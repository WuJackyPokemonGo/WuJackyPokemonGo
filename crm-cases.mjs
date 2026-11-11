// Threads 對話 → 案件（每筆詢價／交易各自一個狀態）、歷史成交建議、到貨等候。
// 全部是「建議」：成交要管理員在後台按「接受」才算數；聊天提到已匯款只會變成「待核款」。
// 在管理員瀏覽器裡執行，輸入是原始私訊，輸出只含遮蔽後的短摘錄與證據時間點。

export const CASE_STATUS={
 owner_to_reply:'我欠回覆',payment_to_verify:'待核款',to_deliver:'待交付',awaiting_payment:'待付款',
 waiting_stock:'等貨',quoted:'已報價待回覆',quote_lapsed:'報價後客人未回',abandoned:'棄單',done:'已成交',closed:'已結束'};
// 下一步的優先順序（數字小＝先處理）
export const CASE_PRIORITY=['payment_to_verify','to_deliver','owner_to_reply','awaiting_payment','waiting_stock','quoted','quote_lapsed','abandoned','done','closed'];
export const OPEN_STATUSES=new Set(['owner_to_reply','payment_to_verify','to_deliver','awaiting_payment','waiting_stock','quoted']);

const DAY=86400000;
const DELIVERY=/密碼\s*[:：]?\s*\S/;
const PAY_INFO=/行號|帳號.{0,6}\d|\d{3}-|中信|國泰|郵局|提供轉帳截圖|匯款至|轉帳至|戶名/;
const PAID=/已匯|匯好|匯了|已轉|轉好|轉了|付款了|已付|付好|匯款完成|轉帳完成|已完成匯款|款項匯出/;
const ASK={price:/多少|價格|價錢|價位|怎麼賣|報價|售價|how much|price/i,stock:/還有(嗎|貨|沒|嘛)|有貨|現貨|有嗎|有沒有|還在嗎|有賣/i,buy:/我要|想買|要買|購買|想要|收一|收兩|我收|^收$|幫我留|保留|預約/i};
const WAIT=/有貨(再)?(通知|跟您說|跟你說)|有多的(再|我)?(跟您說|跟你說|通知)|幫您登記|有幫您登記|已登記|出貨會告知|到貨通知|有貨通知/;
const AGREE=/可以|ok|好的?|沒問題|行|收到/i;

// 從一段文字找價格候選。排除日期、時間、天數、銀行代碼與帳號。
export function priceCandidates(text){
 const t=String(text??'').replace(/\d{1,2}\/\d{1,2}/g,' ').replace(/\d+\s*(?:-\s*\d+\s*)?(?:點|天|小時|分鐘|號|日|等|iv|%|趴|隻|個|套|組|人|次)/gi,m=>/[隻個套組]$/.test(m)?m.replace(/\d+/,' '):' ')
  .replace(/(?:行號|街口|中信|國泰|郵局|銀行|代碼)\s*\d*/g,' ').replace(/8591|85實收|7-?11/g,' ').replace(/\d{3}-\S*/g,' ');
 const out=[];const rx=/(共|總共|一套|=|＝|一組)?\s*(?<![\d,.])([1-9]\d{0,2}(?:,\d{3})+|[1-9]\d{1,4})(?![\d,.])/g;let m;
 while((m=rx.exec(t))){const v=Number(m[2].replace(/,/g,''));if(v<30||v>99999)continue;
  out.push({value:v,total:!!m[1],each:/一隻|一個|各|每隻|單隻|一隻是/.test(t.slice(Math.max(0,m.index-6),m.index+m[0].length))})}
 return out}
const customerOffer=text=>{const m=String(text??'').match(/(?<![\d,])([1-9]\d{1,4})\s*(收|可以嗎|嗎|行嗎|可嗎)/);return m?Number(m[1]):null};
const paidAmount=text=>{const m=String(text??'').match(/(?:轉帳|匯款?|轉了?|匯了?)\s*(?:NT\$?|\$)?\s*([1-9]\d{1,4}(?:,\d{3})?)\s*(?:元|塊)|\$\s*([1-9]\d{1,2}(?:,\d{3})?|[1-9]\d{1,4})(?![\d,])/);return m?Number((m[1]??m[2]).replace(/,/g,'')):null};

