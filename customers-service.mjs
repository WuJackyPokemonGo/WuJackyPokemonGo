// 客人名單：把後台訂單與匯入的歷史購買合併，依客人統計次數、金額、買過什麼。
// 歷史購買存在 customer_history_purchases，不進 orders，不影響營收報表與庫存。
export const COUNTED_ORDER_STATES=['paid_awaiting_purchase','ordered_from_supplier','arrived_for_check','completed'];
export const IMPORT_HEADERS=['客人','日期','時間','品項','金額','管道','備註'];
const HEADER_ALIASES={客人:'customer_alias',客戶:'customer_alias',名稱:'customer_alias',日期:'purchased_on',時間:'purchased_time',品項:'item_text',商品:'item_text',金額:'amount_twd',管道:'channel',備註:'note_private'};
const checked=({data,error})=>{if(error)throw error;return data};

export const normAlias=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export function taipeiDate(value){const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';return d.toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'})}
function daysBetween(a,b){return Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000)}

export function parseDate(raw,defaultYear){
 const s=String(raw??'').trim().replace(/[.]/g,'/');let y,m,d,match;
 if((match=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)))[,y,m,d]=match;
 else if((match=s.match(/^(\d{1,2})\/(\d{1,2})$/))&&defaultYear)[y,m,d]=[defaultYear,match[1],match[2]];
 else return null;
 const iso=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const t=new Date(iso+'T00:00:00Z');
 return Number.isFinite(t.getTime())&&t.toISOString().slice(0,10)===iso?iso:null}
export function parseTime(raw){const s=String(raw??'').trim();if(!s)return '';const m=s.match(/^(\d{1,2}):(\d{2})$/);if(!m||Number(m[1])>23||Number(m[2])>59)return null;return m[1].padStart(2,'0')+':'+m[2]}

function fnv64(s){let h=0xcbf29ce484222325n;for(const c of new TextEncoder().encode(s)){h^=BigInt(c);h=(h*0x100000001b3n)&0xffffffffffffffffn}return h.toString(16).padStart(16,'0')}
export const importKey=r=>'h'+fnv64([normAlias(r.customer_alias),r.purchased_on,r.purchased_time,r.amount_twd,normAlias(r.item_text),normAlias(r.note_private)].join('|'));

export function splitCsv(text){
 const rows=[];let row=[],cell='',quoted=false;const src=String(text??'').replace(/^﻿/,'');
 for(let i=0;i<src.length;i++){const c=src[i];
  if(quoted){if(c==='"'){if(src[i+1]==='"'){cell+='"';i++}else quoted=false}else cell+=c;continue}
  if(c==='"'&&cell==='')quoted=true;else if(c===','||c==='\t'){row.push(cell);cell=''}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&src[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}else cell+=c}
 row.push(cell);rows.push(row);return rows.filter(r=>r.some(c=>c.trim()!==''))}

// 解析匯入檔。回傳 {rows, errors, duplicates}；有任何錯誤時不應匯入。
export function parseHistoryImport(text,{defaultYear=new Date().getFullYear()}={}){
 const table=splitCsv(text);if(!table.length)return {rows:[],errors:['檔案是空的。'],duplicates:[]};
 const header=table[0].map(h=>HEADER_ALIASES[h.trim()]);
 const missing=['customer_alias','purchased_on','item_text','amount_twd'].filter(k=>!header.includes(k));
 if(missing.length)return {rows:[],errors:['第一列必須是欄位名稱：'+IMPORT_HEADERS.join(',')+'（客人、日期、品項、金額為必填）'],duplicates:[]};
 const rows=[],errors=[],duplicates=[],seen=new Map();
 table.slice(1).forEach((cells,i)=>{const line=i+2,v={};header.forEach((k,j)=>{if(k)v[k]=String(cells[j]??'').trim()});const problems=[];
  const date=parseDate(v.purchased_on,defaultYear);if(!date)problems.push('日期看不懂（請用 2026-09-07 或 9/7）');
  const time=parseTime(v.purchased_time);if(time===null)problems.push('時間格式要像 21:07，不知道就留空');
  const amountRaw=String(v.amount_twd??'').replace(/[,，\s]|NT\$|\$|元/gi,'');if(!/^\d{1,9}$/.test(amountRaw))problems.push('金額要是整數');
  if(!v.customer_alias||v.customer_alias.length>120)problems.push('客人名稱未填或太長');
  if(!v.item_text||v.item_text.length>500)problems.push('品項未填或太長');
  if((v.channel??'').length>60)problems.push('管道太長');if((v.note_private??'').length>1000)problems.push('備註太長');
  if(problems.length){errors.push(`第 ${line} 列：${problems.join('、')}`);return}
  const row={customer_alias:v.customer_alias.normalize('NFKC').replace(/\s+/g,' '),purchased_on:date,purchased_time:time,item_text:v.item_text,amount_twd:Number(amountRaw),channel:v.channel??'',note_private:v.note_private??''};
  row.import_key=importKey(row);
  if(seen.has(row.import_key)){duplicates.push(`第 ${line} 列與第 ${seen.get(row.import_key)} 列完全相同，已略過（若真的是兩筆，請在備註寫不同內容）`);return}
  seen.set(row.import_key,line);rows.push(row)});
 return {rows,errors,duplicates}}

