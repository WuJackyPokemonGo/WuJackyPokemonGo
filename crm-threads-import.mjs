// Threads 匯出檔 → CRM 匯入資料。全部在管理員自己的瀏覽器裡解析，私訊原文不上傳；
// 只送出整理後的結果：客人身分、詢問紀錄（含遮蔽摘錄與證據位置）、自動標籤與待追蹤事項。
// 判斷全部屬於「關鍵字判斷」，成交一律只標「疑似」，正式成交要由管理員在後台確認。
import {buildCases,CASE_STATUS,CRED} from './crm-cases.mjs';

export const CATEGORY_LABELS={price:'問價',stock:'問庫存',buy:'表示想買',payment:'交易方式',delivery:'交付問題'};
export {CASE_STATUS};
export const TAG_LABELS={inquired:'詢價',wants:'想買',paid_suspected:'疑似付款',repeat_suspected:'熟客候選',abandon_suspected:'疑似棄單',payment_evidence_pending:'付款證據待確認',payment_overdue:'給匯款資訊後未付款',request_box:'訊息請求',followup:'待追蹤'};
const CATEGORY_RX={
 price:/多少|價格|價錢|價位|幾元|幾塊|怎麼賣|怎賣|報價|售價|開價|\$|how much|price|優惠|折扣|打折|算便宜|便宜點|便宜一點/i,
 stock:/還有(嗎|貨|沒|嘛)|有貨|現貨|庫存|有嗎|有沒有|還在嗎|剩幾|剩下|補貨|缺貨|賣完|售完|in stock|available|still have/i,
 buy:/我要|想買|要買|購買|下單|預訂|預購|想要|要一[隻個]|要兩|\+1|我收|訂一|幫我留|留給我|保留/i,
 payment:/匯款|轉帳|轉賬|付款|支付|街口|line ?pay|超商|刷卡|paypal|收款|末五碼|怎麼付|怎麼買|交易方式|怎麼交易|面交|訂金|全家|7-?11/i,
 delivery:/多久|什麼時候|何時|幾天|交貨|交付|發貨|加好友|好友碼|交換|登入|帳密|密碼|綁定|ptc|星塵|等多久|到貨|收到了|還沒收到/i,
};
// 店主傳匯款資訊、客人回報已付款的樣式（用來標「疑似付款／疑似棄單」）
const OWNER_PAYMENT_INFO=/行號|帳號.{0,6}\d|\d{3}-|中信|國泰|郵局|提供轉帳截圖|匯款至|轉帳至|戶名/;
const CUSTOMER_PAID=/已匯|匯好|匯了|已轉|轉好|轉了|付款了|已付|付好|匯款完成|轉帳完成|已完成匯款|款項匯出|\bpaid\b|transferred/i;
// 圖片旁有這些字才算付款證據；只有圖片 → 付款證據待確認（不算付款、不進 A 層）
const PAYMENT_WORDS=/截圖|收據|明細|轉帳|匯款|付款|已匯|已轉|末[一二三四五六七八九十0-9]碼|receipt|transfer/i;
// 明確取消（棄單必須有這類訊息，或由老闆在後台判定；只是時間過了不算）
const CANCEL_RX=/不要了|不用了|取消|算了|先不買|不買了|先不用|先不要|改天再|下次再買|沒辦法買|放棄|不考慮了|cancel/i;
// 穩定識別：Threads 資料夾名稱是「暱稱_數字」，暱稱會變、數字不變
export const threadIdOf=slug=>String(slug??'').match(/(\d{6,})$/)?.[1]??String(slug??'');
// 訊息內容雜湊（FNV-1a 32 位元），讓識別鍵不受整串訊息位置影響
export function messageHash(msg,role=''){const s=`${role}\u0001${msg.content??''}\u0001${(msg.photos??[]).length}`;let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return h.toString(16).padStart(8,'0')}
const DAY=86400000;
const GENERIC_TERMS=new Set(['背景','色背','限定背景','即將推出','預購','地點背景','色違','異色','套組','活動','裝扮','限定','特殊背景','背景卡','皮卡','日本','台灣','韓國','東京']);

