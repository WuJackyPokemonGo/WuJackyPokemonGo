// Threads 對話 → 案件（每筆詢價／交易各自一個狀態）、歷史成交建議、到貨等候。
// 全部是「建議」：成交要管理員在後台按「接受」才算數；聊天提到已匯款只會變成「待核款」。
// 在管理員瀏覽器裡執行，輸入是原始私訊，輸出只含遮蔽後的短摘錄與證據時間點。
//
// 2026-11-21 依 GPT 複驗修正：
// ・交付要有實際帳密內容（「密碼」後面接英數字）；「改密碼後再試」等教學、登入問題與售後回覆不算交付；
//   提到密碼但看不出交付 → 案件標「交付待確認」。
// ・報價對應商品：每則報價記下是哪個商品；成交金額只用交付品項對得上的報價，對不上就留空待確認。
// ・交付依品項配對到案件（同一單多隻、分批交付、不同訂單交錯）。
// ・幣別：外幣保留原始幣別與金額，不填台幣、不換算。
// ・付款：要有付款文字；只有圖片標「付款證據待確認」，不算付款。
// ・棄單：要有明確取消；只是時間過了 → 待付款（逾期 N 天）。
// ・我欠回覆：看客人最後一輪實際的需求；「謝謝，我先想想」這類禮貌或延後回覆不算。

export const CASE_STATUS={
 owner_to_reply:'我欠回覆',payment_to_verify:'待核款',to_deliver:'待交付',awaiting_payment:'待付款',
 waiting_stock:'等貨',quoted:'已報價待回覆',quote_lapsed:'報價後客人未回',abandoned:'棄單',done:'已成交',closed:'已結束'};
// 下一步的優先順序（數字小＝先處理）
export const CASE_PRIORITY=['payment_to_verify','to_deliver','owner_to_reply','awaiting_payment','waiting_stock','quoted','quote_lapsed','abandoned','done','closed'];
export const OPEN_STATUSES=new Set(['owner_to_reply','payment_to_verify','to_deliver','awaiting_payment','waiting_stock','quoted']);

const DAY=86400000;
// 交付：密碼／帳密後面接著英數字帳密，或「帳號 xxx … 密碼」成對出現
export const CRED=/(?:密碼|帳密|password|pw)\s*(?:皆為|皆是|都是|都為|一樣是|統一為?|是|為)?\s*[:：;；]?\s*[\x21-\x7e]{4,}|(?:帳號|account)\s*[:：]?\s*[\x21-\x7e]{4,}[\s\S]{0,80}?(?:密碼|password)/i;
// 售後重設（已交付過的案件裡重給新密碼）不算新的一次交付
const RESEND=/新密碼|改成|改為|重設|重置|重新給|再給一次|更新密碼/;
const MENTIONS_CRED=/密碼|帳密|帳號/;
const PAY_INFO=/行號|帳號.{0,6}\d|\d{3}-|中信|國泰|郵局|提供轉帳截圖|匯款至|轉帳至|戶名|paypal|wise|line ?pay|街口帳號/i;
const PAID=/已匯|匯好|匯了|已轉|轉好|轉了|付款了|已付|付好|匯款完成|轉帳完成|已完成匯款|款項匯出|\bpaid\b|transferred|sent (?:the )?payment/i;
// 圖片旁邊有這些字才當付款證據；只有圖片 → 付款證據待確認
const PAY_WORDS=/截圖|收據|明細|轉帳|匯款|付款|已匯|已轉|末[一二三四五六七八九十0-9]碼|receipt|transfer/i;
const CANCEL=/不要了|不用了|取消|算了|先不買|不買了|先不用|先不要|改天再|下次再買|沒辦法買|放棄|不考慮了|cancel/i;
const ASK={price:/多少|價格|價錢|價位|怎麼賣|報價|售價|how much|price/i,stock:/還有(嗎|貨|沒|嘛)|有貨|現貨|有嗎|有沒有|還在嗎|有賣/i,buy:/我要|想買|要買|購買|想要|收一|收兩|我收|^收$|^要$|幫我留|保留|預約|都要/i};
const QUESTION=/[?？]|嗎|呢|請問|能不能|可不可以|可以.{0,8}嗎|怎麼|如何|何時|什麼時候|多久/;
// 禮貌、收尾、延後：不是待回答的問題
const POLITE=/^(?:謝謝|感謝|謝啦|好的?|好喔|好唷|好哦|好呦|ok|okay|了解|瞭解|收到|知道了|嗯|恩|👍|🙏|thank|thx)/i;
const DEFER=/先想想|考慮|再看看|再想想|晚點|再說|下次|再跟你說|再跟您說|再決定|再聯絡|改天|等等再/;
const WAIT=/有貨(再)?(通知|跟您說|跟你說)|有多的(再|我)?(跟您說|跟你說|通知)|幫您登記|有幫您登記|已登記|出貨會告知|到貨通知|有貨通知/;
const AGREE=/可以|ok|好的?|沒問題|行|收到/i;
const CUST_ACCEPT=/^(收|我收|要|好|可以|ok|okay|成交|買)|收一|要一|我要|那我收|我收了/i;
// 教學與售後：客人問換綁方法／換綁失敗／付款後催交付
export const TASK_KINDS={rebind_tutorial:'需要換綁教學',rebind_failed:'換綁失敗',delivery_chase:'催交付',other:'其他'};
const REBIND_ASK=/怎麼(換綁|綁定|解綁|改綁)|如何(換綁|綁定|解綁|改綁)|換綁|改綁|解綁|解不了|綁定/;
const REBIND_FAIL=/綁不了|綁不上|換綁失敗|解不了|登不進|登入不了|無法登入|被登出|登不上/;
const CHASE=/有收到嗎|什麼時候|還沒|在嗎|多久|幾點|請問.{0,6}(帳號|帳密)|收到了嗎|給帳號|給帳密/;

