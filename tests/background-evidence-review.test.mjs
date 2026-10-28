import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterBackgrounds} from '../backgrounds-service.mjs';
const data=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url)));
const by=id=>data.records.find(r=>r.background_id===id);
test('Nagano release is cross-checked independently from the asset discovery date',()=>{
 const r=by('BG-0209');
 assert.equal(r.start_date,'2026-10-01');assert.equal(r.verification,'catalog-crosschecked');
 assert.ok(r.catalog_sources.includes('https://pokemongo-raku.com/post130804'));
 assert.ok(r.catalog_sources.includes('https://note.com/chic_badger3860/n/nb32c45620191'));
 assert.ok(!r.official_sources.some(u=>u.includes('note.com')));
});
test('Boston background research is findable after release but is not a worldwide stamp rally',()=>{
 const r=by('BG-0201');
 assert.ok(filterBackgrounds(data.records,{query:'Boston'}).includes(r));
 assert.equal(r.end_date,'2026-10-25');assert.equal(r.research_claim_end,'2028-10-23');
 assert.match(r.method_en,/spin PokéStops in Boston/);assert.match(r.method_en,/per ticketed day/);
});
test('country filters find Copenhagen and Worlds without including source-only unconfirmed art',()=>{
 assert.ok(filterBackgrounds(data.records,{region:'Denmark'}).includes(by('BG-0141')));
 for(const id of ['BG-0016','BG-0054','BG-0190'])assert.ok(filterBackgrounds(data.records,{region:'United States'}).includes(by(id)));
 const visible=filterBackgrounds(data.records);
 for(const id of ['BG-0072','BG-0276','BG-0277'])assert.ok(!visible.includes(by(id)));
});
test('owner-reviewed costume routes retain source labels while unrelated unproven species remain unconfirmed',()=>{
 assert.ok(!by('BG-0119').pokemon.some(p=>p.dex===25));assert.deepEqual(by('BG-0119').pokemon.map(p=>p.dex),[144,145,146]);assert.equal(by('BG-0119').method_status,'reviewed');
 for(const id of ['BG-0136','BG-0141']){
  const r=by(id);assert.equal(r.method_status,'reviewed');
  assert.ok(r.pokemon.filter(p=>p.name_en.includes('themed')).every(p=>p.method_status==='reviewed'&&p.method_evidence==='owner-provided-player-report')); 
  assert.ok(r.pokemon.filter(p=>p.name_en.includes('Shadow')).every(p=>p.method_en.includes('Shadow Raids')));
 }
 assert.equal(by('BG-0190').pokemon.find(p=>p.dex===65).method_status,'unconfirmed');
 assert.equal(data.complete,false);
});

test('Chicago city-background Elekid uses firsthand local research evidence rather than a global GO Pass',()=>{
 const r=by('BG-0140'); const p=r.pokemon.find(p=>p.dex===239);
 assert.equal(p.method_status,'reviewed'); assert.equal(r.method_status,'reviewed');
 assert.equal(p.method_evidence,'firsthand-report-crosschecked');
 assert.match(p.method_en,/four Chicago City District/);assert.match(p.method_en,/Sierra/);
 assert.ok(p.method_sources.some(u=>u.includes('operationrainfall.com')));
 assert.ok(!r.official_sources.some(u=>u.includes('operationrainfall.com')));
 assert.equal(by('BG-0136').pokemon.find(p=>p.dex===131).method_status,'reviewed');
});

test('three city costume rewards retain player-report provenance and one-per-account scope without changing unrelated encounters',()=>{
 for(const [id,dex] of [['BG-0136',131],['BG-0141',77],['BG-0140',239]]){
  const r=by(id),p=r.pokemon.find(p=>p.dex===dex);
  assert.equal(p.reward_per_account,1);assert.equal(p.reward_quantity_evidence,'owner-provided-player-report');
  assert.match(p.method_en,/player.report/i);assert.match(p.method_en,/per account/);
  assert.ok(r.pokemon.filter(p=>p.dex!==dex).every(p=>p.reward_per_account===undefined));
  for(const e of r.evolved_pokemon.filter(p=>p.variant_id.includes('spring-2023')))assert.match(e.method_en,/not an additional research reward/);
 }
 assert.equal(data.review_counts.acquisition_method_pending,5);assert.equal(data.complete,false);
});
