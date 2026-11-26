import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCatalogWithFallback,CATALOG_SNAPSHOT_URL} from '../storefront-service.mjs';

const product={id:'p1',name:'測試商品',aliases:[],tags:[],images:[]};
const json=(body,status=200)=>({ok:status<400,status,json:async()=>body});

test('uses live Supabase data when available',async()=>{
 const r=await loadCatalogWithFallback(async url=>url===CATALOG_SNAPSHOT_URL?json({}):json([product]));
 assert.equal(r.snapshotAt,null);assert.equal(r.products[0].id,'p1');
});
test('falls back to the published snapshot when Supabase refuses (402 quota restriction)',async()=>{
 const r=await loadCatalogWithFallback(async url=>url===CATALOG_SNAPSHOT_URL?json({generated_at:'2026-11-25T10:00:00Z',products:[product]}):json({message:'quota'},402));
 assert.equal(r.snapshotAt,'2026-11-25T10:00:00Z');assert.equal(r.products.length,1);
});
test('still reports the original error when the snapshot is missing or invalid',async()=>{
 await assert.rejects(loadCatalogWithFallback(async url=>url===CATALOG_SNAPSHOT_URL?json({},404):json({},402)),/暫時無法讀取/);
 await assert.rejects(loadCatalogWithFallback(async url=>url===CATALOG_SNAPSHOT_URL?json({generated_at:'x',products:[{id:1}]}):json({},402)),/暫時無法讀取/);
});
test('published snapshot is valid public catalog data',()=>{
 const data=JSON.parse(readFileSync(new URL('../data/catalog-snapshot.json',import.meta.url),'utf8'));
 assert.ok(data.products.length>100);assert.ok(!Number.isNaN(Date.parse(data.generated_at)));
 for(const p of data.products)assert.ok(typeof p.id==='string'&&Array.isArray(p.images));
});
test('storefront uses the fallback loader and tells customers when showing the backup',()=>{
 const src=readFileSync(new URL('../storefront.mjs',import.meta.url),'utf8');
 assert.match(src,/loadCatalogWithFallback\(\)/);assert.match(src,/備份的商品資料/);
});

test('background atlas keeps working when Supabase refuses: overrides and product links fall back',async()=>{
 const {loadPublicBackgroundOverrides,OVERRIDES_SNAPSHOT_URL}=await import('../backgrounds-admin-service.mjs');
 const snap={generated_at:'2026-11-26T00:00:00Z',overrides:{'BG-0001':{background_id:'BG-0001'}}};
 assert.deepEqual(await loadPublicBackgroundOverrides(async url=>url===OVERRIDES_SNAPSHOT_URL?json(snap):json({},402)),snap.overrides);
 assert.deepEqual(await loadPublicBackgroundOverrides(async()=>json({},402)),{},'no snapshot: base catalog still shows');
 const atlas=readFileSync(new URL('../backgrounds.mjs',import.meta.url),'utf8'),links=readFileSync(new URL('../product-backgrounds.mjs',import.meta.url),'utf8');
 assert.match(atlas,/loadPublicBackgroundOverrides\(\)/);assert.match(atlas,/loadCatalogWithFallback\(\)/);assert.doesNotMatch(atlas,/loadPublicCatalog\(/);
 assert.match(links,/loadPublicBackgroundOverrides\(/);
 const published=JSON.parse(readFileSync(new URL('../data/background-overrides-snapshot.json',import.meta.url),'utf8'));
 assert.equal(typeof published.overrides,'object');
});
