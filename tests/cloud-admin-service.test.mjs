import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminService,productPayload} from '../cloud-admin-service.mjs';
const valid={sku:' TEST-001 ',name_zh:' 皮卡丘 ',name_en:'Pikachu',publication_status:'draft',supply_status:'inquiry_only',public_price_twd:''};
test('product save allows inquiry prices and cannot overwrite private stock or finance fields',()=>{
  const p=productPayload({...valid,quantity_on_hand:999,unit_cost_twd:50,created_by:'spoofed',price_is_inquiry:false});
  assert.equal(p.sku,'TEST-001');assert.equal(p.name_zh,'皮卡丘');assert.equal(p.public_price_twd,null);assert.equal(p.price_is_inquiry,true);
  assert.equal('quantity_on_hand' in p,false);assert.equal('unit_cost_twd' in p,false);assert.equal('created_by' in p,false);
});
for(const bad of [{name_zh:' '},{public_price_twd:'1.5'},{public_price_twd:'-1'},{public_price_twd:'2147483648'},{publication_status:'unknown'},{supply_status:'unknown'}])test('invalid product values fail before a database request: '+JSON.stringify(bad),()=>assert.throws(()=>productPayload({...valid,...bad})));
test('unknown network outcome retries the identical inventory request key',async()=>{
  const calls=[];let count=0;
  const service=createAdminService({rpc:async(name,args)=>{calls.push({...args});if(count++===0)throw Error('network lost after commit');return{data:[{new_quantity:10}],error:null}}},()=> 'stable-request-key');
  await assert.rejects(service.adjust('product-1',10,'期初庫存'),/network/);
  assert.equal(service.pending.p_idempotency_key,'stable-request-key');
  await assert.rejects(service.adjust('product-2',10,'期初庫存'),/尚未確認/);
  await service.adjust('product-1',10,'期初庫存');assert.deepEqual(calls[0],calls[1]);assert.equal(service.pending,null);
});
test('network-shaped SDK errors keep pending request; definite SQL rejection permits correction',async()=>{
  let result={error:{message:'Failed to fetch',code:''}};
  const service=createAdminService({rpc:async()=>result},()=> 'request-key');
  await assert.rejects(service.adjust('p',-5,'實際盤點'));assert.ok(service.pending);
  result={error:{message:'negative inventory',code:'23514'}};await assert.rejects(service.adjust('p',-5,'實際盤點'));assert.equal(service.pending,null);
});
test('server authorization rejects ordinary signed-in users before loading private UI',async()=>{
  const service=createAdminService({auth:{getUser:async()=>({data:{user:{id:'ordinary'}},error:null})},rpc:async()=>({data:false,error:null})});
  await assert.rejects(service.authorize(),/尚未獲得管理員/);
});
test('saving an outdated product reports a conflict instead of silently overwriting changes',async()=>{
  const conditions=[];const query={update(){return this},eq(k,v){conditions.push([k,v]);return this},async select(){return {data:[],error:null}}};
  const service=createAdminService({from:()=>query});
  await assert.rejects(service.save(valid,{id:'product-id',updated_at:'original-version'}),/其他裝置修改/);
  assert.deepEqual(conditions,[['id','product-id'],['updated_at','original-version']]);
});
test('a pending inventory key survives reload and logout for the same administrator',async()=>{
  const data=new Map();const journal={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  let disconnected=true;const requests=[];
  const client={auth:{getUser:async()=>({data:{user:{id:'admin'}},error:null}),signOut:async()=>({error:null})},rpc:async(name,payload)=>{
    if(name==='store_admin_status')return{data:true,error:null};
    requests.push({...payload});if(disconnected)throw Error('network');return{data:[{new_quantity:10}],error:null};
  }};
  const first=createAdminService(client,()=> 'persisted-key',journal);await first.authorize();
  await assert.rejects(first.adjust('product-1',10,'期初庫存'));await first.logout();
  const next=createAdminService(client,()=> 'must-not-be-used',journal);await next.authorize();
  assert.equal(next.pending.p_idempotency_key,'persisted-key');disconnected=false;
  await next.adjust('product-1',10,'期初庫存');assert.deepEqual(requests[0],requests[1]);assert.equal(data.size,0);
});
test('a failed retry-journal write prevents sending a stock mutation',async()=>{
  let mutations=0;
  const client={auth:{getUser:async()=>({data:{user:{id:'admin'}},error:null})},rpc:async name=>{if(name==='store_admin_status')return{data:true,error:null};mutations++;return{data:[],error:null}}};
  const service=createAdminService(client,()=> 'key',{getItem:()=>null,setItem(){throw Error('blocked')},removeItem(){}});
  await service.authorize();await assert.rejects(service.adjust('p',1,'測試調整'),/未送出/);assert.equal(mutations,0);
});
