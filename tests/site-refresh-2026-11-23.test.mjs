import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activityState,buildActivityFeed,eventTimeKind,eventDateLabel,eventCountdown,visitorTimeLine,eventBackgroundState,eventGroup,eventPokemon} from '../activity-feed-service.mjs';
import {groupRowsByPlace,clusterPlaces,projectLonLat} from '../backgrounds-map.mjs';
import {filterBackgrounds} from '../backgrounds-service.mjs';
import {ACTIVITY_FEED_URL,BACKGROUNDS_DATA_URL} from '../background-data.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const data=JSON.parse(read('data/backgrounds.json')),feed=JSON.parse(read('data/activity-feed.json')),locations=JSON.parse(read('data/background-locations.json'));
const ev=id=>feed.events.find(e=>e.event_id===id);

test('home event feed is generated from the single background source (run npm run build after data changes)',()=>{
 assert.deepEqual(feed,JSON.parse(JSON.stringify(buildActivityFeed(data))));
 assert.equal(ACTIVITY_FEED_URL.split('?')[1],BACKGROUNDS_DATA_URL.split('?')[1],'feed shares the data version');
 assert.ok(feed.events.length>=38,'activity feed keeps every event added since 11/23');
 for(const e of feed.events)for(const id of e.background_ids)assert.ok(feed.backgrounds[id],e.event_id+' '+id);
});
test('linked backgrounds and products reuse existing stable ids',()=>{
 const ids=new Set(data.records.map(r=>r.background_id));
 for(const id of Object.keys(feed.backgrounds))assert.ok(ids.has(id));
 const linked=ev('night-out-los-angeles-2026');assert.deepEqual(linked.background_ids,['BG-0211']);
 const record=data.records.find(r=>r.background_id==='BG-0211');for(const p of record.related_product_ids)assert.ok(linked.related_product_ids.includes(p));
});
test('event schedule state and background availability stay separate',()=>{
 const duo=ev('duolingo-2026');assert.equal(eventGroup(duo,Date.parse('2026-11-23T03:00Z')),'live');assert.equal(eventBackgroundState(duo,feed),'released','BG-0286 confirmed released on 11/24');
 assert.equal(eventBackgroundState(ev('super-mega-raid-day-2026-11'),feed),'none');
 assert.ok(eventPokemon(ev('wild-area-global-2026'),feed).length>=10,'falls back to linked background Pokémon');
});
test('time rules: local-time vs fixed vs date-only, countdown target, visitor clock',()=>{
 const rolling=ev('twilight-wishes-2026'),fixed=ev('apple-store-japan-2026'),dateOnly=ev('season-25-2026-12-19');
 assert.equal(eventTimeKind(rolling),'rolling');assert.equal(eventTimeKind(fixed),'fixed');assert.equal(eventTimeKind(dateOnly),'date');
 assert.match(eventDateLabel(dateOnly),/2026\/12\/19（時間待公布）/);assert.doesNotMatch(eventDateLabel(dateOnly),/00:00/);
 assert.equal(eventCountdown(dateOnly,Date.parse('2026-12-01T00:00Z')),null,'no countdown without announced hours');
 // A local-time event counts down in the visitor's own zone; a fixed event in the event zone.
 const london=eventCountdown(rolling,Date.parse('2026-11-24T09:00Z'),'Europe/London');assert.equal(london.target,'start');assert.equal(london.clock,'Europe/London');assert.equal(london.ms,3600000);
 const tokyo=eventCountdown(fixed,Date.parse('2026-11-16T00:00Z'),'Europe/London');assert.equal(tokyo.clock,'Asia/Tokyo');assert.equal(tokyo.target,'start');assert.equal(tokyo.ms,3600000);
 assert.equal(eventCountdown(fixed,Date.parse('2026-11-20T00:00Z'),'Asia/Taipei').target,'end');
 assert.match(visitorTimeLine(fixed,'America/New_York','zh'),/你的時間（America\/New_York）：2026\/11\/15 20:00/);
 assert.equal(visitorTimeLine(fixed,'Asia/Tokyo','zh'),null,'same zone needs no extra line');
 assert.match(visitorTimeLine(rolling,'Europe/London','zh'),/同樣依當地時間 10:00/);
});
test('every location background is either mapped to a reliable place or explicitly list-only',()=>{
 const location=data.records.filter(r=>r.type==='location');
 for(const r of location)assert.ok(locations.assignments[r.background_id]||locations.unmapped[r.background_id],r.background_id);
 for(const [id,key] of Object.entries(locations.assignments)){const p=locations.places[key];assert.ok(p,id);assert.ok(p.lat>=-90&&p.lat<=90&&p.lon>=-180&&p.lon<=180,key);assert.ok(['city','site','prefecture'].includes(p.precision));assert.ok(location.some(r=>r.background_id===id),'only location records are mapped: '+id)}
 for(const id of ['BG-0189','BG-0195','BG-0287','BG-0276','BG-0277'])assert.ok(locations.unmapped[id],'multi-airport jets and unconfirmed assets stay off the map');
});
test('map and list use the same filtered rows: mapped + unmapped + special = list total',()=>{
 for(const filters of [{},{query:'GO Fest'},{year:'2025'},{region:'Japan'},{type:'special'},{state:'all'}]){
  const rows=filterBackgrounds(data.records,filters),g=groupRowsByPlace(rows,locations);
  assert.equal(g.places.reduce((n,p)=>n+p.rows.length,0)+g.unmapped.length+g.special.length,rows.length,JSON.stringify(filters));
 }
 const tokyo=groupRowsByPlace(filterBackgrounds(data.records),locations).places.find(p=>p.key==='tokyo');assert.ok(tokyo.rows.length>=5,'one city can hold several entries');
});
test('clusters merge nearby places only within the radius',()=>{
 const [x1,y1]=projectLonLat(139.69,35.68),[x2,y2]=projectLonLat(139.64,35.44),[x3,y3]=projectLonLat(-0.13,51.51);
 const places=[{key:'tokyo',x:x1,y:y1,rows:[1,2]},{key:'yokohama',x:x2,y:y2,rows:[1]},{key:'london',x:x3,y:y3,rows:[1]}];
 assert.equal(clusterPlaces(places,5).length,2);assert.equal(clusterPlaces(places,0.1).length,3);
});
test('pages keep unique ids, the map/viewer controls, and the home search before events and regions',()=>{
 for(const page of ['index.html','backgrounds.html']){const html=read(page),ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,page+' has duplicate ids')}
 const home=read('index.html');assert.ok(home.indexOf('id="quickSearch"')<home.indexOf('id="homeEvents"'));assert.ok(home.indexOf('id="homeEvents"')<home.indexOf('class="region-showcase"'));
 const atlas=read('backgrounds.html');for(const id of ['mapView','worldMap','placeList','bgViewer','viewerPrev','viewerNext','globalEntry','zoomDetail'])assert.ok(atlas.includes(`id="${id}"`),id);
 assert.match(atlas,/data-view="map" aria-pressed="false"/);
});
test('cross-day: a Mexico City event that ends 11/08 18:00 local is still live at Taiwan 11/09 07:30 and ended at 08:30',()=>{
 const mx=ev('wild-area-mexico-city-2026');
 assert.equal(activityState(mx,Date.parse('2026-11-09T07:30+08:00')).status,'in_progress');
 assert.equal(activityState(mx,Date.parse('2026-11-09T08:30+08:00')).status,'ended');
 assert.equal(eventTimeKind(mx),'fixed');assert.match(visitorTimeLine(mx,'Asia/Taipei','zh')??'',/^$/);
 assert.match(visitorTimeLine(mx,'Europe/London','zh'),/2026\/11\/06 16:00 → 2026\/11\/09 00:00/);
});
test('Duolingo: fixed global start, deadline in each visitor\'s local time (official: "11:59 p.m. local time")',()=>{
 const duo=ev('duolingo-2026');assert.equal(duo.activity.schedule.end_local,true);
 const ny=eventCountdown(duo,Date.parse('2026-12-31T12:00Z'),'America/New_York');assert.equal(ny.target,'end');assert.equal(ny.clock,'America/New_York');
 assert.equal(ny.ms,Date.parse('2027-01-01T04:59Z')-Date.parse('2026-12-31T12:00Z'),'counts to 12/31 23:59 New York time');
 assert.match(visitorTimeLine(duo,'America/New_York','zh'),/2026\/11\/16 20:00.*截止同樣依當地時間 2026\/12\/31 23:59/);
 assert.equal(eventCountdown(duo,Date.parse('2026-11-16T00:00Z'),'America/New_York').clock,'Asia/Taipei','start stays one global moment');
});
