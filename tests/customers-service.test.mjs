import test from 'node:test';import assert from 'node:assert/strict';
import {parseHistoryImport,buildRoster,filterRoster,rosterCsv,profilePayload,parseDate,splitCsv,importKey,createCustomersService} from '../customers-service.mjs';

test('parseHistoryImport: headers, dates, amounts, errors and duplicates',()=>{
 const csv='客人,日期,時間,品項,金額,管道,備註\n許大哥,7/26,15:14,派對色背耿鬼,250,一卡通,\n許大哥,2026-07-26,15:14,派對色背耿鬼,250,一卡通,\n"奶茶, 小姐",2026/9/19,,"品項含""引號""",4000元,LINE,\n王思云,13/40,,皮卡丘,abc,,\n';
 const r=parseHistoryImport(csv,{defaultYear:2026});
 assert.equal(r.rows.length,2);assert.equal(r.duplicates.length,1);assert.equal(r.errors.length,1);
 assert.match(r.errors[0],/第 5 列.*日期.*金額/);
 assert.deepEqual(r.rows[1],{customer_alias:'奶茶, 小姐',purchased_on:'2026-09-19',purchased_time:'',item_text:'品項含"引號"',amount_twd:4000,channel:'LINE',note_private:'',import_key:r.rows[1].import_key});
 assert.equal(r.rows[0].purchased_on,'2026-07-26');assert.equal(r.rows[0].purchased_time,'15:14');
 assert.match(parseHistoryImport('a,b\n1,2').errors[0],/第一列/);
 assert.equal(parseDate('2026-02-30'),null);assert.equal(parseDate('9/7',2026),'2026-09-07');
 assert.deepEqual(splitCsv('a\tb\r\nc,d'),[['a','b'],['c','d']]);
 const base={customer_alias:'A',purchased_on:'2026-01-01',purchased_time:'',amount_twd:1,item_text:'x',note_private:''};
 assert.equal(importKey(base),importKey({...base,customer_alias:' a '}));assert.notEqual(importKey(base),importKey({...base,note_private:'第二筆'}));
});

test('buildRoster merges orders, history and alias profiles; ignores unpaid or cancelled orders',()=>{
 const orders=[
  {id:'o1',order_number:'WJ1',status:'completed',customer_alias:'許醫師',channel:'line',public_subtotal_twd:1700,private_adjustments_twd:0,refund_amount_twd:0,created_at:'2026-11-01T02:00:00Z',order_items:[{product_name_snapshot:'日本皮卡集章',quantity:1}]},
  {id:'o2',status:'cancelled',customer_alias:'許大哥',public_subtotal_twd:999,created_at:'2026-11-02T02:00:00Z'},
  {id:'o3',status:'pending_review',customer_alias:'路人',public_subtotal_twd:100,created_at:'2026-11-02T02:00:00Z'},
  {id:'o4',status:'paid_awaiting_purchase',customer_alias:'奶茶',customer_contact_private:'LINE: milk',public_subtotal_twd:500,private_adjustments_twd:-50,refund_amount_twd:0,created_at:'2026-10-31T17:30:00Z',order_items:[{product_name_snapshot:'色背皮卡',quantity:2}]}];
 const history=[{id:'h1',customer_alias:'許大哥',purchased_on:'2026-07-26',purchased_time:'15:14',item_text:'派對色背耿鬼',amount_twd:250,channel:'一卡通',import_batch:'b1'},{id:'h2',customer_alias:'王思云',purchased_on:'2026-09-02',purchased_time:'',item_text:'未記品項',amount_twd:7200}];
 const profiles=[{id:'p1',alias:'許大哥',other_aliases:['許醫師'],contact_private:'FB 許',do_not_market:false,note_private:''},{id:'p2',alias:'王思云',other_aliases:[],contact_private:'',do_not_market:true,note_private:'不要廣告'}];
 const list=buildRoster({orders,history,profiles,today:'2026-11-08'});
 assert.deepEqual(list.map(c=>[c.alias,c.count,c.total]),[['許大哥',2,1950],['王思云',1,7200],['奶茶',1,450]]);
 const hsu=list[0];assert.equal(hsu.lastDate,'2026-11-01');assert.equal(hsu.daysSince,7);assert.deepEqual(hsu.items,['日本皮卡集章','派對色背耿鬼']);assert.equal(hsu.contact,'FB 許');
 assert.equal(list[2].lastDate,'2026-11-01','orders use Taipei date');assert.equal(list[2].contact,'LINE: milk');assert.deepEqual(list[2].items,['色背皮卡×2']);
 assert.equal(list.some(c=>c.alias==='路人'),false);
 assert.deepEqual(filterRoster(list,{minCount:2}).map(c=>c.alias),['許大哥']);
 assert.deepEqual(filterRoster(list,{marketableOnly:true}).map(c=>c.alias),['許大哥','奶茶']);
 assert.deepEqual(filterRoster(list,{inactiveDays:30}).map(c=>c.alias),['王思云']);
 assert.deepEqual(filterRoster(list,{search:'醫師'}).map(c=>c.alias),['許大哥']);
 assert.deepEqual(filterRoster(list,{search:'耿鬼'}).map(c=>c.alias),['許大哥']);
});

