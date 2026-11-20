import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {filterBackgroundAnnouncements,filterBackgrounds,groupBackgroundCards} from '../backgrounds-service.mjs';
const data=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url)));const rows=data.additional_announced_events;
test('announced previews respect state, stock, dex, year, region and language search without affecting released counts',()=>{
 const count=filterBackgrounds(data.records).length;
 assert.equal(filterBackgroundAnnouncements(rows,{state:'pending'}).length,0);
 assert.equal(filterBackgroundAnnouncements(rows,{state:'official'}).length,0);
 assert.equal(filterBackgroundAnnouncements(rows,{state:'all',stockOnly:true}).length,0);
 for(const query of ['Dynamax Trails','巨大足跡 2026 特殊背景'])assert.equal(filterBackgroundAnnouncements(rows,{query}).filter(x=>x.event_id==='dynamax-trails-2026').length,1);
 assert.ok(filterBackgroundAnnouncements(rows,{query:'#0624',year:'2026',region:'Global'}).some(x=>x.event_id==='pawniard-community-day-2026'));
 assert.equal(filterBackgroundAnnouncements(rows,{query:'Dynamax Trails',region:'India'}).length,0);
 assert.equal(filterBackgrounds(data.records).length,count);assert.equal(count,277);
});
test('Dynamax Trails is live, reuses Dark Skies without asserting Eternatus or unverified Max Battle routes',()=>{
 const found=rows.filter(x=>x.event_id==='dynamax-trails-2026');assert.equal(found.length,1);const r=found[0];
 assert.equal(r.release_state,'released');assert.equal(r.image_source,data.records.find(x=>x.background_id==='BG-0235').image_source);assert.deepEqual(r.activity.background_ids,['BG-0235']);assert.equal(r.start_date,'2026-11-16');assert.equal(r.end_date,'2026-11-23');
 assert.match(r.notes_en.join(' '),/non-Legendary, non-Mythical/);assert.match(r.notes_en.join(' '),/Dark Skies.*Max Battle distribution and remote background eligibility still need evidence/);assert.match(r.notes_en.join(' '),/without a promised background/);
 assert.ok(!data.records.some(x=>x.name_en.includes('Dynamax Trails')));
});
test('Pawniard reuses the annual background but its future date and acquisition conditions stay explicit',()=>{
 const r=data.records.find(x=>x.background_id==='BG-0240'),p=r.pokemon.find(x=>x.dex===624);
 assert.equal(r.pokemon.filter(x=>x.dex===624).length,1);assert.equal(p.start_date,'2026-11-21');assert.match(p.method_en,/Upcoming/);assert.match(p.method_en,/14:00–21:00/);
 assert.ok(r.official_sources.includes('https://pokemongo.com/news/communityday-november-2026-pawniard'));
 const a=rows.find(x=>x.event_id==='pawniard-community-day-2026');assert.equal(a.background_id,r.background_id);assert.equal(a.release_state,'upcoming');
});
test('Wild Area clarification does not turn stamp rewards or remote battles into confirmed background routes',()=>{
 for(const id of ['BG-0212','BG-0213']){const r=data.records.find(x=>x.background_id===id);assert.equal(r.release_state,'released');assert.equal(r.pokemon.length,id==='BG-0212'?20:7);assert.ok(r.pokemon.some(x=>x.dex===(id==='BG-0212'?131:701)&&x.method_status==='reviewed'));assert.equal(data.redirects[id==='BG-0212'?'BG-0281':'BG-0282'],id);assert.match(r.date_note_en,/main ticketed day only, 10:00–20:00/);assert.match(r.date_note_en,/Extra Day/);assert.match(r.method_en,/remote battles do not award/);assert.match(r.notes_en[0],/stamp rally are not promised/);if(id==='BG-0212'){assert.match(r.pokemon.find(p=>p.dex===705).method_en,/stamp 5/);assert.equal(r.pokemon.filter(p=>p.method_en.includes('Timed Research')).length,12);}assert.match(r.pokemon.find(x=>x.dex===884).method_en,/Special Research explicitly/)}
 assert.deepEqual(groupBackgroundCards(data.records).filter(x=>x.activity_id).map(x=>x.activity_id),['ancients-recovered']);
});
test('Duolingo stays upcoming until its seven-day research can be claimed and separates direct encounters from evolutions',()=>{
 const r=data.records.find(x=>x.background_id==='BG-0286');assert.ok(r);
 assert.equal(r.release_state,'upcoming');assert.equal(r.image_source,'https://pokexperience.com/pokemon-variants/backgrounds/duolingo.webp?v=20260816');
 assert.deepEqual(r.pokemon.map(x=>x.dex),[25,52,441,448]);assert.deepEqual(r.evolved_pokemon.map(x=>x.dex),[26,53]);assert.ok(r.evolved_pokemon.every(x=>x.acquisition==='evolution'));
 assert.equal(r.activity.id,'duolingo-2026');assert.equal(r.activity.schedule.start,'2026-11-17T09:00');assert.equal(r.activity.schedule.end,'2026-12-31T23:59');
 assert.match(r.date_note_en,/seven different days/i);assert.match(r.notes_en.join(' '),/remains upcoming/i);
});
test('Gunma keeps its date blank until firsthand redemption evidence resolves conflicting catalog dates',()=>{
 const r=data.records.find(x=>x.background_id==='BG-0285');assert.ok(r);
 assert.equal(r.release_state,'upcoming');assert.equal(r.start_date,undefined);assert.equal(r.checked_on,'2026-11-20');
 assert.ok(r.catalog_sources.includes('https://pokemongo-raku.com/post130804'));
 assert.match(r.notes_en.join(' '),/no traceable original player redemption screenshot or video/i);
 assert.match(r.notes_en.join(' '),/October 23.*November 9/i);
});
