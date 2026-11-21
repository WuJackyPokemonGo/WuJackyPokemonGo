import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const data=JSON.parse(fs.readFileSync(new URL('../data/backgrounds.json',import.meta.url)));
const by=id=>data.records.find(r=>r.background_id===id);

test('Blue Pokemon Jet is an official upcoming Squirtle raid background without invented art or remote eligibility',()=>{
 const r=by('BG-0287');
 assert.ok(r);
 assert.equal(r.release_state,'upcoming');
 assert.equal(r.start_date,'2026-12-11');
 assert.equal(r.end_date,'2027-08-31');
 assert.equal(r.image_source,null);
 assert.equal(r.artwork_status,'pending');
 assert.deepEqual(r.pokemon.map(p=>p.dex),[7]);
 assert.match(r.method_en,/one raid per Gym per day/i);
 assert.equal(r.activity.schedule.zone,'Asia/Tokyo');
 assert.equal(r.activity.remote_participation.basis,'pending');
 assert.equal(r.activity.remote_background.basis,'pending');
 assert.deepEqual(r.related_product_ids,[]);
});

test('December recap replaces the date-only preview and reuses the 2026 yearly background',()=>{
 const e=data.additional_announced_events.find(x=>x.event_id==='season-25-2026-12-12');
 assert.equal(e.background_id,'BG-0240');
 assert.equal(e.activity.schedule.start,'2026-12-12T14:00');
 assert.equal(e.activity.schedule.end,'2026-12-13T17:00');
 assert.deepEqual(e.activity.schedule.daily,{
  start:'14:00',
  end:'17:00',
  start_date:'2026-12-12',
  end_date:'2026-12-13',
  basis:'confirmed'
 });
 assert.equal(e.activity.artwork_status,'existing-yearly-background');
 assert.equal(e.pokemon.length,14);
 assert.match(e.activity.conditions_en,/Paid Special Research/);
 assert.match(e.activity.conditions_en,/Field Research/);
 assert.match(e.activity.conditions_en,/Community Ambassador/);
 assert.ok(by('BG-0240').official_sources.includes('https://pokemongo.com/news/community-day-december-2026'));
});
