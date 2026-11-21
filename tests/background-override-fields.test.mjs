import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
import {mergeBackgroundOverrides,changedBackgroundFields} from '../backgrounds-admin-service.mjs';
const read=f=>readFile(new URL(f,import.meta.url),'utf8');
const base={background_id:'BG-0284',name_zh:'曠野地帶',name_en:'Wild Area',type:'special',release_state:'released',verification:'official-event-confirmed',image_source:'https://example.test/new.jpg',notes:['repo 最新註記'],pokemon:[{dex:888,name_zh:'蒼響（百戰勇者）',name_en:'Zacian (Hero)',method_status:'reviewed'}],related_product_ids:[]};
const stale={...base,release_state:'upcoming',image_source:'https://example.test/old.webp',notes:['舊註記'],pokemon:[{dex:888,name_zh:'蒼響（劍之王團體戰）',name_en:'Zacian (Crowned)'}],related_product_ids:['11111111-1111-4111-8111-111111111111']};

test('with a changed-field list only those fields override the repo; repo updates to other fields stay visible',()=>{
 const [r]=mergeBackgroundOverrides([base],{'BG-0284':{background_id:'BG-0284',is_visible:true,version:2,record:stale,fields:['related_product_ids']}});
 assert.deepEqual(r.related_product_ids,stale.related_product_ids,'your related products are kept');
 assert.equal(r.release_state,'released');assert.equal(r.image_source,'https://example.test/new.jpg');assert.deepEqual(r.notes,['repo 最新註記']);assert.equal(r.pokemon[0].name_zh,'蒼響（百戰勇者）');
 assert.deepEqual(r.cloud_fields,['related_product_ids']);
 // 舊資料（沒有 fields）照舊整筆套用；後台新增的背景沒有 repo 原始資料，也整筆套用
 assert.equal(mergeBackgroundOverrides([base],{'BG-0284':{is_visible:true,record:stale}})[0].release_state,'upcoming');
 const id='BG-U-12345678-1234-4123-8123-123456789abc';const added=mergeBackgroundOverrides([base],{[id]:{is_visible:true,record:{...base,name_zh:'新背景'},fields:['name_zh']}}).find(x=>x.background_id===id);
 assert.equal(added.name_zh,'新背景');assert.equal(added.type,'special','new admin rows apply the whole record');
 // 隱藏仍然有效
 assert.equal(mergeBackgroundOverrides([base],{'BG-0284':{is_visible:false,record:null,fields:['name_zh']}}).length,0);
});

test('changed fields ignore checked_on, empty-vs-missing lists and repo-only Pokémon metadata, but catch real edits',()=>{
 const edited={...base,checked_on:'2026-11-16',catalog_sources:[],pokemon:[{dex:888,name_zh:'蒼響（百戰勇者）',name_en:'Zacian (Hero)'}],related_product_ids:['11111111-1111-4111-8111-111111111111']};
 assert.deepEqual(changedBackgroundFields(edited,base),['related_product_ids']);
 assert.deepEqual(changedBackgroundFields({...edited,name_zh:'暗黑蒼穹-紫黑'},base),['name_zh','related_product_ids']);
 assert.deepEqual(changedBackgroundFields({...base,notes:[]},base),['notes'],'clearing a field on purpose is an edit');
 assert.equal(changedBackgroundFields(edited,null),null,'admin-created background stores the whole record');
});

test('database stores and returns the changed-field list; invalid lists are rejected; old entries keep working',async()=>{
 const db=new PGlite();await db.exec(await read('./checkout-fixture.sql'));await db.exec(await read('../supabase/production/background-catalog.sql'));
 const q=async(s,a=[])=>(await db.query(s,a)).rows;const admin=(await q('select user_id from admin_profiles limit 1'))[0].user_id;
 await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);await db.exec('set role authenticated');
 const record={name_zh:'曠野地帶',name_en:'Wild Area',type:'special',release_state:'released',verification:'catalog-crosschecked',image_source:'https://example.test/a.jpg',official_sources:[],catalog_sources:['https://a.test/1','https://b.test/2'],notes:[],notes_en:[],pokemon:[],evolved_pokemon:[],related_product_ids:['11111111-1111-4111-8111-111111111111']};
 const save=(fields,ver,req)=>q("select admin_background_catalog('save',$1,$2) r",[JSON.stringify({background_id:'BG-0284',expected_version:ver,is_visible:true,record,...(fields?{fields}:{})}),req]);
 const r1=(await save(['related_product_ids'],0,'00000000-0000-4000-8000-000000000001'))[0].r;assert.deepEqual(r1.fields,['related_product_ids']);
 const pub=(await q('select background_catalog_overrides() r'))[0].r;assert.deepEqual(pub[0].fields,['related_product_ids']);
 await assert.rejects(save(['secret_field'],1,'00000000-0000-4000-8000-000000000002'),/changed-field list/,'only fields present in the record');
 await assert.rejects(save('related_product_ids',1,'00000000-0000-4000-8000-000000000003'),/changed-field list/);
 const r2=(await save(null,1,'00000000-0000-4000-8000-000000000004'))[0].r;assert.equal(r2.fields,undefined,'saving without a list still works (whole record)');
 await db.exec('reset role');
});
