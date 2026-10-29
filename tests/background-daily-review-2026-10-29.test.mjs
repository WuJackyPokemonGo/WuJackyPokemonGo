import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {filterBackgroundAnnouncements,filterBackgrounds,groupBackgroundCards} from '../backgrounds-service.mjs';
const data=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url)));const rows=data.additional_announced_events;
test('announced previews respect state, stock, dex, year, region and language search without affecting released counts',()=>{
 const count=filterBackgrounds(data.records).length;
 assert.equal(filterBackgroundAnnouncements(rows,{state:'pending'}).length,0);
 assert.equal(filterBackgroundAnnouncements(rows,{state:'official'}).length,0);
 assert.equal(filterBackgroundAnnouncements(rows,{state:'all',stockOnly:true}).length,0);
 for(const query of ['Dynamax Trails','特殊背景預告'])assert.equal(filterBackgroundAnnouncements(rows,{query}).filter(x=>x.event_id==='dynamax-trails-2026').length,1);
 assert.ok(filterBackgroundAnnouncements(rows,{query:'#0624',year:'2026',region:'Global'}).some(x=>x.event_id==='pawniard-community-day-2026'));
 assert.equal(filterBackgroundAnnouncements(rows,{query:'Dynamax Trails',region:'India'}).length,0);
 assert.equal(filterBackgrounds(data.records).length,count);assert.equal(count,271);
});
test('Dynamax Trails is upcoming, no substituted artwork or asserted Eternatus encounter and no duplicate event',()=>{
 const found=rows.filter(x=>x.event_id==='dynamax-trails-2026');assert.equal(found.length,1);const r=found[0];
 assert.equal(r.release_state,'upcoming');assert.equal(r.image_source,null);assert.equal(r.start_date,'2026-11-16');assert.equal(r.end_date,'2026-11-23');
 assert.match(r.notes_en.join(' '),/non-Legendary, non-Mythical/);assert.match(r.notes_en.join(' '),/not evidence of a Dark Skies rerun/);assert.match(r.notes_en.join(' '),/without a promised background/);
 assert.ok(!data.records.some(x=>x.name_en.includes('Dynamax Trails')));
});
test('Pawniard reuses the annual background but its future date and acquisition conditions stay explicit',()=>{
 const r=data.records.find(x=>x.background_id==='BG-0240'),p=r.pokemon.find(x=>x.dex===624);
 assert.equal(r.pokemon.filter(x=>x.dex===624).length,1);assert.equal(p.start_date,'2026-11-21');assert.match(p.method_en,/Upcoming/);assert.match(p.method_en,/14:00–21:00/);
 assert.ok(r.official_sources.includes('https://pokemongo.com/news/communityday-november-2026-pawniard'));
 const a=rows.find(x=>x.event_id==='pawniard-community-day-2026');assert.equal(a.background_id,r.background_id);assert.equal(a.release_state,'upcoming');
});
test('Wild Area clarification does not turn stamp rewards or remote battles into confirmed background routes',()=>{
 for(const id of ['BG-0212','BG-0213']){const r=data.records.find(x=>x.background_id===id);assert.equal(r.release_state,'upcoming');assert.equal(r.pokemon.length,6);assert.match(r.date_note_en,/main ticketed day only, 10:00–20:00/);assert.match(r.date_note_en,/Extra Day/);assert.match(r.method_en,/remote battles do not award/);assert.match(r.notes_en.join(' '),/stamp rally are not promised/);assert.match(r.pokemon.find(x=>x.dex===884).method_en,/Special Research explicitly/)}
 assert.deepEqual(groupBackgroundCards(data.records).filter(x=>x.activity_id).map(x=>x.activity_id),['ancients-recovered']);
});
