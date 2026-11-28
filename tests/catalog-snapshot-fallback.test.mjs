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

test('snapshot keeps generated_at for data changes and refreshes checked_at at most every 3 hours',async()=>{
 const {nextSnapshot,HEARTBEAT_MS}=await import('../scripts/catalog-snapshot-core.mjs');
 const p=[{id:'p1',name:'A',aliases:[],tags:[],images:[]}],t0=new Date('2026-11-28T00:00:00Z');
 const first=nextSnapshot(null,p,t0);assert.equal(first.generated_at,t0.toISOString());assert.equal(first.checked_at,t0.toISOString());
 assert.equal(nextSnapshot(first,p,new Date(t0.getTime()+HEARTBEAT_MS-1)),null,'unchanged and recently checked: no write');
 const beat=nextSnapshot(first,p,new Date(t0.getTime()+HEARTBEAT_MS));assert.equal(beat.generated_at,first.generated_at);assert.notEqual(beat.checked_at,first.checked_at);
 const legacy=nextSnapshot({generated_at:'2026-11-27T07:04:59.233Z',products:p},p,t0);assert.equal(legacy.generated_at,'2026-11-27T07:04:59.233Z');assert.equal(legacy.checked_at,t0.toISOString());
 const changed=nextSnapshot(beat,[{...p[0],name:'B'}],new Date(t0.getTime()+HEARTBEAT_MS+1));assert.equal(changed.generated_at,changed.checked_at);
});
test('shop fallback shows the last confirmation time when the snapshot has one',async()=>{
 const {loadCatalogWithFallback}=await import('../storefront-service.mjs');
 const products=[{id:'p1',name:'A',aliases:[],tags:[],images:[]}];
 const fetcher=async url=>String(url).includes('supabase')?new Response('',{status:402}):new Response(JSON.stringify({generated_at:'2026-11-27T07:00:00Z',checked_at:'2026-11-28T09:00:00Z',products}),{status:200});
 assert.equal((await loadCatalogWithFallback(fetcher)).snapshotAt,'2026-11-28T09:00:00Z');
});
