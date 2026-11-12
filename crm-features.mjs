// 經營特徵（純計算，不碰資料庫）。成交只算「已接受的歷史成交」＋「已完成的網站訂單」，聊天判斷不算。
import {CASE_STATUS,CASE_PRIORITY,OPEN_STATUSES} from './crm-cases.mjs';
export {CASE_STATUS,CASE_PRIORITY,OPEN_STATUSES};
export const DEFAULT_SETTINGS={high_value_twd:1000,lapsed_days:90};
// 全部特徵篩選。首頁顯示哪些、順序、隱藏由「顯示設定」決定（預設首頁：熟客、高單價成交、等貨），隱藏只影響畫面，資料保留。
export const FEATURES=[['regular','熟客'],['high_value','高單價成交'],['waiting','等貨'],['owner_to_reply','我欠回覆'],['payment_to_verify','待核款'],['review','成交待確認'],
 ['high_budget','高預算意向'],['frequent','常問商品'],['lapsed','回購客久未成交'],['no_deal','有詢價、尚無成交紀錄'],['abandoned','有棄單'],['open_tasks','教學／售後待辦'],['linked','已轉其他管道']];
export const DEFAULT_DISPLAY={top:['regular','high_value','waiting'],hidden:[]};
export function displayLayout(display=DEFAULT_DISPLAY){const d={...DEFAULT_DISPLAY,...display};const hidden=new Set(d.hidden??[]);const known=new Map(FEATURES);
 const top=(d.top??[]).filter(k=>known.has(k)&&!hidden.has(k));const rest=FEATURES.map(([k])=>k).filter(k=>!top.includes(k)&&!hidden.has(k));
 return {top:top.map(k=>[k,known.get(k)]),more:rest.map(k=>[k,known.get(k)]),hidden:[...hidden].filter(k=>known.has(k)).map(k=>[k,known.get(k)])}}
export const QUICK_FILTERS=FEATURES.slice(0,3);export const MORE_FILTERS=FEATURES.slice(3);
// 偏好品類（由商品名稱與詢價線索推斷；商品表沒有分類欄位）
export const CATEGORIES=[['background','地點／特殊背景',/背景|背卡|色背|普背|地點|location|background/i],['shiny','異色',/色違|異色|閃光|shiny|色背|色烈|黑烈/i],['costume_pikachu','服裝皮卡丘',/皮卡丘.*(帽|裝|服|造型|衣)|(帽|裝|服|造型).*皮卡丘|costume|hat pikachu/i],['dynamax','極巨／超極巨',/極巨|dynamax|gigantamax|gmax/i]];
export function categoriesOf(text){const t=String(text??'');return CATEGORIES.filter(([,,rx])=>rx.test(t)).map(([k])=>k)}
const DAY=86400000;
const net=d=>Math.max(0,(d.amount_twd??0)-(d.refund_twd??0));

// 一筆成交：已接受、有金額、未全額退款。同一筆買多隻仍算 1 筆。
export function countedDeals(deals=[],orders=[]){
 const a=deals.filter(d=>d.status==='accepted'&&d.amount_twd!=null&&net(d)>0).map(d=>({at:d.occurred_at,net:net(d),source:'threads',id:d.id}));
 // 網站訂單：已完成，扣除退款；全額退款不算
 const b=orders.filter(o=>o.status==='completed').map(o=>({at:o.completed_at??o.created_at,net:Math.max(0,(o.public_subtotal_twd??o.received_amount_twd??0)-(o.refund_amount_twd??0)),source:'order',id:o.id})).filter(o=>o.net>0);
 return [...a,...b].sort((x,y)=>String(y.at).localeCompare(String(x.at)));
}
export function customerFeatures({deals=[],orders=[],cases=[],waits=[],inquiries=[],tasks=[],identities=[],meta=null},settings=DEFAULT_SETTINGS,now=Date.now()){
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
  budget:(()=>{const b=cases.map(c=>c.evidence?.budget).filter(Boolean).sort((a,b)=>b.amount-a.amount)[0];return b&&b.amount>=s.high_value_twd?b:null})(),
  frequent:frequentItems(inquiries,cases),
  lastInquiryAt:inquiries[0]?.occurred_at??null,
  openTasks:tasks.filter(t=>t.status==='open'),
  channel:channelLabel(identities,meta),
  bought:new Set(deals.filter(d=>d.status==='accepted').flatMap(d=>(d.items??[]).flatMap(i=>categoriesOf(i.text)))),
  asked:new Set([...inquiries.flatMap(i=>categoriesOf([...(i.terms??[]),...((i.evidence?.cues)??[]),i.excerpt].join(' '))),...cases.flatMap(c=>categoriesOf((c.items??[]).join(' ')))]),
  statuses:new Set(cases.map(c=>c.status))};
}
export function matchesFilter(f,key){
 switch(key){case 'regular':return f.regular;case 'high_value':return f.highValue;case 'waiting':return f.waiting.length>0;
  case 'review':return f.review>0;case 'lapsed':return f.lapsed;case 'no_deal':return f.noDeal;case 'abandoned':return f.abandoned;
  case 'high_budget':return !!f.budget;case 'frequent':return f.frequent.length>0;case 'open_tasks':return f.openTasks.length>0;case 'linked':return f.channel.includes('→');
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

// 常問商品：同一品項在至少 2 筆不同詢價（不同案件；沒有案件時以不同日期計）中出現，同一串重複問算 1 筆。品項對應有疑問的標「待確認」。
export function frequentItems(inquiries=[],cases=[]){const seen=new Map();const pending=new Set();
 const caseOf=t=>cases.find(c=>String(c.opened_at)<=String(t)&&String(t)<=String(c.last_at));
 for(const i of inquiries){const key=caseOf(i.occurred_at)?.id??String(i.occurred_at).slice(0,10);for(const t of i.terms??[]){if(!seen.has(t))seen.set(t,new Set());seen.get(t).add(key)}
  for(const t of [...(i.evidence?.pending??[]),...(i.evidence?.unverified??[])])pending.add(t)}
 return [...seen.entries()].filter(([,k])=>k.size>=2).sort((a,b)=>b[1].size-a[1].size).map(([term,k])=>({term,count:k.size,pending:pending.has(term)}))}
// 聯絡管道：最初來源 → 目前管道（例如 Threads → LINE）。目前管道以人工資料為準，否則看已確認關聯的身分。
const PLATFORM={threads:'Threads',line:'LINE',instagram:'Instagram',other:'其他'};
export function channelLabel(identities=[],meta=null){const plats=[...new Set(identities.map(i=>PLATFORM[i.platform]??i.platform))];const first=meta?.first_channel||plats[0]||'Threads';
 const current=meta?.current_channel||(plats.length>1?plats.at(-1):first);return first===current?first:`${first} → ${current}`}
export function filterByWaitingProduct(rows,productId,productName=''){const n=String(productName).toLowerCase();return rows.filter(r=>(r.waits??[]).some(w=>w.status==='waiting'&&((w.product_ids??[]).includes(productId)||(n&&String(w.item_text).toLowerCase().includes(n)))))}
