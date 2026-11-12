import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const data=JSON.parse(await readFile(new URL('../data/backgrounds.json',import.meta.url),'utf8'));
test('Night Out London BG-0214 is released; each Toxtricity form records catalog evidence and the missing in-game proof',()=>{
 const r=data.records.find(x=>x.background_id==='BG-0214');assert.equal(r.release_state,'released');assert.equal(r.start_date,'2026-11-10');
 for(const [id,zh,en] of [['toxtricity-amped','高調','Amped'],['toxtricity-low-key','低調','Low Key']]){const p=r.pokemon.find(x=>x.variant_id===id);
  assert.equal(p.method_status,'reviewed');assert.equal(p.method_evidence,'catalogs-and-owner-inventory');
  assert.ok(['serebii.net','dittobase.com','pokexperience.com'].every(h=>p.method_sources.some(u=>u.includes(h))));
  assert.match(p.method_zh,new RegExp(zh+'顫弦蠑螈附倫敦地點背景'));assert.match(p.method_zh,/站長另已持有實物/);assert.match(p.method_en,new RegExp(en));assert.match(p.method_en,/owner holds one in-game/)}
 assert.ok(r.notes.some(n=>n.startsWith('2026-11-12')&&n.includes('站長確認手上已有')&&n.includes('結案')));
});
