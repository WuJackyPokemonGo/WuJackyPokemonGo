import {writeFileSync} from 'node:fs';
import {imageURL,loadPublicCatalog} from '../storefront-service.mjs';

const products=await loadPublicCatalog();
const rows=products.map(product=>({
 id:product.id,
 name:product.name,
 name_en:product.name_en||product.name,
 image:imageURL(product.images[0]?.path)||''
})).sort((a,b)=>a.id.localeCompare(b.id));
writeFileSync(new URL('../data/product-shares.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
