import {parsePokedexNumbers,storedPokedexNumbers} from './pokedex-numbers.mjs';
import {catalogAssetPath} from './catalog-assets.mjs';
import {productPayload} from './cloud-admin-service.mjs';
import {imageType} from './image-upload.mjs';
export const BUCKET='product-images';
const checked=({data,error})=>{if(error)throw error;return data};
export function catalogPayload(values){
 const base=productPayload(values),numbers=parsePokedexNumbers('pokedex_numbers' in values?values.pokedex_numbers:values.pokedex_number);
 const integer=(name,def,min=0)=>{const raw=String(values[name]??'').trim();if(raw==='')return def;if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)<min||Number(raw)>2147483647)throw Error('圖鑑編號、排序與門檻請填有效整數。');return Number(raw)};
 const aliases=Array.isArray(values.aliases)?values.aliases:String(values.aliases??'').split(/[,，\n]/);
 const clean=[...new Set(aliases.map(x=>String(x).trim()).filter(Boolean))];if(clean.length>30||clean.some(x=>x.length>100))throw Error('搜尋別名最多 30 個，每個最多 100 字。');
 const first=String(values.first_stocked_at??'').trim();if(first&&!/^\d{4}-\d{2}-\d{2}$/.test(first))throw Error('請選擇有效的首次入庫日期。');
 if(first&&(!Number.isFinite(Date.parse(first))||new Date(first).toISOString().slice(0,10)!==first))throw Error('請選擇有效的首次入庫日期。');
 return {...base,is_live:values.is_live===true||values.is_live==='on',aliases:clean,pokedex_number:numbers[0]??null,pokedex_numbers:numbers,manual_sort_order:integer('manual_sort_order',0),low_stock_threshold:integer('low_stock_threshold',3),first_stocked_at:first?first+'T00:00:00+08:00':null};
}
export function createCatalogService(client){
 const media=()=>client.storage.from(BUCKET);
 async function publishThumbnail(image){
  if(image.public_path)return image.public_path;
  if(!image.thumbnail_path||!image.thumbnail_path.startsWith(image.product_id+'/')||!/^[0-9a-f-]{36}\/[0-9a-f-]{36}-thumb\.(webp|png)$/i.test(image.thumbnail_path))throw Error('這張圖片缺少可公開的縮圖，請重新上傳圖片。');
  const blob=checked(await media().download(image.thumbnail_path));
  const type=imageType(new Uint8Array(await blob.slice(0,12).arrayBuffer()));if(!['image/webp','image/png'].includes(type.mime)||!image.thumbnail_path.endsWith('-thumb.'+type.extension)||blob.size>2*1024*1024)throw Error('縮圖格式或大小不符，請重新上傳圖片。');
  const response=await client.storage.from('storefront-thumbnails').upload(image.thumbnail_path,blob,{contentType:type.mime,upsert:false});
  if(response.error&&!['409','Duplicate'].includes(String(response.error.statusCode??response.error.error)))throw response.error;
  checked(await client.from('product_images').update({public_path:image.thumbnail_path}).eq('id',image.id).select('id').single());
  return image.thumbnail_path;
 }
 async function publishImages(productId){
  const images=checked(await client.from('product_images').select('id,product_id,thumbnail_path,public_path').eq('product_id',productId).eq('is_approved',true));
  for(const image of images)await publishThumbnail(image);
 }

 async function pageAll(table,selection,order='id'){
  const rows=[];for(let offset=0;;offset+=200){const batch=checked(await client.from(table).select(selection).order(order).order('id').range(offset,offset+199));rows.push(...batch);if(batch.length<200)break;if(rows.length>=20000)throw Error('資料超過本次載入上限，請縮小範圍。')}return rows;
 }
 return {
  list:()=>pageAll('products','id,sku,name_zh,name_en,is_live,aliases,pokedex_number,pokedex_numbers,description_public,public_price_twd,price_is_inquiry,publication_status,supply_status,manual_sort_order,low_stock_threshold,first_stocked_at,updated_at,inventory_balances(quantity_on_hand),inventory_valuations(unit_cost_twd,updated_at),category_assignments(category_id),product_images(id,storage_path,thumbnail_path,public_path,alt_text,sort_order,is_approved)','manual_sort_order'),
  categories:()=>pageAll('product_categories','id,name,sort_order','sort_order'),
  async addCategory(name){name=name.trim();if(!name||name.length>60)throw Error('分類名稱請填 1～60 個字。');return checked(await client.from('product_categories').insert({name}).select('id,name,sort_order').single())},
  async save(values,existing,ids){const payload=catalogPayload(values);if(payload.is_live&&existing)await publishImages(existing.id);return checked(await client.rpc('admin_save_catalog_product',{p_id:existing?.id??null,p_expected_updated_at:existing?.updated_at??null,p_values:payload,p_category_ids:[...new Set(ids)]}))},
  async history(productId){return checked(await client.from('inventory_movements').select('id,quantity_delta,quantity_before,quantity_after,reason,created_at').eq('product_id',productId).order('created_at',{ascending:false}).limit(50))},
  async preview(){return pageAll('catalog_preview','*','manual_sort_order')},
  async signed(path){const asset=catalogAssetPath(path);if(asset)return asset;return checked(await media().createSignedUrl(path,300)).signedUrl},
  async addImage(productId,{original,thumbnail,extension,alt}){
   const thumbnailType=imageType(new Uint8Array(await thumbnail.slice(0,12).arrayBuffer()));if(!['image/webp','image/png'].includes(thumbnailType.mime)||thumbnail.size>2*1024*1024)throw Error('縮圖格式或大小不符，請重新上傳圖片。');
   const id=crypto.randomUUID(),path=`${productId}/${id}-original.${extension}`,thumb=`${productId}/${id}-thumb.${thumbnailType.extension}`;
   checked(await media().upload(path,original,{contentType:original.type,upsert:false}));
   checked(await media().upload(thumb,thumbnail,{contentType:thumbnailType.mime,upsert:false}));
   // Retain uploaded objects if metadata write fails: recovery is safer than deleting an uncertain result.
   return checked(await client.from('product_images').insert({id,product_id:productId,storage_path:path,thumbnail_path:thumb,alt_text:alt,sort_order:0,is_approved:false}).select('id').single());
  },
  async updateImage(id,values){if(!Number.isInteger(values.sort_order)||values.sort_order<0||values.sort_order>2147483647||String(values.alt_text).length>200)throw Error('圖片順序或說明無效。');if(values.is_approved){const image=checked(await client.from('product_images').select('id,product_id,thumbnail_path,public_path,products(is_live)').eq('id',id).single());if(image.products?.is_live)await publishThumbnail(image)}if(!Number.isInteger(values.sort_order)||values.sort_order<0||values.sort_order>2147483647||String(values.alt_text).length>200)throw Error('圖片順序或說明無效。');return checked(await client.from('product_images').update({sort_order:values.sort_order,alt_text:values.alt_text,is_approved:Boolean(values.is_approved)}).eq('id',id).select('id').single())}
 };
}
export function monthKeyTaipei(value){const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).format(d)}
export function publicProduct(row){
 return {id:row.id,sku:row.sku,name:row.name_zh,name_en:row.name_en,aliases:row.aliases??[],dex:row.pokedex_number,dex_numbers:storedPokedexNumbers(row),tags:[...(row.tags??[]),...(row.first_stocked_at&&monthKeyTaipei(row.first_stocked_at)===monthKeyTaipei(new Date())?['本月新庫存']:[])],description:row.description_public,price:row.price_is_inquiry?null:row.public_price_twd,status:row.supply_status,images:row.images??[]};
}
