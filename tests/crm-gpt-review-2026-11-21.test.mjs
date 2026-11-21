// GPT 複驗重現的 10 個問題（2026-11-21）。全部使用合成對話，不含任何真實客人資料。
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
import {parseThreadsExport,maskText} from '../crm-threads-import.mjs';
import {resolveOrderOwners} from '../crm-order-links.mjs';
import {crmRows} from '../crm-ui.mjs';

const read=f=>readFile(new URL(f,import.meta.url),'utf8');
const meta=s=>String.fromCharCode(...new TextEncoder().encode(s));
const OWNER='J. Shop',DAY=86400000,NOW=Date.parse('2026-11-20T12:00:00Z');
const conv=(slug,other,msgs,{name=other}={})=>[`your_activity/messages/inbox/${slug}/message_1.json`,JSON.stringify({participants:[{name:meta(name)},{name:meta(OWNER)}],title:meta(name),
 messages:msgs.map(([who,days,content,extra])=>({sender_name:meta(who==='o'?OWNER:name),timestamp_ms:days>1e9?days:NOW-days*DAY,content:content&&meta(content),...extra}))})];
const PAYINFO='行號391 帳號 1234567890 麻煩提供轉帳截圖我這邊留存交易紀錄 感謝🙏🏻';
const G='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222';
const products=[{id:G,name:'耿鬼-寶可夢之夜',name_en:'Gengar',aliases:['耿鬼']},{id:P,name:'皮卡丘-倫敦',name_en:'Pikachu',aliases:['皮卡丘']}];
// 店主＝出現在最多對話中的人；每次多放一段無關對話，避免只有一段對話時認錯店主
const FILLER=conv('filler_1','Filler',[['c',50,'hi'],['o',49,'hello']]);
const parse=(entries,opt={})=>{const res=parseThreadsExport(new Map([...entries,FILLER]),{products,now:NOW,suggestScope:'all',...opt});res.rows=res.rows.filter(r=>r.external_key!=='filler_1');return res};
const row=(res,slug)=>res.rows.find(r=>r.folder.endsWith('/'+slug));
const PHOTO={photos:[{uri:'photo.jpg'}]};

test('1 遮蔽：轉帳末碼、完整帳號、帳密、驗證碼、付款連結與多行訊息都不外流',()=>{
 const samples=[
  ['已匯款，末五碼 45678，皮卡丘還有嗎','45678'],['後五碼:12345 已轉','12345'],['末5碼\n45678','45678'],['帳號末四碼是 9876','9876'],
  ['匯到 822-1234567890123','1234567890'],['帳號 0123 4567 8901','4567'],['帳號：abc_shop 密碼：Pw123','abc_shop'],['帳號：abc_shop\n密碼：Pw123','Pw123'],
  ['驗證碼 4821','4821'],['OTP: 1234','1234'],['付款連結 pay.line.me/payments/abc123','abc123'],['https://p.ecpay.com.tw/A1B2C3','A1B2C3'],
  ['耿鬼\n帳號 ash.ketchum\n密碼 pika','ash.ketchum']];
 for(const [s,secret] of samples)assert.ok(!maskText(s).includes(secret),`${JSON.stringify(s)} → ${maskText(s)}`);
 assert.match(maskText('已匯款，末五碼 45678，皮卡丘還有嗎'),/皮卡丘還有嗎/,'商品與問句保留');
 const res=parse([conv('mask_1','Mask',[['c',1,'已匯款，末五碼 45678，皮卡丘還有嗎']])]);
 assert.ok(!JSON.stringify(row(res,'mask_1')).includes('45678'),'詢問、待追蹤、案件摘錄都不含末五碼');
 assert.ok(row(res,'mask_1').followups.length,'仍產生待追蹤');
});

test('2 交付：改密碼教學、登入問題與售後回覆不算交付；無法判斷時待確認',()=>{
 const res=parse([
  conv('help_1','Help',[['c',5,'耿鬼多少'],['o',4.9,'耿鬼450'],['c',4.8,'我要'],['o',4.7,PAYINFO],['c',4.6,'已匯'],['o',4,'耿鬼 帳號 aaaa1111 密碼 bbbb2222'],['c',3.9,'登不進去'],['o',3.8,'改密碼後再試']]),
  conv('help_2','Help2',[['c',5,'之前買的帳號登不進去'],['o',4.9,'改密碼後再試']]),
  conv('help_3','Help3',[['c',5,'耿鬼多少'],['o',4.9,'耿鬼450'],['c',4.8,'我要'],['o',4.7,PAYINFO],['c',4.6,'已匯'],['o',4.5,'好的 密碼晚點給您']])]);
 assert.equal(row(res,'help_1').deals.length,1,'售後「改密碼後再試」不會再產生一筆成交');
 assert.equal(row(res,'help_2').deals.length,0);assert.ok(!row(res,'help_2').cases.some(c=>c.status==='done'),'單純登入問題不是已成交');
 const h3=row(res,'help_3');assert.equal(h3.deals.length,0);assert.equal(h3.cases[0].status,'payment_to_verify');assert.equal(h3.cases[0].evidence.delivery_unclear,true,'提到密碼但看不出交付 → 待確認');
});

