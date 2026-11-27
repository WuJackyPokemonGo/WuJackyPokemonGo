import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {collectActivityEvents,activityState} from '../activity-feed-service.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../data/backgrounds.json',import.meta.url)));
test('new catalog artwork does not release the two upcoming official backgrounds or promote evolution to a direct encounter',()=>{
 for(const id of ['BG-0287','BG-0288']){
  const r=data.records.find(r=>r.background_id===id);
  assert.equal(r.release_state,'upcoming');assert.equal(r.artwork_status,'catalogued-preview');
  assert.match(r.image_source,/pokexperience\.com/);assert.match(r.activity.uncertainty_en,/not evidence of an actual player acquisition/);
  assert.equal(r.activity.remote_background.basis,'pending');assert.deepEqual(r.related_product_ids,[]);
 }
 const r=data.records.find(r=>r.background_id==='BG-0287');assert.deepEqual(r.pokemon.map(p=>p.dex),[7]);assert.deepEqual(r.evolved_pokemon.map(p=>p.dex),[8,9]);
 const g=data.records.find(r=>r.background_id==='BG-0285');assert.equal(g.release_state,'upcoming');assert.ok(!g.start_date);
});
test('Inteleon updates the existing preview once and keeps main battles separate from the midnight bonus and remote cap window',()=>{
 const events=collectActivityEvents(data),rows=events.filter(e=>e.event_id==='season-25-2026-12-05');assert.equal(rows.length,1);
 const r=rows[0];assert.equal(r.activity.schedule.start,'2026-12-05T14:00');assert.equal(r.activity.schedule.end,'2026-12-05T17:00');
 assert.equal(activityState(r,Date.parse('2026-12-05T05:59Z')).status,'upcoming');assert.equal(activityState(r,Date.parse('2026-12-05T06:00Z')).status,'in_progress');assert.equal(activityState(r,Date.parse('2026-12-05T09:00Z')).status,'ended');
 assert.equal(r.pokemon[0].dex,818);assert.match(r.pokemon[0].name_en,/Gigantamax/);assert.deepEqual(r.background_ids,[]);
 assert.equal(r.activity.remote_participation.basis,'pending');assert.equal(r.activity.remote_background.basis,'pending');
});
