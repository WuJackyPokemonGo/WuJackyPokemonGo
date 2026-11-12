// CRM 摘要（C5）與「問過沒買」追蹤（C4）：純函式，資料由 crm-ui.mjs 載入後傳入。
// 時間一律以台灣日期計算。成交依據：後台訂單（已收款以上）、匯入的歷史購買、或匯入時判定的「疑似付款」。
import {CATEGORY_LABELS} from './crm-threads-import.mjs';

export const PAID_ORDER_STATES=['paid_awaiting_purchase','ordered_from_supplier','arrived_for_check','completed'];
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

// 把客人資料（含其他名稱）對到 CRM 客人，找出每位客人的成交日期。
export function purchaseDaysByCustomer({profiles=[],orders=[],history=[],tags=[],inquiries=[]}){
 const byName=new Map();
 for(const p of profiles){byName.set(norm(p.alias),p.id);for(const a of p.other_aliases??[])if(!byName.has(norm(a)))byName.set(norm(a),p.id)}
 const days=new Map();const add=(id,day,source,amount)=>{if(!id||!day)return;if(!days.has(id))days.set(id,[]);days.get(id).push({day,source,amount})};
 for(const o of orders)if(PAID_ORDER_STATES.includes(o.status))add(byName.get(norm(o.customer_alias)),taipeiDay(o.received_at||o.created_at),'order',Math.max(0,Number(o.public_subtotal_twd??0)+Number(o.private_adjustments_twd??0)-Number(o.refund_amount_twd??0)));
 for(const h of history)add(byName.get(norm(h.customer_alias)),h.purchased_on,'history',Number(h.amount_twd??0));
 // 疑似付款：匯入時記下的時間點；沒有時間點就用該客人最後一筆詢問日
 const lastInq=new Map();for(const i of inquiries){const d=taipeiDay(i.occurred_at);if(d>(lastInq.get(i.customer_id)??''))lastInq.set(i.customer_id,d)}
 for(const t of tags)if(t.tag==='paid_suspected'){const ts=t.evidence?.timestamp_ms;add(t.customer_id,ts?taipeiDay(ts):lastInq.get(t.customer_id),'paid_suspected',0)}
 for(const v of days.values())v.sort((a,b)=>a.day.localeCompare(b.day));
 return days;
}

export function crmSummary({identities=[],inquiries=[],followups=[],orders=[],history=[],products=[],profiles=[],tags=[],period='today',now=Date.now()}){
 const range=periodRange(period,now),today=taipeiDay(now);
 const inq=inquiries.filter(i=>inRange(taipeiDay(i.occurred_at),range));
 const byCategory=Object.fromEntries(Object.keys(CATEGORY_LABELS).map(k=>[k,0]));for(const i of inq)byCategory[i.category]=(byCategory[i.category]??0)+1;
 const productName=new Map(products.map(p=>[p.id,p.name]));const productCount=new Map(),termCount=new Map();
 for(const i of inq){for(const id of new Set(i.product_ids??[]))productCount.set(id,(productCount.get(id)??0)+1);if(!(i.product_ids??[]).length)for(const t of new Set(i.terms??[]))termCount.set(t,(termCount.get(t)??0)+1)}
 const top=[...[...productCount].map(([id,n])=>({name:productName.get(id)??'（商品已下架）',count:n})),...[...termCount].map(([t,n])=>({name:t+'（未對到商品）',count:n}))]
  .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'zh-Hant')).slice(0,5);
 const open=followups.filter(f=>f.status==='open');
 const purchases=purchaseDaysByCustomer({profiles,orders,history,tags,inquiries});
 const sales={orders:0,orderTotal:0,history:0,historyTotal:0};
 for(const o of orders)if(PAID_ORDER_STATES.includes(o.status)&&inRange(taipeiDay(o.received_at||o.created_at),range)){sales.orders++;sales.orderTotal+=Math.max(0,Number(o.public_subtotal_twd??0)+Number(o.private_adjustments_twd??0)-Number(o.refund_amount_twd??0))}
 for(const h of history)if(inRange(h.purchased_on,range)){sales.history++;sales.historyTotal+=Number(h.amount_twd??0)}
 const asking=new Set(inq.filter(i=>INTENT_CATEGORIES.includes(i.category)).map(i=>i.customer_id));
 const converted=[...asking].filter(id=>(purchases.get(id)??[]).some(p=>inRange(p.day,range)||p.day>range.to)).length;
 return {range,inquiries:inq.length,byCategory,customersAsking:new Set(inq.map(i=>i.customer_id)).size,
  newCustomers:identities.filter(x=>inRange(taipeiDay(x.first_seen_at),range)).length,
  openFollowups:open.length,overdueFollowups:open.filter(f=>f.due_on&&f.due_on<today).length,
  topItems:top,sales,intentCustomers:asking.size,convertedCustomers:converted};
}

export const unconvertedKey=(customerId,lastDay)=>`unconverted:${customerId}:${lastDay}`;

// 問過沒買：期間內有問價／庫存／想買／付款方式的客人，最後一次詢問之後（含當天）沒有成交紀錄。
// minAgeDays：詢問後至少過幾天才列入（剛問的先不算）。已建立追蹤或標「不用追」的（同一個 key）不再列出。
export function unconvertedCustomers({identities=[],inquiries=[],tags=[],followups=[],orders=[],history=[],profiles=[],products=[],now=Date.now(),days=30,minAgeDays=1}){
 const today=taipeiDay(now),from=addDays(today,-days),latest=addDays(today,-minAgeDays);
 const purchases=purchaseDaysByCustomer({profiles,orders,history,tags,inquiries});
 const handled=new Set(followups.map(f=>f.source_key).filter(Boolean));
 const names=new Map(identities.map(x=>[x.customer_id,x.display_name]));const productName=new Map(products.map(p=>[p.id,p.name]));
 const tagSet=new Map();for(const t of tags){if(!tagSet.has(t.customer_id))tagSet.set(t.customer_id,new Set());tagSet.get(t.customer_id).add(t.tag)}
 const group=new Map();
 for(const i of inquiries){if(!INTENT_CATEGORIES.includes(i.category))continue;const d=taipeiDay(i.occurred_at);if(d<from)continue;if(!group.has(i.customer_id))group.set(i.customer_id,[]);group.get(i.customer_id).push({...i,day:d})}
 const out=[];
 for(const [id,list] of group){list.sort((a,b)=>b.day.localeCompare(a.day));const last=list[0].day;if(last>latest)continue;
  if((purchases.get(id)??[]).some(p=>p.day>=last))continue;
  const key=unconvertedKey(id,last);if(handled.has(key))continue;
  const items=[...new Set(list.flatMap(i=>(i.product_ids??[]).length?(i.product_ids??[]).map(p=>productName.get(p)??'（商品已下架）'):(i.terms??[])))].slice(0,5);
  out.push({customer_id:id,name:names.get(id)||'（未命名）',lastDay:last,daysSince:dayDiff(last,today),count:list.length,items,
   categories:[...new Set(list.map(i=>CATEGORY_LABELS[i.category]??i.category))],abandonTag:tagSet.get(id)?.has('abandon_suspected')??false,
   bought:(purchases.get(id)??[]).length>0,key,excerpt:list[0].excerpt??''})}
 return out.sort((a,b)=>Number(b.abandonTag)-Number(a.abandonTag)||b.lastDay.localeCompare(a.lastDay)||a.name.localeCompare(b.name,'zh-Hant'));
}