function orderAmount(o){return Math.max(0,Number(o.public_subtotal_twd??0)+Number(o.private_adjustments_twd??0)-Number(o.refund_amount_twd??0))}
function orderItems(o){const items=(o.order_items??[]).map(i=>(i.product_name_snapshot||'商品')+(i.quantity>1?'×'+i.quantity:''));return items.join('、')||'（訂單未列品項）'}

export function buildRoster({orders=[],history=[],profiles=[],today=taipeiDate(Date.now())}={}){
 const byKey=new Map(),customers=new Map();
 const ensure=(alias,profile=null)=>{const main=profile?.alias??alias;const key=normAlias(main);
  if(!customers.has(key))customers.set(key,{key,alias:main,otherAliases:[...(profile?.other_aliases??[])],profileId:profile?.id??null,contact:profile?.contact_private??'',doNotMarket:!!profile?.do_not_market,note:profile?.note_private??'',updatedAt:profile?.updated_at??null,namesSeen:new Set(),purchases:[]});
  return customers.get(key)};
 for(const p of profiles){ensure(p.alias,p);byKey.set(normAlias(p.alias),p);for(const a of p.other_aliases??[])if(!byKey.has(normAlias(a)))byKey.set(normAlias(a),p)}
 const find=alias=>{const p=byKey.get(normAlias(alias));return ensure(p?p.alias:String(alias).trim(),p)};
 for(const o of orders){if(!COUNTED_ORDER_STATES.includes(o.status)||!String(o.customer_alias??'').trim())continue;const c=find(o.customer_alias);c.namesSeen.add(o.customer_alias.trim());
  const at=o.received_at||o.created_at;c.purchases.push({source:'order',id:o.id,ref:o.order_number??'',date:taipeiDate(at),time:new Date(at).toLocaleTimeString('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit'}),item:orderItems(o),amount:orderAmount(o),channel:o.channel??''});
  if(!c.contact&&o.customer_contact_private)c.contact=o.customer_contact_private}
 for(const h of history){const c=find(h.customer_alias);c.namesSeen.add(h.customer_alias.trim());c.purchases.push({source:'history',id:h.id,ref:h.import_batch??'',date:h.purchased_on,time:h.purchased_time??'',item:h.item_text,amount:Number(h.amount_twd??0),channel:h.channel??'',note:h.note_private??''})}
 return [...customers.values()].map(c=>{c.purchases.sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));const last=c.purchases[0]?.date??'';
  return {...c,namesSeen:[...c.namesSeen].filter(n=>normAlias(n)!==c.key),count:c.purchases.length,total:c.purchases.reduce((s,p)=>s+p.amount,0),lastDate:last,daysSince:last?daysBetween(last,today):null,
   items:[...new Set(c.purchases.map(p=>p.item))]}})
  .sort((a,b)=>b.count-a.count||b.total-a.total||a.alias.localeCompare(b.alias,'zh-Hant'))}

export function filterRoster(list,{search='',minCount=0,inactiveDays=0,marketableOnly=false}={}){
 const q=normAlias(search);
 return list.filter(c=>(!q||[c.alias,...c.otherAliases,...c.namesSeen,...c.items,c.note].some(v=>normAlias(v).includes(q)))
  &&c.count>=minCount&&(!inactiveDays||(c.daysSince!=null&&c.daysSince>=inactiveDays))&&(!marketableOnly||!c.doNotMarket))}

// 匯出 CSV；以 ' 開頭避免試算表把 + - = @ 開頭的內容當公式（會出現 #ERROR!）。
const cell=v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
export function rosterCsv(list){const head=['客人','其他名稱','聯絡資料','購買次數','合計金額','最後購買','距今天數','買過什麼','勿發廣告','備註'];
 return '﻿'+[head,...list.map(c=>[c.alias,[...c.otherAliases,...c.namesSeen].join('、'),c.contact,c.count,c.total,c.lastDate,c.daysSince??'',c.items.join('；'),c.doNotMarket?'是':'',c.note])].map(r=>r.map(cell).join(',')).join('\r\n')}