test('rosterCsv escapes quotes and neutralises spreadsheet formulas',()=>{
 const csv=rosterCsv([{alias:'+100詠儀',otherAliases:[],namesSeen:[],contact:'=HYPERLINK("x")',count:1,total:100,lastDate:'2026-09-21',daysSince:3,items:['ana火龍, 色違'],doNotMarket:true,note:''}]);
 assert.ok(csv.startsWith('﻿客人,'));assert.match(csv,/\r\n'\+100詠儀,,"'=HYPERLINK\(""x""\)",1,100,2026-09-21,3,"ana火龍, 色違",是,$/);
});

test('profilePayload normalises aliases and validates lengths',()=>{
 assert.deepEqual(profilePayload({alias:' 許大哥 ',other_aliases:'許醫師、許醫師, 許大哥\n老許',contact_private:' LINE ',do_not_market:'on',note_private:''}),{alias:'許大哥',other_aliases:['許醫師','老許'],contact_private:'LINE',do_not_market:true,note_private:''});
 assert.throws(()=>profilePayload({alias:''}),/客人名稱/);
});

test('service imports in chunks with duplicate-safe upsert and deletes by batch',async()=>{
 const calls=[];const chain=result=>{const q={};for(const m of ['select','order','range','eq','single'])q[m]=(...a)=>{calls.push([m,...a]);return q};q.then=(r,j)=>Promise.resolve(result()).then(r,j);return q};
 const client={from:table=>({upsert:(rows,opts)=>{calls.push(['upsert',table,rows.length,opts]);return chain(()=>({data:rows.slice(0,rows.length-1).map((_,i)=>({id:i}))}))},delete:()=>chain(()=>({data:[{id:1},{id:2}]}))})};
 const svc=createCustomersService(client);const rows=Array.from({length:450},(_,i)=>({import_key:'k'+i}));
 const r=await svc.importHistory(rows,'b1');assert.deepEqual(r,{inserted:447,skipped:3});
 assert.deepEqual(calls.filter(c=>c[0]==='upsert').map(c=>c[2]),[200,200,50]);assert.deepEqual(calls.find(c=>c[0]==='upsert')[3],{onConflict:'import_key',ignoreDuplicates:true});
 assert.equal(await svc.deleteBatch('b1'),2);await assert.rejects(svc.deleteBatch(''),/批次/);
});

test('customer backup validates format and restore never overwrites existing rows',async()=>{
 const {validateCustomerBackup}=await import('../customers-service.mjs');
 assert.throws(()=>validateCustomerBackup({format:'x'}),/不是客人資料備份/);
 const profile={id:'p1',alias:'許大哥',other_aliases:[],contact_private:'',do_not_market:false,note_private:'',created_at:'t',updated_at:'t',extra:'drop'};
 const hist={id:'h1',customer_alias:'許大哥',purchased_on:'2026-07-26',purchased_time:'',item_text:'x',amount_twd:1,channel:'',note_private:'',import_key:'h0000000000000001',import_batch:'b',created_at:'t'};
 assert.throws(()=>validateCustomerBackup({format:'wu-jacky-customers',version:1,profiles:[{id:'p'}],history:[]}),/客人資料第 1 筆/);
 const v=validateCustomerBackup({format:'wu-jacky-customers',version:1,profiles:[profile],history:[hist]});assert.equal('extra' in v.profiles[0],false);
 const calls=[];const result=rows=>{const q={select:()=>q,then:(r,j)=>Promise.resolve({data:rows}).then(r,j)};return q};
 const client={from:t=>({upsert:(rows,opts)=>{calls.push([t,opts]);return result(t==='customer_profiles'?[]:rows)}})};
 const r=await createCustomersService(client).restore({format:'wu-jacky-customers',version:1,profiles:[profile],history:[hist]});
 assert.deepEqual(r,{profiles:0,history:1,skipped:1});
 assert.deepEqual(calls,[['customer_profiles',{onConflict:'id',ignoreDuplicates:true}],['customer_history_purchases',{onConflict:'import_key',ignoreDuplicates:true}]]);
});