export function fixMojibake(value){
 if(typeof value!=='string')return value;
 for(let i=0;i<value.length;i++)if(value.charCodeAt(i)>255)return value;
 try{return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(value,c=>c.charCodeAt(0)))}catch{return value}
}
function deepFix(o){if(Array.isArray(o))return o.map(deepFix);if(o&&typeof o==='object'){const r={};for(const [k,v] of Object.entries(o))r[k]=deepFix(v);return r}return fixMojibake(o)}
// 遮蔽：帳號／密碼／帳密、轉帳末碼、完整銀行帳號、驗證碼、付款連結、email，以及看起來像帳號或密碼的英數字串。
// 多行訊息逐行一起處理（「帳號」「密碼」換行後寫在下一行也會遮蔽）。商品名稱與問句保留。
export function maskText(s){
 let t=String(s??'');
 // 交付訊息（含帳號／密碼字樣）裡，換行後的純英文帳號名稱也一律遮蔽
 if(/帳號|密碼|帳密|password|passwd/i.test(t))t=t.replace(/(?<![\w.@#$%&!*?+=\/-])[A-Za-z][\w.@#$%&!*?+=\/-]{3,}/g,m=>/^(ID|OK|LINE|PTC|https?)$/i.test(m)?m:'[遮蔽]');
 return t
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g,'[email]')
  // 付款或任何連結：有 https:// 或沒有（pay.line.me/…、p.ecpay.com.tw/…）
  .replace(/https?:\/\/\S+/gi,'[連結]')
  .replace(/(?<![\w@])(?:[a-z0-9-]+\.)+(?:com|tw|me|net|io|cc|co|jp|hk|app|link|ly|gl)(?:\.[a-z]{2})?\/\S*/gi,'[連結]')
  // 轉帳末碼／後幾碼：「末五碼 45678」「後5碼：12345」「末四碼是 9876」，數字可在下一行
  .replace(/((?:末|後|尾)\s*[一二三四五六七八九十0-9]{1,2}\s*碼|末碼|尾碼|後碼)[\s:：是為]*([0-9]{2,8})/g,'$1 [數字遮蔽]')
  // 驗證碼、OTP、認證碼
  .replace(/(驗證碼|認證碼|簡訊碼|otp|code|驗證)\s*[:：是為]?\s*[A-Za-z0-9]{3,10}/gi,'$1 [遮蔽]')
  // 「帳號／密碼」後面到句尾全部遮蔽（交付訊息常把多組帳密寫在同一行）
  .replace(/(密碼|帳號|帳密|password|passwd|pw|pass|ID)\s*[:：]?[^\n，。,；;]*/gi,'$1 [遮蔽]')
  // 英數混合的 6 字元以上字串（帳號名稱、密碼、驗證碼）一律遮蔽
  .replace(/(?<![\w.@#$%&!*?+=\/-])(?=[\w.@#$%&!*?+=\/-]*\d)(?=[\w.@#$%&!*?+=\/-]*[A-Za-z])[\w.@#$%&!*?+=\/-]{6,}/g,'[遮蔽]')
  // 銀行帳號：6 位以上數字（可含 - 或空白分段）
  .replace(/\d[\d\- ]{4,}\d/g,'[數字遮蔽]');
}
const excerpt=s=>{const t=maskText(s).replace(/\s+/g,' ').trim();return t.length>60?t.slice(0,59)+'…':t};

// 商品辨識。來源：① GPT 的暱稱清單（data/crm-nicknames.txt，每行「正式名稱,別名…」；第一欄含「＋」為組合稱呼）
// ② 現有商品目錄的名稱與別名。一律先比對較長的詞；比到後把該段遮掉，避免「皮卡丘」又被拆成更短的詞。
// 待確認詞（例如「藍狗」「黑白龍」）保留原詞、不對應商品。原句的活動、背景、異色、球種、尺寸線索另存為 cues。
export const PENDING_TERMS=['藍狗','黑白龍'];
const QUALIFIER_STOP=new Set(['造型','背景','樣子','的樣','活動','色背','異色']);
export const CUE_RX=[
 ['異色',/色違|異色|异色|閃光|shiny|黑烈|色烈/i],
 ['背景',/色背|背景|背卡|普背|地點背景|特殊背景|無背|无背/],
 ['活動地點',/社群日|萬聖節|曠野|集章|寶可夢之夜|night ?out|go ?fest|城市狩獵|世界賽|錦標賽|週年|平昌|櫻花|汝矣島|倫敦|洛杉磯|墨西哥|仙台|長崎|紐約|大阪|東京|首爾|曼谷|印度|巴黎|新加坡|台北|馬尼拉|吉隆坡|萬博/i],
 ['球種',/大師球|精靈球|超級球|高級球|紀念球|隨機球|球種|master ?ball/i],
 ['尺寸',/xxl|xxs|超大|超小|大隻|小隻|大的|小的/i],
 ['等級／IV',/一等|1等|lv\.?1|百趴|100 ?iv|滿iv|0 ?iv|四星/i],
 ['極巨化',/極巨|超極巨|dynamax|gmax|g-max|gigantamax/i],
];
export function extractCues(text){const t=String(text??'');const out=[];for(const [type,rx] of CUE_RX){const m=t.match(rx);if(m)out.push(type+'：'+m[0])}return out}
export function buildTermIndex(products=[],nicknames=''){
 const catalog=new Map();const productText=new Map();
 const addTerm=(term,id)=>{const k=term.toLowerCase();if(!catalog.has(k))catalog.set(k,new Set());if(id)catalog.get(k).add(id)};
 for(const p of products){
  productText.set(p.id,[p.name,p.name_en,...(p.aliases??[])].join(' ').toLowerCase());
  for(const s of [p.name,...(p.aliases??[])]){for(const part of String(s??'').split(/[-–（）()、,，\s/・*]+/)){if(/^[\u4e00-\u9fff]{2,8}$/.test(part)&&!GENERIC_TERMS.has(part))addTerm(part,p.id)}}
  for(const s of [p.name_en,...(p.aliases??[])]){const m=String(s??'').match(/^[A-Za-z][A-Za-z' .-]{3,40}$/);if(m)addTerm(m[0].trim(),p.id)}
 }
 const productsWith=words=>{const ws=words.map(w=>w.toLowerCase()).filter(Boolean);if(!ws.length)return [];return [...productText.entries()].filter(([,t])=>ws.every(w=>t.includes(w))).map(([id])=>id)};
 const nick=new Map();// alias → {canonical, english}
 for(const line of String(nicknames).split(/\r?\n/)){const parts=line.split(/[,，]/).map(x=>x.trim()).filter(Boolean);if(!parts.length)continue;const canonical=parts[0];const english=parts.find(x=>/^[A-Za-z][A-Za-z .'-]+$/.test(x))??'';
  for(const a of [canonical,...parts.slice(1)])if(!nick.has(a.toLowerCase()))nick.set(a.toLowerCase(),{canonical,english})}
 const resolved=new Map();
 function resolve(canonical,english){if(resolved.has(canonical))return resolved.get(canonical);let ids=[],unverified=false;const combo=canonical.includes('＋');
  if(combo){const members=canonical.split('＋').map(x=>x.trim());ids=productsWith(members);unverified=!ids.length}
  else{const m=canonical.match(/^(.+?)[（(](.+)[）)]$/);const base=m?m[1].trim():canonical;let pool=[...new Set([...productsWith([base]),...(english?productsWith([english]):[])])];
   if(m){const q=m[2];const windows=[];for(let i=0;i+2<=q.length;i++){const w=q.slice(i,i+2);if(/^[\u4e00-\u9fff]{2}$/.test(w)&&!QUALIFIER_STOP.has(w))windows.push(w)}
    if(windows.length)pool=pool.filter(id=>windows.some(w=>productText.get(id).includes(w)));unverified=!pool.length}
   ids=pool}
  const r={products:ids.slice(0,10),combo,unverified};resolved.set(canonical,r);return r}
 const keys=[...new Set([...catalog.keys(),...nick.keys(),...PENDING_TERMS.map(x=>x.toLowerCase())])].sort((a,b)=>b.length-a.length);
 return {match(text){let t=String(text??'').toLowerCase();const found=[];
  for(const k of keys){if(!t.includes(k))continue;let item;
   if(PENDING_TERMS.includes(k))item={term:k,products:[],pending:true};
   else if(nick.has(k)){const {canonical,english}=nick.get(k);const r=resolve(canonical,english);item={term:canonical,products:r.products,combo:r.combo,unverified:r.unverified};if(k!==canonical.toLowerCase())item.said=k}
   else item={term:k,products:[...(catalog.get(k)??[])]};
   if(!found.some(f=>f.term===item.term))found.push(item);t=t.split(k).join(' ');if(found.length>=5)break}
  return found}};
}

// files: Map(path → JSON text)。回傳 {rows, stats}
export function parseThreadsExport(files,{products=[],nicknames='',now=Date.now(),recentDays=14,suggestScope='A'}={}){
 const index=buildTermIndex(products,nicknames);
 const stats={json_files:0,message_files:0,conversations:0,messages:0,groups_skipped:0,empty_skipped:0,failed_files:[],imported:0,inquiries:0,followups:0,tags:{},suggest_scope:suggestScope,suggested_customers:0,cases:0,case_status:{},deals:0,deals_with_amount:0,waits:0,tasks:0,owner:'',date_from:null,date_to:null};
 const convs=new Map();
 for(const [path,text] of files){
  if(!/\.json$/i.test(path))continue;stats.json_files++;
  const m=path.match(/(?:^|\/)messages\/(inbox|message_requests)\/([^/]+)\/message_\d+\.json$/);if(!m)continue;
  stats.message_files++;let j;try{j=deepFix(JSON.parse(text))}catch{stats.failed_files.push(path);continue}
  const key=m[1]+'/'+m[2],c=convs.get(key)??{box:m[1],slug:m[2],participants:j.participants??[],title:j.title??'',messages:[]};
  c.messages.push(...(j.messages??[]));convs.set(key,c);
 }
 // 店主＝出現在最多對話中的參與者
 const seen=new Map();for(const c of convs.values())for(const p of c.participants)seen.set(p.name,(seen.get(p.name)??0)+1);
 const owner=[...seen.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]??'';stats.owner=owner;
 const rows=[];
 for(const c of convs.values()){
  stats.conversations++;c.messages.sort((a,b)=>(a.timestamp_ms??0)-(b.timestamp_ms??0));stats.messages+=c.messages.length;
  for(const msg of c.messages){const ts=msg.timestamp_ms;if(!ts)continue;stats.date_from=Math.min(stats.date_from??ts,ts);stats.date_to=Math.max(stats.date_to??ts,ts)}
  if(c.participants.length>2){stats.groups_skipped++;continue}
  if(!c.messages.length){stats.empty_skipped++;continue}
  const other=c.participants.map(p=>p.name).find(n=>n&&n!==owner)??c.title??'';
  const external_key=c.slug;const isOwner=msg=>msg.sender_name===owner;
  const thread_id=threadIdOf(c.slug);const keyBase=`threads:t${thread_id}`;
  // 同一時間、同一內容的訊息用出現次序區分（只跟同時間同內容的訊息比，不受補入早期訊息影響）
  const seenKey=new Map();const msgKey=c.messages.map(msg=>{const k=`${msg.timestamp_ms}:${messageHash(msg,isOwner(msg)?'o':'c')}`;const n=seenKey.get(k)??0;seenKey.set(k,n+1);return `${keyBase}:m:${k}:${n}`});
  const cust=c.messages.filter(x=>!isOwner(x));
  const row={external_key,thread_id,folder:c.box+'/'+c.slug,box:c.box,display_name:String(other||'').slice(0,120),first_at:c.messages[0].timestamp_ms,last_at:c.messages.at(-1).timestamp_ms,
   message_count:c.messages.length,customer_message_count:cust.length,last_sender:isOwner(c.messages.at(-1))?'owner':'customer',inquiries:[],tags:[],followups:[]};
  const tagSet=new Map();const tag=(name,evidence)=>{if(!tagSet.has(name))tagSet.set(name,evidence)};
  if(c.box==='message_requests')tag('request_box',{folder:row.folder});
  c.messages.forEach((msg,i)=>{
   if(isOwner(msg))return;const text=msg.content??'';if(!text)return;
   const cats=Object.keys(CATEGORY_RX).filter(k=>CATEGORY_RX[k].test(text));if(!cats.length)return;
   let found=index.match(text),fromContext=false;
   if(!found.length&&cats.some(k=>k==='price'||k==='stock'||k==='buy')){const ctx=c.messages.slice(Math.max(0,i-4),i).map(x=>x.content??'').join(' ');found=index.match(ctx);fromContext=found.length>0}
   cats.forEach(cat=>row.inquiries.push({occurred_at:msg.timestamp_ms,category:cat,terms:found.map(f=>f.term).slice(0,5),product_ids:[...new Set(found.flatMap(f=>f.products))].slice(0,10),
    excerpt:excerpt(text),source_key:`${msgKey[i]}:${cat}`,legacy_source_key:`threads:${external_key}:${msg.timestamp_ms}:${i}:${cat}`,evidence:{folder:row.folder,timestamp_ms:msg.timestamp_ms,context:fromContext,cues:extractCues(text),pending:found.filter(f=>f.pending).map(f=>f.term),unverified:found.filter(f=>f.unverified).map(f=>f.term),said:found.filter(f=>f.said).map(f=>f.said)}}));
   if(cats.includes('price')||cats.includes('stock'))tag('inquired',{folder:row.folder,timestamp_ms:msg.timestamp_ms});
   if(cats.includes('buy'))tag('wants',{folder:row.folder,timestamp_ms:msg.timestamp_ms});
  });
  // 疑似付款：店主傳了匯款資訊後，客人 3 天內明確說已付款（或圖片旁寫了付款字樣）。只有圖片 → 付款證據待確認。
  // 疑似棄單：給匯款資訊後客人明確取消；只是時間過了 → 給匯款資訊後未付款（待追蹤依據，不算棄單）。
  const episodes=[];
  // 交付帳密的訊息也含「帳號＋數字」，不算匯款資訊
  const isPayInfo=x=>isOwner(x)&&OWNER_PAYMENT_INFO.test(x.content??'')&&!CRED.test(x.content??'');
  c.messages.forEach((msg,i)=>{if(!isPayInfo(msg))return;
   const until=msg.timestamp_ms+3*DAY;const after=c.messages.slice(i+1).filter(x=>!isOwner(x)&&x.timestamp_ms<=until);
   const reply=after.find(x=>CUSTOMER_PAID.test(x.content??'')||(x.photos?.length&&PAYMENT_WORDS.test(x.content??'')));
   let photo=!reply&&after.find(x=>x.photos?.length&&!String(x.content??'').trim());
   // 只有圖片，但之後（下一次給匯款資訊前、14 天內）店主確實交付帳密 → 圖片＋交付，算付款
   const nextInfoTs=c.messages.slice(i+1).find(isPayInfo)?.timestamp_ms??Infinity;
   const delivered=photo&&c.messages.find(x=>isOwner(x)&&x.timestamp_ms>photo.timestamp_ms&&x.timestamp_ms<nextInfoTs&&x.timestamp_ms<=photo.timestamp_ms+14*DAY&&CRED.test(x.content??''));
   const paidTs=reply?.timestamp_ms??(delivered?photo.timestamp_ms:null);if(delivered)photo=null;
   const cancel=!paidTs&&c.messages.slice(i+1).find(x=>!isOwner(x)&&x.timestamp_ms<nextInfoTs&&CANCEL_RX.test(x.content??''));
   episodes.push({sent:msg.timestamp_ms,paid:paidTs,paidBy:reply?'text':delivered?'photo_then_delivered':null,photo:photo?.timestamp_ms??null,cancel:cancel?.timestamp_ms??null,expired:!paidTs&&until<now})});
  const paid=episodes.filter(e=>e.paid);
  if(paid.length)tag('paid_suspected',{folder:row.folder,timestamp_ms:paid.at(-1).paid,count:paid.length,by_text:paid.filter(e=>e.paidBy==='text').length,by_photo_then_delivery:paid.filter(e=>e.paidBy==='photo_then_delivered').length});
  const months=new Set(paid.map(e=>new Date(e.paid).toISOString().slice(0,7)));
  if(months.size>=2)tag('repeat_suspected',{folder:row.folder,months:[...months]});
  const photoOnly=episodes.filter(e=>e.photo&&!e.paid);
  if(photoOnly.length)tag('payment_evidence_pending',{folder:row.folder,timestamp_ms:photoOnly.at(-1).photo,count:photoOnly.length});
  const lastEp=episodes.at(-1);
  if(lastEp&&!lastEp.paid&&!c.messages.some(x=>!isOwner(x)&&x.timestamp_ms>lastEp.sent&&CUSTOMER_PAID.test(x.content??''))){
   if(lastEp.cancel)tag('abandon_suspected',{folder:row.folder,timestamp_ms:lastEp.cancel,pay_info_ms:lastEp.sent});
   else if(lastEp.expired)tag('payment_overdue',{folder:row.folder,timestamp_ms:lastEp.sent,days:Math.floor((now-lastEp.sent)/DAY)})}
  // 待追蹤：最近 N 天內，最後一段由客人發出且是問價／問庫存／想買
  if(row.last_sender==='customer'&&now-row.last_at<=recentDays*DAY){
   let k=c.messages.length-1;const turn=[];while(k>=0&&!isOwner(c.messages[k])){turn.unshift(c.messages[k]);k--}
   const t=turn.map(x=>x.content??'').join(' ');const cats=['price','stock','buy'].filter(x=>CATEGORY_RX[x].test(t));
   if(cats.length){const found=index.match(t);row.followups.push({reason:'最後一則為客人'+cats.map(x=>CATEGORY_LABELS[x]).join('／')+(found.length?'：'+found.map(f=>f.term).join('、'):''),source_key:`${keyBase}:last:${row.last_at}`,legacy_source_key:`threads:${external_key}:last:${row.last_at}`,due_on:new Date(now+8*3600000).toISOString().slice(0,10),excerpt:excerpt(t)});tag('followup',{folder:row.folder,timestamp_ms:row.last_at})}
  }
  row.tags=[...tagSet.entries()].map(([name,evidence])=>({tag:name,evidence}));
  // 案件與成交建議：第一輪只做 A 層（疑似付款或熟客候選），其他客人等核准後再開
  row.cases=[];row.deals=[];row.waits=[];row.tasks=[];
  if(suggestScope==='all'||tagSet.has('paid_suspected')||tagSet.has('repeat_suspected')){
   Object.assign(row,buildCases({messages:c.messages,isOwner,index,maskText,excerpt,externalKey:external_key,keyBase,folder:row.folder,now}));
   stats.suggested_customers++;stats.cases+=row.cases.length;stats.deals+=row.deals.length;stats.deals_with_amount+=row.deals.filter(d=>d.amount_twd!=null).length;stats.waits+=row.waits.length;stats.tasks+=row.tasks.length;
   for(const k of row.cases)stats.case_status[k.status]=(stats.case_status[k.status]??0)+1}
  row.summary=summaryLine(row);
  for(const t of row.tags)stats.tags[t.tag]=(stats.tags[t.tag]??0)+1;
  stats.inquiries+=row.inquiries.length;stats.followups+=row.followups.length;stats.imported++;rows.push(row);
 }
 return {rows,stats};
}

// 一行摘要（全部客人，規則產生，不用 AI）：期間、則數、問過的品項、詢問類型、疑似付款／棄單、最後一則是誰
export function summaryLine(r){const day=t=>new Date(t).toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'}).slice(2).replace(/-/g,'/');
 const terms=new Map();for(const i of r.inquiries)for(const t of i.terms)terms.set(t,(terms.get(t)??0)+1);const top=[...terms.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0]);
 const cats=['buy','price','stock','payment','delivery'].filter(c=>r.inquiries.some(i=>i.category===c)).map(c=>CATEGORY_LABELS[c]);const tag=t=>r.tags.find(x=>x.tag===t);
 const s=`${day(r.first_at)}–${day(r.last_at)}・私訊 ${r.message_count} 則${top.length?'・問過：'+top.join('、'):''}${cats.length?'・'+cats.join('／'):''}${tag('paid_suspected')?'・疑似付款 '+(tag('paid_suspected').evidence.count??1)+' 次':''}${tag('abandon_suspected')?'・疑似棄單':''}${r.last_sender==='customer'?'・最後一則是客人':''}`;
 return s.slice(0,200)}

// 瀏覽器端：讀 ZIP（只取 messages 底下的 JSON；圖片與其他檔案不解壓）
export async function readThreadsZip(file){
 const {unzipSync,strFromU8}=await import('fflate');
 const buf=new Uint8Array(await file.arrayBuffer());
 const entries=unzipSync(buf,{filter:f=>/\.json$/i.test(f.name)});
 const files=new Map();for(const [name,data] of Object.entries(entries))files.set(name,strFromU8(data));
 return files;
}
export async function sha256Hex(file){const d=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
export const chunk=(rows,size=40)=>{const out=[];for(let i=0;i<rows.length;i+=size)out.push(rows.slice(i,i+size));return out};
