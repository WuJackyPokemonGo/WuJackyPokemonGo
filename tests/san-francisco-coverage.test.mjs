import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {backgroundMatch} from '../backgrounds-service.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const data=read('../data/backgrounds.json'),refs=read('../data/background-reference-facts.json');
const row=data.records.find(r=>r.background_id==='BG-0190');
test('San Francisco retains every independently preserved source species, distinguishing costumes from evolution-only records',()=>{
 const ref=refs.entries.find(r=>r.reference_id==='WCS2026_san_francisco');
 const all=[...row.pokemon,...row.evolved_pokemon];
 for(const name of ref.species){
  const matches=all.filter(p=>name==='Pikachu'?p.dex===25:name==='Exeggutor'?p.variant_id==='exeggutor-alola':p.name_en===name);
  assert.ok(matches.length,name);
 }
 assert.equal(ref.species.length,42);assert.equal(row.pokemon.length,40);assert.equal(row.evolved_pokemon.length,3);
 assert.equal(row.pokemon.filter(p=>p.dex===25).length,2);
 assert.equal(new Set(all.map(p=>p.variant_id)).size,all.length);
 assert.ok(row.evolved_pokemon.every(p=>p.acquisition==='evolution'));
});
test('new community-supported city variants are searchable without certifying guarantees or importing disputed raid-only species',()=>{
 for(const term of ['差不多娃娃','Audino','531','化石翼龍','Aerodactyl','142','大嘴娃','Mawile','303','勾魂眼','Sableye','302'])assert.ok(backgroundMatch(row,term),term);
 for(const id of ['audino','aerodactyl','mawile','sableye']){
  const p=row.pokemon.find(p=>p.variant_id===id);assert.equal(p.method_status,'unconfirmed');assert.match(p.method_en,/player.reported/);assert.match(p.method_en,/remain unconfirmed/);assert.ok(p.method_sources.some(u=>u.includes('pokemongotrading.com')));
 }
 for(const dex of [380,381,212,475,373,386])assert.ok(!row.pokemon.some(p=>p.dex===dex));
 assert.equal(row.method_status,'partial');assert.equal(data.complete,false);
});
