import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogAssetPath} from '../catalog-assets.mjs';
import {imageURL} from '../storefront-service.mjs';
import {createCatalogService} from '../catalog-service.mjs';
test('first-party catalog assets render in storefront and admin without private Storage signing',async()=>{
 const path='assets/products/dark-skies-reference.jpeg';
 assert.equal(catalogAssetPath(path),path);assert.equal(imageURL(path),path);
 const service=createCatalogService({storage:{from(){throw Error('must not sign public assets')}}});
 assert.equal(await service.signed(path),path);
});
test('public asset support rejects remote URLs, traversal, SVG and query injection',()=>{
 for(const path of ['https://evil.example/a.png','//evil.example/a.png','assets/products/../secret.png','assets/products/a.svg','assets/products/a.png?x=1','assets/products/%2e%2e/a.png','assets/products/a.png#x'])assert.equal(catalogAssetPath(path),'',path);
});
