import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
import {parseThreadsExport,fixMojibake,maskText,buildTermIndex,chunk} from '../crm-threads-import.mjs';
const read=f=>readFile(new URL(f,import.meta.url),'utf8');
const fixture=await read('./checkout-fixture.sql'),roster=await read('../supabase/production/customer-roster.sql'),contacts=await read('../supabase/production/customer-contacts.sql'),crm=await read('../supabase/production/crm-threads.sql');
// Meta exports UTF-8 text as Latin-1 escaped strings; build the same shape for fixtures.
const meta=s=>String.fromCharCode(...new TextEncoder().encode(s));
const OWNER='J. Shop',DAY=86400000,NOW=Date.parse('2026-11-10T12:00:00Z');
function conv(box,slug,other,msgs){return [`your_activity/messages/${box}/${slug}/message_1.json`,JSON.stringify({participants:[{name:meta(other)},{name:meta(OWNER)}],title:meta(other),messages:msgs.map(([who,days,content,extra])=>({sender_name:meta(who==='o'?OWNER:other),timestamp_ms:NOW-days*DAY,content:content&&meta(content),...extra}))})]}
const files=new Map([
 conv('inbox','amy_1001','Amy',[['c',20,'請問耿鬼還有嗎'],['o',19.9,'有的 匯款至 822-中信 帳號 1234567890'],['c',19.5,'已匯款'],['c',2,'雪地皮卡丘多少']]),
 conv('inbox','amy_1002','Amy',[['c',10,'我要月光皮皮'],['o',9.9,'行號391 帳號 9876543210 麻煩提供轉帳截圖']]),
 conv('message_requests','bob_2001','Bob',[['c',1,'你好想請問MEGA卡洛斯御三家有嗎']]),
 conv('inbox','grp_3001','Group',[]),
 ['your_activity/threads/threads_and_replies.json','{}'],
]);
// a 3-person group thread must be skipped
files.set('your_activity/messages/inbox/grp_3001/message_1.json',JSON.stringify({participants:[{name:'a'},{name:'b'},{name:meta(OWNER)}],messages:[{sender_name:'a',timestamp_ms:NOW,content:'hi'}]}));
const products=[{id:'11111111-1111-4111-8111-111111111111',name:'耿鬼-寶可夢之夜洛杉磯',name_en:'Gengar - Night Out',aliases:['耿鬼']},{id:'22222222-2222-4222-8222-222222222222',name:'卡洛斯御三家-Mega背景',name_en:'Kalos Starters',aliases:['卡洛斯御三家']}];

test('parser reads every conversation, fixes Meta text, skips groups and never keeps raw secrets',()=>{
 assert.equal(fixMojibake(meta('雪地皮卡丘')),'雪地皮卡丘');assert.equal(fixMojibake('already ok 皮'),'already ok 皮');
 assert.equal(maskText('帳號 1234567890 密碼 abc123 mail a@b.co'),'帳號 [遮蔽] 密碼 [遮蔽] mail [email]');
 const {rows,stats}=parseThreadsExport(files,{products,nicknames:'平昌皮卡丘,雪地皮卡丘,雪地皮',now:NOW});
 assert.equal(stats.message_files,4);assert.equal(stats.conversations,4);assert.equal(stats.groups_skipped,1);assert.equal(stats.imported,3);assert.equal(stats.owner,OWNER);
 const amy=rows.find(r=>r.external_key==='amy_1001');assert.equal(amy.display_name,'Amy');
 assert.ok(amy.inquiries.some(i=>i.category==='stock'&&i.terms.includes('耿鬼')&&i.product_ids[0]===products[0].id));
 assert.ok(amy.inquiries.some(i=>i.category==='price'&&i.terms.includes('平昌皮卡丘')),'nickname maps to canonical term');
 assert.deepEqual(amy.tags.map(t=>t.tag).sort(),['followup','inquired','paid_suspected']);
 const amy2=rows.find(r=>r.external_key==='amy_1002');assert.ok(amy2.tags.some(t=>t.tag==='abandon_suspected'),'payment info sent, no payment within 3 days');
 const bob=rows.find(r=>r.external_key==='bob_2001');assert.ok(bob.tags.some(t=>t.tag==='request_box'));assert.equal(bob.followups.length,1);
 const all=JSON.stringify(rows);assert.doesNotMatch(all,/1234567890|9876543210/);assert.ok(rows.flatMap(r=>r.inquiries).every(i=>i.excerpt.length<=60));
 assert.equal(chunk([1,2,3,4,5],2).length,3);
});

