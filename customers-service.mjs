// 客人名單：把後台訂單與匯入的歷史購買合併，依客人統計次數、金額、買過什麼。
// 歷史購買存在 customer_history_purchases，不進 orders，不影響營收報表與庫存。
export const COUNTED_ORDER_STATES=['paid_awaiting_purchase','ordered_from_supplier','arrived_for_check','completed'];
export const PLATFORMS=['官方LINE','Messenger','IG','Threads','LINE社群','8591'];
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
  if(!customers.has(key))customers.set(key,{key,alias:main,otherAliases:[...(profile?.other_aliases??[])],profileId:profile?.id??null,contacts:[...(profile?.contacts??[])],doNotMarket:!!profile?.do_not_market,note:profile?.note_private??'',updatedAt:profile?.updated_at??null,namesSeen:new Set(),purchases:[]});
  return customers.get(key)};
 for(const p of profiles){ensure(p.alias,p);byKey.set(normAlias(p.alias),p);for(const a of p.other_aliases??[])if(!byKey.has(normAlias(a)))byKey.set(normAlias(a),p)}
 const find=alias=>{const p=byKey.get(normAlias(alias));return ensure(p?p.alias:String(alias).trim(),p)};
 for(const o of orders){if(!COUNTED_ORDER_STATES.includes(o.status)||!String(o.customer_alias??'').trim())continue;const c=find(o.customer_alias);c.namesSeen.add(o.customer_alias.trim());
  const at=o.received_at||o.created_at;c.purchases.push({source:'order',id:o.id,ref:o.order_number??'',date:taipeiDate(at),time:new Date(at).toLocaleTimeString('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit'}),item:orderItems(o),amount:orderAmount(o),channel:o.channel??''});
  if(!c.contacts.length&&o.customer_contact_private&&!c.contacts.some(x=>x.handle===o.customer_contact_private))c.orderContact=o.customer_contact_private}
 for(const h of history){const c=find(h.customer_alias);c.namesSeen.add(h.customer_alias.trim());c.purchases.push({source:'history',id:h.id,ref:h.import_batch??'',date:h.purchased_on,time:h.purchased_time??'',item:h.item_text,amount:Number(h.amount_twd??0),channel:h.channel??'',note:h.note_private??''})}
 return [...customers.values()].map(c=>{c.purchases.sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));const last=c.purchases[0]?.date??'';
  const contacts=c.contacts.length?c.contacts:(c.orderContact?[{platform:'訂單填寫',handle:c.orderContact}]:[]);
  return {...c,contacts,contact:contacts.map(x=>x.platform+'：'+x.handle).join('・'),namesSeen:[...c.namesSeen].filter(n=>normAlias(n)!==c.key&&!c.otherAliases.some(a=>normAlias(a)===normAlias(n))),count:c.purchases.length,total:c.purchases.reduce((s,p)=>s+p.amount,0),lastDate:last,daysSince:last?daysBetween(last,today):null,
   items:[...new Set(c.purchases.map(p=>p.item))]}})
  .sort((a,b)=>b.count-a.count||b.total-a.total||a.alias.localeCompare(b.alias,'zh-Hant'))}

export function filterRoster(list,{search='',minCount=0,inactiveDays=0,marketableOnly=false,platform=''}={}){
 const q=normAlias(search);
 return list.filter(c=>(!q||[c.alias,...c.otherAliases,...c.namesSeen,...c.items,c.note,...c.contacts.map(x=>x.handle)].some(v=>normAlias(v).includes(q)))
  &&c.count>=minCount&&(!inactiveDays||(c.daysSince!=null&&c.daysSince>=inactiveDays))&&(!marketableOnly||!c.doNotMarket)&&(!platform||c.contacts.some(x=>x.platform===platform)))}
export function usedPlatforms(list){const used=new Set(PLATFORMS);for(const c of list)for(const x of c.contacts)if(x.platform!=='訂單填寫')used.add(x.platform);return [...used]}

// 匯出 CSV；以 ' 開頭避免試算表把 + - = @ 開頭的內容當公式（會出現 #ERROR!）。
const cell=v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
export function rosterCsv(list){const platforms=[...usedPlatforms(list),...(list.some(c=>c.contacts.some(x=>x.platform==='訂單填寫'))?['訂單填寫']:[])];
 const head=['客人','其他名稱',...platforms,'購買次數','合計金額','最後購買','距今天數','買過什麼','勿發廣告','備註'];
 return '﻿'+[head,...list.map(c=>[c.alias,[...c.otherAliases,...c.namesSeen].join('、'),...platforms.map(p=>c.contacts.filter(x=>x.platform===p).map(x=>x.handle).join('、')),c.count,c.total,c.lastDate,c.daysSince??'',c.items.join('；'),c.doNotMarket?'是':'',c.note])].map(r=>r.map(cell).join(',')).join('\r\n')}