// 幣別：明確標示才算外幣；沒有標示或 NT$／台幣／元／塊 視為台幣。只有「$」也視為台幣（台灣常用寫法，見 CRM-FEATURES.md 限制）。
const CURRENCY=[['USD',/USD|US\$|美金|美元|\$US/i],['JPY',/JPY|日幣|日圓|日元|円|¥|￥/i],['HKD',/HKD|HK\$|港幣|港元/i],['CNY',/RMB|CNY|人民幣/i],
 ['MYR',/MYR|馬幣|令吉|\bRM/i],['SGD',/SGD|S\$|新幣|新加坡幣/i],['EUR',/EUR|€|歐元/i],['KRW',/KRW|韓元|韓幣|₩/i],['THB',/THB|泰銖|泰幣/i],['AUD',/AUD|A\$|澳幣/i],['GBP',/GBP|£|英鎊/i]];
function currencyNear(t,start,end){const around=t.slice(Math.max(0,start-6),Math.min(t.length,end+5));for(const [c,rx] of CURRENCY)if(rx.test(around))return c;return 'TWD'}

// 從一段文字找價格候選。排除日期、時間、天數、銀行代碼與帳號。回傳 {value,total,each,currency,index}
export function priceCandidates(text){
 const t=String(text??'').replace(/\d{1,2}\/\d{1,2}/g,m=>' '.repeat(m.length)).replace(/\d+\s*(?:-\s*\d+\s*)?(?:點|天|小時|分鐘|號|日|等|iv|%|趴|隻|個|套|組|人|次)/gi,m=>/[隻個套組]$/.test(m)?m.replace(/\d+/,d=>' '.repeat(d.length)):' '.repeat(m.length))
  .replace(/(?:行號|街口|中信|國泰|郵局|銀行|代碼)\s*\d*/g,m=>' '.repeat(m.length)).replace(/8591|85實收|7-?11/g,m=>' '.repeat(m.length)).replace(/\d{3}-\S*/g,m=>' '.repeat(m.length));
 const out=[];const rx=/(共|總共|一套|=|＝|一組|總計|合計)?\s*(?<![\d,.])([1-9]\d{0,2}(?:,\d{3})+|[1-9]\d{1,4})(?![\d,.])/g;let m;
 while((m=rx.exec(t))){const v=Number(m[2].replace(/,/g,''));const cur=currencyNear(t,m.index,m.index+m[0].length);if((cur==='TWD'&&v<30)||v<1||v>99999)continue;
  out.push({value:v,total:!!m[1],each:/一隻|一個|各|每隻|單隻|一隻是/.test(t.slice(Math.max(0,m.index-6),m.index+m[0].length)),currency:cur,index:m.index})}
 return out}
