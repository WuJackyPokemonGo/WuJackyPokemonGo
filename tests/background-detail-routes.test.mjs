import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {detailPokemonRows,detailPokemonSections,pokemonFormLabel} from '../backgrounds-detail-service.mjs';
import {backgroundMatch,groupBackgroundCards} from '../backgrounds-service.mjs';
const data=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url))),by=id=>data.records.find(r=>r.background_id===id);
const asc=ps=>ps.every((p,i)=>!i||ps[i-1].dex<=p.dex);
for(const id of ['BG-0190','BG-0070','BG-0122','BG-0123','BG-0022'])test(`${id} sorts encounters and evolutions numerically without mutating raw order`,()=>{const r=by(id),before=JSON.stringify(r);assert.ok(asc(detailPokemonRows(r)));assert.ok(asc(detailPokemonRows(r,{evolved:true})));for(const s of detailPokemonSections(r))assert.ok(asc(s.pokemon));assert.equal(JSON.stringify(r),before)});
test('Nagasaki retains every encounter, with separate raids, Max, stamps and research',()=>{
 const r=by('BG-0070'),ss=detailPokemonSections(r),group=id=>ss.find(s=>s.id===id).pokemon;
 assert.deepEqual(ss.map(s=>s.id),['raids','max','stamps','research']);
 assert.deepEqual(group('raids').map(p=>p.dex),[488,491,760]);assert.deepEqual(group('max').map(p=>p.dex),[861]);assert.deepEqual(group('stamps').map(p=>p.dex),[181,633,728,760,859]);
 assert.ok(group('research').some(p=>p.dex===635));assert.ok(group('research').some(p=>p.dex===730));assert.equal(group('research').find(p=>p.dex===38).variant_id,'ninetales-alola');
 assert.deepEqual(new Set(ss.flatMap(s=>s.pokemon)),new Set(r.pokemon));assert.equal(r.pokemon.length,20);assert.equal(r.evolved_pokemon.length,6);
});
for(const id of ['BG-0122','BG-0123'])test(`${id} Mega Night has the six announced evening encounters plus added Dragonite and keeps uncertain Inkay outside confirmed raids`,()=>{
 const ss=detailPokemonSections(by(id));assert.deepEqual(ss.find(s=>s.id==='mega-night').pokemon.map(p=>p.dex),[6,149,181,254,334,373,445]);
 assert.deepEqual(ss.find(s=>s.id==='day-raids').pokemon.map(p=>p.dex),[71,130,282,359,448,679,687,716,717]);assert.deepEqual(ss.find(s=>s.id==='unassigned').pokemon.map(p=>p.dex),[686]);assert.equal(new Set(ss.flatMap(s=>s.pokemon)).size,17);
});
test('Fukuoka explicitly distinguishes regular, Dynamax and Gigantamax without replacing original variants',()=>{
 const r=by('BG-0022'),ss=detailPokemonSections(r);assert.deepEqual(ss.map(s=>[s.id,s.pokemon.length]),[['legends',2],['normal',2],['dynamax',2],['gigantamax',1]]);
 for(const p of ss.find(s=>s.id==='dynamax').pokemon){assert.equal(p.dex,849);assert.equal(p.method_status,'reviewed');assert.ok(p.method_sources[0].includes('pokemongolive.com'))}
 assert.equal(pokemonFormLabel(ss.find(s=>s.id==='normal').pokemon[0]),'高調的樣子');assert.equal(pokemonFormLabel(ss.find(s=>s.id==='dynamax').pokemon[1],'en'),'Low Key Form');
 for(const q of ['極巨化顫弦蠑螈','Dynamax Toxtricity','#0849'])assert.ok(backgroundMatch(r,q));assert.equal(new Set(r.pokemon.map(p=>p.variant_id)).size,7);
});
test('new unmatched edited encounters stay visible in an unassigned group',()=>{const r=by('BG-0122'),extra={dex:25,name_en:'Pikachu',name_zh:'皮卡丘'};assert.ok(detailPokemonSections({...r,pokemon:[...r.pokemon,extra]}).find(s=>s.id==='unassigned').pokemon.includes(extra))});
test('unrelated events and original background counts remain unchanged by detail presentation',()=>{const r=by('BG-0265');assert.deepEqual(detailPokemonRows(r),r.pokemon);assert.deepEqual(detailPokemonSections(r),[]);assert.equal(data.records.length,276);assert.equal(groupBackgroundCards(data.records).length,271)});
