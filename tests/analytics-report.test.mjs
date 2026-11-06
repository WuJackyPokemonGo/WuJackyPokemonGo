import test from 'node:test';import assert from 'node:assert/strict';
import {funnelSteps,overviewTiles,topRows} from '../analytics-report.mjs';
import {analyticsPayload} from '../analytics.mjs';
test('background funnel reports each step with step-to-step rate',()=>{
 const s=funnelSteps({background_view:200,background_product_click:20,background_referral:18,bg_cart_add:6,bg_line_click:0});
 assert.deepEqual(s.map(x=>x.count),[200,20,18,6,0]);assert.deepEqual(s.map(x=>x.rate),[null,10,90,33,0]);
 assert.deepEqual(funnelSteps({}).map(x=>x.rate),[null,null,null,null,null]);
});
test('overview and top five read safely from partial reports',()=>{
 assert.equal(overviewTiles({}).every(t=>t.value===0),true);
 assert.deepEqual(topRows([{views:1},{views:9},{views:3},{views:7},{views:2},{views:8}]).map(r=>r.views),[9,8,7,3,2]);
});
test('storefront may send the new funnel events and still rejects unknown ones',()=>{
 for(const e of ['line_click','background_referral','bg_cart_add','bg_line_click'])assert.equal(analyticsPayload(e,'s','i').p_event,e);
 assert.throws(()=>analyticsPayload('background_product_click','s','i'));
});
test('database allow-list matches the funnel events',async()=>{
 const sql=(await import('node:fs')).readFileSync(new URL('../supabase/production/analytics.sql',import.meta.url),'utf8');
 for(const e of ['line_click','background_referral','bg_cart_add','bg_line_click','background_product_click'])assert.match(sql,new RegExp("'"+e+"'"));
});