const customerOffer=text=>{const m=String(text??'').match(/(?<![\d,])([1-9]\d{1,4})\s*(收|可以嗎|嗎|行嗎|可嗎)/);return m?{value:Number(m[1]),currency:currencyNear(String(text),m.index,m.index+m[0].length)}:null};
// 客人寫的整筆金額：「總共1200」「那總共1000對吧」「100對嗎」
const customerTotal=text=>{const s=String(text??'');const m=s.match(/(?:總共|一共|總計|合計|共)\s*(?:NT\$?|\$)?\s*([1-9]\d{1,4}(?:,\d{3})?)/)??s.match(/(?<![\d,])([1-9]\d{1,4}(?:,\d{3})?)\s*(?:元|塊)?\s*(?:對吧|對嗎|對不對|沒錯吧)/)??s.match(/(?:這樣是?|就是|總共是?|全部)\s*([1-9]\d{1,4}(?:,\d{3})?)\s*(?:元|塊)?\s*(?:嗎|對吧|吧)/);
 if(!m)return null;const v=Number(m[1].replace(/,/g,''));return v>=30?{value:v,currency:currencyNear(s,m.index,m.index+m[0].length)}:null};
const paidAmount=text=>{const s=String(text??'');const m=s.match(/(?:轉帳|匯款?|轉了?|匯了?)\s*(?:NT\$?|\$)?\s*([1-9]\d{1,4}(?:,\d{3})?)\s*(?:元|塊)|\$\s*([1-9]\d{1,2}(?:,\d{3})?|[1-9]\d{1,4})(?![\d,])/);return m?{value:Number((m[1]??m[2]).replace(/,/g,'')),currency:currencyNear(s,m.index,m.index+m[0].length)}:null};

// 交付訊息的品項文字與數量（「蜥蜴王 帳號… 密碼…」→ 蜥蜴王）
export function deliveryItems(raw,maskText){
 // 一則訊息可能交付多隻：「快龍 帳號 A 密碼 B 卡比獸 帳號 C 密碼 D」→ 快龍、卡比獸
 const pieces=String(raw??'').split(/密碼\s*[:：]?\s*\S+/).map(x=>x.split(/帳號/)[0]);
 const clean=x=>maskText(x).replace(/\[[^\]]*\]/g,' ').replace(/帳密|[:：]|皆為|中央站|✨|‼️|登入|再確認看看|感謝|久等/g,' ').replace(/\s+/g,' ').trim();
 const names=pieces.map(clean).filter(x=>/[一-鿿A-Za-z]/.test(x));
 const text=names.join(' ').slice(0,60);
 let qty=0;const toks=text.split(' ').filter(x=>/[一-鿿A-Za-z]/.test(x));let absorb=0;
 for(const tok of toks){const m=tok.match(/[*＊×x]\s*(\d{1,2})$/i);if(m){qty+=Number(m[1]);absorb=Number(m[1]);continue}if(absorb>0&&tok.length<=3){absorb--;continue}absorb=0;qty+=1}
 return {text:text||'（品項未寫在交付訊息）',qty:Math.min(Math.max(qty,1),50)}}

// 同一個商品可能有幾種叫法（「呱呱泡蛙」「紅隊」都指同一件商品）：商品集合有交集就當同一個品項。
function sameItem(a,b,productsOf){if(a===b)return true;const pa=productsOf(a),pb=productsOf(b);return pa.length>0&&pa.some(x=>pb.includes(x))}
function groups(terms,productsOf){const out=[];for(const t of terms){const g=out.find(x=>x.some(y=>sameItem(y,t,productsOf)));if(g)g.push(t);else out.push([t])}return out}
// 店主報價：每個價格對到哪些品項。報價訊息本身寫了品項 → 價格歸給它前面最近的品項；
// 沒寫品項 → 用上一段客人訊息提到的品項；提到兩個以上品項就是「品項不明」。
function quotesFrom(text,ts,index,contextTerms,productsOf){
 const c=priceCandidates(text);if(!c.length)return [];
 const lower=String(text).toLowerCase();const found=index.match(text).map(f=>({term:f.term,products:f.products,at:Math.max(lower.indexOf((f.said??f.term).toLowerCase()),0)}));
 return c.map(p=>{let items;
  if(p.total)items=found.length?found.map(f=>f.term):[...contextTerms];
  else if(found.length){const before=found.filter(f=>f.at<=p.index).sort((a,b)=>b.at-a.at);items=[(before[0]??found[0]).term]}
  else items=[...contextTerms];
  return {...p,ts,items,ambiguous:!p.total&&groups(items,productsOf).length!==1}})}