export function profilePayload(v){const alias=String(v.alias??'').normalize('NFKC').trim().replace(/\s+/g,' ');if(!alias||alias.length>120)throw Error('客人名稱未填或超過 120 字。');
 const others=[...new Set(String(v.other_aliases??'').split(/[,，、\n]/).map(s=>s.normalize('NFKC').trim().replace(/\s+/g,' ')).filter(s=>s&&normAlias(s)!==normAlias(alias)))];
 if(others.length>20||others.some(s=>s.length>120))throw Error('其他名稱最多 20 個，每個 120 字內。');
 const note=String(v.note_private??'').trim();if(note.length>2000)throw Error('備註超過 2000 字。');
 return {alias,other_aliases:others,contacts:contactsPayload(v.contacts),contact_private:'',do_not_market:v.do_not_market===true||v.do_not_market==='on'||v.do_not_market==='true',note_private:note}}

export function contactsPayload(rows=[]){const out=[],seen=new Set();
 for(const r of rows??[]){const platform=String(r?.platform??'').normalize('NFKC').trim().replace(/\s+/g,' '),handle=String(r?.handle??'').normalize('NFKC').trim();
  if(!platform&&!handle)continue;if(!platform)throw Error(`「${handle}」沒有選平台。`);if(!handle)throw Error(`${platform} 的帳號沒有填。`);
  if(platform.length>30)throw Error('平台名稱最多 30 字。');if(handle.length>200)throw Error('帳號或連結最多 200 字。');
  const k=normAlias(platform)+'|'+normAlias(handle);if(seen.has(k))continue;seen.add(k);out.push({platform,handle})}
 if(out.length>20)throw Error('聯絡方式最多 20 個。');return out}
const PROFILE_KEYS=['id','alias','other_aliases','contacts','contact_private','do_not_market','note_private','created_at','updated_at'];
const HISTORY_KEYS=['id','customer_alias','purchased_on','purchased_time','item_text','amount_twd','channel','note_private','import_key','import_batch','created_at'];
// CRM（Threads 客人身分、詢問、標籤、待追蹤、匯入批次）一起備份；舊備份檔沒有 crm 欄位也能還原。
export const CRM_TABLES=[
 ['batches','crm_import_batches',['id','source','file_sha256','stats','result','started_at','finished_at'],'id'],
 ['identities','crm_identities',['id','customer_id','platform','external_key','display_name','folder','first_seen_at','last_seen_at','message_count','customer_message_count','last_sender','summary','narrative','narrative_updated_at','last_batch','created_at','updated_at'],'platform,external_key'],
 ['inquiries','crm_inquiries',['id','customer_id','identity_id','occurred_at','category','terms','product_ids','excerpt','evidence','source_key','batch_id','created_at'],'source_key'],
 ['tags','crm_tags',['customer_id','tag','source','evidence','created_at'],'customer_id,tag'],
 ['followups','crm_followups',['id','customer_id','reason','excerpt','status','due_on','note','source_key','created_at','resolved_at'],'id'],
 ['cases','crm_cases',['id','customer_id','identity_id','opened_at','last_at','status','status_source','suggested_status','items','product_ids','excerpt','evidence','note','source_key','batch_id','created_at','updated_at'],'source_key'],
 ['deals','crm_deals',['id','customer_id','identity_id','case_source_key','occurred_at','items','product_ids','qty','amount_twd','refund_twd','status','source','evidence','note','source_key','decided_at','decided_by','batch_id','created_at','updated_at'],'source_key'],
 ['waits','crm_stock_waits',['id','customer_id','item_text','product_ids','channel','follow_on','status','source','excerpt','evidence','note','source_key','created_at','updated_at'],'id'],
 ['settings','crm_settings',['key','value','updated_at'],'key'],
 ['metas','crm_customer_meta',['customer_id','first_channel','current_channel','referral_source','contact_types','language','region','payment_preferred','payment_last','note','updated_at'],'customer_id'],
 ['tasks','crm_tasks',['id','customer_id','case_source_key','kind','title','status','source','excerpt','evidence','source_key','created_at','resolved_at'],'id']];
