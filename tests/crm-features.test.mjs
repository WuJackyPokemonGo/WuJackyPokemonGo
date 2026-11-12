import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
import {parseThreadsExport} from '../crm-threads-import.mjs';
import {priceCandidates,deliveryItems} from '../crm-cases.mjs';
import {customerFeatures,countedDeals,matchesFilter} from '../crm-features.mjs';
const read=f=>readFile(new URL(f,import.meta.url),'utf8');
const sql=await Promise.all(['./checkout-fixture.sql','../supabase/production/customer-roster.sql','../supabase/production/customer-contacts.sql','../supabase/production/crm-threads.sql','../supabase/review/crm-features.sql'].map(read));
const meta=s=>String.fromCharCode(...new TextEncoder().encode(s));
const OWNER='J. Shop',DAY=86400000,NOW=Date.parse('2026-11-10T12:00:00Z');
const conv=(slug,other,msgs)=>[`your_activity/messages/inbox/${slug}/message_1.json`,JSON.stringify({participants:[{name:meta(other)},{name:meta(OWNER)}],title:meta(other),
 messages:msgs.map(([who,days,content,extra])=>({sender_name:meta(who==='o'?OWNER:other),timestamp_ms:NOW-days*DAY,content:content&&meta(content),...extra}))})];
const PAYINFO='行號391 帳號 1234567890 麻煩提供轉帳截圖我這邊留存交易紀錄 感謝🙏🏻';
const products=[{id:'11111111-1111-4111-8111-111111111111',name:'耿鬼-寶可夢之夜',name_en:'Gengar',aliases:['耿鬼']},{id:'22222222-2222-4222-8222-222222222222',name:'皮卡丘-倫敦',name_en:'Pikachu',aliases:['皮卡丘']},{id:'33333333-3333-4333-8333-333333333333',name:'呱呱泡蛙-紅隊',name_en:'Froakie',aliases:['呱呱泡蛙']}];
const files=new Map([
 // 同一單買兩隻：報單價 450、付款一次、兩隻一起交付 → 1 筆成交、2 隻、900
 conv('multi_1','Multi',[['c',40,'呱呱泡蛙紅隊黃隊還有嗎 多少'],['o',39.9,'有 一隻450'],['c',39.8,'各收一'],['o',39.7,PAYINFO],['c',39.6,'已匯',{photos:[{uri:'x'}]}],
  ['o',38,'呱呱泡蛙*2 紅 abcdefg01 黃 abcdefg02 密碼 Secret999']]),
 // 只有賣家報價、客人沒回
 conv('quote_1','Quote',[['c',30,'耿鬼多少'],['o',29.9,'耿鬼 500元'],]),
 // 同一位客人兩件事：耿鬼已付款待核款；之後另問皮卡丘、老闆還沒回
 conv('two_1','Two',[['c',5,'我要耿鬼'],['o',4.9,PAYINFO],['c',4.8,'轉好了'],['c',2,'皮卡丘還有嗎 多少']]),
 // 同名客人（不同 Threads 帳號）各自獨立
 conv('amy_1','Amy',[['c',10,'皮卡丘多少'],['o',9.9,'100']]),
 conv('amy_2','Amy',[['c',10,'耿鬼還有嗎'],['o',9.9,PAYINFO],['c',9.8,'已匯款'],['o',9,'耿鬼 帳號 zzzzzz11 密碼 yyyyyy22']]),
 // 不是 A 層（沒有付款紀錄）：第一輪不產生建議
 conv('ask_1','Ask',[['c',3,'皮卡丘多少']]),
]);

