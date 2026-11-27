import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {STOREFRONT_CACHE_EPOCH} from '../scripts/storefront-cache-epoch.mjs';
test('shop.html (catalog) loads the storefront bundle with a content-hash version, so new product share IDs are never served from an old cache',()=>{
 const bundle=readFileSync(new URL('../assets/storefront.bundle.js',import.meta.url));const v='c'+createHash('sha256').update(STOREFRONT_CACHE_EPOCH+':').update(bundle).digest('hex').slice(0,10);
 const html=readFileSync(new URL('../shop.html',import.meta.url),'utf8');const refs=html.match(/storefront\.bundle\.js\?v=[^"']+/g);
 assert.ok(refs.length>=2,'module script and modulepreload');for(const r of refs)assert.equal(r,'storefront.bundle.js?v='+v);
});