test('3 我欠回覆：報價後客人「謝謝，我先想想」不是待回答問題',()=>{
 const res=parse([conv('think_1','Think',[['c',3,'耿鬼多少'],['o',2.9,'耿鬼450'],['c',2.8,'謝謝，我先想想']]),
  conv('think_2','Think2',[['c',20,'耿鬼多少'],['o',19.9,'耿鬼450'],['c',19.8,'好的謝謝']]),
  conv('ask_2','Ask2',[['c',3,'耿鬼多少'],['o',2.9,'耿鬼450'],['c',2.8,'謝謝，那皮卡丘呢？']])]);
 assert.equal(row(res,'think_1').cases[0].status,'quoted');
 assert.equal(row(res,'think_2').cases[0].status,'quote_lapsed');
 assert.equal(row(res,'ask_2').cases.at(-1).status,'owner_to_reply','有新的問題仍是我欠回覆');
 assert.equal(row(res,'think_1').followups.length,0,'禮貌回覆不產生待追蹤');
});

test('4 跨商品報價：成交金額對應實際交付的商品；無法確定時留空待確認',()=>{
 const res=parse([
  conv('two_q','TwoQ',[['c',6,'耿鬼多少'],['o',5.9,'耿鬼450'],['c',5.8,'皮卡丘呢'],['o',5.7,'皮卡丘1200'],['c',5.6,'我要耿鬼'],['o',5.5,PAYINFO],['c',5.4,'已匯'],['o',5,'耿鬼 帳號 aaaa1111 密碼 bbbb2222']]),
  conv('vague_q','VagueQ',[['c',6,'耿鬼跟皮卡丘多少'],['o',5.9,'450'],['o',5.85,'1200'],['c',5.8,'我要一隻'],['o',5.5,PAYINFO],['c',5.4,'已匯'],['o',5,'帳號 aaaa1111 密碼 bbbb2222']])]);
 const d=row(res,'two_q').deals[0];assert.equal(d.amount_twd,450);assert.deepEqual(d.product_ids,[G]);
 const v=row(res,'vague_q').deals[0];assert.equal(v.amount_twd,null);assert.match(v.evidence.amount_basis,/待確認/);
});

test('5 多筆交易：交付依品項配對；同一單多隻、分批交付、不同訂單交錯',()=>{
 const res=parse([
  conv('inter_1','Inter',[['c',10,'我要耿鬼'],['o',9.9,'耿鬼450'],['o',9.8,PAYINFO],['c',9.7,'已匯'],['c',9,'皮卡丘還有嗎 多少'],['o',8.9,'皮卡丘1200'],['c',8.8,'要'],['o',8.7,PAYINFO],['c',8.6,'已匯'],
   ['o',8,'皮卡丘 帳號 pppp1111 密碼 qqqq2222'],['o',7,'耿鬼 帳號 gggg1111 密碼 hhhh2222']]),
  conv('batch_1','Batch',[['c',10,'耿鬼跟皮卡丘都要'],['o',9.9,'耿鬼450 皮卡丘1200 共1650'],['o',9.8,PAYINFO],['c',9.7,'已匯'],['o',9,'皮卡丘 帳號 pppp1111 密碼 qqqq2222'],['o',8,'耿鬼 帳號 gggg1111 密碼 hhhh2222']])]);
 const i=row(res,'inter_1').deals;assert.equal(i.length,2);
 const gd=i.find(d=>d.product_ids.includes(G)),pd=i.find(d=>d.product_ids.includes(P));
 assert.ok(gd&&pd,'兩筆成交各自對到自己的商品');assert.equal(gd.amount_twd,450);assert.equal(pd.amount_twd,1200);
 assert.equal(gd.occurred_at,NOW-7*DAY);assert.equal(pd.occurred_at,NOW-8*DAY);
 const b=row(res,'batch_1').deals;assert.equal(b.length,1,'同一單分批交付仍是一筆');assert.equal(b[0].qty,2);assert.equal(b[0].amount_twd,1650);
});

