import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePokedexNumbers} from '../pokedex-numbers.mjs';
import {catalogPayload,publicProduct} from '../catalog-service.mjs';
import {planImport,exportCSV} from '../csv-import.mjs';
import {searchMatch} from '../storefront-service.mjs';

const values={name_zh:'大阪萬博套組',publication_status:'draft',supply_status:'inquiry_only',public_price_twd:'',pokedex_numbers:'25,0004,1,#0007,4'};
test('multiple-number entry normalizes leading zeros, duplicates, order, and fullwidth input',()=>{
 assert.deepEqual(parsePokedexNumbers(values.pokedex_numbers),[1,4,7,25]);
 assert.deepEqual(parsePokedexNumbers('１，４，７，２５'),[1,4,7,25]);
 assert.deepEqual(parsePokedexNumbers('[25,1,4,7,1]'),[1,4,7,25]);
 for(const empty of ['',null,undefined,[]])assert.deepEqual(parsePokedexNumbers(empty),[]);
 for(const bad of ['0','-1','1.5','1e2','10000','1,abc','[null]','[true]',Array(101).fill(1)])assert.throws(()=>parsePokedexNumbers(bad));
});
test('catalog stores the list and legacy first number; clearing is explicit and old inputs still work',()=>{
 const p=catalogPayload(values);assert.deepEqual(p.pokedex_numbers,[1,4,7,25]);assert.equal(p.pokedex_number,1);
 const cleared=catalogPayload({...values,pokedex_numbers:''});assert.deepEqual(cleared.pokedex_numbers,[]);assert.equal(cleared.pokedex_number,null);
 const {pokedex_numbers,...legacy}=values;assert.deepEqual(catalogPayload({...legacy,pokedex_number:'252'}).pokedex_numbers,[252]);
});
test('public searches use the array without numeric aliases and reject partial-number or year matches',()=>{
 const p={...publicProduct({...catalogPayload(values),id:'bundle',aliases:[],tags:[],images:[]}),name:'大阪萬博套組',sku:null};
 assert.deepEqual(p.dex_numbers,[1,4,7,25]);
 for(const q of ['1','4','7','25','#0007','００２５'])assert.equal(searchMatch(p,q),true,q);
 for(const q of ['2','2025','1004'])assert.equal(searchMatch(p,q),false,q);
});
test('CSV roundtrip preserves the complete array and legacy CSV can still set a single number',()=>{
 const product={...catalogPayload(values),id:'11111111-1111-4111-8111-111111111111',updated_at:'2026-10-29T00:00:00Z',category_assignments:[]};
 const roundtrip=planImport(exportCSV([product]),[product],[]);assert.deepEqual(roundtrip.errors,[]);assert.equal(roundtrip.skipped,1);
 const updated=planImport('schema_version,product_id,name_zh,pokedex_numbers\n1,11111111-1111-4111-8111-111111111111,大阪萬博套組,"[1,4,7,25,133]"',[product],[]);
 assert.deepEqual(updated.errors,[]);assert.deepEqual(updated.payload.rows[0].values.pokedex_numbers,[1,4,7,25,133]);
 const legacy=planImport('schema_version,product_id,name_zh,pokedex_number\n1,11111111-1111-4111-8111-111111111111,大阪萬博套組,25',[product],[]);
 assert.deepEqual(legacy.errors,[]);assert.deepEqual(legacy.payload.rows[0].values.pokedex_numbers,[25]);
 const omitted=planImport('schema_version,product_id,name_zh\n1,11111111-1111-4111-8111-111111111111,大阪萬博套組',[product],[]);assert.equal(omitted.skipped,1);
});
