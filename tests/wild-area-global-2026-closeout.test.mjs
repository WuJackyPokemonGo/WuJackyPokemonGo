import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const data=JSON.parse(await readFile(new URL('../data/backgrounds.json',import.meta.url),'utf8'));
test('Wild Area Global 2026 (BG-0284) closeout: released, in-game artwork, 13 Pokémon, Hero-form Zacian/Zamazenta, guaranteed G-Max Duraludon research',()=>{
 const r=data.records.find(x=>x.background_id==='BG-0284');assert.equal(r.release_state,'released');assert.equal(r.start_date,'2026-11-09');
 assert.equal(r.image_source,'https://assets.dittobase.com/go/backgrounds/sb-wild-area-global-2026.jpg','in-game artwork matching Serebii and Dittobase, not the pre-event lake variant');
 assert.equal(r.pokemon.length,13);for(const dex of [888,889])assert.match(r.pokemon.find(p=>p.dex===dex).name_en,/Hero of Many Battles/);
 assert.match(r.method_zh,/保證遇到附背景的超極巨鋁鋼龍/);assert.equal(r.activity.remote_background.basis,'inferred','remote eligibility stays inferred until officially stated');
 assert.ok(r.notes.some(n=>n.startsWith('2026-11-16 結案查核')));
});