test('6 幣別：外幣保留原始幣別與金額，不填台幣、不猜匯率',()=>{
 const res=parse([conv('usd_1','Usd',[['c',6,'耿鬼多少'],['o',5.9,'耿鬼 USD 80'],['c',5.8,'要'],['o',5.7,PAYINFO],['c',5.6,'已匯'],['o',5,'耿鬼 帳號 aaaa1111 密碼 bbbb2222']])]);
 const d=row(res,'usd_1').deals[0];assert.equal(d.amount_twd,null);assert.deepEqual(d.evidence.amount_original,{currency:'USD',value:80});
 assert.match(d.evidence.amount_basis,/USD/);
});

test('7 附圖：提供匯款資料後傳款式圖片不算付款、不進 A 層；有付款文字才算',()=>{
 const res=parseThreadsExport(new Map([
  conv('pic_1','Pic',[['c',3,'耿鬼多少'],['o',2.9,'耿鬼450'],['o',2.8,PAYINFO],['c',2.7,'是這款嗎',PHOTO]]),
  conv('pic_2','Pic2',[['c',3,'耿鬼多少'],['o',2.9,'耿鬼450'],['o',2.8,PAYINFO],['c',2.7,null,PHOTO]]),
  conv('pic_3','Pic3',[['c',3,'耿鬼多少'],['o',2.9,'耿鬼450'],['o',2.8,PAYINFO],['c',2.7,'已匯款',PHOTO]])]),{products,now:NOW});
 for(const s of ['pic_1','pic_2'])assert.ok(!row(res,s).tags.some(t=>t.tag==='paid_suspected'),s+' 不標疑似付款');
 assert.equal(row(res,'pic_1').cases.length,0,'款式圖片不進 A 層');
 const all=parse([conv('pic_2','Pic2',[['c',3,'耿鬼多少'],['o',2.9,'耿鬼450'],['o',2.8,PAYINFO],['c',2.7,null,PHOTO]])]);
 const c=row(all,'pic_2').cases[0];assert.equal(c.status,'awaiting_payment');assert.equal(c.evidence.payment_evidence_pending,true,'只有圖片 → 付款證據待確認');
 assert.ok(row(res,'pic_3').tags.some(t=>t.tag==='paid_suspected'));assert.equal(row(res,'pic_3').cases[0].status,'payment_to_verify');
});

test('8 棄單：只憑時間經過不算棄單，需要明確取消',()=>{
 const res=parse([conv('late_1','Late',[['c',12,'耿鬼多少'],['o',11.9,'耿鬼450'],['c',11.8,'要'],['o',11.7,PAYINFO]]),
  conv('cancel_1','Cancel',[['c',12,'耿鬼多少'],['o',11.9,'耿鬼450'],['c',11.8,'要'],['o',11.7,PAYINFO],['c',11,'抱歉不要了']])]);
 const l=row(res,'late_1');assert.equal(l.cases[0].status,'awaiting_payment');assert.ok(l.cases[0].evidence.payment_overdue_days>=7);assert.ok(!l.tags.some(t=>t.tag==='abandon_suspected'));
 const c=row(res,'cancel_1');assert.equal(c.cases[0].status,'abandoned');assert.ok(c.tags.some(t=>t.tag==='abandon_suspected'));
});

test('9 重匯識別鍵：補早期訊息、同時間不同訊息、改暱稱都穩定',()=>{
 const T=NOW-3*DAY;
 const base=[['c',T,'耿鬼多少'],['c',T,'皮卡丘多少'],['o',T+1000,'耿鬼450']];
 const a=parse([conv('nick_1040025918571213','Nick',base)]);
 const b=parse([conv('nick_1040025918571213','Nick',[['c',30,'你好'],['o',29.9,'您好'],...base])]);
 const c=parse([conv('newname_1040025918571213','NewName',base)]);
 const keys=r=>r.rows[0].inquiries.map(i=>i.source_key).sort();
 assert.equal(new Set(keys(a)).size,keys(a).length,'同時間不同訊息不同鍵');
 assert.deepEqual(keys(b).filter(k=>keys(a).includes(k)),keys(a),'補早期訊息後原本的鍵不變');
 assert.deepEqual(keys(c),keys(a),'改暱稱（資料夾名稱跟著變）鍵不變');
 assert.equal(c.rows[0].thread_id,'1040025918571213');
});

