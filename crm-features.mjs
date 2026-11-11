// 經營特徵（純計算，不碰資料庫）。成交只算「已接受的歷史成交」＋「已完成的網站訂單」，聊天判斷不算。
import {CASE_STATUS,CASE_PRIORITY,OPEN_STATUSES} from './crm-cases.mjs';
export {CASE_STATUS,CASE_PRIORITY,OPEN_STATUSES};
export const DEFAULT_SETTINGS={high_value_twd:1000,lapsed_days:90};
export const QUICK_FILTERS=[['regular','熟客'],['high_value','高單價成交'],['waiting','等貨'],['owner_to_reply','我欠回覆'],['payment_to_verify','待核款'],['review','成交待確認']];
export const MORE_FILTERS=[['lapsed','回購客久未成交'],['no_deal','有詢價、尚無成交紀錄'],['abandoned','有棄單']];
const DAY=86400000;
const net=d=>Math.max(0,(d.amount_twd??0)-(d.refund_twd??0));

// 一筆成交：已接受、有金額、未全額退款。同一筆買多隻仍算 1 筆。
export function countedDeals(deals=[],orders=[]){
 const a=deals.filter(d=>d.status==='accepted'&&d.amount_twd!=null&&net(d)>0).map(d=>({at:d.occurred_at,net:net(d),source:'threads',id:d.id}));
 // 網站訂單：已完成，扣除退款；全額退款不算
 const b=orders.filter(o=>o.status==='completed').map(o=>({at:o.completed_at??o.created_at,net:Math.max(0,(o.received_amount_twd??o.public_subtotal_twd??0)-(o.refund_amount_twd??0)),source:'order',id:o.id})).filter(o=>o.net>0);
 return [...a,...b].sort((x,y)=>String(y.at).localeCompare(String(x.at)));
}
export function customerFeatures({deals=[],orders=[],cases=[],waits=[],inquiries=[]},settings=DEFAULT_SETTINGS,now=Date.now()){
 const s={...DEFAULT_SETTINGS,...settings};
 const done=countedDeals(deals,orders);const total=done.reduce((n,d)=>n+d.net,0);const max=done.reduce((n,d)=>Math.max(n,d.net),0);
 const last=done[0]?.at??null;
 const open=cases.filter(c=>OPEN_STATUSES.has(c.status)).sort((a,b)=>CASE_PRIORITY.indexOf(a.status)-CASE_PRIORITY.indexOf(b.status)||String(b.last_at).localeCompare(String(a.last_at)));
 const waiting=waits.filter(w=>w.status==='waiting');
 return {dealCount:done.length,total,max,lastDealAt:last,
  regular:done.length>=2,highValue:max>=s.high_value_twd,
  lapsed:done.length>=2&&last!=null&&now-Date.parse(last)>=s.lapsed_days*DAY,
  noDeal:!done.length&&inquiries.length>0,
  review:deals.filter(d=>d.status==='suggested').length,
  waiting,openCases:open,next:open[0]??null,
  abandoned:cases.some(c=>c.status==='abandoned'),
  statuses:new Set(cases.map(c=>c.status))};
}
export function matchesFilter(f,key){
 switch(key){case 'regular':return f.regular;case 'high_value':return f.highValue;case 'waiting':return f.waiting.length>0;
  case 'review':return f.review>0;case 'lapsed':return f.lapsed;case 'no_deal':return f.noDeal;case 'abandoned':return f.abandoned;
  default:return CASE_STATUS[key]?f.openCases.some(c=>c.status===key)||(!OPEN_STATUSES.has(key)&&f.statuses.has(key)):true}
}
// 商品搜尋：名稱、暱稱、摘要、詢價品項、案件品項、成交品項、等貨品項、商品名稱
export function searchText(r,productNames=new Map()){
 const ids=[...(r.inquiries??[]).flatMap(i=>i.product_ids??[]),...(r.cases??[]).flatMap(c=>c.product_ids??[]),...(r.deals??[]).flatMap(d=>d.product_ids??[]),...(r.waits??[]).flatMap(w=>w.product_ids??[])];
 return [r.display_name,r.narrative,...(r.inquiries??[]).flatMap(i=>[...(i.terms??[]),i.excerpt]),...(r.cases??[]).flatMap(c=>c.items??[]),
  ...(r.deals??[]).flatMap(d=>(d.items??[]).map(x=>x.text)),...(r.waits??[]).map(w=>w.item_text),...ids.map(id=>productNames.get(id)??'')].join(' ').toLowerCase()}
export const SORTS={recent:['最近私訊',(a,b)=>String(b.last_seen_at??'').localeCompare(String(a.last_seen_at??''))],
 total:['累計成交額',(a,b)=>b.features.total-a.features.total||b.features.dealCount-a.features.dealCount],
 count:['成交次數',(a,b)=>b.features.dealCount-a.features.dealCount||b.features.total-a.features.total],
 last_deal:['最近成交',(a,b)=>String(b.features.lastDealAt??'').localeCompare(String(a.features.lastDealAt??''))]};