// 交付訊息的品項文字與數量（「蜥蜴王 帳號… 密碼…」→ 蜥蜴王）
export function deliveryItems(raw,maskText){
 // 一則訊息可能交付多隻：「快龍 帳號 A 密碼 B 卡比獸 帳號 C 密碼 D」→ 快龍、卡比獸
 const pieces=String(raw??'').split(/密碼\s*[:：]?\s*\S+/).map(x=>x.split(/帳號/)[0]);
 const clean=x=>maskText(x).replace(/\[[^\]]*\]/g,' ').replace(/帳密|[:：]|皆為|中央站|✨|‼️|登入|再確認看看|感謝|久等/g,' ').replace(/\s+/g,' ').trim();
 const names=pieces.map(clean).filter(x=>/[\u4e00-\u9fffA-Za-z]/.test(x));
 const text=names.join(' ').slice(0,60);
 let qty=0;const toks=text.split(' ').filter(x=>/[\u4e00-\u9fffA-Za-z]/.test(x));let absorb=0;
 for(const tok of toks){const m=tok.match(/[*＊×x]\s*(\d{1,2})$/i);if(m){qty+=Number(m[1]);absorb=Number(m[1]);continue}if(absorb>0&&tok.length<=3){absorb--;continue}absorb=0;qty+=1}
 return {text:text||'（品項未寫在交付訊息）',qty:Math.min(Math.max(qty,1),50)}}

