// Threads 匯出檔 → CRM 匯入資料。全部在管理員自己的瀏覽器裡解析，私訊原文不上傳；
// 只送出整理後的結果：客人身分、詢問紀錄（含遮蔽摘錄與證據位置）、自動標籤與待追蹤事項。
// 判斷全部屬於「關鍵字判斷」，成交一律只標「疑似」，正式成交要由管理員在後台確認。

export const CATEGORY_LABELS={price:'問價',stock:'問庫存',buy:'表示想買',payment:'交易方式',delivery:'交付問題'};
export const TAG_LABELS={inquired:'詢價',wants:'想買',paid_suspected:'疑似付款',repeat_suspected:'熟客候選',abandon_suspected:'疑似棄單',request_box:'訊息請求',followup:'待追蹤'};
const CATEGORY_RX={
 price:/多少|價格|價錢|價位|幾元|幾塊|怎麼賣|怎賣|報價|售價|開價|\$|how much|price|優惠|折扣|打折|算便宜|便宜點|便宜一點/i,
 stock:/還有(嗎|貨|沒|嘛)|有貨|現貨|庫存|有嗎|有沒有|還在嗎|剩幾|剩下|補貨|缺貨|賣完|售完|in stock|available|still have/i,
 buy:/我要|想買|要買|購買|下單|預訂|預購|想要|要一[隻個]|要兩|\+1|我收|訂一|幫我留|留給我|保留/i,
 payment:/匯款|轉帳|轉賬|付款|支付|街口|line ?pay|超商|刷卡|paypal|收款|末五碼|怎麼付|怎麼買|交易方式|怎麼交易|面交|訂金|全家|7-?11/i,
 delivery:/多久|什麼時候|何時|幾天|交貨|交付|發貨|加好友|好友碼|交換|登入|帳密|密碼|綁定|ptc|星塵|等多久|到貨|收到了|還沒收到/i,
};
// 店主傳匯款資訊、客人回報已付款的樣式（用來標「疑似付款／疑似棄單」）
const OWNER_PAYMENT_INFO=/行號|帳號.{0,6}\d|\d{3}-|中信|國泰|郵局|提供轉帳截圖|匯款至|轉帳至|戶名/;
const CUSTOMER_PAID=/已匯|匯好|匯了|已轉|轉好|轉了|付款了|已付|付好|匯款完成|轉帳完成|已完成匯款/;
const DAY=86400000;
const GENERIC_TERMS=new Set(['背景','色背','限定背景','即將推出','預購','地點背景','色違','異色','套組','活動','裝扮','限定','特殊背景','背景卡','皮卡','日本','台灣','韓國','東京']);

export function fixMojibake(value){
 if(typeof value!=='string')return value;
 for(let i=0;i<value.length;i++)if(value.charCodeAt(i)>255)return value;
 try{return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(value,c=>c.charCodeAt(0)))}catch{return value}
}
function deepFix(o){if(Array.isArray(o))return o.map(deepFix);if(o&&typeof o==='object'){const r={};for(const [k,v] of Object.entries(o))r[k]=deepFix(v);return r}return fixMojibake(o)}
export function maskText(s){
 return String(s??'')
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g,'[email]')
  .replace(/(密碼|帳號|帳密|password|pw|pass)\s*[:：]?\s*\S+/gi,'$1 [遮蔽]')
  .replace(/\d[\d\- ]{4,}\d/g,'[數字遮蔽]')
  .replace(/https?:\/\/\S+/g,'[連結]');
}
const excerpt=s=>{const t=maskText(s).replace(/\s+/g,' ').trim();return t.length>60?t.slice(0,59)+'…':t};

