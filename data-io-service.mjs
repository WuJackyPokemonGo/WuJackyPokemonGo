export const PROJECT='wlrwlqchlxehlvkyesnj';
export const BASE_TABLES=['product_categories','products','category_assignments','product_images','purchase_batches','orders','order_items','inventory_balances','inventory_movements','expenses','app_settings','audit_logs','store_operation_requests','app_io_requests'];
export const TABLES=[...BASE_TABLES,'order_payments','inventory_valuations','valuation_events'];
export const BUCKETS=['product-images','storefront-thumbnails'];
const MAX_MEDIA=64*1024*1024,MAX_DOCUMENT=16*1024*1024,MAX_FILE=128*1024*1024;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const checked=({data,error})=>{if(error)throw error;return data};
export function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value)}
export function toBase64(bytes){let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s)}
export function fromBase64(text){if(typeof text!=='string'||text.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))throw Error('備份編碼損壞。');try{return Uint8Array.from(atob(text),c=>c.charCodeAt(0))}catch{throw Error('備份編碼損壞。')}}
function requireCrypto(){if(!globalThis.crypto?.subtle)throw Error('此功能需要 HTTPS 安全連線。請從正式賣場的管理後台開啟，或使用較新的瀏覽器。')}
export async function digest(bytes){requireCrypto();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')}
export function validateDocument(d){
 const tables=d?.version===1?BASE_TABLES:TABLES;
 if(!d||d.format!=='wu-jacky-app-backup'||![1,2].includes(d.version)||d.project!==PROJECT||!d.data||typeof d.data!=='object'||Array.isArray(d.data)||Object.keys(d.data).length!==tables.length||tables.some(k=>!Array.isArray(d.data[k])))throw Error('備份格式、版本或網站來源不符。');
 if(encoder.encode(JSON.stringify(d)).length>MAX_DOCUMENT||Object.values(d.data).reduce((n,v)=>n+v.length,0)>50000)throw Error('資料備份超過 16 MB 或 50,000 筆的還原上限。');return d;
}
function validPath(path){return typeof path==='string'&&path.length>0&&path.length<=1000&&!path.startsWith('/')&&!path.split('/').some(v=>!v||v==='.'||v==='..')&&!/[\u0000-\u001f\\]/.test(path)}
function objectKey(o){return o.bucket+'/'+o.path}
function references(d){const refs=[];for(const i of d.data.product_images){if(i.storage_path)refs.push({bucket:'product-images',path:i.storage_path});if(i.thumbnail_path)refs.push({bucket:'product-images',path:i.thumbnail_path});if(i.public_path)refs.push({bucket:'storefront-thumbnails',path:i.public_path})}return refs}
async function derive(password,salt,usages){const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,usages)}
export async function encryptBackup(bundle,password){
 requireCrypto();
 if(typeof password!=='string'||[...password].length<12||password.length>1024)throw Error('備份密碼需為 12～1,024 個字元。');
 const plain=encoder.encode(JSON.stringify(bundle));if(plain.length>MAX_FILE-1024)throw Error('備份檔案超過手機版可處理大小。');
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const header={format:'wu-jacky-encrypted-backup',version:1,kdf:'PBKDF2-SHA256',iterations:310000,cipher:'AES-256-GCM',salt:toBase64(salt),iv:toBase64(iv)};
 const aad=encoder.encode(canonical(header)),key=await derive(password,salt,['encrypt']);const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,plain);
 return JSON.stringify({...header,data:toBase64(new Uint8Array(encrypted))});
}
export async function decryptBackup(text,password){
 requireCrypto();
 if(typeof text!=='string'||encoder.encode(text).length>MAX_FILE*1.4)throw Error('備份檔案過大。');let e;try{e=JSON.parse(text)}catch{throw Error('不是有效的加密備份檔案。')}
 if(e?.format!=='wu-jacky-encrypted-backup'||e.version!==1||e.kdf!=='PBKDF2-SHA256'||e.iterations!==310000||e.cipher!=='AES-256-GCM')throw Error('不支援的加密備份格式。');
 if(typeof password!=='string'||password.length>1024)throw Error('備份密碼無效。');const salt=fromBase64(e.salt),iv=fromBase64(e.iv);if(salt.length!==16||iv.length!==12)throw Error('備份加密參數損壞。');
 const {data,...header}=e,key=await derive(password,salt,['decrypt']);let plain;try{plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:encoder.encode(canonical(header))},key,fromBase64(data))}catch{throw Error('密碼不正確，或備份檔案已損壞。')}
 let bundle;try{bundle=JSON.parse(decoder.decode(plain))}catch{throw Error('備份內容無法辨識。')}await validateBundle(bundle);return bundle;
}
export async function validateBundle(b){
 if(b?.format!=='wu-jacky-complete-app-backup'||b.version!==1||!Array.isArray(b.objects)||b.objects.length>10000)throw Error('備份套件格式無效。');validateDocument(b.document);
 const keys=new Set();let size=0;
 for(const o of b.objects){if(!BUCKETS.includes(o.bucket)||!validPath(o.path)||keys.has(objectKey(o))||typeof o.sha256!=='string'||typeof o.content_type!=='string'||o.content_type.length>100)throw Error('備份的圖片索引無效或重複。');const bytes=fromBase64(o.data);size+=bytes.length;if(size>MAX_MEDIA||bytes.length!==o.size||await digest(bytes)!==o.sha256)throw Error('圖片備份大小超過限制或完整性驗證失敗。');keys.add(objectKey(o))}
 for(const ref of references(b.document))if(!keys.has(objectKey(ref)))throw Error('備份缺少商品原圖或縮圖，已停止還原。');return b;
}
export function validateCloudManifest(b){
 if(b?.format!=='wu-jacky-cloud-backup'||b.version!==2||!Array.isArray(b.objects)||b.objects.length>10000)throw Error('雲端完整備份格式不符。');validateDocument(b.document);
 const keys=new Set();let size=0;for(const o of b.objects){if(!BUCKETS.includes(o.bucket)||!validPath(o.path)||keys.has(objectKey(o))||!Number.isSafeInteger(o.size)||o.size<0||o.size>12*1024*1024||!/^[a-f0-9]{64}$/.test(o.sha256)||o.backup_path!=='media/'+o.sha256||typeof o.content_type!=='string'||o.content_type.length>100)throw Error('雲端圖片索引無效。');keys.add(objectKey(o));size+=o.size}if(size>512*1024*1024)throw Error('雲端備份超過 512 MB 上限。');for(const ref of references(b.document))if(!keys.has(objectKey(ref)))throw Error('雲端備份缺少商品圖片。');return b;
}
export function createDataIOService(client,journal,randomUUID=()=>crypto.randomUUID()){
 let actor=null,pending=null,inMemory=null;const journalKey=()=>`wj_pending_data_io:${actor}`;
 const rpc=(action,payload={})=>client.rpc('admin_data_io',{p_action:action,p_payload:payload,p_request_id:null}).then(checked);
 function persist(){try{if(pending)journal.setItem(journalKey(),JSON.stringify(pending));else journal.removeItem(journalKey())}catch{throw Error('無法保存操作重試資訊，本次沒有送出。請確認瀏覽器儲存空間。')}}
 async function perform(action,payload){
  if(!actor)throw Error('請先登入。');if(!['import_products','restore_missing'].includes(action))throw Error('不支援的資料操作。');
  const fingerprint=await digest(encoder.encode(canonical(payload)));
  if(pending&&(pending.action!==action||pending.fingerprint!==fingerprint))throw Error('上一筆結果尚未確認，請先重試原操作；還原請重新選擇相同備份。');
  if(!pending)pending={action,request_id:randomUUID(),fingerprint,...(action==='import_products'?{payload:structuredClone(payload)}:{})};inMemory=payload;persist();
  let response;try{response=await client.rpc('admin_data_io',{p_action:action,p_payload:payload,p_request_id:pending.request_id})}catch(error){throw Error('連線中斷，操作結果尚未確認。請按「重試原操作」，不要另建一批。',{cause:error})}
  if(response.error){if(/^(22...|23...|42501|PT409|P0002)$/.test(response.error.code??'')){pending=null;inMemory=null;persist()}throw response.error}
  const result=response.data;pending=null;inMemory=null;persist();return result;
 }
 async function listObjects(){
  const all=[];for(const bucket of BUCKETS){const folders=[''];while(folders.length){const folder=folders.shift();for(let offset=0;;offset+=200){const rows=checked(await client.storage.from(bucket).list(folder,{limit:200,offset,sortBy:{column:'name',order:'asc'}}));for(const row of rows){const path=(folder?folder+'/':'')+row.name;if(!validPath(path))throw Error('雲端圖片路徑不支援備份。');if(row.id==null){if(path.split('/').length>20)throw Error('圖片目錄層數過多。');folders.push(path)}else all.push({bucket,path,size:Number(row.metadata?.size??0),updated_at:row.updated_at})}if(all.length+folders.length>10000)throw Error('圖片數量超過本次備份上限。');if(rows.length<200)break}}}return all.sort((a,b)=>objectKey(a).localeCompare(objectKey(b)))
 }
 async function backup(progress=()=>{}){
  if(!actor)throw Error('請先登入。');const document=validateDocument(checked(await client.rpc('admin_backup_document'))),before=await listObjects();
  if(before.reduce((n,o)=>n+o.size,0)>MAX_MEDIA)throw Error('圖片總量超過本次 64 MB 上限，需另外安排大量圖片備份；本次未產生不完整備份。');
  const objects=[];let size=0;
  for(const [i,o] of before.entries()){progress(`正在備份圖片 ${i+1} / ${before.length}`);const blob=checked(await client.storage.from(o.bucket).download(o.path)),bytes=new Uint8Array(await blob.arrayBuffer());size+=bytes.length;if(size>MAX_MEDIA)throw Error('圖片總量超過 64 MB，本次備份已停止。');objects.push({bucket:o.bucket,path:o.path,size:bytes.length,content_type:blob.type||'application/octet-stream',sha256:await digest(bytes),data:toBase64(bytes)})}
  progress('正在核對資料快照…');const after=validateDocument(checked(await client.rpc('admin_backup_document')));
  if(canonical(document.data)!==canonical(after.data)||canonical(before)!==canonical(await listObjects()))throw Error('備份期間資料或圖片有變更，請暫停其他裝置的編輯後重新備份。');
  const bundle={format:'wu-jacky-complete-app-backup',version:1,created_at:new Date().toISOString(),document,objects};await validateBundle(bundle);return bundle;
 }
 async function mediaPlan(bundle,progress=()=>{}){
  const current=new Map((await listObjects()).map(o=>[objectKey(o),o])),missing=[],conflicts=[];let same=0;
  for(const [i,o] of bundle.objects.entries()){progress(`正在比對圖片 ${i+1} / ${bundle.objects.length}`);if(!current.has(objectKey(o))){missing.push(o);continue}const blob=checked(await client.storage.from(o.bucket).download(o.path));if(await digest(new Uint8Array(await blob.arrayBuffer()))!==o.sha256)conflicts.push({bucket:o.bucket,path:o.path});else same++}
  return {missing,conflicts,same};
 }
 async function previewRestore(bundle,progress=()=>{}){if(!actor)throw Error('請先登入。');await validateBundle(bundle);const database=await rpc('restore_preview',{document:bundle.document}),media=await mediaPlan(bundle,progress);return {database,media,can_restore:database.can_restore&&media.conflicts.length===0}}
 async function restore(bundle,progress=()=>{}){
  if(pending&&(pending.action!=='restore_missing'||pending.fingerprint!==await digest(encoder.encode(canonical({document:bundle.document})))))throw Error('上一筆結果尚未確認，請先重試原操作或選擇相同備份。');
  const plan=await previewRestore(bundle,progress);if(!plan.can_restore)throw Object.assign(Error('現有資料或圖片與備份不同，已停止還原。'),{code:'PT409'});
  // Image uploads are immutable and resumable. Database restoration is one transaction.
  for(const [i,o] of plan.media.missing.entries()){
   progress(`正在補回圖片 ${i+1} / ${plan.media.missing.length}`);const response=await client.storage.from(o.bucket).upload(o.path,fromBase64(o.data),{contentType:o.content_type,upsert:false});
   if(response.error){const existing=await client.storage.from(o.bucket).download(o.path);if(existing.error||await digest(new Uint8Array(await existing.data.arrayBuffer()))!==o.sha256)throw Error('圖片補回尚未完成。可使用相同備份重試，已存在圖片不會被覆寫。')}
  }
  progress('正在補回資料並核對庫存…');const result=await perform('restore_missing',{document:bundle.document});return {...result,images:plan.media.missing.length};
 }
 return {
  get pending(){return pending?structuredClone(pending):null},
  attach(id){actor=id;pending=null;inMemory=null;if(!id)return;let p;try{p=JSON.parse(journal.getItem(journalKey())||'null')}catch{throw Error('無法讀取上次資料操作紀錄。')}if(p&&(!['import_products','restore_missing'].includes(p.action)||typeof p.request_id!=='string'||typeof p.fingerprint!=='string'))throw Error('上次資料操作紀錄異常，請先核對。');pending=p},
  perform,
  async retry(){if(!pending)throw Error('沒有待確認的資料操作。');const status=await rpc('request_status',{id:pending.request_id});if(status.applied){pending=null;inMemory=null;persist();return status.result}const payload=inMemory||pending.payload;if(!payload)throw Error('伺服器尚未確認完成。請重新選擇相同備份並解鎖，接著重試還原。');return perform(pending.action,payload)},
  backup,previewRestore,restore,
  async listFullBackups(){const status=checked(await client.rpc('admin_job_control',{p_action:'status',p_payload:{}}));return (status.backups??[]).filter(b=>b.state==='completed')},
  async getCloudBackup(id){if(!actor)throw Error('請先登入。');const info=checked(await client.rpc('admin_job_control',{p_action:'backup_get',p_payload:{id}}));if(!/^daily\/\d{4}-\d{2}-\d{2}\/manifest\.json$/.test(info?.manifest_path??''))throw Error('找不到已完成的完整備份。');const blob=checked(await client.storage.from('app-backups').download(info.manifest_path));if(blob.size>24*1024*1024)throw Error('雲端備份索引過大。');return validateCloudManifest(JSON.parse(await blob.text()))},
  async previewCloud(b,progress=()=>{}){if(!actor)throw Error('請先登入。');validateCloudManifest(b);const database=await rpc('restore_preview',{document:b.document}),media=await mediaPlan(b,progress);return {database,media,can_restore:database.can_restore&&media.conflicts.length===0}},
  async restoreCloud(b,progress=()=>{}){
   if(pending&&(pending.action!=='restore_missing'||pending.fingerprint!==await digest(encoder.encode(canonical({document:b.document})))))throw Error('上一筆結果尚未確認，請選擇相同備份。');
   const plan=await this.previewCloud(b,progress);if(!plan.can_restore)throw Object.assign(Error('現有資料或圖片與備份不同，已停止還原。'),{code:'PT409'});
   for(const [i,o]of plan.media.missing.entries()){progress(`正在逐一補回圖片 ${i+1} / ${plan.media.missing.length}`);const blob=checked(await client.storage.from('app-backups').download(o.backup_path));if(blob.size!==o.size||await digest(new Uint8Array(await blob.arrayBuffer()))!==o.sha256)throw Error('雲端圖片完整性驗證失敗，資料尚未套用。');const response=await client.storage.from(o.bucket).upload(o.path,blob,{contentType:o.content_type,upsert:false});if(response.error){const existing=await client.storage.from(o.bucket).download(o.path);if(existing.error||await digest(new Uint8Array(await existing.data.arrayBuffer()))!==o.sha256)throw Error('圖片補回中斷，可使用相同備份重試。')}}
   const result=await perform('restore_missing',{document:b.document});return {...result,images:plan.media.missing.length};
  },
  listBackups:()=>rpc('backup_list'),
  async getSnapshot(id){const d=validateDocument(await rpc('backup_get',{id}));return d},
  previewSnapshot:document=>rpc('restore_preview',{document:validateDocument(document)}),
  restoreSnapshot:document=>perform('restore_missing',{document:validateDocument(document)})
 };
}