// c.messages 已依時間排序。回傳 {cases, deals, waits}
export function buildCases({messages,isOwner,index,maskText,excerpt,externalKey,folder,now}){
 const eps=[];let cur=null;
 const open=(m)=>{cur={start:m.timestamp_ms,last:m.timestamp_ms,msgs:[],terms:new Map(),payInfoAt:null,paidAt:null,paidMsg:null,deliveries:[],asked:false};eps.push(cur);return cur};
 const addTerms=(ep,text)=>{for(const f of index.match(text))if(!ep.terms.has(f.term))ep.terms.set(f.term,f.products)};
 for(let i=0;i<messages.length;i++){const m=messages[i],text=m.content??'',ts=m.timestamp_ms;if(!ts)continue;const owner=isOwner(m);
  if(owner&&DELIVERY.test(text)){
   // 交付：先給「已付款但還沒交付」最早的那一筆，否則給目前這筆
   // 同一筆訂單分批交付：目前這段沒有自己的付款紀錄，而上一筆 3 天內才交付過 → 併回上一筆
   const prev=[...eps].reverse().find(e=>e.deliveries.length&&e!==cur);
   const partial=prev&&(prev.paidAt||prev.payInfoAt)&&ts-prev.deliveries.at(-1).ts<=3*DAY&&!(cur?.payInfoAt||cur?.paidAt);
   const target=eps.find(e=>e.paidAt&&!e.deliveries.length&&e!==cur)??(partial?prev:null)??cur??open(m);
   target.deliveries.push({ts,raw:text});target.last=Math.max(target.last,ts);target.msgs.push(m);
   if(target===cur){const next=messages[i+1];if(!next||!(isOwner(next)&&DELIVERY.test(next.content??'')))cur=null}continue}
  if(!cur){if(!owner&&!text&&!m.photos?.length)continue;open(m)}
  else if(!owner){const gap=ts-cur.last;const lastOwner=cur.msgs.length&&isOwner(cur.msgs.at(-1));
   const terms=index.match(text).map(f=>f.term);
   if((gap>=14*DAY&&lastOwner)||(cur.paidAt&&!cur.deliveries.length&&terms.length&&terms.every(t=>!cur.terms.has(t))&&Object.values(ASK).some(r=>r.test(text))))open(m)}
  cur.msgs.push(m);cur.last=ts;
  if(owner){if(PAY_INFO.test(text))cur.payInfoAt=ts}
  else{addTerms(cur,text);if(Object.values(ASK).some(r=>r.test(text)))cur.asked=true;
   if(cur.payInfoAt&&!cur.paidAt&&ts-cur.payInfoAt<=3*DAY&&(PAID.test(text)||m.photos?.length)){cur.paidAt=ts;cur.paidMsg=m}
   else if(!cur.paidAt&&PAID.test(text)){cur.paidAt=ts;cur.paidMsg=m}}
 }
 const cases=[],deals=[],waits=[];
 for(const ep of eps){
  const ownerMsgs=ep.msgs.filter(isOwner),custMsgs=ep.msgs.filter(m=>!isOwner(m));
  if(!custMsgs.length&&!ep.deliveries.length)continue;// 只有店主單方面發話，不算案件
  if(!ep.asked&&!ep.payInfoAt&&!ep.paidAt&&!ep.deliveries.length)continue;// 純聊天
  for(const d of ep.deliveries)addTerms(ep,deliveryItems(d.raw,maskText).text);
  const last=ep.msgs.at(-1),age=now-ep.last;
  const lastCustomerAsk=!isOwner(last)&&Object.values(ASK).some(r=>r.test(custMsgs.slice(-3).map(x=>x.content??'').join(' ')));
  const ownerWait=ownerMsgs.length&&WAIT.test(ownerMsgs.at(-1).content??'');
  const quoted=ownerMsgs.some(m=>!PAY_INFO.test(m.content??'')&&priceCandidates(m.content).length);
  let status;
  if(ep.deliveries.length)status='done';
  else if(ep.paidAt)status='payment_to_verify';
  else if(lastCustomerAsk)status='owner_to_reply';
  else if(ownerWait)status='waiting_stock';
  else if(ep.payInfoAt)status=age>7*DAY?'abandoned':'awaiting_payment';
  else if(quoted&&isOwner(last))status=age>7*DAY?'quote_lapsed':'quoted';
  else if(!isOwner(last))status='owner_to_reply';
  else status='closed';
  const items=[...ep.terms.keys()].slice(0,8),productIds=[...new Set([...ep.terms.values()].flat())].slice(0,10);
  const keyMsg=(status==='owner_to_reply'?custMsgs.at(-1):ep.paidMsg??custMsgs[0])??ep.msgs[0];
  const sk=`threads:${externalKey}:case:${ep.start}`;
  cases.push({source_key:sk,opened_at:ep.start,last_at:ep.last,status,items,product_ids:productIds,excerpt:excerpt(keyMsg.content??''),
   evidence:{folder,start_ms:ep.start,last_ms:ep.last,pay_info_ms:ep.payInfoAt,paid_ms:ep.paidAt,delivered_ms:ep.deliveries.map(d=>d.ts),last_sender:isOwner(last)?'owner':'customer'}});
  if(status==='waiting_stock')waits.push({source_key:`threads:${externalKey}:wait:${ep.start}`,item_text:items.join('、').slice(0,80)||excerpt(custMsgs.at(-1)?.content??''),product_ids:productIds,channel:'Threads',
   excerpt:excerpt(ownerMsgs.at(-1).content??''),evidence:{folder,timestamp_ms:ownerMsgs.at(-1).timestamp_ms}});
  if(ep.deliveries.length){
   // 交付訊息沒寫品項時，改用這段對話辨識到的品項
   const parts=ep.deliveries.map(d=>deliveryItems(d.raw,maskText)).map(p=>p.text==='（品項未寫在交付訊息）'&&ep.terms.size?{...p,text:[...ep.terms.keys()].slice(0,3).join('、')+'（對話推測）'}:p);const qty=parts.reduce((n,p)=>n+p.qty,0);
   // 金額：付款前最後一個報價（客人出價且店主同意＞店主報價），客人付款訊息裡寫的金額最優先
   const cutoff=ep.paidAt??ep.deliveries[0].ts;let amount=null,basis='',basisMsg=null;
   const paidAmt=ep.paidMsg?paidAmount(ep.paidMsg.content):null;
   if(paidAmt){amount=paidAmt;basis='客人付款訊息寫的金額';basisMsg=ep.paidMsg}
   else{const before=ep.msgs.filter(m=>m.timestamp_ms<=cutoff);
    for(let k=0;k<before.length;k++){const m=before[k],tx=m.content??'';
     if(isOwner(m)){if(PAY_INFO.test(tx)||DELIVERY.test(tx))continue;const c=priceCandidates(tx);if(c.length){const p=c.at(-1);amount=p.total?p.value:(p.each&&qty>1?p.value*qty:p.value);basis=p.total?'店主報總價':p.each&&qty>1?`店主報單價×${qty}`:'店主報價';basisMsg=m}}
     else{const o=customerOffer(tx);const reply=before.slice(k+1,k+3).find(isOwner);if(o&&reply&&AGREE.test(reply.content??'')){amount=o;basis='客人出價、店主同意';basisMsg=m}}}}
   deals.push({source_key:`threads:${externalKey}:deal:${ep.deliveries[0].ts}`,case_source_key:sk,occurred_at:ep.deliveries[0].ts,
    items:parts.map(p=>({text:p.text,qty:p.qty})),product_ids:productIds,qty,amount_twd:amount,
    evidence:{folder,paid_ms:ep.paidAt,delivered_ms:ep.deliveries.map(d=>d.ts),amount_basis:basis||'找不到報價，請手動填',amount_excerpt:basisMsg?excerpt(basisMsg.content??''):''}});
  }
 }
 return {cases,deals,waits};
}
