import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const site=read('../data/backgrounds.json').records.find(r=>r.background_id==='BG-0190');
const mine=read('../docs/personal/san-francisco-wcs2026-personal.json');
test('personal San Francisco list matches the website baseline: 40 direct + 3 evolution, no Latias/Latios',()=>{
 assert.equal(mine.direct.length,40);assert.equal(mine.evolution.length,3);assert.equal(mine.counts.total,43);
 assert.deepEqual(mine.direct.map(p=>p.variant_id).sort(),site.pokemon.map(p=>p.variant_id).sort());
 assert.deepEqual(mine.evolution.map(p=>p.variant_id).sort(),site.evolved_pokemon.map(p=>p.variant_id).sort());
 const ids=[...mine.direct,...mine.evolution].map(p=>p.variant_id);
 for(const x of ['latias','latios'])assert.ok(!ids.includes(x),x);
});
test('42 PokéXperience labels map onto all 43 entries with only Pikachu shared',()=>{
 const m=mine.pokexperience_42_label_mapping;assert.equal(m.length,42);
 const mapped=m.flatMap(x=>x.variant_ids);assert.equal(mapped.length,43);
 assert.deepEqual([...new Set(mapped)].sort(),[...mine.direct,...mine.evolution].map(p=>p.variant_id).sort());
 assert.deepEqual(m.filter(x=>x.variant_ids.length>1).map(x=>x.source_name),['Pikachu']);
 assert.deepEqual(mine.reconciliation.map(r=>r.count),[38,40,42,39]);
});
