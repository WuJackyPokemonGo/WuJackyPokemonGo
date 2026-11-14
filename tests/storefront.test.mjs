import test from 'node:test';import assert from 'node:assert/strict';
import {loadPublicCatalog,searchMatch,imageURL,inquiryText,tagsFor,publicStockFields,stockLabel,sortByFirstPublication} from '../storefront-service.mjs';
const p={id:'p',sku:'WJ-001',name:'木守宮',name_en:'Treecko',aliases:['色違'],dex:252,tags:['背景'],images:[],price:100,status:'available'};
test('public catalog fetch uses only the read endpoint and parses pagination',async()=>{const calls=[];const rows=await loadPublicCatalog(async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,body});return{ok:true,json:async()=>Array.from({length:body.p_offset===0?100:1},()=>p)}});assert.equal(rows.length,101);assert.equal(calls[1].body.p_offset,100);assert.ok(calls.every(x=>x.url.endsWith('/rpc/storefront_catalog')))});
test('public loader reports unavailable or malformed data instead of fabricating inventory',async()=>{await assert.rejects(loadPublicCatalog(async()=>({ok:false})));await assert.rejects(loadPublicCatalog(async()=>({ok:true,json:async()=>[{id:1}]})))});
test('search supports Traditional Chinese, English spaces and leading-zero dex',()=>{assert.ok(searchMatch(p,'TREE CKO'));assert.ok(searchMatch(p,'木守宮'));assert.ok(searchMatch(p,'0252'));assert.ok(searchMatch(p,'背景'));assert.equal(searchMatch(p,'不存在'),false)});
test('images accept only public thumbnail paths, never original private objects or arbitrary URLs',()=>{assert.equal(imageURL('https://evil.example/p.png'),'');assert.equal(imageURL('p/secret-original.jpg'),'');const u='11111111-1111-4111-8111-111111111111';assert.ok(imageURL(u+'/'+u+'-thumb.webp').includes('/object/public/storefront-thumbnails/'));assert.ok(imageURL(u+'/'+u+'-thumb.png').includes('/object/public/storefront-thumbnails/'));assert.equal(imageURL(u+'/'+u+'-original.png'),'')});
test('inquiry distinguishes unknown prices and sold-out items without treating it as an order',()=>{const text=inquiryText([p,{...p,id:'q',name:'未知價格',price:null,status:'sold_out'}],[{id:'p',qty:2},{id:'q',qty:1}],'想確認供貨');assert.match(text,/NT\$ 200/);assert.match(text,/不含詢價商品/);assert.match(text,/已售罄/);assert.match(text,/不代表訂單成立/);assert.match(text,/想確認供貨/)});
test('recent stock includes 14 Taiwan dates across months and ignores stored stock tags',()=>{
 const now='2026-11-01T16:00:00Z';
 const tags=['背景','本月新庫存','最近新庫存'];
 assert.deepEqual(tagsFor({tags,first_published_at:now},now),["背景"]);
 for(const date of ['2026-10-19T16:00:00Z','2026-11-01T16:00:00Z']){
  assert.deepEqual(tagsFor({tags,first_stocked_at:date},now),['背景','最近新庫存']);
 }
 for(const date of ['2026-10-19T15:59:59Z','2026-11-02T16:00:00Z',null,'invalid']){
  assert.deepEqual(tagsFor({tags,first_stocked_at:date},now),['背景']);
 }
});
test('normal public stock shows the real account quantity',()=>assert.deepEqual(stockLabel(publicStockFields('available',77,3)),{text:'庫存：77 帳',tone:'normal'}));
test('low stock uses an orange badge at the product threshold, without changing order',()=>{const rows=[{id:'first',...publicStockFields('available',77,3)},{id:'second',...publicStockFields('available',2,3)}];assert.deepEqual(stockLabel(rows[1]),{text:'剩餘 2 帳',tone:'low'});assert.deepEqual(rows.map(r=>r.id),['first','second']);assert.equal(publicStockFields('available',3,3).is_low_stock,true);assert.equal(publicStockFields('available',3,2).is_low_stock,false)});
test('zero stock displays sold out rather than an urgent low-stock claim',()=>assert.deepEqual(stockLabel(publicStockFields('available',0,3)),{text:'已售罄',tone:'sold'}));
test('unconfirmed supply and missing ledger quantities are not fabricated as zero',()=>{for(const q of [null,undefined,-1,'2',NaN,2147483648])assert.deepEqual(stockLabel(publicStockFields('available',q,3)),{text:'數量請洽詢',tone:'normal'});assert.equal(publicStockFields('inquiry_only',12,3).stock_quantity,null);assert.deepEqual(stockLabel(publicStockFields('inquiry_only',0,3)),{text:'詢問供貨',tone:'pending'});assert.notEqual(stockLabel(publicStockFields('available',null,3)).text,'庫存待確認');assert.deepEqual(stockLabel(publicStockFields('coming_soon',2,3)),{text:'即將推出',tone:'pending'})});
test('manual low-stock status retains the notice without inventing a quantity',()=>{assert.deepEqual(stockLabel(publicStockFields('low_stock',null,3)),{text:'庫存偏低',tone:'low'});assert.equal(stockLabel(publicStockFields('low_stock',25,3)).text,'剩餘 25 帳')});

test('recent stock follows the entered stock date instead of publication or a stored tag',()=>{
 const now='2026-11-05T00:00:00Z';
 assert.deepEqual(tagsFor({tags:['最近新庫存'],first_stocked_at:'2026-10-01T00:00:00+08:00',first_published_at:now},now),[]);
 assert.deepEqual(tagsFor({tags:[],first_stocked_at:'2026-11-05T00:00:00+08:00',first_published_at:'2026-10-01'},now),['最近新庫存']);
 assert.deepEqual(tagsFor({tags:['最近新庫存'],first_stocked_at:'2026-10-23T00:00:00+08:00'},now),['最近新庫存']);
 assert.deepEqual(tagsFor({tags:['最近新庫存'],first_stocked_at:'2026-10-22T00:00:00+08:00'},now),[]);
});

test('newest listings sort by first publication even without an image or stock date',()=>{
 const rows=[
  {...p,id:'featured',hot_rank:1,first_published_at:'2026-11-12T00:00:00Z'},
  {...p,id:'legacy',first_published_at:null,first_stocked_at:'2026-11-15'},
  {...p,id:'newest',status:'coming_soon',first_published_at:'2026-11-14T02:00:00Z'},
  {...p,id:'today',first_published_at:'2026-11-14T00:00:00Z'}
 ];
 assert.deepEqual(sortByFirstPublication(rows).map(row=>row.id),['newest','today','featured','legacy']);
});
