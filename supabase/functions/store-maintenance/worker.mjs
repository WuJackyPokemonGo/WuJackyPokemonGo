const SOURCE_BUCKETS=['product-images','storefront-thumbnails'];
// Product rows may point at images shipped with the website (GitHub Pages) instead of Supabase Storage; those are versioned in git, not backed up here.
export const isStaticSitePath=path=>typeof path==='string'&&path.startsWith('assets/');
const INDEX_PATH='index/objects.json',INDEX_FORMAT='wu-jacky-backup-index',DOWNLOADS_PER_RUN=25,PROGRESS_BATCH=50;
const checked=r=>{if(r.error)throw Object.assign(Error('BACKEND_OPERATION_FAILED'),{code:r.error.code});return r.data};
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function listFiles(client,bucket,root=''){const files=[],folders=[root];while(folders.length){const folder=folders.shift();for(let offset=0;;offset+=200){const rows=checked(await client.storage.from(bucket).list(folder,{offset,limit:200,sortBy:{column:'name',order:'asc'}}));for(const r of rows){const path=(folder?folder+'/':'')+r.name;if(r.id==null)folders.push(path);else files.push({bucket,path,size:Number(r.metadata?.size??0),updated_at:r.updated_at})}if(files.length+folders.length>10000)throw Error('OBJECT_COUNT_LIMIT');if(rows.length<200)break}}return files.sort((a,b)=>(a.bucket+'/'+a.path).localeCompare(b.bucket+'/'+b.path))}
export function discordText(payload){
 const clean=v=>String(v??'').replace(/[\r\n]/g,' ').slice(0,120);
 if(payload.type==='daily'){const a=payload.analytics??{},e=a.events??{},t=payload.tasks??{};return `Wu Jacky 每日摘要｜${clean(payload.day)}（台灣時間）\n瀏覽 ${Number(e.page_view??0)} 次｜匿名工作階段 ${Number(a.sessions??0)}\n商品瀏覽 ${Number(e.product_view??0)} 次｜搜尋無結果 ${Number(e.search_empty??0)} 次\n加入清單 ${Number(e.cart_add??0)} 次｜移除 ${Number(e.cart_remove??0)} 次｜複製詢價 ${Number(e.inquiry_copy??0)} 次\n待處理訂單 ${Number(t.pending_orders??0)} 筆｜低庫存商品 ${Number(t.low_stock??0)} 件\n複製詢價不代表已傳送訊息或成立訂單。`}
 if(payload.type==='new_order')return `Wu Jacky：新增待處理訂單 #${clean(payload.order_number)}，請到管理後台確認。`;
 if(payload.type==='refund_task')return `Wu Jacky：訂單 #${clean(payload.order_number)} 進入退款處理，請到後台確認。`;
 if(payload.type==='low_stock')return `Wu Jacky 低庫存提醒：${clean(payload.product)}，請核對供貨。`;
 if(payload.type==='stock_recovered')return `Wu Jacky 庫存已恢復：${clean(payload.product)}。`;
 return `Wu Jacky 系統提醒：${clean(payload.code||'TASK_FAILED')}｜${clean(payload.day)}，請到後台查看排程狀態。`;
}
export async function runMaintenance({client,token,fetchImpl=fetch,clock=()=>Date.now()}){
 const rpc=async(action,payload={})=>checked(await client.rpc('maintenance_work',{p_token:token,p_action:action,p_payload:payload}));
 const claim=await rpc('claim');let backupResult='idle';
 if(claim.backup){const job=claim.backup,start=clock(),store=client.storage.from('app-backups');try{
  const bucket=await client.storage.createBucket('app-backups',{public:false});if(bucket.error&&!/already exists|Duplicate/i.test(bucket.error.message??''))throw Error('BACKUP_BUCKET_FAILED');
  let plan=job.plan,media=job.media??{},cursor=job.cursor??0;
  if(!plan){plan=[];for(const bucket of SOURCE_BUCKETS)plan.push(...await listFiles(client,bucket));if(plan.reduce((n,x)=>n+x.size,0)>512*1024*1024)throw Error('BACKUP_STORAGE_LIMIT');await rpc('progress',{id:job.id,lease:job.lease,plan,cursor})}
  // Incremental backup: an object whose size and updated_at match the stored index, and whose content-addressed copy still exists, is reused without downloading it again.
  let index={};const idx=await store.download(INDEX_PATH);if(!idx.error){try{const parsed=JSON.parse(await idx.data.text());if(parsed?.format===INDEX_FORMAT&&parsed.objects&&typeof parsed.objects==='object')index=parsed.objects}catch{index={}}}
  const stored=new Map((await listFiles(client,'app-backups','media')).map(f=>[f.path,f.size]));
  let downloads=0,indexChanged=false,batch={};
  const flush=async(extra={})=>{if(!Object.keys(batch).length&&!extra.release)return;await rpc('progress',{id:job.id,lease:job.lease,cursor,media:batch,...extra});batch={}};
  while(cursor<plan.length&&clock()-start<45000){const o=plan[cursor],key=o.bucket+'/'+o.path,prev=index[key];let entry;
   if(prev&&prev.size===o.size&&prev.updated_at===o.updated_at&&/^[a-f0-9]{64}$/.test(prev.sha256??'')&&prev.backup_path==='media/'+prev.sha256&&stored.get(prev.backup_path)===prev.size)entry={bucket:o.bucket,path:o.path,size:prev.size,content_type:prev.content_type,sha256:prev.sha256,backup_path:prev.backup_path};
   else{if(downloads>=DOWNLOADS_PER_RUN)break;if(o.size>12*1024*1024)throw Error('OBJECT_SIZE_LIMIT');const blob=checked(await client.storage.from(o.bucket).download(o.path));downloads++;if(blob.size>12*1024*1024)throw Error('OBJECT_SIZE_LIMIT');const hash=await sha(await blob.arrayBuffer()),backupPath='media/'+hash;
    if(stored.get(backupPath)!==blob.size){const uploaded=await store.upload(backupPath,blob,{contentType:blob.type||'application/octet-stream',upsert:false});if(uploaded.error){if(!/already exists|Duplicate/i.test(uploaded.error.message??''))throw Error('BACKUP_OBJECT_WRITE_FAILED');const existing=await store.download(backupPath);if(existing.error||await sha(await existing.data.arrayBuffer())!==hash)throw Error('BACKUP_OBJECT_WRITE_FAILED')}stored.set(backupPath,blob.size)}
    entry={bucket:o.bucket,path:o.path,size:blob.size,content_type:blob.type||'application/octet-stream',sha256:hash,backup_path:backupPath};index[key]={...entry,updated_at:o.updated_at};indexChanged=true}
   media[key]=entry;batch[key]=entry;cursor++;if(Object.keys(batch).length>=PROGRESS_BATCH)await flush();
  }
  if(indexChanged){const live=new Set(plan.map(o=>o.bucket+'/'+o.path));for(const k of Object.keys(index))if(!live.has(k))delete index[k];checked(await store.upload(INDEX_PATH,new Blob([JSON.stringify({format:INDEX_FORMAT,version:1,objects:index})],{type:'application/json'}),{contentType:'application/json',upsert:true}))}
  if(cursor<plan.length){await flush({release:true});backupResult='pending'}else{await flush();
   const manifest={format:'wu-jacky-cloud-backup',version:2,created_at:new Date(clock()).toISOString(),document:job.document,objects:Object.values(media)};
   const keys=new Set(manifest.objects.map(o=>o.bucket+'/'+o.path));for(const i of job.document.data.product_images??[])for(const [bucket,path]of[['product-images',i.storage_path],['product-images',i.thumbnail_path],['storefront-thumbnails',i.public_path]])if(path&&!isStaticSitePath(path)&&!keys.has(bucket+'/'+path))throw Error('REFERENCED_IMAGE_MISSING');
   const path='daily/'+job.day+'/manifest.json',body=JSON.stringify(manifest),existing=await store.download(path);if(existing.error)checked(await store.upload(path,new Blob([body],{type:'application/json'}),{contentType:'application/json',upsert:false}));else if(await existing.data.text()!==body){const old=JSON.parse(await existing.data.text());if(JSON.stringify(old.document)!==JSON.stringify(job.document)||JSON.stringify(old.objects)!==JSON.stringify(manifest.objects))throw Error('MANIFEST_CONFLICT')}
   await rpc('complete',{id:job.id,lease:job.lease,manifest_path:path,object_count:manifest.objects.length});backupResult='completed';
  }
 }catch(error){await rpc('fail',{id:job.id,lease:job.lease,code:/^[A-Z_]+$/.test(error.message)?error.message:'BACKUP_FAILED'});backupResult='failed'}}
 for(const n of claim.notifications??[]){let status='failed';if(/^https:\/\/discord\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+$/.test(claim.webhook??'')){try{const response=await fetchImpl(claim.webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:discordText(n.payload),allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(10000)});status=response.ok?'delivered':'http_'+response.status}catch{status='network_unknown'}}await rpc('notification_result',{id:n.id,status})}
 const retention=await rpc('retention');
 try{const keep=new Set(retention.keep_media??[]),files=await listFiles(client,'app-backups'),cutoff=new Date(clock()-29*86400000).toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'}),remove=[];for(const f of files){if(f.path.startsWith('daily/')&&f.path.split('/')[1]<cutoff)remove.push(f.path);if(f.path.startsWith('media/')&&!keep.has(f.path)&&Date.parse(f.updated_at)<clock()-48*3600000)remove.push(f.path)}for(let i=0;i<remove.length;i+=100)checked(await client.storage.from('app-backups').remove(remove.slice(i,i+100)))}catch{/* Retention retries on the next scheduled run; source media is never removed. */}
 return {backup:backupResult,notifications:(claim.notifications??[]).length};
}
