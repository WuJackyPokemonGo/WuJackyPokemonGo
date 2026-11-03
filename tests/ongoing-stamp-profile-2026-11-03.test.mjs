import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {collectActivityEvents,activityState,activityTimeLines,activityWindows,zonedInstant} from '../activity-feed-service.mjs';import {backgroundArtworkGallery,filterBackgrounds,groupBackgroundCards} from '../backgrounds-service.mjs';
const data=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url))),events=collectActivityEvents(data),get=id=>events.find(e=>e.event_id===id);
test('ongoing stamp rallies use the same absolute opening instant without invented expiry and preserve owner-confirmed city artwork reuse',()=>{
 for(const [id,dex]of [['sendai-lapras-ongoing-stamp-rally-2026',131],['mexico-hawlucha-ongoing-stamp-rally-2026',701]]){
  const e=get(id),s=e.activity.schedule;assert.equal(zonedInstant(s.start,s.zone),Date.parse('2026-11-03T00:00Z'));assert.equal(s.end,null);assert.equal(s.open_ended,true);
  assert.equal(activityState(e,Date.parse('2026-11-02T23:59:59Z')).status,'upcoming');assert.equal(activityState(e,Date.parse('2026-11-03T00:00Z')).status,'in_progress');assert.equal(activityState(e,Date.parse('2031-01-01T00:00Z')).status,'in_progress');
  const t=activityTimeLines(e);assert.match(t.taiwan,/2026\/11\/03 08:00/);assert.match(t.local,/未定結束日/);assert.match(activityTimeLines(e,'en').local,/no end date/);assert.deepEqual(activityWindows(e),[]);
  assert.equal(e.pokemon.length,1);assert.equal(e.pokemon[0].dex,dex);const original=data.records.find(r=>r.background_id===(dex===131?'BG-0212':'BG-0213'));assert.equal(e.image_source,original.image_source);assert.equal(e.artwork_reuses_background_id,original.background_id);assert.equal(e.activity.artwork_status,'owner-confirmed-reuse');assert.equal(e.artwork_confirmation.basis,'owner-confirmed');assert.equal(backgroundArtworkGallery(e).length,1);assert.deepEqual(e.related_product_ids,[]);assert.ok(filterBackgrounds(data.records).some(r=>r.background_id===e.background_id));assert.match(e.activity.remote_background.text_en,/not applicable/);
 }
 for(const id of ['wild-area-sendai-2026','wild-area-mexico-city-2026'])assert.equal(activityState(get(id),Date.parse('2026-11-03T00:00Z')).status,'upcoming');
 assert.deepEqual(groupBackgroundCards(data.records).filter(r=>r.activity_id).map(r=>[r.activity_id,r.members.length]),[['ancients-recovered',6]]);
});
test('profile rollout is a feature event with no new capture entitlement or catalog artwork',()=>{
 const e=get('trainer-profile-background-rollout-2026');assert.equal(e.activity.kind,'feature');assert.equal(e.activity.background_type,'display');assert.deepEqual(e.background_ids,[]);assert.ok(!data.records.some(r=>r.activity?.kind==='feature'));
 assert.equal(activityState(e,Date.parse('2026-11-06T01:59:59Z')).status,'upcoming');assert.equal(activityState(e,Date.parse('2026-11-06T02:00Z')).status,'in_progress');assert.match(activityTimeLines(e,'en').local,/Each region/);assert.match(e.activity.conditions_zh,/11\/9/);assert.match(e.activity.uncertainty_en,/does not release rewards early/);
 assert.throws(()=>activityState({activity:{schedule:{start:'2026-11-03T10:00',zone:'Asia/Taipei'}}}));
 assert.equal(data.records.length,281);assert.equal(filterBackgrounds(data.records).length,274);assert.equal(Object.values(data.counts).reduce((a,b)=>a+b,0),281);
 const states=events.map(e=>activityState(e,Date.parse('2026-11-03T09:00Z')).status);assert.equal(states.filter(s=>s==='in_progress').length,4);assert.equal(states.filter(s=>s==='upcoming').length,12);assert.equal(states.filter(s=>s==='ended').length,1);
});
