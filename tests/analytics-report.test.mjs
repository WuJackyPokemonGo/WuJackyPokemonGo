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
test('visitor source comes from ?src first, then the referring site, never same-site',async()=>{
 const {visitSource}=await import('../analytics.mjs');
 assert.equal(visitSource('https://x.io/backgrounds.html?background=BG-0001&src=threads'),'threads');
 assert.equal(visitSource('https://x.io/?src=IG'),'instagram');assert.equal(visitSource('https://x.io/?src=twitter'),'x');
 assert.equal(visitSource('https://x.io/?src=weird'),'other');assert.equal(visitSource('https://x.io/?src='),null);
 assert.equal(visitSource('https://x.io/','https://www.reddit.com/r/pokemongo/'),'reddit');
 assert.equal(visitSource('https://x.io/','https://wujackypokemongo.github.io/WuJackyPokemonGo/'),null);
 assert.equal(visitSource('https://x.io/','https://google.com/'),null);
});
test('source report groups by site and splits atlas and storefront arrivals',async()=>{
 const {sourceRows}=await import('../analytics-report.mjs');
 const rows=sourceRows({sources:[{source:'atlas:threads',visits:5},{source:'store:threads',visits:2},{source:'atlas:reddit',visits:3},{source:'bogus',visits:9}]});
 assert.deepEqual(rows.map(r=>[r.label,r.atlas,r.store,r.total]),[['Threads',5,2,7],['Reddit',3,0,3]]);
});
test('database accepts only whitelisted source keys',async()=>{
 const sql=(await import('node:fs')).readFileSync(new URL('../supabase/production/analytics.sql',import.meta.url),'utf8');
 assert.match(sql,/\^\(store\|atlas\):\(threads\|reddit\|discord\|facebook\|instagram\|line\|x\|youtube\|share\|other\)\$/);assert.match(sql,/'sources',/);
});
test('empty search terms are normalised and anything personal-looking is dropped',async()=>{
 const {emptySearchTerm}=await import('../analytics.mjs');
 assert.equal(emptySearchTerm('  Teddiursa  '),'teddiursa');assert.equal(emptySearchTerm('馬拉松'),'馬拉松');assert.equal(emptySearchTerm('ＡＢＣ  def'),'abc def');
 for(const bad of ['','   ','me@mail.com','0912345678','https://x.io','www.x.io','a/b','<b>','x'.repeat(41)])assert.equal(emptySearchTerm(bad),null,bad);
});
test('empty term report splits storefront and atlas',async()=>{
 const {emptyTermRows}=await import('../analytics-report.mjs');
 assert.deepEqual(emptyTermRows({empty_terms:[{term:'store:馬拉松',searches:3},{term:'atlas:a:b',searches:1},{term:'bad',searches:9}]}),[{site:'庫存網站',term:'馬拉松',searches:3},{site:'背景圖鑑',term:'a:b',searches:1}]);
});
test('database keeps the same personal-data guard for empty terms',async()=>{
 const sql=(await import('node:fs')).readFileSync(new URL('../supabase/production/analytics.sql',import.meta.url),'utf8');
 assert.match(sql,/search_term_empty/);assert.match(sql,/\^\(store\|atlas\):\.\{1,40\}\$/);assert.match(sql,/'empty_terms'/);
});
