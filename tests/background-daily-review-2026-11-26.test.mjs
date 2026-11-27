import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {collectActivityEvents,activityState} from '../activity-feed-service.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../data/backgrounds.json',import.meta.url)));
test('Champions replaces its placeholder once, without releasing preview artwork or extending backgrounds to the raid rotation end',()=>{
 const r=data.records.find(r=>r.background_id==='BG-0288');
 assert.equal(r.release_state,'upcoming');assert.match(r.image_source,/pokemon_champions\.webp/);
 assert.deepEqual(r.pokemon.map(p=>p.dex),[371,725,996,26,445,812,380,381,485,638,639,640,894,895]);
 assert.equal(r.evolved_pokemon.length,6);assert.deepEqual(r.related_product_ids,[]);
 assert.equal(r.activity.remote_participation.basis,'inferred');assert.equal(r.activity.remote_background.basis,'pending');
 const events=collectActivityEvents(data).filter(e=>e.event_id==='december-unannounced-event-2026');assert.equal(events.length,1);
 assert.deepEqual(events[0].background_ids,['BG-0288']);
 assert.equal(activityState(events[0],Date.parse('2026-12-14T12:00Z')).status,'ended');
 assert.ok(!data.additional_announced_events.some(e=>e.event_id==='december-unannounced-event-2026'));
});
test('Tropical Paradise now has exact local hours while Choose Your Path preserves each separate claim-zone deadline',()=>{
 const events=collectActivityEvents(data),t=events.find(e=>e.event_id==='tropical-paradise-2026');
 assert.equal(t.activity.schedule.start,'2026-12-01T10:00');assert.equal(t.activity.schedule.end,'2026-12-07T20:00');
 assert.equal(t.activity.remote_background.basis,'pending');assert.deepEqual(t.background_ids,[]);
 const paths=events.filter(e=>e.event_id.startsWith('choose-your-path-'));assert.equal(paths.length,4);
 for(const e of paths){assert.match(e.activity.conditions_en,/originally claimed/);assert.deepEqual(e.background_ids,[])}
 const gunma=data.records.find(e=>e.background_id==='BG-0285');assert.equal(gunma.release_state,'upcoming');assert.ok(!gunma.start_date);
});
