import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {searchMatch} from '../storefront-service.mjs';
import {filterBackgrounds,referenceArtwork} from '../backgrounds-service.mjs';
import {productShareLink} from '../product-link.mjs';
import {buildProductShares,productSharePage} from '../scripts/build-product-shares.mjs';

const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const {records}=read('data/backgrounds.json');
const indiaId='363df33c-f836-4bf9-8cfe-f7ddb527ad31';
test('local Pokémon, region, costume and reordered words find the correct India listing',()=>{
 const p={name:'皮卡丘-2026印度色彩節限定背景（2款）',name_en:'Pikachu - Festival of Colors 2026 India Background (2 Costumes)',dex:25,aliases:['Saree Pikachu','Kurta Pikachu'],tags:[]};
 for(const query of ['ピカチュウ インド','インド ピカチュウ','クルタ ピカチュウ','ホーリー祭','Pikachu Festival','Ấn Độ','0025'])assert.equal(searchMatch(p,query),true,query);
 assert.equal(searchMatch(p,'Festival of Lights'),false);
 assert.ok(records.find(r=>r.background_id==='BG-0250').related_product_ids.includes(indiaId));
 assert.ok(!records.find(r=>r.background_id==='BG-0283').related_product_ids.includes(indiaId));
});

test('the atlas surfaces exact upcoming ID and title matches in the released view',()=>{
 for(const query of ['BG-0284','GO Wild Area 2026 Global','曠野地帶 2026 全球']){
  assert.deepEqual(filterBackgrounds(records,{query,includeExactUpcoming:true}).map(r=>r.background_id),['BG-0284']);
 }
 for(const query of ['','Wild Area'])assert.ok(!filterBackgrounds(records,{query,includeExactUpcoming:true}).some(r=>r.background_id==='BG-0284'));
 assert.equal(filterBackgrounds(records,{query:'BG-0284',includeExactUpcoming:true,type:'location'}).length,0);
 assert.equal(filterBackgrounds(records,{query:'BG-0284',includeExactUpcoming:true,state:'pending'}).length,0);
});

test('published atlas card images do not depend on the deferred reference document',()=>{
 const references=read('data/background-reference-facts.json');
 for(const row of records)assert.equal(referenceArtwork(row),referenceArtwork(row,references),row.background_id);
});

test('product shares render an escaped static preview and preserve a direct-link fallback',()=>{
 const pages=buildProductShares(),html=pages.get(indiaId);
 assert.ok(html.includes('og:title" content="Pikachu - Festival of Colors'));
 assert.ok(html.includes('og:image" content="https://wujackypokemongo.github.io/WuJackyPokemonGo/assets/products/opt/'));
 assert.equal(readFileSync(new URL('../p/'+indiaId+'.html',import.meta.url),'utf8'),html);
 const crafted=productSharePage({id:indiaId,name:'<name>',name_en:'"title"',image:'javascript:alert(1)'});
 assert.ok(crafted.includes('content="&lt;name&gt;"'));
 assert.ok(crafted.includes('<title>&quot;title&quot;</title>'));
 assert.ok(crafted.includes('assets/og/store.jpg'));
 const base='https://example.test/shop/index.html?src=threads';
 assert.equal(productShareLink(base,indiaId,'ja'),'https://example.test/shop/p/'+indiaId+'.html?lang=ja');
 assert.equal(productShareLink(base,'new-id','ja'),'https://example.test/shop/index.html?product=new-id&lang=ja');
});
