// CRM 摘要（C5）與「問過沒買」追蹤（C4）：純函式，資料由 crm-ui.mjs 載入後傳入。
// 時間一律以台灣日期計算。成交依據：後台訂單（已收款以上，或退款後仍保有實收款）、匯入的歷史購買、
// 匯入時判定的「疑似付款」（有時間點才算；沒有時間點只提示，不推定成交日）。
import {CATEGORY_LABELS} from './crm-threads-import.mjs';

export const PAID_ORDER_STATES=['paid_awaiting_purchase','ordered_from_supplier','arrived_for_check','completed'];
export const REFUND_STATES=['refund_pending','refunded'];
export const INTENT_CATEGORIES=['price','stock','buy','payment'];
export const taipeiDay=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'}):''};
const norm=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const addDays=(day,n)=>{const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const dayDiff=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000);

// 期間：today／week（週一起算）／month，回傳台灣日期 [from, to]（含頭含尾）。
export function periodRange(kind,now=Date.now()){
 const today=taipeiDay(now);
 if(kind==='week'){const dow=(new Date(today+'T00:00:00Z').getUTCDay()+6)%7;return {from:addDays(today,-dow),to:today}}
 if(kind==='month')return {from:today.slice(0,8)+'01',to:today};
 return {from:today,to:today};
}
const inRange=(day,{from,to})=>day>=from&&day<=to;

// 訂單算不算成交、算多少：已收款以上照售價；退款中／已退款只算退款後仍留下的實收款。
export function orderSale(o){
 if(PAID_ORDER_STATES.includes(o.status))return Math.max(0,Number(o.public_subtotal_twd??0)+Number(o.private_adjustments_twd??0)-Number(o.refund_amount_twd??0));
 if(REFUND_STATES.includes(o.status)){const kept=Number(o.received_amount_twd??0)-Number(o.refund_amount_twd??0);return kept>0?kept:null}
 return null;
}

// 客人名稱對應：主名稱優先；別名只有在不跟別人的主名稱或別名重複時才使用，重複的列為待核對。
export function nameIndex(profiles=[]){
 const main=new Map(),aliasOwners=new Map(),mainOwners=new Map();
 // 主名稱：正規化後（全形半形、大小寫、空白）相同的多位客人也算歧義，不歸戶
 for(const p of profiles){const k=norm(p.alias);if(!k)continue;if(!mainOwners.has(k))mainOwners.set(k,new Set());mainOwners.get(k).add(p.id)}
 const ambiguousMain=[];for(const [k,owners] of mainOwners){if(owners.size===1)main.set(k,[...owners][0]);else ambiguousMain.push(k)}
 for(const p of profiles)for(const a of new Set((p.other_aliases??[]).map(norm)))if(a&&!mainOwners.has(a)){if(!aliasOwners.has(a))aliasOwners.set(a,new Set());aliasOwners.get(a).add(p.id)}
 const byName=new Map(main),ambiguous=[...ambiguousMain];
 for(const [a,owners] of aliasOwners){if(owners.size===1)byName.set(a,[...owners][0]);else ambiguous.push(a)}
 return {byName,ambiguous:ambiguous.sort()};
}

// 每位客人的成交日期（台灣日期，已排序）。paidUnknown：有疑似付款標籤但沒有時間點的客人。
export function purchaseDaysByCustomer({profiles=[],orders=[],history=[],tags=[]}){
 const {byName,ambiguous}=nameIndex(profiles);
 const days=new Map(),paidUnknown=new Set();const add=(id,day,source,amount)=>{if(!id||!day)return;if(!days.has(id))days.set(id,[]);days.get(id).push({day,source,amount})};
 for(const o of orders){const amt=orderSale(o);if(amt!=null)add(byName.get(norm(o.customer_alias)),taipeiDay(o.received_at||o.created_at),'order',amt)}
 for(const h of history)add(byName.get(norm(h.customer_alias)),h.purchased_on,'history',Number(h.amount_twd??0));
 for(const t of tags)if(t.tag==='paid_suspected'){const ts=t.evidence?.timestamp_ms;if(ts)add(t.customer_id,taipeiDay(ts),'paid_suspected',0);else paidUnknown.add(t.customer_id)}
 for(const v of days.values())v.sort((a,b)=>a.day.localeCompare(b.day));
 days.paidUnknown=paidUnknown;days.ambiguousAliases=ambiguous;
 return days;
}

