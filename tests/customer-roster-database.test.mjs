import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const fixture=await readFile(new URL('./checkout-fixture.sql',import.meta.url),'utf8'),sql=await readFile(new URL('../supabase/production/customer-roster.sql',import.meta.url),'utf8'),contactsSql=await readFile(new URL('../supabase/production/customer-contacts.sql',import.meta.url),'utf8');
test('customer roster SQL: admin-only access, constraints and duplicate-safe import key',async()=>{
 const db=new PGlite();await db.exec(fixture);await db.exec(sql);await db.exec(sql);// 可重複套用
 const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const row="insert into customer_history_purchases(customer_alias,purchased_on,item_text,amount_twd,import_key) values('許大哥','2026-07-26','派對色背耿鬼',250,'h0000000000000001')";
 await db.exec('set role anon');await assert.rejects(q('select * from customer_profiles'),/permission denied/);await assert.rejects(q(row),/permission denied/);await db.exec('reset role');
 await db.exec("select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false)");await db.exec('set role authenticated');
 assert.equal((await q('select * from customer_history_purchases')).length,0);await assert.rejects(q(row),/row-level security/);await db.exec('reset role');
 const admin=(await q('select user_id from admin_profiles limit 1'))[0].user_id;
 await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);await db.exec('set role authenticated');
 await q(row);await assert.rejects(q(row),/duplicate key/);
 await q("insert into customer_profiles(alias,other_aliases) values('許大哥','{許醫師}')");await assert.rejects(q("insert into customer_profiles(alias) values(' 許大哥 ')"),/duplicate key/);
 await assert.rejects(q("insert into customer_history_purchases(customer_alias,purchased_on,item_text,amount_twd,import_key,purchased_time) values('x','2026-01-01','y',1,'h0000000000000002','25:00')"),/check constraint/);
 await assert.rejects(q("insert into customer_history_purchases(customer_alias,purchased_on,item_text,amount_twd,import_key) values('x','2026-01-01','y',-1,'h0000000000000003')"),/check constraint/);
 const before=(await q("select updated_at from customer_profiles"))[0].updated_at;await q("update customer_profiles set do_not_market=true");const after=(await q("select do_not_market,updated_at from customer_profiles"))[0];assert.equal(after.do_not_market,true);assert.ok(after.updated_at>=before);
 await db.exec('reset role');
});
test('customer contacts migration: moves legacy contact, validates entries, keeps updated_at touch',async()=>{
 const db=new PGlite();await db.exec(fixture);await db.exec(sql);const q=async(s,a=[])=>(await db.query(s,a)).rows;
 await q("insert into customer_profiles(alias,contact_private) values('許大哥','FB 許'),('奶茶','')");
 await db.exec(contactsSql);await db.exec(contactsSql);
 assert.deepEqual((await q("select alias,contacts,contact_private from customer_profiles order by alias")).map(r=>[r.alias,r.contacts,r.contact_private]),[['奶茶',[],''],['許大哥',[{platform:'其他',handle:'FB 許'}],'']]);
 const admin=(await q('select user_id from admin_profiles limit 1'))[0].user_id;await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);await db.exec('set role authenticated');
 await q(`update customer_profiles set contacts='[{"platform":"官方LINE","handle":"hsu01"},{"platform":"IG","handle":"hsu"}]' where alias='許大哥'`);
 for(const bad of ['{}','[{"platform":"IG"}]','[{"platform":"","handle":"x"}]','[{"platform":"IG","handle":"x","extra":1}]','[1]',JSON.stringify(Array.from({length:21},(_,i)=>({platform:'IG',handle:'h'+i})))])
  await assert.rejects(q("update customer_profiles set contacts=$1::jsonb where alias='奶茶'",[bad]),/contact/);
 await assert.rejects(q(`insert into customer_profiles(alias,contacts) values('新客','[{"platform":"IG"}]')`),/contact/);
 const r=(await q("select created_at,updated_at from customer_profiles where alias='許大哥'"))[0];assert.ok(r.updated_at>r.created_at);
 await db.exec('reset role');
});
