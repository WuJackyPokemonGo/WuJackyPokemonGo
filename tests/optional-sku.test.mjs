import test from 'node:test';
import assert from 'node:assert/strict';
import {productPayload} from '../cloud-admin-service.mjs';
import {planImport,exportCSV} from '../csv-import.mjs';
import {inquiryText,searchMatch} from '../storefront-service.mjs';

const values={name_zh:'皮卡丘',publication_status:'draft',supply_status:'inquiry_only',public_price_twd:''};
test('manual saves accept absent and whitespace-only SKU, but still require a name',()=>{
 for(const sku of [null,undefined,'','   '])assert.equal(productPayload({...values,sku}).sku,null);
 assert.equal(productPayload({...values,sku:' 001 '}).sku,'001');
 assert.throws(()=>productPayload({...values,name_zh:' '}));
 assert.throws(()=>productPayload({...values,sku:'x'.repeat(81)}));
});
test('CSV accepts multiple new products without SKU and does not merge them',()=>{
 for(const text of ['schema_version,name_zh\n1,皮卡丘\n1,小火龍','schema_version,sku,name_zh\n1,,皮卡丘\n1, ,小火龍']){
  const p=planImport(text,[],[]);assert.deepEqual(p.errors,[]);assert.equal(p.inserted,2);
  assert.ok(p.payload.rows.every(r=>r.values.sku===null&&r.expected===null));
 }
});
test('CSV export and reimport identify SKU-less products by UUID without creating duplicates',()=>{
 const products=[{...values,id:'11111111-1111-4111-8111-111111111111',sku:null,aliases:[],updated_at:'2026-10-29T00:00:00Z'},{...values,id:'22222222-2222-4222-8222-222222222222',sku:null,name_zh:'小火龍',aliases:[],updated_at:'2026-10-29T00:00:00Z'}];
 const p=planImport(exportCSV(products),products,[]);assert.deepEqual(p.errors,[]);assert.equal(p.skipped,2);assert.equal(p.inserted,0);
 const csv='schema_version,product_id,sku,name_zh\n1,11111111-1111-4111-8111-111111111111,,新名稱';
 const update=planImport(csv,products,[]);assert.deepEqual(update.errors,[]);assert.equal(update.updated,1);assert.equal(update.payload.rows[0].expected.id,products[0].id);assert.equal(update.payload.rows[0].values.sku,null);
 const duplicate=planImport(csv+'\n1,11111111-1111-4111-8111-111111111111,,再改',products,[]);assert.equal(duplicate.errors.length,1);
});
test('customer inquiry contains product names and prices without SKU or null placeholders',()=>{
 for(const sku of ['WJ-001',null]){
  const p={id:'p',sku,name:'皮卡丘',name_en:'Pikachu',aliases:[],tags:[],dex:25,status:'available',price:80};
  const text=inquiryText([p],[{id:'p',qty:2}]);assert.ok(text.includes('皮卡丘 × 2'));assert.ok(text.includes('160'));
  assert.ok(!/WJ-001|null|undefined/.test(text));assert.equal(searchMatch(p,'皮卡丘'),true);
 }
});