async function adminDb(){const db=new PGlite();await db.exec(fixture);for(const s of [roster,contacts,crm,crm])await db.exec(s);const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const admin=(await q('select user_id from admin_profiles limit 1'))[0].user_id;return {db,q,admin}}
test('CRM tables are admin-only and the import is idempotent without merging same-name customers',async()=>{
 const {db,q,admin}=await adminDb();const {rows}=parseThreadsExport(files,{products,now:NOW});
 await db.exec('set role anon');await assert.rejects(q('select * from crm_inquiries'),/permission denied/);await db.exec('reset role');
 await db.exec("select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false)");await db.exec('set role authenticated');
 assert.equal((await q('select * from crm_identities')).length,0);await assert.rejects(q("select admin_crm_import_threads(gen_random_uuid(),'[]')"),/insufficient_privilege|permission/);await db.exec('reset role');
 await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);await db.exec('set role authenticated');
 const batch=(await q("insert into crm_import_batches(source) values('threads') returning id"))[0].id;
 const r1=(await q('select admin_crm_import_threads($1,$2) r',[batch,JSON.stringify(rows)]))[0].r;
 assert.equal(r1.customers_created,3);assert.equal(r1.customers_matched,0);
 const aliases=(await q('select alias from customer_profiles order by alias')).map(r=>r.alias);assert.equal(aliases.length,3);assert.ok(aliases.includes('Amy')&&aliases.some(a=>/^Amy #1002$/.test(a)),'same display name stays two customers');
 await q("insert into crm_tags(customer_id,tag,source) select id,'paid_suspected','manual' from customer_profiles where alias='Amy' on conflict(customer_id,tag) do update set source='manual'");
 await q("update crm_followups set status='dismissed'");
 const r2=(await q('select admin_crm_import_threads($1,$2) r',[batch,JSON.stringify(rows)]))[0].r;
 assert.equal(r2.customers_created,0);assert.equal(r2.customers_matched,3);assert.equal(r2.inquiries_new,0);assert.equal(r2.followups_new,0);
 assert.equal((await q('select count(*)::int n from customer_profiles'))[0].n,3);
 assert.equal((await q("select source from crm_tags t join customer_profiles c on c.id=t.customer_id where c.alias='Amy' and tag='paid_suspected'"))[0].source,'manual','manual tag is never overwritten');
 assert.equal((await q("select count(*)::int n from crm_followups where status='open'"))[0].n,0,'dismissed follow-ups do not come back');
 await assert.rejects(q('select admin_crm_import_threads($1,$2)',[batch,JSON.stringify(Array(101).fill(rows[0]))]),/at most 100/);
 await db.exec('reset role');
});
test('CRM list groups tags and inquiries per customer and filters by Pokémon or tag',async()=>{
 const {crmRows,filterCrm}=await import('../crm-ui.mjs');
 const rows=crmRows({identities:[{customer_id:'a',display_name:'Amy',last_seen_at:'2026-11-09'},{customer_id:'b',display_name:'Bob',last_seen_at:'2026-11-10'}],
  tags:[{customer_id:'a',tag:'paid_suspected'}],inquiries:[{customer_id:'a',occurred_at:'2026-11-01',terms:['耿鬼'],excerpt:'耿鬼還有嗎'},{customer_id:'a',occurred_at:'2026-11-02',terms:['耿鬼','皮卡丘'],excerpt:'x'}]});
 assert.deepEqual(rows.map(r=>r.display_name),['Bob','Amy']);assert.deepEqual(rows[1].topTerms,['耿鬼','皮卡丘']);
 assert.deepEqual(filterCrm(rows,{query:'耿鬼'}).map(r=>r.display_name),['Amy']);assert.deepEqual(filterCrm(rows,{tag:'paid_suspected'}).map(r=>r.display_name),['Amy']);assert.equal(filterCrm(rows,{query:'bob'}).length,1);
});
test('G2 nicknames: longest alias wins, combos and pending words stay unlinked, cues keep event/shiny/ball/size hints',async()=>{
 const {buildTermIndex,extractCues}=await import('../crm-threads-import.mjs');const {readFileSync}=await import('node:fs');
 const nick=readFileSync(new URL('../data/crm-nicknames.txt',import.meta.url),'utf8');
 const prods=[{id:'r1',name:'烈空坐-水墨背景',name_en:'Rayquaza - GO Fest 2026',aliases:['烈空坐','Shiny Rayquaza']},{id:'p1',name:'皮卡丘-2026平昌冬季慶典限定背景',name_en:'Pikachu',aliases:['平昌皮卡丘']},{id:'p2',name:'皮卡丘-寶可夢之夜洛杉磯',name_en:'Pikachu',aliases:['皮卡丘']}];
 const idx=buildTermIndex(prods,nick);
 const black=idx.match('黑烈還有嗎');assert.equal(black[0].term,'烈空坐（異色）');assert.deepEqual(black[0].products,['r1']);
 const snow=idx.match('雪地皮多少');assert.equal(snow[0].term,'皮卡丘（平昌冬季慶典）');assert.deepEqual(snow[0].products,['p1'],'qualifier narrows to the PyeongChang product');
 const dogs=idx.match('色背雙狗還有嗎');assert.equal(dogs[0].term,'蒼響＋藏瑪然特');assert.equal(dogs[0].combo,true);assert.equal(dogs[0].unverified,true);assert.deepEqual(dogs[0].products,[]);
 assert.deepEqual(idx.match('背卡藍狗').map(f=>[f.term,!!f.pending]),[['藍狗',true]]);assert.equal(idx.match('黑白龍有嗎')[0].pending,true);
 assert.equal(idx.match('梗鬼多少')[0].term,'耿鬼');assert.equal(idx.match('潛水皮卡丘')[0].term,'皮卡丘（潛水鏡造型）','longer alias beats 皮卡丘');
 assert.deepEqual(extractCues('想要大師球XXL色違倫敦背景'),['異色：色違','背景：背景','活動地點：倫敦','球種：大師球','尺寸：XXL']);
});
test('re-import refreshes recognition fields without duplicating inquiries',async()=>{
 const {db,q,admin}=await adminDb();await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);await db.exec('set role authenticated');
 const batch=(await q("insert into crm_import_batches(source) values('threads') returning id"))[0].id;
 const row=t=>JSON.stringify([{external_key:'k_1',display_name:'X',first_at:1,last_at:2,inquiries:[{occurred_at:2,category:'price',terms:t,product_ids:[],excerpt:'e',source_key:'threads:k_1:2:0:price',evidence:{}}]}]);
 assert.equal((await q('select admin_crm_import_threads($1,$2) r',[batch,row([])]))[0].r.inquiries_new,1);
 const r2=(await q('select admin_crm_import_threads($1,$2) r',[batch,row(['耿鬼'])]))[0].r;assert.equal(r2.inquiries_updated,1);assert.equal(r2.inquiries_new,0);
 const r3=(await q('select admin_crm_import_threads($1,$2) r',[batch,row(['耿鬼'])]))[0].r;assert.equal(r3.inquiries_skipped,1);
 assert.deepEqual((await q('select terms from crm_inquiries'))[0].terms,['耿鬼']);assert.equal((await q('select count(*)::int n from crm_inquiries'))[0].n,1);await db.exec('reset role');
});
test('customer backup carries CRM rows and restore re-adds them without duplicates; old backups still validate',async()=>{
 const {validateCustomerBackup,createCustomersService,CRM_TABLES}=await import('../customers-service.mjs');
 const old=validateCustomerBackup({format:'wu-jacky-customers',version:1,profiles:[],history:[]});assert.deepEqual(Object.values(old.crm).flat(),[]);
 const store=Object.fromEntries(CRM_TABLES.map(([,t])=>[t,[]]));store.customer_profiles=[];store.customer_history_purchases=[];
 const pk={crm_import_batches:'id',crm_identities:'external_key',crm_inquiries:'source_key',crm_tags:r=>r.customer_id+r.tag,crm_followups:'id',customer_profiles:'id',customer_history_purchases:'import_key'};
 const key=(t,r)=>typeof pk[t]==='function'?pk[t](r):r[pk[t]];
 const client={from(t){const api={_rows:null,select(){return api},order(){return api},range(){return Promise.resolve({data:store[t],error:null})},
  upsert(rows){const fresh=rows.filter(r=>!store[t].some(x=>key(t,x)===key(t,r)));store[t].push(...fresh);return {select:()=>Promise.resolve({data:fresh,error:null})}}};return api}};
 const svc=createCustomersService(client);
 store.customer_profiles.push({id:'c1',alias:'Amy',other_aliases:[],contacts:[],contact_private:'',do_not_market:false,note_private:'',created_at:'x',updated_at:'x'});
 store.crm_identities.push({id:'i1',customer_id:'c1',platform:'threads',external_key:'amy_1',display_name:'Amy',folder:'inbox/amy_1',first_seen_at:null,last_seen_at:null,message_count:3,customer_message_count:2,last_sender:'customer',last_batch:null,created_at:'x',updated_at:'x'});
 store.crm_inquiries.push({id:'q1',customer_id:'c1',identity_id:'i1',occurred_at:'x',category:'price',terms:['耿鬼'],product_ids:[],excerpt:'耿鬼多少',evidence:{},source_key:'threads:amy_1:1:0:price',batch_id:null,created_at:'x'});
 const doc=await svc.backup();assert.equal(doc.crm.identities.length,1);assert.equal(doc.crm.inquiries[0].terms[0],'耿鬼');
 for(const t of Object.keys(store))store[t]=[];
 const r1=await svc.restore(JSON.parse(JSON.stringify(doc)));assert.equal(r1.crm,2);assert.equal(store.crm_inquiries.length,1);
 const r2=await svc.restore(JSON.parse(JSON.stringify(doc)));assert.equal(r2.crm,0);assert.equal(store.crm_inquiries.length,1,'restore twice does not duplicate');
});
test('every imported customer gets a one-line summary without personal or payment data',async()=>{
 const {summaryLine}=await import('../crm-threads-import.mjs');
 const s=summaryLine({first_at:Date.parse('2026-07-09T04:00:00Z'),last_at:Date.parse('2026-11-10T04:00:00Z'),message_count:73,last_sender:'customer',
  inquiries:[{category:'price',terms:['快龍']},{category:'buy',terms:['快龍','藏瑪然特']}],tags:[{tag:'paid_suspected',evidence:{count:1}}]});
 assert.equal(s,'26/07/09–26/11/10・私訊 73 則・問過：快龍、藏瑪然特・表示想買／問價・疑似付款 1 次・最後一則是客人');
 const {rows}=parseThreadsExport(files,{products,now:NOW});assert.ok(rows.every(r=>r.summary&&r.summary.length<=200));assert.doesNotMatch(JSON.stringify(rows.map(r=>r.summary)),/\d{6,}/);
});
