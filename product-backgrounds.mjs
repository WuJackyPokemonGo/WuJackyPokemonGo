import {BACKGROUNDS_DATA_URL} from './background-data.mjs';
import {mergeBackgroundOverrides,loadBackgroundOverrides} from './backgrounds-admin-service.mjs';
// Reverse lookup: which visible atlas backgrounds link to a product.
export function backgroundsForProduct(records,productId){
 if(!Array.isArray(records)||!productId)return [];
 return records.filter(r=>r&&r.is_visible!==false&&(r.related_product_ids??[]).includes(productId)).map(r=>({id:r.background_id,name_zh:r.name_zh||r.name_en||r.background_id,name_en:r.name_en||r.name_zh||r.background_id,image:safeImage(r.image_source)})).sort((a,b)=>a.id.localeCompare(b.id));
}
let pending=null;
export function loadBackgroundRecords(fetcher=fetch){
 if(!pending)pending=(async()=>{const r=await fetcher(BACKGROUNDS_DATA_URL,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('catalog unavailable');const data=await r.json();if(!Array.isArray(data.records))throw Error('invalid catalog');let overrides={};try{overrides=await loadBackgroundOverrides(fetcher)}catch{}return mergeBackgroundOverrides(data.records,overrides)})().catch(e=>{pending=null;throw e});
 return pending;
}
function safeImage(u){try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password&&/\.(jpe?g|png|webp)$/i.test(x.pathname)?x.href:''}catch{return ''}}
