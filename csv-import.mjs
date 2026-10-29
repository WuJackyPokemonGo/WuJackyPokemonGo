import {storedPokedexNumbers} from './pokedex-numbers.mjs';
import {catalogPayload} from './catalog-service.mjs';
export const CSV_COLUMNS=['schema_version','product_id','sku','name_zh','name_en','aliases','pokedex_number','pokedex_numbers','description_public','publication_status','supply_status','public_price_twd','low_stock_threshold','manual_sort_order','first_stocked_at','tag_names'];
const labels={product_id:'既有商品識別',sku:'商品編號',name_zh:'中文名稱',name_en:'英文名稱',aliases:'搜尋別名',pokedex_number:'圖鑑編號（舊單值）',pokedex_numbers:'圖鑑編號（複數）',description_public:'商品說明',publication_status:'上架狀態',supply_status:'供貨狀態',public_price_twd:'售價',low_stock_threshold:'低庫存門檻',manual_sort_order:'顯示順序',first_stocked_at:'首次入庫日期',tag_names:'分類'};
export const fieldLabel=key=>labels[key]||key;
const bytes=text=>new TextEncoder().encode(text).length;
export function parseCSV(text){
 if(typeof text!=='string'||bytes(text)>2*1024*1024)throw Error('CSV 檔案最多 2 MB。');
 text=text.replace(/^\uFEFF/,'');if(text.includes('\uFFFD'))throw Error('檔案編碼無法辨識，請使用 UTF-8 CSV。');
 const rows=[];let row=[],cell='',quoted=false,ended=false;
 function finishCell(){row.push(cell);cell='';ended=false}
 function finishRow(){finishCell();if(row.some(v=>v!==''))rows.push(row);row=[];if(rows.length>1001)throw Error('每次最多匯入 1,000 筆商品。')}
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;ended=true}}else cell+=c;continue}
  if(c==='"'){if(cell||ended)throw Error('CSV 引號格式錯誤。');quoted=true}
  else if(c===',')finishCell();else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;finishRow()}
  else {if(ended)throw Error('CSV 引號後只能接逗號或換行。');cell+=c}
 }
 if(quoted)throw Error('CSV 有尚未結束的引號。');if(cell||row.length||ended)finishRow();
 if(rows.length<2)throw Error('CSV 必須包含欄位名稱與至少一筆商品。');
 const headers=rows.shift().map(x=>x.trim());if(new Set(headers).size!==headers.length)throw Error('CSV 欄位名稱重複。');
 for(const h of headers)if(!CSV_COLUMNS.includes(h))throw Error('不支援的欄位：'+h+'。請使用此後台下載的範本；庫存不能由商品 CSV 覆寫。');
 for(const h of ['schema_version','name_zh'])if(!headers.includes(h))throw Error('缺少必要欄位：'+h);
 return {headers,rows:rows.map((values,i)=>{if(values.length!==headers.length)throw Error(`第 ${i+2} 列欄位數量不符。`);return {line:i+2,values:Object.fromEntries(headers.map((h,j)=>[h,/^'(?:'|\s*[=+@\-\t\r])/.test(values[j])?values[j].slice(1):values[j]]))}})};
}
function arrayCell(value,label,max,length){let rows;try{rows=JSON.parse(value||'[]')}catch{throw Error(label+'需填 JSON 陣列，例如 ["異色","背景"]。')}if(!Array.isArray(rows)||rows.some(v=>typeof v!=='string')||rows.length>max||rows.some(v=>v.trim().length>length))throw Error(label+'格式或長度無效。');return [...new Set(rows.map(v=>v.trim()).filter(Boolean))]}
const day=value=>value?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)):'';
function baseValues(p){return {sku:p?.sku??'',name_zh:p?.name_zh??'',name_en:p?.name_en??'',aliases:p?.aliases??[],pokedex_number:p?.pokedex_number??'',pokedex_numbers:storedPokedexNumbers(p),description_public:p?.description_public??'',publication_status:p?.publication_status??'draft',supply_status:p?.supply_status??'inquiry_only',public_price_twd:p?.public_price_twd??'',low_stock_threshold:p?.low_stock_threshold??3,manual_sort_order:p?.manual_sort_order??0,first_stocked_at:day(p?.first_stocked_at)}}
function normalize(v){const p=catalogPayload(v);delete p.is_live;if(String(p.sku).length>80||String(p.name_zh).length>100||p.name_en.length>100||p.description_public.length>1000)throw Error('商品編號或文字超過長度限制。');return p}
export function planImport(text,products,categories){
 const parsed=parseCSV(text),bySKU=new Map(products.filter(p=>p.sku).map(p=>[p.sku,p])),byID=new Map(products.map(p=>[p.id,p])),seen=new Set(),seenIDs=new Set(),entries=[],errors=[];
 for(const {line,values:v} of parsed.rows){try{
  if(v.schema_version!=='1')throw Error('schema_version 必須為 1。');const productID=String(v.product_id??'').trim(),inputSKU=String(v.sku??'').trim();
  if(productID&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productID))throw Error('既有商品識別格式無效，請使用匯出檔案中的 product_id。');
  const old=productID?byID.get(productID):(inputSKU?bySKU.get(inputSKU):undefined);
  if(productID&&!old)throw Error('找不到既有商品，請重新匯出後再更新。');
  const sku='sku' in v?inputSKU:(old?.sku??'');
  if(sku&&seen.has(sku))throw Error('同一份 CSV 商品編號重複：'+sku);if(sku)seen.add(sku);
  if(old&&seenIDs.has(old.id))throw Error('同一份 CSV 重複更新同一件商品。');if(old)seenIDs.add(old.id);
  if(productID&&sku&&bySKU.has(sku)&&bySKU.get(sku).id!==productID)throw Error('商品編號已屬於另一件商品。');
  const base=baseValues(old),merged={...base,...v,sku};if('pokedex_number' in v&&!('pokedex_numbers' in v))merged.pokedex_numbers=v.pokedex_number;if('aliases' in v)merged.aliases=arrayCell(v.aliases,'搜尋別名',30,100);
  const beforeTags=(old?.category_assignments??[]).map(a=>categories.find(c=>c.id===a.category_id)?.name).filter(Boolean).sort();
  const tags='tag_names' in v?arrayCell(v.tag_names,'分類',30,60).sort():beforeTags;
  const payload=normalize(merged),before=old?normalize(base):null;
  // Preserve the original timestamp when its date column was omitted or unchanged.
  if(old&&(!('first_stocked_at' in v)||v.first_stocked_at===day(old.first_stocked_at)))payload.first_stocked_at=old.first_stocked_at??null;
  if(before&&old.first_stocked_at)before.first_stocked_at=old.first_stocked_at;
  const changes=Object.keys(payload).filter(k=>!before||JSON.stringify(payload[k])!==JSON.stringify(before[k])).map(k=>({field:k,before:before?.[k]??null,after:payload[k]}));
  if(JSON.stringify(tags)!==JSON.stringify(beforeTags))changes.push({field:'tag_names',before:beforeTags,after:tags});
  entries.push({line,sku,name:payload.name_zh,kind:!old?'insert':changes.length?'update':'skip',live:Boolean(old?.is_live),changes,row:{values:payload,categories:tags,expected:old?{id:old.id,updated_at:old.updated_at}:null}});
 }catch(error){errors.push({line,message:error.message})}}
 const writes=entries.filter(e=>e.kind!=='skip');const payload={rows:writes.map(e=>e.row),allow_live_updates:false};if(bytes(JSON.stringify(payload))>2*1024*1024)errors.push({line:0,message:'完整匯入資料超過 2 MB，請減少筆數。'});
 return {entries,errors,payload,inserted:entries.filter(e=>e.kind==='insert').length,updated:entries.filter(e=>e.kind==='update').length,skipped:entries.filter(e=>e.kind==='skip').length,liveUpdates:writes.filter(e=>e.live).length};
}
function csvCell(value){let v=String(value??'');if(/^'|^\s*[=+@\-\t\r]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"'}
export function exportCSV(products=[],categories=[]){const rows=products.map(p=>({...baseValues(p),schema_version:'1',product_id:p.id??'',pokedex_numbers:JSON.stringify(storedPokedexNumbers(p)),aliases:JSON.stringify(p.aliases??[]),tag_names:JSON.stringify((p.category_assignments??[]).map(a=>categories.find(c=>c.id===a.category_id)?.name).filter(Boolean))}));return '\uFEFF'+[CSV_COLUMNS.join(','),...rows.map(r=>CSV_COLUMNS.map(k=>csvCell(r[k])).join(','))].join('\r\n')+'\r\n'}
export function templateCSV(){return exportCSV([{sku:'',name_zh:'請替換為商品名稱',publication_status:'draft',supply_status:'inquiry_only',aliases:[],category_assignments:[]}])}
