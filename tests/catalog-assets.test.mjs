import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogAssetPath} from '../catalog-assets.mjs';
import {imageURL} from '../storefront-service.mjs';
import {createCatalogService} from '../catalog-service.mjs';
test('first-party catalog assets render in storefront and admin without private Storage signing',async()=>{
 const path='assets/products/dark-skies-reference.jpeg';
 assert.equal(catalogAssetPath(path),path);assert.equal(imageURL(path),'assets/products/opt/dark-skies-reference.webp');
 const service=createCatalogService({storage:{from(){throw Error('must not sign public assets')}}});
 assert.equal(await service.signed(path),path);
});
test('public asset support rejects remote URLs, traversal, SVG and query injection',()=>{
 for(const path of ['https://evil.example/a.png','//evil.example/a.png','assets/products/../secret.png','assets/products/a.svg','assets/products/a.png?x=1','assets/products/%2e%2e/a.png','assets/products/a.png#x'])assert.equal(catalogAssetPath(path),'',path);
});
test('optimized thumbnail copies exist, stay first-party and only replace their exact Storage path',async()=>{
 const {existsSync,statSync}=await import('node:fs');const {OPTIMIZED_THUMBNAILS}=await import('../thumbnail-manifest.mjs');
 const entries=Object.entries(OPTIMIZED_THUMBNAILS);assert.ok(entries.length>=69);
 for(const [from,to] of entries){assert.match(to,/^assets\/products\/opt\/[a-z0-9-]+\.webp$/);const file=new URL('../'+to,import.meta.url);assert.ok(existsSync(file),to);assert.ok(statSync(file).size<160*1024,to);assert.equal(imageURL(from),to)}
 const replaced='d131d983-5a56-4590-89b0-167335cde607/00000000-0000-4000-8000-000000000000-thumb.png';assert.match(imageURL(replaced),/storefront-thumbnails\/d131d983/);
});
test('uploader keeps shrinking PNG-only thumbnails toward the light target',async()=>{
 const {createThumbnail,THUMBNAIL_TARGET_BYTES}=await import('../image-upload.mjs');const sizes=[];
 const canvas={width:0,height:0,getContext:()=>({drawImage(){}})};
 const blob=await createThumbnail({naturalWidth:1800,naturalHeight:1800},{createCanvas:()=>canvas,encode:async c=>{sizes.push(c.width);return {size:c.width*c.width}}});
 assert.ok(blob.size<=THUMBNAIL_TARGET_BYTES);assert.deepEqual(sizes.slice(0,2),[900,720]);
});
