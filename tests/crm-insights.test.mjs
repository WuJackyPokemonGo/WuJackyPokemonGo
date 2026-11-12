import test from 'node:test';import assert from 'node:assert/strict';
import {periodRange,crmSummary,unconvertedCustomers,purchaseDaysByCustomer,unconvertedKey,taipeiDay} from '../crm-insights.mjs';

// 台灣時間 2026-11-12（週四）10:00
const NOW=Date.parse('2026-11-12T02:00:00Z');
const C={a:'aaaaaaaa-0000-4000-8000-000000000001',b:'aaaaaaaa-0000-4000-8000-000000000002',c:'aaaaaaaa-0000-4000-8000-000000000003',d:'aaaaaaaa-0000-4000-8000-000000000004'};
const P1='bbbbbbbb-0000-4000-8000-000000000001';
const identities=[{customer_id:C.a,display_name:'許大哥',first_seen_at:'2026-11-12T01:00:00Z'},{customer_id:C.b,display_name:'奶茶',first_seen_at:'2026-10-01T00:00:00Z'},{customer_id:C.c,display_name:'路人甲',first_seen_at:'2026-11-03T00:00:00Z'},{customer_id:C.d,display_name:'老楊',first_seen_at:'2026-09-01T00:00:00Z'}];
const profiles=[{id:C.a,alias:'許大哥',other_aliases:['許醫師']},{id:C.b,alias:'奶茶',other_aliases:[]},{id:C.c,alias:'路人甲',other_aliases:[]},{id:C.d,alias:'老楊',other_aliases:[]}];
const inquiries=[
 {customer_id:C.a,occurred_at:'2026-11-12T01:30:00Z',category:'price',product_ids:[P1],terms:['超夢'],excerpt:'超夢多少'},
 {customer_id:C.a,occurred_at:'2026-11-10T03:00:00Z',category:'buy',product_ids:[P1],terms:['超夢'],excerpt:'我要一隻'},
 {customer_id:C.b,occurred_at:'2026-11-05T15:30:00Z',category:'stock',product_ids:[],terms:['藍狗'],excerpt:'藍狗還有嗎'},   // 台灣 11/5 23:30
 {customer_id:C.c,occurred_at:'2026-11-11T16:30:00Z',category:'price',product_ids:[P1],terms:[],excerpt:'價格？'},          // 台灣 11/12 00:30（今天）
 {customer_id:C.d,occurred_at:'2026-11-09T02:00:00Z',category:'delivery',product_ids:[],terms:[],excerpt:'何時交貨'},
 {customer_id:C.d,occurred_at:'2026-09-20T02:00:00Z',category:'price',product_ids:[],terms:['皮卡丘'],excerpt:'舊的'}];
const orders=[{status:'completed',customer_alias:'許醫師',public_subtotal_twd:1700,private_adjustments_twd:0,refund_amount_twd:0,created_at:'2026-11-10T05:00:00Z'},{status:'cancelled',customer_alias:'奶茶',public_subtotal_twd:999,created_at:'2026-11-08T05:00:00Z'},{status:'pending_review',customer_alias:'路人甲',public_subtotal_twd:100,created_at:'2026-11-12T01:00:00Z'}];
const history=[{customer_alias:'老楊',purchased_on:'2026-11-11',amount_twd:300}];
const products=[{id:P1,name:'超夢-十週年'}];

test('periodRange uses Taipei dates with Monday-start weeks',()=>{
 assert.deepEqual(periodRange('today',NOW),{from:'2026-11-12',to:'2026-11-12'});
 assert.deepEqual(periodRange('week',NOW),{from:'2026-11-09',to:'2026-11-12'});
 assert.deepEqual(periodRange('month',NOW),{from:'2026-11-01',to:'2026-11-12'});
 assert.deepEqual(periodRange('week',Date.parse('2026-11-15T15:00:00Z')),{from:'2026-11-09',to:'2026-11-15'},'Sunday 23:00 Taipei stays in the same week');
 assert.deepEqual(periodRange('week',Date.parse('2026-11-15T16:30:00Z')),{from:'2026-11-16',to:'2026-11-16'},'Monday 00:30 Taipei (still Sunday in UTC) starts a new week');
 assert.equal(taipeiDay('2026-11-11T16:30:00Z'),'2026-11-12');
});