// c.messages 已依時間排序。keyBase＝穩定的對話識別（threads:t<thread id>），回傳 {cases, deals, waits, tasks}
export function buildCases({messages,isOwner,index,maskText,excerpt,externalKey,keyBase=`threads:${externalKey}`,folder,now}){
 const eps=[];let cur=null;
 const open=(m)=>{cur={start:m.timestamp_ms,last:m.timestamp_ms,msgs:[],terms:new Map(),quotes:[],offers:[],totals:[],payInfoAt:null,paidAt:null,paidMsg:null,payPhotoAt:null,cancelAt:null,deliveries:[],delivered:new Set(),unclear:false,asked:false,lastCustTerms:[]};eps.push(cur);return cur};
 const addTerms=(ep,found)=>{for(const f of found)if(!ep.terms.has(f.term))ep.terms.set(f.term,f.products)};
 const productsOf=t=>index.match(t).find(f=>f.term===t)?.products??[];
 // 還沒交付的品項（同一商品的不同叫法算同一個）
 const undelivered=ep=>groups([...ep.terms.keys()],productsOf).filter(g=>!g.some(t=>[...ep.delivered].some(d=>sameItem(d,t,productsOf)))).map(g=>g[0]);
 for(let i=0;i<messages.length;i++){const m=messages[i],text=m.content??'',ts=m.timestamp_ms;if(!ts)continue;const owner=isOwner(m);
  if(owner&&CRED.test(text)){
   const dterms=index.match(text).map(f=>f.term);
   // 售後重給新密碼：最近交付過、而且這次沒有新的付款 → 不算新的交付
   const recent=[...eps].reverse().find(e=>e.deliveries.length&&ts-e.deliveries.at(-1).ts<=14*DAY);
   if(RESEND.test(text)&&recent&&!(cur&&cur!==recent&&(cur.paidAt||cur.payInfoAt))){recent.msgs.push(m);recent.last=Math.max(recent.last,ts);continue}
   // 可接這次交付的案件：目前這段；或 14 天內有付款／匯款資訊、還沒交付完的案件。已交付過的，3 天內才算分批交付
   const waiting=eps.filter(e=>(!e.deliveries.length||undelivered(e).length)&&(e===cur||((e.paidAt||e.payInfoAt)&&ts-(e.paidAt??e.payInfoAt)<=14*DAY))
    &&(!e.deliveries.length||ts-e.deliveries.at(-1).ts<=3*DAY||e===cur));
   let target=null,how='context';
   if(dterms.length){const hit=waiting.filter(e=>dterms.some(t=>undelivered(e).some(u=>sameItem(u,t,productsOf))));
    target=hit.find(e=>e.paidAt)??hit[0]??null;if(target)how='items'}
   if(!target){
    // 分批交付：目前這段沒有自己的付款紀錄，而上一筆 3 天內才交付過 → 併回上一筆
    const prev=[...eps].reverse().find(e=>e.deliveries.length&&e!==cur);
    const partial=prev&&(prev.paidAt||prev.payInfoAt)&&ts-prev.deliveries.at(-1).ts<=3*DAY&&!(cur?.payInfoAt||cur?.paidAt);
    const paidOpen=eps.filter(e=>e.paidAt&&!e.deliveries.length&&e!==cur);
    if(cur&&(cur.paidAt||cur.payInfoAt)&&!cur.deliveries.length)target=cur;
    else target=(paidOpen.length===1?paidOpen[0]:null)??(partial?prev:null)??cur??open(m);
    if(!dterms.length&&paidOpen.length>1)how='uncertain'}
   target.deliveries.push({ts,raw:text,terms:dterms,how});for(const t of dterms){target.delivered.add(t);if(!target.terms.has(t))target.terms.set(t,index.match(t)[0]?.products??[])}
   target.last=Math.max(target.last,ts);target.msgs.push(m);
   // 交付後這段結束（下一則仍是交付除外）；同一單的其餘品項之後再交付，會依品項在 3 天內配回這一段
   if(target===cur){const next=messages[i+1];if(!next||!(isOwner(next)&&CRED.test(next.content??'')))cur=null}continue}
  // 交付後 7 天內問換綁／登入問題 → 屬於剛交付那筆的售後，不另開案件
  if(!owner&&!cur&&(REBIND_ASK.test(text)||REBIND_FAIL.test(text))){const prev=[...eps].reverse().find(e=>e.deliveries.length);if(prev&&ts-prev.deliveries.at(-1).ts<=7*DAY){prev.msgs.push(m);prev.last=Math.max(prev.last,ts);continue}}
  if(!cur){if(!owner&&!text&&!m.photos?.length)continue;open(m)}
  else if(!owner){const gap=ts-cur.last;const lastOwner=cur.msgs.length&&isOwner(cur.msgs.at(-1));
   const terms=index.match(text).map(f=>f.term);
   if((gap>=14*DAY&&lastOwner)||(cur.paidAt&&!cur.deliveries.length&&terms.length&&terms.every(t=>!cur.terms.has(t))&&Object.values(ASK).some(r=>r.test(text))))open(m)}
  cur.msgs.push(m);cur.last=ts;
  if(owner){
   if(PAY_INFO.test(text))cur.payInfoAt=ts;
   else{cur.quotes.push(...quotesFrom(text,ts,index,cur.lastCustTerms,productsOf));addTerms(cur,index.match(text))}
   if(cur.paidAt&&!cur.deliveries.length&&MENTIONS_CRED.test(text))cur.unclear=true;
   if(/已取消|取消訂單|幫您取消|先幫您釋出|那就不保留/.test(text))cur.cancelAt=ts}
  else{const found=index.match(text);addTerms(cur,found);if(found.length)cur.lastCustTerms=found.map(f=>f.term);
   if(Object.values(ASK).some(r=>r.test(text)))cur.asked=true;
   const tot=customerTotal(text);if(tot)cur.totals.push({...tot,ts,k:cur.msgs.length-1});
   const o=customerOffer(text);if(o)cur.offers.push({...o,ts,items:found.length?found.map(f=>f.term):[...cur.lastCustTerms],k:cur.msgs.length-1});
   const photo=m.photos?.length>0;
   if(!cur.paidAt&&(PAID.test(text)||(photo&&PAY_WORDS.test(text)))){cur.paidAt=ts;cur.paidMsg=m}
   else if(!cur.paidAt&&photo&&!text.trim()&&cur.payInfoAt&&ts-cur.payInfoAt<=3*DAY)cur.payPhotoAt=ts;
   if(!cur.paidAt&&CANCEL.test(text)&&(cur.payInfoAt||cur.quotes.length||cur.asked))cur.cancelAt=ts}
 }
 const cases=[],deals=[],waits=[],allTasks=[];
 for(const ep of eps){
  const ownerMsgs=ep.msgs.filter(isOwner),custMsgs=ep.msgs.filter(m=>!isOwner(m));
  // 只傳圖片、之後店主確實交付帳密 → 圖片＋交付才算付款證據；沒有交付就維持「付款證據待確認」
  if(!ep.paidAt&&ep.payPhotoAt&&ep.deliveries.some(d=>d.ts>ep.payPhotoAt)){ep.paidAt=ep.payPhotoAt;ep.paidBy='photo_then_delivered';ep.payPhotoAt=null}
  if(!custMsgs.length&&!ep.deliveries.length)continue;// 只有店主單方面發話，不算案件
  if(!ep.asked&&!ep.payInfoAt&&!ep.paidAt&&!ep.deliveries.length&&!ep.quotes.length)continue;// 純聊天
  for(const d of ep.deliveries)if(!d.terms.length)for(const f of index.match(deliveryItems(d.raw,maskText).text))if(!ep.terms.has(f.term))ep.terms.set(f.term,f.products);
  const last=ep.msgs.at(-1),age=now-ep.last;
  // 客人最後一輪（最後一則店主訊息之後的客人訊息）實際在問什麼
  let k=ep.msgs.length-1;const turn=[];while(k>=0&&!isOwner(ep.msgs[k])){turn.unshift(ep.msgs[k]);k--}
  const turnText=turn.map(x=>x.content??'').join(' ').trim();
  const politeOnly=turn.length&&turnText&&!Object.values(ASK).some(r=>r.test(turnText))&&!QUESTION.test(turnText)&&(POLITE.test(turnText)||DEFER.test(turnText));
  const needsReply=turn.length>0&&!politeOnly&&!(ep.cancelAt&&ep.cancelAt>=(turn[0]?.timestamp_ms??0));
  const ownerWait=ownerMsgs.length&&WAIT.test(ownerMsgs.at(-1).content??'');
  const quoted=ep.quotes.length>0;
  const overdue=ep.payInfoAt&&!ep.paidAt?Math.floor((now-ep.payInfoAt)/DAY):0;
  let status;
  if(ep.deliveries.length)status='done';
  else if(ep.paidAt)status='payment_to_verify';
  else if(ep.cancelAt)status=ep.payInfoAt?'abandoned':'closed';
  else if(needsReply&&!(ep.payInfoAt&&turn.every(x=>!x.content&&x.photos?.length)))status='owner_to_reply';
  else if(ownerWait)status='waiting_stock';
  else if(ep.payInfoAt)status='awaiting_payment';
  else if(quoted)status=age>7*DAY?'quote_lapsed':'quoted';
  else status='closed';
  const items=[...ep.terms.keys()].slice(0,8),productIds=[...new Set([...ep.terms.values()].flat())].slice(0,10);
  const keyMsg=(status==='owner_to_reply'?custMsgs.at(-1):ep.paidMsg??custMsgs[0])??ep.msgs[0];
  const sk=`${keyBase}:case:${ep.start}`;
  // 高預算意向：客人明確出價，或接受店主報價（報價後兩則內客人回「收／要／好」）。門檻在後台套用；只算台幣。
  let budget=null;
  for(let j=0;j<ep.msgs.length;j++){const m=ep.msgs[j],tx=m.content??'';
   if(!isOwner(m)){const o=customerOffer(tx);if(o&&o.currency==='TWD'&&(!budget||o.value>=budget.amount))budget={amount:o.value,ts:m.timestamp_ms,kind:'offer',excerpt:excerpt(tx)}}
   else if(!PAY_INFO.test(tx)&&!CRED.test(tx)){const c=priceCandidates(tx).filter(x=>x.currency==='TWD');if(!c.length)continue;const v=Math.max(...c.map(x=>x.value));
    const reply=ep.msgs.slice(j+1,j+3).find(x=>!isOwner(x));if(reply&&CUST_ACCEPT.test(String(reply.content??'').trim())&&(!budget||v>=budget.amount))budget={amount:v,ts:reply.timestamp_ms,kind:'accepted_quote',excerpt:excerpt(tx)}}}
  // 教學與售後待辦（每段案件每種最多一筆；已交付的歷史案件預設為已處理，只留紀錄）
  const tasks=[];const addTask=(kind,m,st)=>{if(tasks.some(t=>t.kind===kind))return;tasks.push({source_key:`${keyBase}:task:${kind}:${ep.start}`,case_source_key:sk,kind,title:TASK_KINDS[kind]+(items.length?'：'+items.slice(0,2).join('、'):''),status:st,excerpt:excerpt(m.content??''),evidence:{folder,timestamp_ms:m.timestamp_ms}})};
  const histDone=status==='done'&&age>7*DAY?'done':'open';
  for(const m of custMsgs){const tx=m.content??'';if(REBIND_FAIL.test(tx))addTask('rebind_failed',m,histDone);else if(REBIND_ASK.test(tx))addTask('rebind_tutorial',m,histDone)}
  if(ep.paidAt){const firstDel=ep.deliveries[0]?.ts??Infinity;const chase=custMsgs.find(m=>m.timestamp_ms>ep.paidAt&&m.timestamp_ms<firstDel&&CHASE.test(m.content??''));if(chase)addTask('delivery_chase',chase,ep.deliveries.length?'done':'open')}
  allTasks.push(...tasks);
  cases.push({source_key:sk,opened_at:ep.start,last_at:ep.last,status,items,product_ids:productIds,excerpt:excerpt(keyMsg.content??''),
   evidence:{folder,start_ms:ep.start,last_ms:ep.last,pay_info_ms:ep.payInfoAt,paid_ms:ep.paidAt,...(ep.paidBy?{paid_by:ep.paidBy}:{}),delivered_ms:ep.deliveries.map(d=>d.ts),last_sender:isOwner(last)?'owner':'customer',
    ...(ep.unclear&&!ep.deliveries.length?{delivery_unclear:true}:{}),...(ep.payPhotoAt&&!ep.paidAt?{payment_evidence_pending:true,payment_photo_ms:ep.payPhotoAt}:{}),
    ...(overdue&&!ep.cancelAt&&status==='awaiting_payment'?{payment_overdue_days:overdue}:{}),...(ep.cancelAt?{cancel_ms:ep.cancelAt}:{}),
    ...(ep.deliveries.some(d=>d.how==='uncertain')?{delivery_match:'uncertain'}:{}),...(budget?{budget:{...budget,items}}:{})}});
  if(status==='waiting_stock')waits.push({source_key:`${keyBase}:wait:${ep.start}`,item_text:items.join('、').slice(0,80)||excerpt(custMsgs.at(-1)?.content??''),product_ids:productIds,channel:'Threads',
   excerpt:excerpt(ownerMsgs.at(-1).content??''),evidence:{folder,timestamp_ms:ownerMsgs.at(-1).timestamp_ms}});
  if(ep.deliveries.length)deals.push(dealFor(ep,{sk,keyBase,folder,index,maskText,excerpt,productsOf}));
 }
 return {cases,deals,waits,tasks:allTasks};
}

