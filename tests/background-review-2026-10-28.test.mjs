import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterBackgrounds,referenceArtwork,backgroundMatch} from '../backgrounds-service.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const data=read('../data/backgrounds.json'),refs=read('../data/background-reference-facts.json'),audit=read('../docs/background-coverage-review-2026-10-28.json');
test('Mexico Cubone is released, searchable and uses a verified working image instead of the broken catalog filename',()=>{
 const row=data.records.find(r=>r.background_id==='BG-0278');
 assert.equal(row.start_date,'2026-10-27');assert.equal(row.end_date,'2026-11-05');
 assert.ok(filterBackgrounds(data.records).includes(row));assert.ok(backgroundMatch(row,'卡拉卡拉'));assert.ok(backgroundMatch(row,'105'));
 assert.deepEqual(row.pokemon.map(p=>p.dex),[104]);assert.deepEqual(row.evolved_pokemon.map(p=>p.dex),[105]);
 assert.equal(row.evolved_pokemon[0].acquisition,'evolution');
 assert.equal(referenceArtwork(row,refs),audit.image_check.url);
 assert.ok(row.official_sources.includes('https://pokemongo.com/es-MX/news/dia-de-muertos-2026'));
 assert.match(row.method_en,/Party Challenge/);assert.match(row.method_en,/Timed Research/);
});
test('announced city Location Backgrounds stay separate from the released Cubone Special Background',()=>{
 const event=data.additional_announced_events.find(r=>r.name_en.includes('Mexico City Location Background'));
 assert.equal(event.start_date,'2026-10-31');assert.equal(event.release_state,'upcoming');assert.equal(event.image_source,null);
 assert.ok(!data.records.find(r=>r.background_id==='BG-0278').pokemon.some(p=>[92,93,94,355].includes(p.dex)));
 for(const id of audit.owner_keep_unchanged_ids)assert.equal(data.records.find(r=>r.background_id===id).release_state,'needs-verification');
 assert.equal(data.complete,false);
});
test('current source additions all map to real records without rewriting historical coverage receipts',()=>{
 for(const source of ['serebii','dittobase']){
  assert.equal(audit.sources[source].removed.length,0);
  for(const row of audit.sources[source].added)assert.ok(data.records.some(r=>r.background_id===row.background_id));
 }
 assert.equal(audit.sources.pokexperience.full_recheck,false);
 assert.equal(data.records.length,audit.catalog_records);assert.equal(filterBackgrounds(data.records).length,audit.released_records);
});
