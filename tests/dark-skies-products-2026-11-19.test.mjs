import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const data=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url),'utf8'));
const r=data.records.find(x=>x.background_id==='BG-0235');

test('紫黑背景圖鑑連到全部紫黑商品，且不重複',()=>{
  const ids=r.related_product_ids;
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(ids.length,70,'2 款泛用背景 + 65 個基本款 + 3 個特殊款');
  assert.ok(ids.includes('72d40e23-fa06-44c7-8d6a-caa662364e1a')&&ids.includes('20df8d2e-5ca5-44c1-a476-c120e1d72c46'),'原有泛用商品保留');
  assert.ok(ids.includes('004692c5-deea-4371-854f-f6dba6f66ad8'),'拉魯拉絲公款');
  assert.ok(ids.includes('b1361e07-528d-4f5e-b302-d0e63190c7cc'),'拉魯拉絲母款');
});

test('鋁鋼龍紫黑款與曠野地帶款分開、舊獨角犀牛未連',()=>{
  const ids=new Set(r.related_product_ids);
  assert.ok(ids.has('90d68c23-ead1-4708-a43e-96b504e2cfa5'));
  for(const wild of ['d8490bed-ac47-4180-9e44-4771e4548697','963bcd58-ea19-45b7-88b1-aff6e065174c','651a5056-6f60-40c4-8296-5c6e21ce8d05'])assert.ok(!ids.has(wild));
  assert.ok(!ids.has('98dd2922-cdc6-4067-8a29-6e9c4574c9da'),'WJ-0152 等性別確認');
  assert.equal(r.go_pass_pokemon.length,58);
});
