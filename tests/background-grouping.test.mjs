import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterBackgrounds,groupBackgroundCards,ANCIENTS_RECOVERED_IDS,referenceArtwork} from '../backgrounds-service.mjs';
const records=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url))).records;
const refs=JSON.parse(readFileSync(new URL('../data/background-reference-facts.json',import.meta.url)));
test('only the six named Regi records group, without mutating any original record',()=>{
 const before=JSON.stringify(records),cards=groupBackgroundCards(records),g=cards.find(c=>c.activity_id);
 assert.equal(cards.length,records.length-5);assert.deepEqual(g.members.map(r=>r.background_id),ANCIENTS_RECOVERED_IDS);
 assert.equal(new Set(g.members.map(r=>referenceArtwork(r,refs))).size,6);
 const ungrouped=records.filter(r=>!ANCIENTS_RECOVERED_IDS.includes(r.background_id));
 assert.deepEqual(cards.filter(c=>!c.activity_id),ungrouped);assert.equal(JSON.stringify(records),before);
});
for(const id of ANCIENTS_RECOVERED_IDS){const r=records.find(r=>r.background_id===id),p=r.pokemon[0];for(const query of [p.name_zh,p.name_en,String(p.dex),'#'+String(p.dex).padStart(4,'0')])test(`search ${query} retains original ${id} and highlights it in the six-variant activity`,()=>{
 const eligible=filterBackgrounds(records),matches=filterBackgrounds(records,{query}),g=groupBackgroundCards(matches,{eligibleRows:eligible}).find(c=>c.activity_id);
 assert.ok(g.matchedIds.includes(id));assert.equal(g.members.length,6);assert.ok(g.members.includes(r));
});}
test('group does not restore entries excluded by non-search filters or overrides',()=>{
 const allowed=records.filter(r=>r.background_id!=='BG-0271'),cards=groupBackgroundCards(filterBackgrounds(allowed,{query:'Regirock'}),{eligibleRows:filterBackgrounds(allowed)});
 assert.equal(cards.find(c=>c.activity_id).members.length,5);
 assert.ok(!groupBackgroundCards(filterBackgrounds(records,{year:'2026'})).some(c=>c.activity_id));
 assert.ok(!groupBackgroundCards(filterBackgrounds(records,{type:'location'})).some(c=>c.activity_id));
});
test('released and all-entry counts are independent from presentation-card counts',()=>{
 assert.equal(records.length,276);const released=filterBackgrounds(records);assert.equal(released.length,269);assert.equal(groupBackgroundCards(released).length,264);assert.equal(groupBackgroundCards(records).length,271);
});