export function validateCustomerBackup(doc){
 if(!doc||doc.format!=='wu-jacky-customers'||doc.version!==1||!Array.isArray(doc.profiles)||!Array.isArray(doc.history))throw Error('這不是客人資料備份檔。');
 const crmRows=CRM_TABLES.reduce((n,[k])=>n+(Array.isArray(doc.crm?.[k])?doc.crm[k].length:0),0);
 if(doc.profiles.length+doc.history.length+crmRows>200000)throw Error('備份筆數超過上限。');
 const pick=(rows,keys,label)=>rows.map((r,i)=>{if(r&&typeof r==='object'&&keys.includes('contacts')&&!('contacts' in r))r={...r,contacts:r.contact_private?[{platform:'其他',handle:r.contact_private}]:[]};if(!r||typeof r!=='object'||Array.isArray(r)||keys.some(k=>!(k in r)))throw Error(`${label}第 ${i+1} 筆欄位不完整。`);return Object.fromEntries(keys.map(k=>[k,r[k]]))});
 // 後來才加的欄位：舊備份沒有時補預設值，不擋還原
 const LATER={summary:'',narrative:'',narrative_updated_at:null};
 const crm={};for(const [k,,keys] of CRM_TABLES)crm[k]=Array.isArray(doc.crm?.[k])?pick(doc.crm[k].map(r=>r&&typeof r==='object'&&!Array.isArray(r)?{...Object.fromEntries(Object.entries(LATER).filter(([x])=>keys.includes(x))),...r}:r),keys,'CRM '+k):[];
 return {profiles:pick(doc.profiles,PROFILE_KEYS,'客人資料'),history:pick(doc.history,HISTORY_KEYS,'歷史購買'),crm}}
export function createCustomersService(client){
 async function all(table,selection,order,tie='id'){const rows=[];for(let offset=0;;offset+=500){let q=client.from(table).select(selection).order(order);if(tie)q=q.order(tie);const batch=checked(await q.range(offset,offset+499));rows.push(...batch);if(batch.length<500)return rows;if(rows.length>=200000)throw Error('資料超過本次可載入上限。')}}
 return {
  profiles:()=>all('customer_profiles','id,alias,other_aliases,contacts,do_not_market,note_private,updated_at','alias'),
  history:()=>all('customer_history_purchases','id,customer_alias,purchased_on,purchased_time,item_text,amount_twd,channel,note_private,import_batch','purchased_on'),
  async saveProfile(id,payload){if(id)return checked(await client.from('customer_profiles').update(payload).eq('id',id).select('id').single());return checked(await client.from('customer_profiles').insert(payload).select('id').single())},
  async importHistory(rows,batch){let inserted=0;for(let i=0;i<rows.length;i+=200){const chunk=rows.slice(i,i+200).map(r=>({...r,import_batch:batch}));const data=checked(await client.from('customer_history_purchases').upsert(chunk,{onConflict:'import_key',ignoreDuplicates:true}).select('id'));inserted+=data.length}return {inserted,skipped:rows.length-inserted}},
  // 客人資料備份：只補回缺少的資料，不覆寫現有內容。
  async backup(){const [profiles,history]=await Promise.all([all('customer_profiles','id,alias,other_aliases,contacts,contact_private,do_not_market,note_private,created_at,updated_at','alias'),all('customer_history_purchases','id,customer_alias,purchased_on,purchased_time,item_text,amount_twd,channel,note_private,import_key,import_batch,created_at','purchased_on')]);
   const crm={};for(const [k,table,keys] of CRM_TABLES){try{crm[k]=await all(table,keys.join(','),k==='tags'?'customer_id':k==='settings'?'key':k==='metas'?'customer_id':'id',k==='tags'?'tag':null)}catch(e){if(/does not exist|relation|schema cache/i.test(e?.message??''))crm[k]=[];else throw e}}
   return {format:'wu-jacky-customers',version:1,created_at:new Date().toISOString(),profiles,history,crm}},
  async restore(doc){const {profiles,history}=validateCustomerBackup(doc);let p=0,h=0;
   for(let i=0;i<profiles.length;i+=200)p+=checked(await client.from('customer_profiles').upsert(profiles.slice(i,i+200),{onConflict:'id',ignoreDuplicates:true}).select('id')).length;
   for(let i=0;i<history.length;i+=200)h+=checked(await client.from('customer_history_purchases').upsert(history.slice(i,i+200),{onConflict:'import_key',ignoreDuplicates:true}).select('id')).length;
   const {crm}=validateCustomerBackup(doc);let c=0,total=0;
   for(const [k,table,,conflict] of CRM_TABLES){const rows=crm[k];total+=rows.length;for(let i=0;i<rows.length;i+=200)c+=checked(await client.from(table).upsert(rows.slice(i,i+200),{onConflict:conflict,ignoreDuplicates:true}).select(k==='tags'?'tag':k==='settings'?'key':k==='metas'?'customer_id':'id')).length}
   return {profiles:p,history:h,crm:c,skipped:profiles.length+history.length+total-p-h-c}},
  async deleteBatch(batch){if(!batch)throw Error('請指定匯入批次。');return checked(await client.from('customer_history_purchases').delete().eq('import_batch',batch).select('id')).length}
 }}