test('price and delivery parsing keeps prices, drops dates, bank codes and 8591, and masks credentials',()=>{
 assert.deepEqual(priceCandidates('有 一隻450').map(x=>[x.value,x.each]),[[450,true]]);
 assert.deepEqual(priceCandidates('7/16 付款後1-2天交貨 行號391 8591實收').map(x=>x.value),[]);
 assert.deepEqual(priceCandidates('500*2=1,000').map(x=>[x.value,x.total]),[[500,false],[1000,true]]);
 const mask=s=>s.replace(/[A-Za-z0-9]{6,}/g,'[遮蔽]');
 assert.deepEqual(deliveryItems('快龍 帳號 abcdef12 密碼 Pass1234 卡比獸 帳號 ghijk345 密碼 Word5678',mask),{text:'快龍 卡比獸',qty:2});
 assert.deepEqual(deliveryItems('小火龍*3 帳號\n鐵塔右 aaaaaa1\n鐵塔左 bbbbbb2\n密碼 cccccc3',mask),{text:'小火龍*3',qty:3});
 assert.ok(!JSON.stringify(deliveryItems('耿鬼 帳號 zzzzzz11 密碼 yyyyyy22',mask)).match(/zzzz|yyyy/));
});

test('cases and deal suggestions: one order with two items is one deal; quote-only and paid chats never become deals; only tier A in round one',()=>{
 const {rows,stats}=parseThreadsExport(files,{products,now:NOW});const by=k=>rows.find(r=>r.external_key===k);
 const m=by('multi_1');assert.equal(m.deals.length,1);assert.equal(m.deals[0].qty,2);assert.equal(m.deals[0].amount_twd,900);assert.equal(m.deals[0].evidence.amount_basis,'店主報單價×2');
 assert.equal(m.cases[0].status,'done');assert.ok(!JSON.stringify(m).match(/abcdefg0|Secret999/),'credentials never leave the browser');
 // 只有賣家報價的客人沒有付款紀錄 → 不是 A 層，第一輪不產生案件；開到全部時是「報價後客人未回」
 assert.equal(by('quote_1').cases.length,0);
 const all=parseThreadsExport(files,{products,now:NOW,suggestScope:'all'}).rows;
 const q=all.find(r=>r.external_key==='quote_1');assert.equal(q.cases[0].status,'quote_lapsed');assert.equal(q.deals.length,0);
 const two=by('two_1');assert.deepEqual(two.cases.map(c=>c.status).sort(),['owner_to_reply','payment_to_verify']);assert.equal(two.deals.length,0,'chat saying "paid" is only 待核款, never a deal');
 assert.deepEqual(two.cases.find(c=>c.status==='payment_to_verify').items,['耿鬼']);assert.deepEqual(two.cases.find(c=>c.status==='owner_to_reply').items,['皮卡丘']);
 assert.equal(by('amy_1').cases.length,0);assert.equal(by('amy_2').deals.length,1);
 assert.equal(by('ask_1').cases.length,0);assert.equal(stats.suggest_scope,'A');assert.equal(stats.suggested_customers,3);
});

