import {safeBackgroundImage,safeSource} from './backgrounds-service.mjs';
import {STAGING_URL,STAGING_PUBLISHABLE_KEY} from './staging-config.mjs';

const checked=({data,error})=>{if(error)throw error;return data};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
export function mergeBackgroundOverrides(records,overrides,{includeHidden=false}={}){
 if(!Array.isArray(records)||!object(overrides))throw Error('圖鑑資料格式不正確。');
 const byId=new Map(records.map(r=>[r.background_id,{...r,cloud_version:0,is_visible:true}]));
 for(const [id,entry] of Object.entries(overrides)){
  if(!/^BG-(?:\d{4}|U-[0-9a-f-]{36})$/i.test(id)||!object(entry)||typeof entry.is_visible!=='boolean')throw Error('雲端圖鑑資料格式不正確。');
  const base=byId.get(id);
  if(entry.is_visible||includeHidden){
   if(!object(entry.record))throw Error('雲端圖鑑內容不完整。');
   byId.set(id,{...base,...entry.record,background_id:id,is_visible:entry.is_visible,cloud_version:entry.version??0,cloud_updated_at:entry.updated_at??null});
  }else byId.delete(id);
 }
 return [...byId.values()];
}
export async function loadBackgroundOverrides(fetcher=fetch){
 const response=await fetcher(STAGING_URL+'/rest/v1/rpc/background_catalog_overrides',{method:'POST',headers:{apikey:STAGING_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!response.ok)throw Error('暫時無法讀取圖鑑最新修改，請稍後重試。');
 const rows=await response.json();
 if(!Array.isArray(rows)||rows.length>2000)throw Error('雲端圖鑑資料格式不正確。');
 const entries={};for(const row of rows){if(!object(row)||typeof row.background_id!=='string')throw Error('雲端圖鑑資料格式不正確。');entries[row.background_id]=row}
 return entries;
}
function text(value,label,max=5000,required=false){const v=String(value??'').trim();if((required&&!v)||v.length>max)throw Error(label+'未填寫或超過長度限制。');return v}
function date(value,label){const v=String(value??'').trim();if(!v)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw Error(label+'請填有效日期。');return v}
export function parseBackgroundPokemon(value){
 const rows=String(value??'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);if(rows.length>500)throw Error('寶可夢名單最多 500 筆。');
 return rows.map((line,i)=>{const parts=line.split(/[|｜\t]/).map(s=>s.trim());const dex=Number(parts[0]?.replace(/^#/,''));if(parts.length!==3||!/^#?\d+$/.test(parts[0])||!Number.isInteger(dex)||dex<1||dex>9999||!parts[1]||!parts[2]||parts[1].length>200||parts[2].length>200)throw Error(`寶可夢第 ${i+1} 行請用「編號｜中文名稱｜英文名稱」。`);return{dex,name_zh:parts[1],name_en:parts[2]}});
}
export const backgroundPokemonText=rows=>(rows??[]).map(p=>`${String(p.dex).padStart(4,'0')}｜${p.name_zh}｜${p.name_en}`).join('\n');
const lines=v=>String(v??'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
export function backgroundEditPayload(values,current={}){
 const p={};for(const k of ['name_zh','name_en','series','series_zh','region_zh','region_en'])p[k]=text(values[k],k,k.startsWith('name_')?200:200,k.startsWith('name_'));
 p.type=values.type;p.release_state=values.release_state;p.verification=values.verification;
 if(!['location','special'].includes(p.type)||!['released','upcoming','needs-verification'].includes(p.release_state)||!['official-event-confirmed','catalog-crosschecked','catalogued-needs-event-check','owner-confirmed'].includes(p.verification))throw Error('請選擇有效的背景類型及核對狀態。');
 p.year=text(values.year,'年份',4);if(p.year&&!/^20\d{2}$/.test(p.year))throw Error('年份請填 2000～2099，或留空。');
 p.start_date=date(values.start_date,'開始日期');p.end_date=date(values.end_date,'結束日期');if(p.start_date&&p.end_date&&p.end_date<p.start_date)throw Error('結束日期不能早於開始日期。');
 p.image_source=text(values.image_source,'背景圖片網址',2000,true);if(!safeBackgroundImage(p.image_source))throw Error('請使用 HTTPS 的 JPG、PNG 或 WebP 直接圖片網址。');
 for(const k of ['method_zh','method_en'])p[k]=text(values[k],'取得方式');
 p.source=text(values.source,'主要來源',2000);if(p.source&&!safeSource(p.source))throw Error('來源網址必須使用 HTTPS。');
 for(const k of ['notes','notes_en','official_sources','catalog_sources']){p[k]=lines(values[k]);if(p[k].length>500||p[k].some(v=>v.length>2000))throw Error('來源或備註過長。');if(k.endsWith('_sources')&&p[k].some(v=>!safeSource(v)))throw Error('來源網址必須使用 HTTPS。')}
 if(p.verification==='official-event-confirmed'&&!p.official_sources.length)throw Error('標記官方活動已核對時，請提供官方來源網址。');
 if(p.verification==='catalog-crosschecked'&&new Set(p.catalog_sources).size<2)throw Error('名錄交叉核對需要至少兩個來源網址。');
 // Preserve per-variant availability/methods when its editable identity did not change.
 for(const k of ['pokemon','evolved_pokemon'])p[k]=parseBackgroundPokemon(values[k]).map(q=>{const old=(current[k]??[]).find(v=>v.dex===q.dex&&v.name_zh===q.name_zh&&v.name_en===q.name_en);if(!old)return q;return {...Object.fromEntries(['variant_id','start_date','method_zh','method_en'].filter(f=>typeof old[f]==='string').map(f=>[f,old[f]])),...q}});
 p.related_product_ids=[...new Set(values.related_product_ids??[])];if(p.related_product_ids.length>500||p.related_product_ids.some(id=>!/^[0-9a-f-]{36}$/i.test(id)))throw Error('關聯商品資料不正確。');
 const sameDates=(p.start_date??null)===(current.start_date??null)&&(p.end_date??null)===(current.end_date??null);
 for(const k of ['date_status','date_conflict','verification_note_zh','verification_note_en'])p[k]=sameDates?(current[k]??null):null;
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());p.checked_on=['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
 return p;
}
export function createBackgroundAdminService(client,journal,randomUUID=()=>crypto.randomUUID()){
 let actor=null,pending=null;const key=()=>`wj_background_pending:${actor}`;
 function persist(){try{if(pending)journal.setItem(key(),JSON.stringify(pending));else journal.removeItem(key())}catch{throw Error('無法保存重試資訊，本次修改未送出。')}}
 async function send(){
  if(!actor||!pending)throw Error('沒有待重試的圖鑑修改。');const wasUncertain=pending.uncertain;persist();
  let response;try{response=await client.rpc('admin_background_catalog',{p_action:'save',p_payload:pending.payload,p_request_id:pending.request_id})}catch(e){pending.uncertain=true;persist();throw e}
  if(response.error){const definite=/^(?:[0-9A-Z]{5}|PGRST\d+)$/.test(response.error.code??'');if(definite&&!wasUncertain){pending=null;persist()}else{pending.uncertain=true;persist()}throw response.error}
  const result=response.data;pending=null;try{persist()}catch{}return result;
 }
 return {
  get pending(){return pending?structuredClone(pending):null},
  attach(id){actor=id;pending=null;if(!id)return;try{const p=JSON.parse(journal.getItem(key())||'null');if(p&&(!p.payload||typeof p.request_id!=='string'||typeof p.uncertain!=='boolean'))throw Error();pending=p}catch{throw Error('無法讀取上次圖鑑修改，請先確認瀏覽器儲存設定。')}},
  async list(){const entries=checked(await client.rpc('admin_background_catalog',{p_action:'list',p_payload:{},p_request_id:null}));if(!object(entries))throw Error('圖鑑修改資料格式不正確。');return entries},
  async save(row,record,isVisible){if(!actor)throw Error('請先登入。');if(pending)throw Error('上一筆修改結果尚未確認，請先重試原修改。');pending={request_id:randomUUID(),uncertain:false,payload:{background_id:row.background_id,expected_version:row.cloud_version??0,is_visible:Boolean(isVisible),record:structuredClone(record)}};return send()},
  retry:send
 };
}