export function crmSummary({identities=[],inquiries=[],followups=[],orders=[],history=[],products=[],profiles=[],tags=[],purchases=null,period='today',now=Date.now()}){
 const range=periodRange(period,now),today=taipeiDay(now);
 purchases??=purchaseDaysByCustomer({profiles,orders,history,tags});
 const inq=[];for(const i of inquiries){const d=i.day??taipeiDay(i.occurred_at);if(inRange(d,range))inq.push({...i,day:d})}
 const byCategory=Object.fromEntries(Object.keys(CATEGORY_LABELS).map(k=>[k,0]));for(const i of inq)byCategory[i.category]=(byCategory[i.category]??0)+1;
 const productName=new Map(products.map(p=>[p.id,p.name]));const productCount=new Map(),termCount=new Map();
 for(const i of inq){for(const id of new Set(i.product_ids??[]))productCount.set(id,(productCount.get(id)??0)+1);if(!(i.product_ids??[]).length)for(const t of new Set(i.terms??[]))termCount.set(t,(termCount.get(t)??0)+1)}
 const top=[...[...productCount].map(([id,n])=>({name:productName.get(id)??'（商品已下架）',count:n})),...[...termCount].map(([t,n])=>({name:t+'（未對到商品）',count:n}))]
  .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'zh-Hant')).slice(0,5);
 const open=followups.filter(f=>f.status==='open');
 const sales={orders:0,orderTotal:0,history:0,historyTotal:0};
 for(const o of orders){const amt=orderSale(o);if(amt!=null&&inRange(taipeiDay(o.received_at||o.created_at),range)){sales.orders++;sales.orderTotal+=amt}}
 for(const h of history)if(inRange(h.purchased_on,range)){sales.history++;sales.historyTotal+=Number(h.amount_twd??0)}
 // 轉換：期間內第一次表達購買意圖之後（含當天）、到今天為止有成交，才算已成交；之前買的不算這次的轉換。
 const firstIntent=new Map();for(const i of inq)if(INTENT_CATEGORIES.includes(i.category)&&(!firstIntent.has(i.customer_id)||i.day<firstIntent.get(i.customer_id)))firstIntent.set(i.customer_id,i.day);
 let converted=0;for(const [id,d] of firstIntent)if((purchases.get(id)??[]).some(p=>p.day>=d&&p.day<=today))converted++;
 return {range,inquiries:inq.length,byCategory,customersAsking:new Set(inq.map(i=>i.customer_id)).size,
  newCustomers:identities.filter(x=>inRange(taipeiDay(x.first_seen_at),range)).length,
  openFollowups:open.length,overdueFollowups:open.filter(f=>f.due_on&&f.due_on<today).length,
  topItems:top,sales,intentCustomers:firstIntent.size,convertedCustomers:converted};
}

export const unconvertedKey=(customerId,lastDay)=>`unconverted:${customerId}:${lastDay}`;

// 問過沒買：期間內有問價／庫存／想買／付款方式的客人，最後一次詢問之後（含當天）沒有成交紀錄。
// minAgeDays：詢問後至少過幾天才列入（剛問的先不算）。已建立追蹤或標「不用追」的（同一個 key）不再列出。
export function unconvertedCustomers({identities=[],inquiries=[],tags=[],followups=[],orders=[],history=[],profiles=[],products=[],purchases=null,now=Date.now(),days=30,minAgeDays=1}){
 const today=taipeiDay(now),from=addDays(today,-days),latest=addDays(today,-minAgeDays);
 purchases??=purchaseDaysByCustomer({profiles,orders,history,tags});
 const handled=new Set(followups.map(f=>f.source_key).filter(Boolean));
 const names=new Map(identities.map(x=>[x.customer_id,x.display_name]));const productName=new Map(products.map(p=>[p.id,p.name]));
 const tagSet=new Map();for(const t of tags){if(!tagSet.has(t.customer_id))tagSet.set(t.customer_id,new Set());tagSet.get(t.customer_id).add(t.tag)}
 const group=new Map();
 for(const i of inquiries){if(!INTENT_CATEGORIES.includes(i.category))continue;const d=i.day??taipeiDay(i.occurred_at);if(d<from)continue;if(!group.has(i.customer_id))group.set(i.customer_id,[]);group.get(i.customer_id).push({...i,day:d})}
 const out=[];
 for(const [id,list] of group){list.sort((a,b)=>b.day.localeCompare(a.day));const last=list[0].day;if(last>latest)continue;
  if((purchases.get(id)??[]).some(p=>p.day>=last&&p.day<=today))continue;
  const key=unconvertedKey(id,last);if(handled.has(key))continue;
  const items=[...new Set(list.flatMap(i=>(i.product_ids??[]).length?(i.product_ids??[]).map(p=>productName.get(p)??'（商品已下架）'):(i.terms??[])))].slice(0,5);
  out.push({customer_id:id,name:names.get(id)||'（未命名）',lastDay:last,daysSince:dayDiff(last,today),count:list.length,items,
   categories:[...new Set(list.map(i=>CATEGORY_LABELS[i.category]??i.category))],abandonTag:tagSet.get(id)?.has('abandon_suspected')??false,
   bought:(purchases.get(id)??[]).some(p=>p.day<=today),paidUnknown:purchases.paidUnknown?.has(id)??false,key,excerpt:list[0].excerpt??''})}
 return out.sort((a,b)=>Number(b.abandonTag)-Number(a.abandonTag)||b.lastDay.localeCompare(a.lastDay)||a.name.localeCompare(b.name,'zh-Hant'));
}
