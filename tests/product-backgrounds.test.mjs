import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {backgroundsForProduct} from '../product-backgrounds.mjs';
import {BACKGROUNDS_DATA_URL} from '../background-data.mjs';
const data=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url),'utf8'));
test('reverse lookup lists every background linked to a product, sorted and visible only',()=>{
 const list=backgroundsForProduct(data.records,'a2897287-4cb1-4c11-8bce-3d2f6d7dba1d');assert.deepEqual(list.map(b=>b.id),['BG-0254','BG-0257']);
 assert.deepEqual(backgroundsForProduct([{background_id:'BG-0001',is_visible:false,related_product_ids:['x']}],'x'),[]);
 assert.deepEqual(backgroundsForProduct(null,'x'),[]);
});
test('every page reads the same versioned background catalog',()=>{
 assert.match(BACKGROUNDS_DATA_URL,/^data\/backgrounds\.json\?v=\d{8}-[a-z0-9-]+$/);
 for(const f of ['backgrounds.mjs','backgrounds-admin-ui.mjs','storefront.mjs'])assert.doesNotMatch(readFileSync(new URL('../'+f,import.meta.url),'utf8'),/backgrounds\.json\?v=/,f);
});
test('every linked product id is a well-formed uuid and links are not duplicated per background',()=>{
 for(const r of data.records){const ids=r.related_product_ids??[];assert.equal(new Set(ids).size,ids.length,r.background_id);for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,r.background_id)}
});
