import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
import {runSheetSync,colLetter} from '../supabase/functions/sheet-sync/core.mjs';
const read=f=>readFile(new URL(f,import.meta.url),'utf8');
const fixture=await read('./checkout-fixture.sql'),sql=await read('../supabase/review/order-reservations.sql');
const ADMIN='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function setup(){
 const db=new PGlite();await db.exec(fixture);
 await db.exec('alter table public.order_items add column if not exists created_at timestamptz default clock_timestamp()');
 await db.exec(sql);await db.exec(sql);// 可重複套用
 const q=async(s,a=[])=>(await db.query(s,a)).rows;
 await db.exec(`select set_config('request.jwt.claim.sub','${ADMIN}',false)`);
 const [A]=await q("insert into products(sku,name_zh) values('WJ-A','耿鬼-洛杉磯') returning id");const [B]=await q("insert into products(sku,name_zh) values('WJ-B','皮卡丘-倫敦') returning id");
 const up=rows=>q('select admin_upsert_account_units($1) r',[JSON.stringify(rows)]).then(r=>r[0].r);
 const order=async(items,status='awaiting_payment')=>{const [o]=await q("insert into orders(channel,customer_alias) values('line','測試客') returning id,order_number");
  for(const [pid,qty] of items)await q('insert into order_items(order_id,product_id,product_name_snapshot,quantity,sale_unit_price_twd,unit_cost_snapshot_twd) values($1,$2,$3,$4,300,100)',[o.id,pid,'商品',qty]);
  if(status!=='pending_review')await q('update orders set status=$2 where id=$1',[o.id,status]);return o};
 const alloc=async id=>(await q('select admin_order_allocation($1) a',[id]))[0].a;
 const units=async()=>q("select unit_code,status,(select order_number from orders o where o.id=u.order_id) num from account_units u order by unit_code");
 return {db,q,A:A.id,B:B.id,up,order,alloc,units};
}

test('sheet units import: maps 商品編號 to products, never trusts pre-reserved rows, adjusts stock ledger once',async()=>{
 const {q,A,up}=await setup();
 const r=await up([{unit_code:'A1',sku:'WJ-A',status:'可出貨'},{unit_code:'A2',sku:'wj-a',status:'可出貨'},{unit_code:'A3',sku:'WJ-A',status:'已保留'},{unit_code:'X1',sku:'NOPE',status:'可出貨'}]);
 assert.equal(r.inserted,3);assert.deepEqual(r.unknown_sku,[{unit_code:'X1',sku:'NOPE'}]);
 assert.equal((await q("select status from account_units where unit_code='A3'"))[0].status,'verifying','untrusted 已保留 from the sheet becomes 待驗證');
 assert.equal((await q('select quantity_on_hand from inventory_balances where product_id=$1',[A]))[0].quantity_on_hand,3);
 // 已有期初庫存的商品第一次匯入：對齊成帳號數，不是累加
 const [Bp]=await q("select id from products where sku='WJ-B'");await q("insert into inventory_balances(product_id,quantity_on_hand) values($1,5) on conflict(product_id) do update set quantity_on_hand=5",[Bp.id]);
 await up([{unit_code:'B1',sku:'WJ-B',status:'可出貨'},{unit_code:'B2',sku:'WJ-B',status:'停用'}]);assert.equal((await q('select quantity_on_hand from inventory_balances where product_id=$1',[Bp.id]))[0].quantity_on_hand,1);
 const again=await up([{unit_code:'A1',sku:'WJ-A',status:'可出貨'},{unit_code:'A3',sku:'WJ-A',status:'可出貨'}]);assert.equal(again.inserted,0);assert.equal(again.updated,1);
 assert.equal((await q('select quantity_on_hand from inventory_balances where product_id=$1',[A]))[0].quantity_on_hand,3,'re-sync does not add stock again');
 await q("set role anon");await assert.rejects(q('select * from account_units'),/permission denied/);await q('reset role');
});

