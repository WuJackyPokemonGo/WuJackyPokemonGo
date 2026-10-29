import test from 'node:test';
import assert from 'node:assert/strict';
import {backgroundProductSummary,filterBackgrounds,relatedProducts} from '../backgrounds-service.mjs';
import {productDescription} from '../storefront-locale.mjs';

const row={related_product_ids:['a','b','c','d','e','a'],release_state:'released',verification:'owner-confirmed'};
test('sale counts separate inquiries and previews, exclude zero stock, and deduplicate IDs',()=>{
 const products=[{id:'a',status:'available',stock_quantity:null},{id:'b',status:'low_stock',stock_quantity:1},{id:'c',status:'inquiry_only'},{id:'d',status:'coming_soon'},{id:'e',status:'sold_out'},{id:'a',status:'available'}, {id:'unrelated',status:'available'}];
 assert.equal(relatedProducts(row,products).length,5);
 assert.deepEqual(backgroundProductSummary(row,products),{onSale:2,inquiry:1,comingSoon:1,soldOut:1});
 products[0].stock_quantity=0;
 assert.deepEqual(backgroundProductSummary(row,products),{onSale:1,inquiry:1,comingSoon:1,soldOut:2});
});
test('hidden quantities remain on sale and status changes immediately affect counts and filtering',()=>{
 const products=[{id:'a',status:'available',stock_quantity:null}];
 assert.equal(backgroundProductSummary(row,products).onSale,1);
 assert.deepEqual(filterBackgrounds([row],{stockOnly:true,products}),[row]);
 products[0].status='sold_out';
 assert.equal(backgroundProductSummary(row,products).onSale,0);
 assert.deepEqual(filterBackgrounds([row],{stockOnly:true,products}),[]);
 for(const status of ['inquiry_only','coming_soon','unknown']){
  products[0].status=status;assert.deepEqual(filterBackgrounds([row],{stockOnly:true,products}),[]);
 }
});
test('an unlinked or unpublished product cannot inflate a background count',()=>{
 assert.deepEqual(backgroundProductSummary(row,[]),{onSale:0,inquiry:0,comingSoon:0,soldOut:0});
 assert.equal(backgroundProductSummary({related_product_ids:[]},[{id:'a',status:'available'}]).onSale,0);
});
test('standardized set pricing descriptions have English text with all original amounts',()=>{
 const descriptions=[['商品內容：ESA 太空裝皮卡丘，六國背景。\n單隻價格：NT$ 80\n六國各一套組價格：NT$ 450',[80,450]],['商品內容：2025 大阪萬博背景，皮卡丘、小火龍、傑尼龜、妙蛙種子。\n小火龍單隻價格：NT$ 200\n皮卡丘、傑尼龜、妙蛙種子單隻價格：NT$ 150\n四隻各一套組價格：NT$ 500',[200,150,500]]];
 for(const [description,amounts] of descriptions){const english=productDescription({description},'en');assert.match(english,/Contents:/);for(const amount of amounts)assert.ok(english.includes('NT$ '+amount));assert.equal(productDescription({description},'zh'),description)}
});