test('10 同名客人：網站訂單不會自動歸到其中一人；人工確認後才歸戶',()=>{
 const identities=[{id:'i1',customer_id:'c1',platform:'threads',display_name:'Amy'},{id:'i2',customer_id:'c2',platform:'threads',display_name:'Amy'},{id:'i3',customer_id:'c3',platform:'threads',display_name:'Bob'}];
 const profiles=[{id:'c1',alias:'Amy'},{id:'c2',alias:'Amy #1213'},{id:'c3',alias:'Bob'}];
 const orders=[{id:'o1',customer_alias:'Amy',status:'completed',public_subtotal_twd:900},{id:'o2',customer_alias:'Bob',status:'completed',public_subtotal_twd:500}];
 let r=resolveOrderOwners({orders,profiles,identities,links:[]});
 assert.equal(r.owner.get('o1'),undefined,'同名 → 不自動指定');assert.deepEqual(r.pending.map(p=>[p.order_id,p.candidates.sort()]),[['o1',['c1','c2']]]);
 assert.equal(r.owner.get('o2'),'c3','名稱唯一可對應');
 r=resolveOrderOwners({orders,profiles,identities,links:[{order_id:'o1',customer_id:'c2'}]});assert.equal(r.owner.get('o1'),'c2');assert.equal(r.pending.length,0);
 const rows=crmRows({identities,tags:[],inquiries:[],orders,profiles,links:[]});
 assert.equal(rows.find(x=>x.customer_id==='c1').orders.length,0);assert.equal(rows.find(x=>x.customer_id==='c2').orders.length,0);
 assert.equal(rows.find(x=>x.customer_id==='c1').pendingOrders.length,1,'兩位都看得到待確認');
});

test('11 合併後保留營運摘要、問過沒買與備份範圍',async()=>{
 const ui=await read('../crm-ui.mjs');for(const s of ['renderInsights','unconvertedCustomers','markUnconverted','crmSummary','營運摘要','問過沒買'])assert.ok(ui.includes(s),s);
 const svc=await read('../customers-service.mjs');for(const t of ['crm_cases','crm_deals','crm_order_links'])assert.ok(svc.includes(t),'備份包含 '+t);
});

// 資料庫：重匯更新遮蔽摘錄並保留人工結果；舊版識別鍵沿用不重複
test('1+9 重匯：更新既有摘錄遮蔽、保留人工內容；舊識別鍵自動沿用',async()=>{
 const sql=await Promise.all(['./checkout-fixture.sql','../supabase/production/customer-roster.sql','../supabase/production/customer-contacts.sql','../supabase/production/crm-threads.sql','../supabase/review/crm-features.sql','../supabase/review/crm-review-fixes.sql'].map(read));
 const db=new PGlite();for(const s of sql)await db.exec(s);const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const admin=(await q('select user_id from admin_profiles limit 1'))[0].user_id;await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);await db.exec('set role authenticated');
 const batch=(await q("insert into crm_import_batches(source) values('threads') returning id"))[0].id;
 const msgs=[['c',3,'耿鬼多少'],['o',2.9,'耿鬼450'],['c',2.8,'要'],['o',2.7,PAYINFO],['c',2.6,'已匯款，末五碼 45678，皮卡丘還有嗎'],['o',2,'耿鬼 帳號 aaaa1111 密碼 bbbb2222'],['c',1,'皮卡丘還有嗎？剛剛末五碼 45678']];
 const fresh=parse([conv('re_1040025918571299','Re',msgs)]).rows;
 // 模擬舊版：詢問用舊識別鍵（全串索引）且摘錄未遮蔽末五碼
 const legacy=structuredClone(fresh);const ext=legacy[0].external_key;
 legacy[0].inquiries=legacy[0].inquiries.map(i=>({...i,source_key:`threads:${ext}:${i.occurred_at}:4:${i.category}`,excerpt:'已匯款，末五碼 45678，皮卡丘還有嗎'}));
 legacy[0].followups=legacy[0].followups.map(f=>({...f,excerpt:'末五碼 45678'}));
 const imp=async rows=>{const a=(await q('select admin_crm_import_threads($1,$2) r',[batch,JSON.stringify(rows)]))[0].r;
  const b=(await q('select admin_crm_import_suggestions($1,$2) r',[batch,JSON.stringify(rows.map(r=>({external_key:r.external_key,thread_id:r.thread_id,cases:r.cases,deals:r.deals,waits:r.waits})))]))[0].r;return {...a,...b}};
 await imp(legacy);
 const inqBefore=(await q('select count(*)::int n from crm_inquiries'))[0].n;
 // 人工操作：手動標籤、改案件狀態、接受成交、處理待追蹤
 const cid=(await q('select customer_id from crm_identities'))[0].customer_id;
 await q("insert into crm_tags(customer_id,tag,source) values($1,'VIP','manual')",[cid]);
 await q("update crm_cases set status='closed',status_source='manual',note='老闆手動'");
 await q("update crm_deals set status='accepted',amount_twd=450,decided_at=now()");
 await q("update crm_followups set status='done'");
 const r2=await imp(fresh);
 assert.equal((await q('select count(*)::int n from crm_inquiries'))[0].n,inqBefore,'舊識別鍵沿用，不重複');
 assert.ok(r2.inquiries_updated>0,'摘錄已更新');
 const dump=JSON.stringify(await q('select excerpt from crm_inquiries union all select excerpt from crm_followups union all select excerpt from crm_cases union all select evidence::text from crm_deals'));
 assert.ok(!dump.includes('45678'),'所有既有摘錄都重新遮蔽');
 assert.deepEqual((await q("select tag from crm_tags where source='manual'")).map(x=>x.tag),['VIP']);
 assert.deepEqual(await q('select distinct status,status_source,note from crm_cases'),[{status:'closed',status_source:'manual',note:'老闆手動'}]);
 assert.deepEqual(await q('select status,amount_twd from crm_deals'),[{status:'accepted',amount_twd:450}]);
 assert.ok((await q('select status from crm_followups')).length>0);assert.deepEqual([...new Set((await q('select status from crm_followups')).map(x=>x.status))],['done'],'待追蹤處理結果保留');
 const r3=await imp(fresh);assert.equal(r3.inquiries_new+r3.cases_new+r3.deals_new,0,'第三次重匯零新增');
});

