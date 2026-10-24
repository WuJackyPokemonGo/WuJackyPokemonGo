import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {backgroundMatch,filterBackgrounds} from '../backgrounds-service.mjs';
const data=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url)));
const rows=data.records,by=id=>rows.find(r=>r.background_id===id);
test('cross-region rally availability is distinct from city launch dates and links the existing four-color product',()=>{
 for(const id of ['BG-0191','BG-0192','BG-0193','BG-0194']){
  const r=by(id);assert.equal(r.start_date,'2026-09-12');assert.equal(r.end_date,'2029-09-11');assert.equal(r.release_state,'released');
  assert.ok(r.related_product_ids.includes('295ebfb5-bf6c-4be3-b126-a2e256b3a777'));
 }
});
test('NPB events use match days and Toyama is distinct from the reused Tokyo Dome design',()=>{
 assert.equal(by('BG-0142').start_date,'2026-07-20');assert.equal(by('BG-0143').start_date,'2026-07-28');assert.equal(by('BG-0143').end_date,'2026-07-29');
 assert.equal(by('BG-0126').start_date,by('BG-0126').end_date);
});
test('Paris reused artwork retains Charmander with its own later encounter date',()=>{
 const r=by('BG-0037'),p=r.pokemon.find(p=>p.dex===4);
 assert.ok(p);assert.equal(p.start_date,'2025-09-13');assert.ok(p.method_en.includes('September'));assert.ok(backgroundMatch(r,'小火龍'));
 assert.ok(r.start_date<'2025-09-13');
});
test('ESA association retains exactly nine source variants and research windows',()=>{
 for(const r of rows.filter(r=>r.series==='ESA')){
  assert.equal(r.pokemon.length,9);assert.ok(r.related_product_ids.includes('4bc4658d-3532-482a-a11b-20eebe4c2e55'));
  assert.ok(r.method_en.includes('Oct 4–10'));assert.ok(r.method_en.includes('ESA offices'));
 }
});
test('unreleased artwork stays pending even with an official event link and summary counts are reproducible',()=>{
 assert.equal(data.redirects['BG-0270'],'BG-0261');assert.ok(!by('BG-0270'));
 assert.equal(data.review_counts.date_details_pending,rows.filter(r=>!r.start_date).length);
 assert.equal(data.review_counts.acquisition_method_pending,rows.filter(r=>!r.method_en||['partial','unconfirmed'].includes(r.method_status)).length);
 assert.equal(data.review_counts.backgrounds_pending,rows.filter(r=>r.release_state==='needs-verification').length);
 assert.equal(data.counts.upcoming,rows.filter(r=>r.release_state==='upcoming').length);
 assert.equal(data.complete,false);
});
test('preserved source-date conflicts never acquire an invented ISO date',()=>{
 for(const id of ['BG-0072','BG-0209','BG-0276','BG-0277'])assert.ok(!by(id).start_date,id);
 for(const r of rows){if(r.start_date)assert.equal(new Date(r.start_date).toISOString().slice(0,10),r.start_date);if(r.end_date&&r.start_date)assert.ok(r.end_date>=r.start_date,r.background_id)}
});
