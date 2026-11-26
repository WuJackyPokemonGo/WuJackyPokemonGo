// Writes data/catalog-snapshot.json: the same public data the storefront RPC returns, so the shop can
// still show products if Supabase is unavailable. Keeps the previous snapshot when the RPC fails.
import {readFileSync,writeFileSync} from 'node:fs';
import {loadPublicCatalog} from '../storefront-service.mjs';
try{
 const products=await loadPublicCatalog();
 if(!products.length)throw Error('empty catalog');
 const file=new URL('../data/catalog-snapshot.json',import.meta.url);
 let previous=null;try{previous=JSON.parse(readFileSync(file,'utf8'))}catch{}
 if(previous&&JSON.stringify(previous.products)===JSON.stringify(products))console.log('catalog snapshot unchanged');
 else{writeFileSync(file,JSON.stringify({generated_at:new Date().toISOString(),products})+'\n');console.log(`catalog snapshot: ${products.length} products`)}
}catch(error){console.warn(`::warning::catalog snapshot kept unchanged: ${error.message}`)}

// Cloud edits to the background atlas, published so the atlas keeps them if Supabase is unavailable.
import {loadBackgroundOverrides} from '../backgrounds-admin-service.mjs';
try{
 const overrides=await loadBackgroundOverrides();
 const file=new URL('../data/background-overrides-snapshot.json',import.meta.url);
 let previous=null;try{previous=JSON.parse(readFileSync(file,'utf8'))}catch{}
 if(previous&&JSON.stringify(previous.overrides)===JSON.stringify(overrides))console.log('background overrides snapshot unchanged');
 else{writeFileSync(file,JSON.stringify({generated_at:new Date().toISOString(),overrides})+'\n');console.log(`background overrides snapshot: ${Object.keys(overrides).length} records`)}
}catch(error){console.warn(`::warning::background overrides snapshot kept unchanged: ${error.message}`)}