test('reservation cases: enough, partial, none, last-unit race, resubmit, cancel release, delivery without double deduction',async()=>{
 const {q,A,B,up,order,alloc,units}=await setup();
 await up([{unit_code:'A1',sku:'WJ-A',status:'可出貨'},{unit_code:'A2',sku:'WJ-A',status:'可出貨'},{unit_code:'A3',sku:'WJ-A',status:'可出貨'},{unit_code:'A4',sku:'WJ-A',status:'待驗證'},{unit_code:'B1',sku:'WJ-B',status:'可出貨'}]);
 // ① 庫存足夠：訂 2 份 → 保留 2、待叫貨 0；待審中的訂單不保留
 const pend=await order([[A,1]],'pending_review');assert.equal((await alloc(pend.id))[0].reserved,0);
 const o1=await order([[A,2]]);let a=await alloc(o1.id);assert.deepEqual([a[0].ordered,a[0].reserved,a[0].backorder],[2,2,0]);
 // ② 部分缺貨：訂 3、剩 1 可出貨（A4 待驗證不算）→ 保留 1、待叫貨 2
 const o2=await order([[A,3]]);a=await alloc(o2.id);assert.deepEqual([a[0].reserved,a[0].backorder],[1,2]);
 // ③ 完全缺貨：再訂 1 → 保留 0、待叫貨 1；同一張多項商品逐項顯示
 const o3=await order([[A,1],[B,1]]);a=await alloc(o3.id);assert.deepEqual(a.map(x=>[x.reserved,x.backorder]),[[0,1],[1,0]]);
 // ④ 兩張搶最後一份：B1 已被 o3 拿走 → 新訂單 0 保留；且沒有任何帳號被重複綁定
 const o4=await order([[B,1]]);assert.equal((await alloc(o4.id))[0].reserved,0);
 assert.equal((await q("select count(*)::int n from (select order_id from account_units where status='reserved' group by id,order_id) x"))[0].n,4);
 // ⑤ 重送同一張訂單：重跑保留、狀態來回觸發，不會多保留，也不會多排同步
 const before=(await q('select count(*)::int n from sheet_sync_queue'))[0].n;
 await q('select admin_reserve_order($1)',[o1.id]);await q('select admin_reserve_order($1)',[o1.id]);await q("update orders set status='paid_awaiting_purchase' where id=$1",[o1.id]);
 a=await alloc(o1.id);assert.deepEqual([a[0].reserved,a[0].backorder],[2,0]);assert.equal((await q('select count(*)::int n from sheet_sync_queue'))[0].n,before);
 // ⑥ 取消釋回：o2 取消 → A3 回可出貨；再補保留，o3 依成立順序拿到 A3
 await q("update orders set status='cancelled' where id=$1",[o2.id]);
 assert.equal((await q("select status from account_units where unit_code='A3'"))[0].status,'available');
 await q('select admin_fill_backorders()');assert.deepEqual((await alloc(o3.id)).map(x=>[x.reserved,x.backorder]),[[1,0],[1,0]]);
 // ⑦ 交付不重扣：o1 完成 → 庫存帳 A 從 4 扣 2；帳號改已交付；同一把冪等鍵重送不再扣
 await q("update orders set status='ordered_from_supplier' where id=$1",[o1.id]);await q("update orders set status='arrived_for_check' where id=$1",[o1.id]);
 const bal=async()=>(await q('select quantity_on_hand from inventory_balances where product_id=$1',[A]))[0].quantity_on_hand;assert.equal(await bal(),4);
 const key='11111111-1111-4111-8111-111111111111';
 await q('select * from private.admin_complete_order_and_deduct_stock($1,$2)',[o1.id,key]);assert.equal(await bal(),2);
 await q('select * from private.admin_complete_order_and_deduct_stock($1,$2)',[o1.id,key]);assert.equal(await bal(),2,'retry does not deduct twice');
 a=await alloc(o1.id);assert.deepEqual([a[0].reserved,a[0].delivered,a[0].backorder],[0,2,0]);
 assert.equal((await q("select count(*)::int n from inventory_movements where related_order_id=$1 and movement_type='sale'",[o1.id]))[0].n,1);
 // 交付後退款：已交付帳號不釋放
 await q("update orders set status='refund_pending' where id=$1",[o1.id]);assert.equal((await q("select count(*)::int n from account_units where order_id=$1 and status='delivered'",[o1.id]))[0].n,2);
 // 還有待叫貨的訂單不能完成交付
 const o5=await order([[A,2]]);await q("update orders set status='paid_awaiting_purchase' where id=$1",[o5.id]);await q("update orders set status='ordered_from_supplier' where id=$1",[o5.id]);await q("update orders set status='arrived_for_check' where id=$1",[o5.id]);
 await assert.rejects(q('select * from private.admin_complete_order_and_deduct_stock($1,$2)',[o5.id,'22222222-2222-4222-8222-222222222222']),/待叫貨/);
 const final=await units();assert.ok(final.every(u=>(u.status==='reserved'||u.status==='delivered')===(u.num!=null)));
});

