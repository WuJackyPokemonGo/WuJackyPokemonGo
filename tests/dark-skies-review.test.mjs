import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {backgroundMatch} from '../backgrounds-service.mjs';
import {detailPokemonSections} from '../backgrounds-detail-service.mjs';
const data=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url)));
const row=data.records.find(r=>r.background_id==='BG-0235');
test('Dark Skies aliases and future dex/name queries reach the same stable record',()=>{
 for(const q of ['紫黑','紫黑背景','Dark Skies','暗黑蒼穹','皮卡丘','#0884','０８８４'])assert.ok(backgroundMatch(row,q),q);
});
test('historical Max encounters preserve 38 Dynamax and 14 separately tracked Gigantamax forms',()=>{
 const sections=detailPokemonSections(row);
 assert.deepEqual(sections.map(s=>s.pokemon.length),[38,14]);
 assert.equal(row.pokemon.length,52);assert.equal(row.evolved_pokemon.length,36);
 assert.deepEqual(row.pokemon.filter(p=>p.variant_id.startsWith('toxtricity-gigantamax')).map(p=>p.variant_id).sort(),['toxtricity-gigantamax-amped','toxtricity-gigantamax-low-key']);
 assert.ok(!row.pokemon.some(p=>p.dex===848));assert.ok(!(row.unconfirmed_pokemon??[]).some(p=>p.dex===848));
 for(const q of ['毒電嬰','Toxel','#0848'])assert.equal(backgroundMatch(row,q),false,q);
});
test('announced 2026 candidates never count as historical releases or establish shiny availability',()=>{
 assert.equal(row.upcoming_pokemon.length,54);
 assert.ok(row.upcoming_pokemon.every(p=>p.release_state==='upcoming'&&p.start_date==='2026-11-16'&&p.method_status==='unconfirmed'&&!('shiny' in p)));
 assert.ok(!row.upcoming_pokemon.some(p=>[144,145,146,243,244,245,380,381,848,890].includes(p.dex)));
 for(const dex of [25,58,63,106,107,111,125,126,133,163,215,237,280,303,328,415,524,527,633,686,761,780,850,857,884])assert.ok(row.upcoming_pokemon.some(p=>p.dex===dex),dex);
 assert.equal(new Set(row.upcoming_pokemon.map(p=>p.variant_id)).size,54);
 assert.ok(!row.pokemon.some(p=>p.dex===25));
 assert.equal(row.start_date,'2025-08-18');assert.equal(row.end_date,'2025-08-24');
});