test('features count accepted deals only; same order with many items is one deal; partial refund reduces, full refund removes',()=>{
 const base={status:'accepted',occurred_at:'2026-08-01'};
 const deals=[{...base,id:'1',amount_twd:900,refund_twd:0,qty:2},{...base,id:'2',occurred_at:'2026-08-10',amount_twd:1200,refund_twd:300},{...base,id:'3',amount_twd:500,refund_twd:500},{id:'4',status:'suggested',amount_twd:5000,occurred_at:'2026-09-01'},{id:'5',status:'rejected',amount_twd:5000,occurred_at:'2026-09-01'}];
 const f=customerFeatures({deals},{high_value_twd:1000,lapsed_days:90},Date.parse('2026-11-10'));
 assert.equal(f.dealCount,2);assert.equal(f.total,900+900);assert.equal(f.regular,true);assert.equal(f.highValue,false,'1200 - 300 refund = 900 < 1000');assert.equal(f.review,1);assert.equal(f.lapsed,true,'last deal 08/10 → 92 days ≥ 90');
 assert.equal(customerFeatures({deals},{high_value_twd:900}).highValue,true,'threshold is adjustable');
 assert.equal(customerFeatures({deals},{lapsed_days:120},Date.parse('2026-11-10')).lapsed,false,'lapsed days are adjustable');
 // 網站訂單：已完成才算，全額退款不算
 assert.deepEqual(countedDeals([],[{id:'o1',status:'completed',received_amount_twd:800,refund_amount_twd:0,completed_at:'2026-10-01'},{id:'o2',status:'completed',received_amount_twd:800,refund_amount_twd:800},{id:'o3',status:'cancelled',received_amount_twd:800}]).map(x=>x.id),['o1']);
 // 同一位客人多件進行中：下一步依優先順序，全部都看得到
 const g=customerFeatures({cases:[{status:'owner_to_reply',last_at:'2026-11-08',items:['皮卡丘']},{status:'payment_to_verify',last_at:'2026-11-05',items:['耿鬼']},{status:'done',last_at:'2026-10-01'}],inquiries:[{}]});
 assert.equal(g.next.status,'payment_to_verify');assert.equal(g.openCases.length,2);assert.ok(matchesFilter(g,'owner_to_reply'));assert.ok(matchesFilter(g,'payment_to_verify'));assert.ok(matchesFilter(g,'no_deal'));
});

async function db(){const d=new PGlite();await d.exec(sql[0]);for(const s of sql.slice(1))await d.exec(s);await d.exec(sql[4]);// 重複套用不出錯
 const q=async(s,a=[])=>(await d.query(s,a)).rows;
 const admin=(await q('select user_id from admin_profiles limit 1'))[0].user_id;
 return {d,q,admin}}
const asAdmin=async(d,admin)=>{await d.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);await d.exec('set role authenticated')};

test('import twice: no duplicates, manual case status and decided deals are kept, same-name customers stay separate, anon has no access',async()=>{
 const {d,q,admin}=await db();
 await d.exec('set role anon');await assert.rejects(q('select * from crm_deals'),/permission denied/);await assert.rejects(q('select * from crm_cases'),/permission denied/);await d.exec('reset role');
 await asAdmin(d,admin);
 const {rows}=parseThreadsExport(files,{products,now:NOW});const batch=(await q("insert into crm_import_batches(source) values('threads') returning id"))[0].id;
 const imp=async()=>{const a=(await q('select admin_crm_import_threads($1,$2) r',[batch,JSON.stringify(rows)]))[0].r;
  const b=(await q('select admin_crm_import_suggestions($1,$2) r',[batch,JSON.stringify(rows.map(r=>({external_key:r.external_key,cases:r.cases,deals:r.deals,waits:r.waits})))]))[0].r;return {a,b}};
 const r1=await imp();assert.equal(r1.a.customers_created,6);assert.equal(r1.b.deals_new,2);assert.equal(r1.b.customers_missing,0);
 const n0=(await q('select (select count(*) from crm_cases)::int c,(select count(*) from crm_deals)::int d'))[0];
 assert.equal((await q("select count(*)::int n from customer_profiles where alias like 'Amy%'"))[0].n,2,'same display name → two customers');
 // 人工：改案件狀態、接受一筆成交（改金額）、略過另一筆
 await q("update crm_cases set status='to_deliver',status_source='manual' where status='payment_to_verify'");
 const [d1,d2]=(await q('select id from crm_deals order by occurred_at'));
 await q("update crm_deals set status='accepted',amount_twd=1000 where id=$1",[d1.id]);await q("update crm_deals set status='rejected' where id=$1",[d2.id]);
 await assert.rejects(q("update crm_deals set status='accepted',amount_twd=null where id=$1",[d2.id]),/check/,'accepted deal needs an amount');
 await assert.rejects(q("update crm_deals set refund_twd=2000 where id=$1",[d1.id]),/check/,'refund cannot exceed amount');
 const r2=await imp();assert.equal(r2.a.customers_created,0);assert.equal(r2.b.cases_new,0);assert.equal(r2.b.deals_new,0);
 const n1=(await q('select (select count(*) from crm_cases)::int c,(select count(*) from crm_deals)::int d'))[0];assert.deepEqual(n1,n0,'no duplicates after re-import');
 assert.equal((await q("select status from crm_cases where status_source='manual'"))[0].status,'to_deliver','manual status kept');
 assert.equal((await q("select suggested_status from crm_cases where status_source='manual'"))[0].suggested_status,'payment_to_verify','system suggestion still visible');
 assert.deepEqual((await q('select status,amount_twd from crm_deals order by occurred_at')).map(x=>[x.status,x.amount_twd]),[['accepted',1000],['rejected',null]],'decided deals untouched');
 await assert.rejects(q("select admin_crm_import_suggestions($1,'[]')",['00000000-0000-4000-8000-000000000000']),/unknown batch/);
 await d.exec('reset role');await d.exec(`select set_config('request.jwt.claim.sub','',false)`);await d.exec('set role authenticated');
 await assert.rejects(q("select admin_crm_import_suggestions($1,'[]')",[batch]),/insufficient_privilege|permission/);await d.exec('reset role');
});

