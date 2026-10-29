import {catalogAssetPath} from './catalog-assets.mjs';
import {tr,t,productName} from './storefront-locale.mjs';
import {STAGING_URL,STAGING_PUBLISHABLE_KEY} from './staging-config.mjs';
export const PUBLIC_STORAGE=STAGING_URL+'/storage/v1/object/public/storefront-thumbnails/';
export function publicStockFields(supply,quantity,threshold=3){
 const known=Number.isInteger(quantity)&&quantity>=0&&quantity<=2147483647;
 const stock_quantity=known&&['available','low_stock','sold_out'].includes(supply)?quantity:null;
 const is_low_stock=stock_quantity>0&&['available','low_stock'].includes(supply)&&(supply==='low_stock'||stock_quantity<=threshold);
 const status=stock_quantity===0&&['available','low_stock'].includes(supply)?'sold_out':is_low_stock?'low_stock':supply;
 return {status,stock_quantity,is_low_stock};
}
export function stockLabel(p,locale='zh'){
 if(p.status==='coming_soon')return {text:tr('即將推出','Coming soon',locale),tone:'pending'};
 if(p.status==='inquiry_only')return {text:tr('庫存待確認','Stock to confirm',locale),tone:'pending'};
 if(p.status==='sold_out'||p.stock_quantity===0)return {text:tr('已售罄','Sold out',locale),tone:'sold'};
 const known=Number.isInteger(p.stock_quantity)&&p.stock_quantity>0&&p.stock_quantity<=2147483647;
 if(!known)return {text:p.status==='low_stock'?tr('庫存偏低','Low stock',locale):tr('庫存待確認','Stock to confirm',locale),tone:p.status==='low_stock'?'low':'pending'};
 return p.is_low_stock||p.status==='low_stock'?{text:tr(`剩餘 ${p.stock_quantity.toLocaleString('zh-TW')} 帳`,`${p.stock_quantity.toLocaleString('en-US')} left`,locale),tone:'low'}:{text:tr(`庫存：${p.stock_quantity.toLocaleString('zh-TW')} 帳`,`In stock: ${p.stock_quantity.toLocaleString('en-US')}`,locale),tone:'normal'};
}
export function imageURL(path){const asset=catalogAssetPath(path);if(asset)return asset;if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}-thumb\.(webp|png)$/i.test(String(path)))return '';return PUBLIC_STORAGE+String(path).split('/').map(encodeURIComponent).join('/')}
export function monthTaipei(value){const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).formatToParts(d);return parts.find(x=>x.type==='year').value+'-'+parts.find(x=>x.type==='month').value}
export function tagsFor(p){const tags=(p.tags??[]).filter(t=>t!=='本月新庫存');return p.first_stocked_at&&monthTaipei(p.first_stocked_at)===monthTaipei(new Date())?[...tags,'本月新庫存']:tags}
export function searchMatch(p,keyword){
 const normalize=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
 const term=normalize(keyword),aliases=p.aliases??[];
 if(!term)return true;
 if(/^#?\d+$/.test(term)){const number=Number(term.replace('#',''));return [p.dex,...(p.dex_numbers??[]),...aliases.filter(a=>/^#?\d+$/.test(String(a))).map(a=>String(a).replace('#',''))].some(n=>n!=null&&Number(n)===number)||normalize(p.sku)===term}
 return normalize([p.name,p.name_en,p.sku,...aliases,...tagsFor(p),...tagsFor(p).map(tag=>t(tag,'en'))].join(' ')).includes(term);
}
export function inquiryText(products,cart,note='',locale='zh'){
 const lines=[tr('Wu Jacky Pokémon GO 詢價清單','Wu Jacky Pokémon GO — Inquiry list',locale),tr('（此內容為詢價，不代表訂單成立）','(This is an inquiry, not a confirmed order.)',locale),''];let total=0,unknown=false;
 for(const item of cart){const p=products.find(p=>p.id===item.id);if(!p)continue;lines.push(`${productName(p,locale)} × ${item.qty}｜${p.price==null?t('私訊詢價',locale):'NT$ '+(p.price*item.qty).toLocaleString('zh-TW')}${p.status==='sold_out'?'｜'+t('已售罄，請確認能否補貨',locale):''}`);if(p.price==null)unknown=true;else total+=p.price*item.qty}
 lines.push(t('公開價格小計：',locale)+'NT$ '+total.toLocaleString('zh-TW')+(unknown?t('（不含詢價商品）',locale):''));if(note.trim())lines.push(tr('備註：','Notes: ',locale)+note.trim());lines.push(tr('請協助確認供貨、最終價格及交付方式。','Please confirm availability, final prices and delivery.',locale));return lines.join('\n');
}
export async function loadPublicCatalog(fetcher=fetch){const rows=[];for(let offset=0;offset<=20000;offset+=100){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const response=await fetcher(STAGING_URL+'/rest/v1/rpc/storefront_catalog',{method:'POST',headers:{apikey:STAGING_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_offset:offset,p_limit:100}),signal:controller.signal});if(!response.ok)throw Error('商品資料暫時無法讀取。');const batch=await response.json();if(!Array.isArray(batch)||batch.some(p=>!p||typeof p.id!=='string'||typeof p.name!=='string'||!Array.isArray(p.aliases)||!Array.isArray(p.tags)||!Array.isArray(p.images)))throw Error('商品資料格式無效。');rows.push(...batch);if(batch.length<100)return rows;if(rows.length>=20000)throw Error('商品資料超過可載入上限。')}finally{clearTimeout(timer)}}return rows}