test('9 資料庫：同檔重匯、補早期訊息、改暱稱都不重複新增客人、詢問、案件、成交',async()=>{
 const sql=await Promise.all(['./checkout-fixture.sql','../supabase/production/customer-roster.sql','../supabase/production/customer-contacts.sql','../supabase/production/crm-threads.sql','../supabase/review/crm-features.sql','../supabase/review/crm-review-fixes.sql'].map(read));
 const db=new PGlite();for(const s of sql)await db.exec(s);const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const admin=(await q('select user_id from admin_profiles limit 1'))[0].user_id;await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);await db.exec('set role authenticated');
 const batch=(await q("insert into crm_import_batches(source) values('threads') returning id"))[0].id;
 const imp=async rows=>{const a=(await q('select admin_crm_import_threads($1,$2) r',[batch,JSON.stringify(rows)]))[0].r;
  const b=(await q('select admin_crm_import_suggestions($1,$2) r',[batch,JSON.stringify(rows.map(r=>({external_key:r.external_key,thread_id:r.thread_id,cases:r.cases,deals:r.deals,waits:r.waits})))]))[0].r;return {...a,...b}};
 const T=NOW-3*DAY;const msgs=[['c',T,'耿鬼多少'],['c',T,'皮卡丘多少'],['o',T+1000,'耿鬼450'],['c',T+2000,'要'],['o',T+3000,PAYINFO],['c',T+4000,'已匯'],['o',T+5000,'耿鬼 帳號 aaaa1111 密碼 bbbb2222']];
 const count=async()=>Object.fromEntries(await Promise.all(['customer_profiles','crm_identities','crm_inquiries','crm_cases','crm_deals'].map(async t=>[t,(await q(`select count(*)::int n from ${t}`))[0].n])));
 const first=await imp(parse([conv('ken_2000000000000001','Ken',msgs)]).rows);const c1=await count();
 assert.ok(first.inquiries_new>=2&&first.deals_new===1);
 const same=await imp(parse([conv('ken_2000000000000001','Ken',msgs)]).rows);assert.deepEqual(await count(),c1,'同檔重匯');
 assert.equal(same.inquiries_new+same.cases_new+same.deals_new+same.customers_created,0);
 const earlier=await imp(parse([conv('ken_2000000000000001','Ken',[['c',40,'你好 耿鬼還有嗎'],['o',39.9,'有喔'],...msgs])]).rows);
 assert.equal(earlier.customers_created,0);assert.ok(earlier.inquiries_new>=1,'只新增早期那則 '+JSON.stringify(earlier));
 const c2=await count();assert.equal(c2.crm_deals,c1.crm_deals,'成交不重複');
 const renamed=await imp(parse([conv('kenneth_2000000000000001','Kenneth',[['c',40,'你好 耿鬼還有嗎'],['o',39.9,'有喔'],...msgs])]).rows);
 assert.deepEqual(await count(),c2,'改暱稱（資料夾名稱也變）仍是同一位客人、資料不重複');assert.equal(renamed.customers_matched,1);
 assert.equal((await q('select display_name from crm_identities'))[0].display_name,'Kenneth','顯示名稱更新');
});