test('CRM list: quick filters, status filter, product search across cases/deals/waits, and sort by total',async()=>{
 const {crmRows,filterCrm}=await import('../crm-ui.mjs');
 const rows=crmRows({identities:[{customer_id:'a',display_name:'Amy',last_seen_at:'2026-11-09'},{customer_id:'b',display_name:'Bob',last_seen_at:'2026-11-10'},{customer_id:'c',display_name:'Cat',last_seen_at:'2026-11-01'}],tags:[],inquiries:[],
  cases:[{customer_id:'a',status:'owner_to_reply',last_at:'2026-11-09',items:['烈空坐']},{customer_id:'b',status:'abandoned',last_at:'2026-10-01',items:['耿鬼']}],
  deals:[{customer_id:'a',status:'accepted',amount_twd:400,occurred_at:'2026-08-01',items:[{text:'皮卡丘'}]},{customer_id:'a',status:'accepted',amount_twd:300,occurred_at:'2026-09-01',items:[{text:'快龍'}]},{customer_id:'b',status:'accepted',amount_twd:1500,occurred_at:'2026-09-01',items:[{text:'路卡利歐'}]}],
  waits:[{customer_id:'c',status:'waiting',item_text:'超夢 XXL'}],orders:[{customer_alias:'cat',status:'completed',received_amount_twd:200,completed_at:'2026-10-01',id:'o'}],aliases:new Map([['c','Cat']])});
 const names=x=>x.map(r=>r.display_name);
 assert.deepEqual(names(filterCrm(rows,{filters:['regular']})),['Amy']);assert.deepEqual(names(filterCrm(rows,{filters:['high_value']})),['Bob']);
 assert.deepEqual(names(filterCrm(rows,{filters:['waiting']})),['Cat']);assert.deepEqual(names(filterCrm(rows,{filters:['owner_to_reply']})),['Amy']);
 assert.deepEqual(names(filterCrm(rows,{status:'abandoned'})),['Bob']);assert.deepEqual(names(filterCrm(rows,{filters:['abandoned']})),['Bob']);
 assert.deepEqual(names(filterCrm(rows,{query:'超夢'})),['Cat']);assert.deepEqual(names(filterCrm(rows,{query:'快龍'})),['Amy']);assert.deepEqual(names(filterCrm(rows,{query:'烈空坐'})),['Amy']);
 assert.deepEqual(names(filterCrm(rows,{sort:'total'})),['Bob','Amy','Cat']);assert.equal(rows.find(r=>r.display_name==='Cat').features.dealCount,1,'website order matched by customer name');
});