test('crmSummary counts inquiries, customers, sales and follow-ups per period',()=>{
 const followups=[{status:'open',due_on:'2026-11-10'},{status:'open',due_on:'2026-11-12'},{status:'done',due_on:'2026-11-01'}];
 const today=crmSummary({identities,inquiries,followups,orders,history,products,profiles,period:'today',now:NOW});
 assert.equal(today.inquiries,2);assert.equal(today.customersAsking,2);assert.equal(today.newCustomers,1);
 assert.deepEqual(today.topItems,[{name:'超夢-十週年',count:2}]);
 assert.deepEqual(today.sales,{orders:0,orderTotal:0,history:0,historyTotal:0});
 assert.equal(today.openFollowups,2);assert.equal(today.overdueFollowups,1);
 const week=crmSummary({identities,inquiries,followups,orders,history,products,profiles,period:'week',now:NOW});
 assert.equal(week.inquiries,4);assert.equal(week.byCategory.price,2);assert.equal(week.byCategory.buy,1);assert.equal(week.byCategory.delivery,1);
 assert.deepEqual(week.sales,{orders:1,orderTotal:1700,history:1,historyTotal:300},'cancelled and unpaid orders are not sales');
 assert.equal(week.intentCustomers,2);assert.equal(week.convertedCustomers,1,'許大哥 bought via alias 許醫師; 路人甲 did not');
 const month=crmSummary({identities,inquiries,followups,orders,history,products,profiles,period:'month',now:NOW});
 assert.equal(month.inquiries,5);assert.deepEqual(month.topItems.map(x=>x.name),['超夢-十週年','藍狗（未對到商品）']);
});

test('purchaseDaysByCustomer links orders and history through aliases and keeps paid_suspected',()=>{
 const tags=[{customer_id:C.c,tag:'paid_suspected',evidence:{timestamp_ms:Date.parse('2026-11-11T17:00:00Z')}}];
 const m=purchaseDaysByCustomer({profiles,orders,history,tags,inquiries});
 assert.deepEqual(m.get(C.a),[{day:'2026-11-10',source:'order',amount:1700}]);
 assert.deepEqual(m.get(C.d),[{day:'2026-11-11',source:'history',amount:300}]);
 assert.deepEqual(m.get(C.c),[{day:'2026-11-12',source:'paid_suspected',amount:0}]);
 assert.equal(m.has(C.b),false,'cancelled order is not a purchase');
});

test('unconvertedCustomers lists askers without a later purchase and respects handled keys',()=>{
 const tags=[{customer_id:C.b,tag:'abandon_suspected',evidence:{}}];
 let list=unconvertedCustomers({identities,inquiries,tags,followups:[],orders,history,profiles,products,now:NOW,days:30});
 // 許大哥：最後詢問 11/12（今天，未滿 1 天不列）；路人甲：今天；老楊：只有交付問題＋9/20 舊詢問（30 天外）；奶茶：11/5 問庫存，取消的訂單不算 → 列入
 assert.deepEqual(list.map(x=>x.name),['奶茶']);
 assert.deepEqual({...list[0],key:undefined},{customer_id:C.b,name:'奶茶',lastDay:'2026-11-05',daysSince:7,count:1,items:['藍狗'],categories:['問庫存'],abandonTag:true,bought:false,key:undefined,excerpt:'藍狗還有嗎'});
 assert.equal(list[0].key,unconvertedKey(C.b,'2026-11-05'));
 // 隔天：許大哥 11/12 詢問，但 11/10 才買過 → 詢問在成交之後，列入；路人甲也列入
 const tomorrow=Date.parse('2026-11-13T02:00:00Z');
 list=unconvertedCustomers({identities,inquiries,tags,followups:[],orders,history,profiles,products,now:tomorrow,days:30});
 assert.deepEqual(list.map(x=>x.name),['奶茶','許大哥','路人甲']);
 assert.equal(list.find(x=>x.name==='許大哥').bought,true);assert.deepEqual(list.find(x=>x.name==='許大哥').items,['超夢-十週年']);
 // 處理過（建立追蹤或不用追）的 key 不再列出；同一客人之後有新詢問會換新 key 重新出現
 list=unconvertedCustomers({identities,inquiries,tags,followups:[{source_key:unconvertedKey(C.b,'2026-11-05')}],orders,history,profiles,products,now:tomorrow,days:30});
 assert.deepEqual(list.map(x=>x.name),['許大哥','路人甲']);
 // 7 天範圍：奶茶 11/5 已超出
 assert.deepEqual(unconvertedCustomers({identities,inquiries,tags,followups:[],orders,history,profiles,products,now:tomorrow,days:7}).map(x=>x.name),['許大哥','路人甲']);
 // 之後有成交就不列
 const later=[...history,{customer_alias:'路人甲',purchased_on:'2026-11-12',amount_twd:100}];
 assert.deepEqual(unconvertedCustomers({identities,inquiries,tags,followups:[],orders,history:later,profiles,products,now:tomorrow,days:7}).map(x=>x.name),['許大哥']);
});