// 一段案件的成交建議：品項以交付為準；金額只用對得上這些品項的報價（或客人付款時寫的金額）。
function dealFor(ep,{sk,keyBase,folder,index,maskText,excerpt,productsOf}){
 const parts=ep.deliveries.map(d=>({...deliveryItems(d.raw,maskText),terms:d.terms}));
 let dealTerms=groups([...new Set(parts.flatMap(p=>p.terms))],productsOf).map(g=>g[0]);
 const epGroups=groups([...ep.terms.keys()],productsOf);
 if(!dealTerms.length&&epGroups.length===1)dealTerms=[epGroups[0][0]];
 const same=(a,b)=>sameItem(a,b,productsOf);
 const shown=parts.map(p=>p.text==='（品項未寫在交付訊息）'&&dealTerms.length?{...p,text:dealTerms.slice(0,3).join('、')+'（對話推測）'}:p);
 const qty=shown.reduce((n,p)=>n+p.qty,0);
 const qtyOf=t=>{const p=parts.filter(x=>x.terms.some(y=>same(y,t)));return p.length?p.reduce((n,x)=>n+(x.terms.length===1?x.qty:1),0):1};
 const productIds=[...new Set(dealTerms.flatMap(t=>ep.terms.get(t)??productsOf(t)))].slice(0,10);
 const cutoff=ep.paidAt??ep.deliveries[0].ts;
 let amount=null,original=null,basis='',basisTs=null;
 const pick=(value,currency,why,ts)=>{basisTs=ts;if(currency&&currency!=='TWD'){original={currency,value};basis=`${why}：${currency} ${value}（外幣，未換算台幣，請手動填）`}else{amount=value;basis=why}};
 const paid=ep.paidMsg?paidAmount(ep.paidMsg.content):null;
 if(paid)pick(paid.value,paid.currency,'客人付款訊息寫的金額',ep.paidMsg.timestamp_ms);
 else{
  const quotes=ep.quotes.filter(q=>q.ts<=cutoff);
  // 客人出價、店主同意
  const agreed=ep.offers.filter(o=>o.ts<=cutoff&&ep.msgs.slice(o.k+1,o.k+3).some(x=>x.timestamp_ms<=cutoff&&!x.content?.match(/不/)&&AGREE.test(x.content??'')&&x!==ep.msgs[o.k]&&x.sender_name!==ep.msgs[o.k].sender_name));
  // 整筆金額（跟這次付款綁在一起）：客人付款前寫的總額（店主同意，或之後直接付款），其次是店主最後報的總價
  const before=ep.msgs.filter(m=>m.timestamp_ms<=cutoff);const lastQuoteTs=Math.max(0,...quotes.map(q=>q.ts));
  // 店主同意：回「對／是／好／可以」，或下一則店主訊息直接給匯款資訊
  const ownerNext=t=>ep.msgs.slice(t.k+1).find(x=>x.sender_name!==ep.msgs[t.k].sender_name);
  const custTotal=[...ep.totals].reverse().find(t=>t.ts<=cutoff&&t.ts>=lastQuoteTs&&(ep.msgs.slice(t.k+1,t.k+3).some(x=>x.sender_name!==ep.msgs[t.k].sender_name&&/^(對|是|沒錯|ok|好|可以)/i.test(String(x.content??'').trim()))
   ||(ownerNext(t)&&PAY_INFO.test(ownerNext(t).content??'')&&!CRED.test(ownerNext(t).content??''))
   ||(ep.paidMsg&&before.filter(m=>m.timestamp_ms>t.ts&&m.timestamp_ms<=ep.paidAt).length<=4)));
  const ownerTotal=[...quotes].reverse().find(q=>q.total);const laterItem=ownerTotal&&quotes.some(q=>!q.total&&q.ts>ownerTotal.ts);
  const sameSet=(a,b)=>{const ga=groups(a,productsOf),gb=groups(b,productsOf);return ga.length===gb.length&&ga.every(g=>gb.some(h=>g.some(x=>h.some(y=>same(x,y)))))};
  const total=[...quotes].reverse().find(q=>q.total&&dealTerms.length>0&&q.items.length>0&&sameSet(q.items,dealTerms));
  if(custTotal)pick(custTotal.value,custTotal.currency,'客人付款前寫的整筆金額',custTotal.ts);
  else if(total)pick(total.value,total.currency,'店主報總價',total.ts);
  else if(ownerTotal&&!laterItem&&dealTerms.length!==1)pick(ownerTotal.value,ownerTotal.currency,'店主最後報的整筆總價',ownerTotal.ts);
  else if(dealTerms.length){
   const per=dealTerms.map(t=>{const o=[...agreed].reverse().find(x=>groups(x.items,productsOf).length===1&&same(x.items[0],t));if(o)return {...o,why:'客人出價、店主同意'};
    const q=[...quotes].reverse().find(x=>!x.total&&!x.ambiguous&&x.items.some(y=>same(y,t)));return q?{...q,why:q.each&&qtyOf(t)>1?`店主報單價×${qtyOf(t)}`:'店主報價',value:q.each&&qtyOf(t)>1?q.value*qtyOf(t):q.value}:null});
   const currencies=new Set(per.filter(Boolean).map(x=>x.currency));
   if(per.every(Boolean)&&currencies.size===1)pick(per.reduce((n,x)=>n+x.value,0),[...currencies][0],per.length===1?per[0].why:'各品項報價加總',Math.max(...per.map(x=>x.ts)));
   else basis=per.some(Boolean)?'部分品項找不到對應報價，待確認':'報價對不到交付的商品，待確認'}
  else{
   // 交付品項不明：整段只有一個明確的報價金額時才採用，否則待確認
   const values=new Set(quotes.map(q=>q.currency+q.value));
   if(values.size===1&&quotes.length){const q=quotes.at(-1);const mult=q.each&&!q.total&&qty>1;pick(mult?q.value*qty:q.value,q.currency,mult?`店主報單價×${qty}（交付品項不明，只有這一個報價）`:'店主報價（交付品項不明，只有這一個報價）',q.ts)}
   else basis=quotes.length?'交付品項不明、有多個報價，待確認':''}
 }
 const basisMsg=basisTs?ep.msgs.find(m=>m.timestamp_ms===basisTs):null;
 return {source_key:`${keyBase}:deal:${ep.deliveries[0].ts}`,case_source_key:sk,occurred_at:ep.deliveries[0].ts,
  items:shown.map(p=>({text:p.text,qty:p.qty})),product_ids:productIds,qty,amount_twd:amount,
  evidence:{folder,paid_ms:ep.paidAt,delivered_ms:ep.deliveries.map(d=>d.ts),amount_basis:basis||'找不到報價，請手動填',amount_excerpt:basisMsg?excerpt(basisMsg.content??''):'',
   ...(original?{amount_original:original}:{}),...(ep.deliveries.some(d=>d.how==='uncertain')?{delivery_match:'uncertain'}:{})}};
}