test('round-two features: budget intent, rebind and delivery-chase tasks come from chat as suggestions',()=>{
 const f2=new Map([...files,conv('big_1','Big',[['c',30,'超夢XXL 3000收'],['o',29.9,'可以 '+PAYINFO],['c',29.8,'已匯',{photos:[{uri:'x'}]}],['c',29,'請問什麼時候給帳號'],['o',28,'超夢 帳號 qwerty12 密碼 asdfgh34'],['c',27.9,'請問怎麼換綁']])]);
 const {rows}=parseThreadsExport(f2,{products,now:NOW,suggestScope:'all'});const r=rows.find(x=>x.external_key==='big_1');
 assert.equal(r.cases[0].evidence.budget.amount,3000);assert.equal(r.cases[0].evidence.budget.kind,'offer');
 assert.deepEqual(r.tasks.map(t=>[t.kind,t.status]).sort(),[['delivery_chase','done'],['rebind_tutorial','done']],'delivered history is recorded as already handled');
 const f=customerFeatures({cases:r.cases},{high_value_twd:1000});assert.equal(f.budget.amount,3000);assert.ok(matchesFilter(f,'high_budget'));
 assert.equal(customerFeatures({cases:r.cases},{high_value_twd:5000}).budget,null,'budget threshold follows the adjustable setting');
});

test('frequent items count distinct cases, categories split bought vs asked, waiting product reverse lookup, LINE link shows Threads → LINE',async()=>{
 const {frequentItems,channelLabel,displayLayout,FEATURES}=await import('../crm-features.mjs');const {crmRows,filterCrm}=await import('../crm-ui.mjs');
 const inq=[{occurred_at:'2026-08-01T01:00:00Z',terms:['烈空坐（異色）'],evidence:{}},{occurred_at:'2026-08-01T02:00:00Z',terms:['烈空坐（異色）'],evidence:{}},{occurred_at:'2026-09-01T01:00:00Z',terms:['烈空坐（異色）','藍狗'],evidence:{pending:['藍狗']}},{occurred_at:'2026-09-02T01:00:00Z',terms:['藍狗'],evidence:{pending:['藍狗']}}];
 const cases=[{id:'k1',opened_at:'2026-08-01T00:00:00Z',last_at:'2026-08-01T05:00:00Z'},{id:'k2',opened_at:'2026-09-01T00:00:00Z',last_at:'2026-09-03T00:00:00Z'}];
 assert.deepEqual(frequentItems(inq,cases).map(x=>[x.term,x.count]),[['烈空坐（異色）',2]],'same thread asked twice counts once; 藍狗 only in one case');
 assert.deepEqual(frequentItems(inq,[]).map(x=>[x.term,x.count,x.pending]),[['烈空坐（異色）',2,false],['藍狗',2,true]],'without cases, distinct days; pending terms flagged');
 assert.equal(channelLabel([{platform:'threads'}],null),'Threads');assert.equal(channelLabel([{platform:'threads'},{platform:'line'}],null),'Threads → LINE');
 const rows=crmRows({identities:[{customer_id:'a',platform:'threads',display_name:'Amy',last_seen_at:'2026-11-09'},{customer_id:'a',platform:'line',display_name:'amy_line'},{customer_id:'b',platform:'threads',display_name:'Bob',last_seen_at:'2026-11-08'}],tags:[],
  inquiries:[{customer_id:'b',occurred_at:'2026-11-01',terms:['皮卡丘'],excerpt:'色違背景皮卡丘多少',evidence:{cues:['背景：背景']}}],
  deals:[{customer_id:'a',status:'accepted',amount_twd:500,occurred_at:'2026-08-01',items:[{text:'極巨化色背淚眼蜥'}]}],
  waits:[{customer_id:'b',status:'waiting',item_text:'超夢 XXL',product_ids:['p1']}],tasks:[{customer_id:'a',status:'open',kind:'rebind_tutorial'}]});
 assert.equal(rows.length,2,'LINE identity does not create a second customer');assert.equal(rows.find(r=>r.display_name==='Amy').features.channel,'Threads → LINE');
 const names=x=>x.map(r=>r.display_name);
 assert.deepEqual(names(filterCrm(rows,{filters:['linked']})),['Amy']);assert.deepEqual(names(filterCrm(rows,{filters:['open_tasks']})),['Amy']);
 assert.deepEqual(names(filterCrm(rows,{category:'dynamax',categoryMode:'bought'})),['Amy']);assert.deepEqual(names(filterCrm(rows,{category:'background',categoryMode:'asked'})),['Bob']);
 assert.deepEqual(names(filterCrm(rows,{category:'background',categoryMode:'bought'})),['Amy'],'色背 counts as background for bought items');
 assert.deepEqual(names(filterCrm(rows,{waitingProduct:'p1',productNames:new Map([['p1','超夢']])})),['Bob']);
 // 顯示設定：隱藏後重新顯示、排序；資料不受影響
 let lay=displayLayout({top:['regular','high_value','waiting'],hidden:[]});assert.deepEqual(lay.top.map(x=>x[0]),['regular','high_value','waiting']);assert.equal(lay.more.length,FEATURES.length-3);
 lay=displayLayout({top:['waiting','regular'],hidden:['high_value']});assert.deepEqual(lay.top.map(x=>x[0]),['waiting','regular']);assert.ok(!lay.more.some(x=>x[0]==='high_value'));assert.deepEqual(lay.hidden.map(x=>x[0]),['high_value']);
 lay=displayLayout({top:['waiting','regular'],hidden:[]});assert.ok(lay.more.some(x=>x[0]==='high_value'),'re-shown feature comes back');
 assert.equal(filterCrm(rows,{filters:['regular']}).length,0,'hiding never changes the underlying data');
});