export function profilePayload(v){const alias=String(v.alias??'').normalize('NFKC').trim().replace(/\s+/g,' ');if(!alias||alias.length>120)throw Error('客人名稱未填或超過 120 字。');
 const others=[...new Set(String(v.other_aliases??'').split(/[,，、\n]/).map(s=>s.normalize('NFKC').trim().replace(/\s+/g,' ')).filter(s=>s&&normAlias(s)!==normAlias(alias)))];
 if(others.length>20||others.some(s=>s.length>120))throw Error('其他名稱最多 20 個，每個 120 字內。');
 const contact=String(v.contact_private??'').trim(),note=String(v.note_private??'').trim();if(contact.length>500)throw Error('聯絡資料超過 500 字。');if(note.length>2000)throw Error('備註超過 2000 字。');
 return {alias,other_aliases:others,contact_private:contact,do_not_market:v.do_not_market===true||v.do_not_market==='on'||v.do_not_market==='true',note_private:note}}

const PROFILE_KEYS=['id','alias','other_aliases','contact_private','do_not_market','note_private','created_at','updated_at'];
const HISTORY_KEYS=['id','customer_alias','purchased_on','purchased_time','item_text','amount_twd','channel','note_private','import_key','import_batch','created_at'];
export function validateCustomerBackup(doc){
 if(!doc||doc.format!=='wu-jacky-customers'||doc.version!==1||!Array.isArray(doc.profiles)||!Array.isArray(doc.history))throw Error('這不是客人資料備份檔。');
 if(doc.profiles.length+doc.history.length>50000)throw Error('備份筆數超過上限。');
 const pick=(rows,keys,label)=>rows.map((r,i)=>{if(!r||typeof r!=='object'||Array.isArray(r)||keys.some(k=>!(k in r)))throw Error(`${label}第 ${i+1} 筆欄位不完整。`);return Object.fromEntries(keys.map(k=>[k,r[k]]))});
 return {profiles:pick(doc.profiles,PROFILE_KEYS,'客人資料'),history:pick(doc.history,HISTORY_KEYS,'歷史購買')}}
export function createCustomersService(client){
 async function all(table,selection,order){const rows=[];for(let offset=0;;offset+=500){const batch=checked(await client.from(table).select(selection).order(order).order('id').range(offset,offset+499));rows.push(...batch);if(batch.length<500)return rows;if(rows.length>=50000)throw Error('資料超過本次可載入上限。')}}
 return {
  profiles:()=>all('customer_profiles','id,alias,other_aliases,contact_private,do_not_market,note_private,updated_at','alias'),
  history:()=>all('customer_history_purchases','id,customer_alias,purchased_on,purchased_time,item_text,amount_twd,channel,note_private,import_batch','purchased_on'),
  async saveProfile(id,payload){if(id)return checked(await client.from('customer_profiles').update(payload).eq('id',id).select('id').single());return checked(await client.from('customer_profiles').insert(payload).select('id').single())},
  async importHistory(rows,batch){let inserted=0;for(let i=0;i<rows.length;i+=200){const chunk=rows.slice(i,i+200).map(r=>({...r,import_batch:batch}));const data=checked(await client.from('customer_history_purchases').upsert(chunk,{onConflict:'import_key',ignoreDuplicates:true}).select('id'));inserted+=data.length}return {inserted,skipped:rows.length-inserted}},
  // 客人資料備份：只補回缺少的資料，不覆寫現有內容。
  async backup(){const [profiles,history]=await Promise.all([all('customer_profiles','id,alias,other_aliases,contact_private,do_not_market,note_private,created_at,updated_at','alias'),all('customer_history_purchases','id,customer_alias,purchased_on,purchased_time,item_text,amount_twd,channel,note_private,import_key,import_batch,created_at','purchased_on')]);return {format:'wu-jacky-customers',version:1,created_at:new Date().toISOString(),profiles,history}},
  async restore(doc){const {profiles,history}=validateCustomerBackup(doc);let p=0,h=0;
   for(let i=0;i<profiles.length;i+=200)p+=checked(await client.from('customer_profiles').upsert(profiles.slice(i,i+200),{onConflict:'id',ignoreDuplicates:true}).select('id')).length;
   for(let i=0;i<history.length;i+=200)h+=checked(await client.from('customer_history_purchases').upsert(history.slice(i,i+200),{onConflict:'import_key',ignoreDuplicates:true}).select('id')).length;
   return {profiles:p,history:h,skipped:profiles.length+history.length-p-h}},
  async deleteBatch(batch){if(!batch)throw Error('請指定匯入批次。');return checked(await client.from('customer_history_purchases').delete().eq('import_batch',batch).select('id')).length}
 }}