// 商品辨識：商品名稱與別名中的中文詞、英文名，加上暱稱表（GPT 提供，格式「正式名稱,別名1,別名2」）
export function buildTermIndex(products=[],nicknames=''){
 const terms=new Map();const add=(term,id)=>{const k=term.toLowerCase();if(!terms.has(k))terms.set(k,new Set());if(id)terms.get(k).add(id)};
 for(const p of products){
  for(const s of [p.name,...(p.aliases??[])]){for(const part of String(s??'').split(/[-–（）()、,，\s/・*]+/)){if(/^[一-鿿]{2,8}$/.test(part)&&!GENERIC_TERMS.has(part))add(part,p.id)}}
  for(const s of [p.name_en,...(p.aliases??[])]){const m=String(s??'').match(/^[A-Za-z][A-Za-z' .-]{3,40}$/);if(m)add(m[0].trim(),p.id)}
 }
 const alias=new Map();
 for(const line of String(nicknames).split(/\r?\n/)){const parts=line.split(/[,，]/).map(x=>x.trim()).filter(Boolean);if(parts.length<2)continue;const canonical=parts[0];for(const a of parts.slice(1))alias.set(a.toLowerCase(),canonical)}
 const ordered=[...new Set([...terms.keys(),...alias.keys()])].sort((a,b)=>b.length-a.length);
 return {match(text){const t=String(text??'').toLowerCase();const found=[];let used=t;
  for(const k of ordered){if(!used.includes(k))continue;const canonical=alias.get(k);const name=canonical??k;if(!found.some(f=>f.term===name))found.push({term:name,products:[...(terms.get((canonical??k).toLowerCase())??[])]});used=used.split(k).join(' ');if(found.length>=5)break}
  return found}};
}

// files: Map(path → JSON text)。回傳 {rows, stats}
export function parseThreadsExport(files,{products=[],nicknames='',now=Date.now(),recentDays=14}={}){
 const index=buildTermIndex(products,nicknames);
 const stats={json_files:0,message_files:0,conversations:0,messages:0,groups_skipped:0,empty_skipped:0,failed_files:[],imported:0,inquiries:0,followups:0,tags:{},owner:'',date_from:null,date_to:null};
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
  const cust=c.messages.filter(x=>!isOwner(x));
  const row={external_key,folder:c.box+'/'+c.slug,box:c.box,display_name:String(other||'').slice(0,120),first_at:c.messages[0].timestamp_ms,last_at:c.messages.at(-1).timestamp_ms,
   message_count:c.messages.length,customer_message_count:cust.length,last_sender:isOwner(c.messages.at(-1))?'owner':'customer',inquiries:[],tags:[],followups:[]};
  const tagSet=new Map();const tag=(name,evidence)=>{if(!tagSet.has(name))tagSet.set(name,evidence)};
  if(c.box==='message_requests')tag('request_box',{folder:row.folder});
  c.messages.forEach((msg,i)=>{
   if(isOwner(msg))return;const text=msg.content??'';if(!text)return;
   const cats=Object.keys(CATEGORY_RX).filter(k=>CATEGORY_RX[k].test(text));if(!cats.length)return;
   let found=index.match(text),fromContext=false;
   if(!found.length&&cats.some(k=>k==='price'||k==='stock'||k==='buy')){const ctx=c.messages.slice(Math.max(0,i-4),i).map(x=>x.content??'').join(' ');found=index.match(ctx);fromContext=found.length>0}
   cats.forEach(cat=>row.inquiries.push({occurred_at:msg.timestamp_ms,category:cat,terms:found.map(f=>f.term).slice(0,5),product_ids:[...new Set(found.flatMap(f=>f.products))].slice(0,10),
    excerpt:excerpt(text),source_key:`threads:${external_key}:${msg.timestamp_ms}:${i}:${cat}`,evidence:{folder:row.folder,timestamp_ms:msg.timestamp_ms,context:fromContext}}));
   if(cats.includes('price')||cats.includes('stock'))tag('inquired',{folder:row.folder,timestamp_ms:msg.timestamp_ms});
   if(cats.includes('buy'))tag('wants',{folder:row.folder,timestamp_ms:msg.timestamp_ms});
  });
  // 疑似付款／疑似棄單：店主傳了匯款資訊後，客人 3 天內回報已付款或傳圖片
  const episodes=[];
  c.messages.forEach((msg,i)=>{if(!isOwner(msg)||!OWNER_PAYMENT_INFO.test(msg.content??''))return;
   const until=msg.timestamp_ms+3*DAY;const reply=c.messages.slice(i+1).find(x=>!isOwner(x)&&x.timestamp_ms<=until&&(CUSTOMER_PAID.test(x.content??'')||x.photos?.length));
   episodes.push({sent:msg.timestamp_ms,paid:reply?.timestamp_ms??null,expired:!reply&&until<now})});
  const paid=episodes.filter(e=>e.paid);
  if(paid.length)tag('paid_suspected',{folder:row.folder,timestamp_ms:paid.at(-1).paid,count:paid.length});
  const months=new Set(paid.map(e=>new Date(e.paid).toISOString().slice(0,7)));
  if(months.size>=2)tag('repeat_suspected',{folder:row.folder,months:[...months]});
  const lastEp=episodes.at(-1);
  if(lastEp&&lastEp.expired&&!lastEp.paid&&!c.messages.some(x=>!isOwner(x)&&x.timestamp_ms>lastEp.sent&&CUSTOMER_PAID.test(x.content??'')))tag('abandon_suspected',{folder:row.folder,timestamp_ms:lastEp.sent});
  // 待追蹤：最近 N 天內，最後一段由客人發出且是問價／問庫存／想買
  if(row.last_sender==='customer'&&now-row.last_at<=recentDays*DAY){
   let k=c.messages.length-1;const turn=[];while(k>=0&&!isOwner(c.messages[k])){turn.unshift(c.messages[k]);k--}
   const t=turn.map(x=>x.content??'').join(' ');const cats=['price','stock','buy'].filter(x=>CATEGORY_RX[x].test(t));
   if(cats.length){const found=index.match(t);row.followups.push({reason:'最後一則為客人'+cats.map(x=>CATEGORY_LABELS[x]).join('／')+(found.length?'：'+found.map(f=>f.term).join('、'):''),source_key:`threads:${external_key}:last:${row.last_at}`,due_on:new Date(now+8*3600000).toISOString().slice(0,10),excerpt:excerpt(t)});tag('followup',{folder:row.folder,timestamp_ms:row.last_at})}
  }
  row.tags=[...tagSet.entries()].map(([name,evidence])=>({tag:name,evidence}));
  for(const t of row.tags)stats.tags[t.tag]=(stats.tags[t.tag]??0)+1;
  stats.inquiries+=row.inquiries.length;stats.followups+=row.followups.length;stats.imported++;rows.push(row);
 }
 return {rows,stats};
}

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