test('tasks and customer meta: admin-only, task import is idempotent and never reopens handled tasks, contact types are validated',async()=>{
 const {d,q,admin}=await db();
 await d.exec('set role anon');await assert.rejects(q('select * from crm_tasks'),/permission denied/);await assert.rejects(q('select * from crm_customer_meta'),/permission denied/);await d.exec('reset role');
 await asAdmin(d,admin);
 const batch=(await q("insert into crm_import_batches(source) values('threads') returning id"))[0].id;
 const row={external_key:'t_1',display_name:'T',folder:'inbox/t_1',first_at:NOW,last_at:NOW,message_count:2,customer_message_count:1,last_sender:'customer',inquiries:[],tags:[],followups:[]};
 await q('select admin_crm_import_threads($1,$2)',[batch,JSON.stringify([row])]);
 const tasks=[{source_key:'threads:t_1:task:rebind_tutorial:1',kind:'rebind_tutorial',title:'需要換綁教學',status:'open',excerpt:'怎麼換綁'}];
 assert.equal((await q('select admin_crm_import_tasks($1) r',[JSON.stringify([{external_key:'t_1',tasks}])]))[0].r.tasks_new,1);
 await q("update crm_tasks set status='done',resolved_at=now()");
 assert.equal((await q('select admin_crm_import_tasks($1) r',[JSON.stringify([{external_key:'t_1',tasks}])]))[0].r.tasks_new,0);
 assert.equal((await q('select status from crm_tasks'))[0].status,'done','re-import never reopens a handled task');
 const cid=(await q("select customer_id from crm_identities where external_key='t_1'"))[0].customer_id;
 await q("insert into crm_customer_meta(customer_id,first_channel,current_channel,contact_types) values($1,'Threads','LINE','{customer,friend}')",[cid]);
 await assert.rejects(q("update crm_customer_meta set contact_types='{boss}'"),/check/);
 await q("insert into crm_identities(customer_id,platform,external_key,display_name) values($1,'line','t_line','T')",[cid]);
 assert.equal((await q('select count(distinct customer_id)::int n from crm_identities'))[0].n,1,'LINE identity links to the same customer');
 await d.exec('reset role');
});