test('sheet sync writes each unit result once, survives a failed run and retries without touching credentials',async()=>{
 const {q,A,up,order}=await setup();
 await up([{unit_code:'A1',sku:'WJ-A',status:'可出貨'},{unit_code:'A2',sku:'WJ-A',status:'可出貨'}]);
 const o=await order([[A,1]]);await q("update orders set status='cancelled' where id=$1",[o.id]);await order([[A,1]]);
 // 試算表：A 帳號編號｜B 帳號(帳密，不得讀取)｜C 商品編號｜D 狀態｜E 訂單編號
 const grid=[['帳號編號','帳號','商品編號','狀態','訂單編號'],['A1','secret-1','WJ-A','可出貨',''],['A2','secret-2','WJ-A','可出貨','']];
 const reads=[];let failNext=true;const writes=[];
 const sheet={async getValues(range){reads.push(range);const m=range.match(/!([A-Z]+)?(\d+):([A-Z]+)?(\d*)$/);if(range.endsWith('!1:1'))return [grid[0]];const c=m[1].charCodeAt(0)-65;return grid.slice(1).map(r=>[r[c]])},
  async batchUpdate(data){if(failNext){failNext=false;throw Error('Google API 503')}for(const d of data){const m=d.range.match(/!([A-Z]+)(\d+)$/);grid[Number(m[2])-1][m[1].charCodeAt(0)-65]=d.values[0][0];writes.push(d.range)}}};
 const claim=n=>q('select * from sheet_sync_claim($1)',[n]),finish=(d,f)=>q('select sheet_sync_finish($1,$2)',[d,JSON.stringify(f)]);
 const pending=(await q("select unit_code,status_label,order_number,state from sheet_sync_queue where state='pending' order by id")).map(r=>r.unit_code+':'+r.status_label);
 assert.deepEqual(pending,['A1:已保留'],'A1 reserved→released→reserved collapses to the latest version only');
 const r1=await runSheetSync({claim,finish,sheet});assert.deepEqual([r1.done,r1.failed],[0,1]);
 const st=(await q('select admin_sheet_sync_status() s'))[0].s;assert.equal(st.failed,1);assert.match(st.last_error,/503/);
 assert.equal((await q("select status from account_units where unit_code='A1'"))[0].status,'reserved','reservation stays valid while the sheet is behind');
 assert.equal((await q('select admin_retry_sheet_sync() n'))[0].n,1);
 const r2=await runSheetSync({claim,finish,sheet});assert.deepEqual([r2.done,r2.failed],[1,0]);
 assert.deepEqual(grid[1].slice(3),['已保留',String((await q('select order_number from orders order by order_number desc limit 1'))[0].order_number)]);
 const r3=await runSheetSync({claim,finish,sheet});assert.equal(r3.claimed,0,'nothing is written twice');
 assert.ok(reads.every(r=>/!1:1$|!A2:A$/.test(r)),'only the header row and the 帳號編號 column are read');assert.ok(writes.every(w=>/!(D|E)\d+$/.test(w)));
 assert.equal(colLetter(0),'A');assert.equal(colLetter(26),'AA');
});
test('admin shows per-item ordered/reserved/delivered/backorder and a plain summary',async()=>{
 const {allocationRows,allocationSummary}=await import('../reservations-ui.mjs');
 const rows=[{product:'耿鬼',ordered:3,reserved:2,delivered:0,backorder:1},{product:'皮卡丘',ordered:1,reserved:0,delivered:1,backorder:0}];
 assert.deepEqual(allocationRows(rows).map(r=>r.backorder),[1,0]);assert.equal(allocationSummary(rows),'待叫貨 1 份（已保留 2、已交付 1）');
 assert.equal(allocationSummary([{ordered:2,reserved:2,delivered:0,backorder:0}]),'全部到位（已保留 2、已交付 0）');
});
test('sheet-sync function: only admins (or the cron secret for push) can run it; pull maps three columns only',async()=>{
 const {createSheetSyncHandler}=await import('../supabase/functions/sheet-sync/worker.mjs');
 const calls=[];const fetcher=async(url,opt)=>{calls.push([url.split('/rpc/')[1],opt.headers.Authorization]);const name=url.split('/rpc/')[1];
  if(name==='admin_sheet_sync_status')return opt.headers.Authorization==='Bearer admin'?new Response('{}'):new Response('denied',{status:401});
  if(name==='admin_upsert_account_units')return new Response(JSON.stringify({inserted:JSON.parse(opt.body).p_rows.length,updated:0,kept_reserved:0,unknown_sku:[]}));
  if(name==='sheet_sync_claim')return new Response('[]');return new Response('null')};
 const reads=[];const sheet={async getValues(r){reads.push(r);if(r.endsWith('!1:1'))return [['帳號編號','帳號','密碼','商品編號','狀態','訂單編號']];return {"'帳號明細'!A2:A":[['U1'],['U2']],"'帳號明細'!D2:D":[['WJ-A'],['WJ-A']],"'帳號明細'!E2:E":[['可出貨'],['待驗證']]}[r]??[]},async batchUpdate(){}};
 const h=createSheetSyncHandler({url:'https://x.supabase.co',anonKey:'anon',serviceKey:'service',cronSecret:'cron',makeSheet:async()=>sheet,fetcher});
 const post=(body,headers)=>h(new Request('https://f/sheet-sync',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}));
 assert.equal((await post({action:'pull'},{authorization:'Bearer someone'})).status,403);
 assert.equal((await post({action:'pull'},{'x-sync-secret':'cron'})).status,403,'cron may only push');
 assert.equal((await post({action:'push'},{'x-sync-secret':'cron'})).status,200);
 const r=await post({action:'pull'},{authorization:'Bearer admin'});assert.equal(r.status,200);assert.equal((await r.json()).inserted,2);
 assert.ok(reads.every(x=>/!1:1$|!A2:A$|!D2:D$|!E2:E$/.test(x)),'never reads columns B/C (credentials)');
 assert.ok(calls.some(([n,a])=>n==='admin_upsert_account_units'&&a==='Bearer admin'),'units are written as the signed-in admin');
});
