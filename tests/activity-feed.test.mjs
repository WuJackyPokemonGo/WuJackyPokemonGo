import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {zonedInstant,formatZoned,zoneOffset,collectActivityEvents,activityState,sortActivityEvents,activityTimeLines,activityWindows,activityEarlyAccess} from '../activity-feed-service.mjs';
const data=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url)));const events=collectActivityEvents(data),get=id=>events.find(r=>r.event_id===id);
test('IANA conversions preserve Mexico, half-hour India and date-specific daylight saving',()=>{
 assert.equal(formatZoned(zonedInstant('2026-10-31T10:00','America/Mexico_City'),'Asia/Taipei'),'2026/11/01 00:00');
 assert.equal(formatZoned(zonedInstant('2026-10-31T14:00','America/Mexico_City'),'Asia/Taipei'),'2026/11/01 04:00');
 assert.equal(formatZoned(zonedInstant('2026-11-06T10:00','Asia/Kolkata'),'Asia/Taipei'),'2026/11/06 12:30');
 assert.equal(zoneOffset(zonedInstant('2026-10-24T12:00','America/Los_Angeles'),'America/Los_Angeles'),'UTC−07:00');
 assert.equal(zoneOffset(zonedInstant('2026-11-10T12:00','Europe/London'),'Europe/London'),'UTC+00:00');
 assert.throws(()=>zonedInstant('2026-03-08T02:30','America/Los_Angeles'));assert.throws(()=>zonedInstant('2026-02-30T10:00','Asia/Taipei'));
});
test('official Mexico City event starts at 10:00 and its end boundary is exclusive',()=>{
 const r=get('dia-de-muertos-mexico-city-2026');
 for(const [time,status]of [['2026-10-31T15:59Z','upcoming'],['2026-10-31T16:00Z','in_progress'],['2026-10-31T19:59Z','in_progress'],['2026-10-31T20:00Z','in_progress'],['2026-11-06T02:00Z','ended']])assert.equal(activityState(r,Date.parse(time)).status,status,time);
 const t=activityTimeLines(r);assert.match(t.taiwan,/2026\/11\/01 00:00/);assert.match(t.taiwan,/2026\/11\/06 10:00/);
});
test('reported Mexico windows replace broad inferred hours without asserting official confirmation',()=>{
 const r=get('dia-de-muertos-mexico-city-2026'),windows=activityWindows(r);assert.equal(windows.length,4);
 assert.match(windows[0].local,/2026\/11\/02 19:00 → 2026\/11\/02 20:00/);assert.match(windows[0].taiwan,/2026\/11\/03 09:00 → 2026\/11\/03 10:00/);
 assert.match(windows.at(-1).taiwan,/2026\/11\/06 09:00 → 2026\/11\/06 10:00/);assert.ok(windows.every(w=>w.basis==='pending'&&w.end-w.start===3600000));assert.match(r.activity.window_note_zh,/非官方確認/);assert.match(r.activity.reported_info_zh,/未獲官方確認/);
 const daily=get('wild-area-sendai-2026');assert.equal(activityState(daily,Date.parse('2026-11-06T12:00Z')).session_open,false);assert.equal(activityState(daily,Date.parse('2026-11-06T01:00Z')).session_open,true);assert.equal(activityWindows(daily).length,3);
});
test('date-only events never invent midnight and worldwide local-time events identify Taiwan status basis',()=>{
 const r=get('night-out-los-angeles-2026');assert.equal(activityState(r,Date.parse('2026-10-25T08:00Z')).status,'ended');assert.equal(activityState(r,Date.parse('2026-10-24T20:00Z')).status,'time_unknown');assert.equal(activityState(r,Date.parse('2026-10-25T08:00Z')).basis,'inferred');assert.match(activityTimeLines(r).taiwan,/待當地時刻確認/);assert.doesNotMatch(activityTimeLines(r).local,/00:00/);
 const global=get('wild-area-global-2026');assert.match(activityTimeLines(global,'en').taiwan,/not at one shared Taiwan instant/);assert.equal(activityState(global,Date.parse('2026-11-14T02:00Z')).status,'in_progress');assert.equal(activityWindows(global).length,0);
});
test('feed contains 21 unique events with complete evidence fields without mutating catalog release states',()=>{
 const before=JSON.stringify(data);assert.equal(events.length,21);assert.equal(new Set(events.map(r=>r.event_id )).size,21);
 const statuses=events.map(r=>activityState(r,Date.parse('2026-10-31T00:00Z')).status);assert.equal(statuses.filter(s=>s==='in_progress').length,1);assert.equal(statuses.filter(s=>s==='upcoming').length,19);assert.equal(statuses.filter(s=>s==='ended').length,1);
 for(const r of events.filter(r=>r.activity.kind!=='event')){for(const f of ['conditions_zh','conditions_en','eligible_zh','eligible_en','checked_on','background_type','artwork_status'])assert.ok(r.activity[f],r.event_id+' '+f);assert.ok(r.activity.sources.length);for(const f of ['remote_participation','remote_background'])assert.ok(['confirmed','inferred','pending'].includes(r.activity[f].basis));}
 const sorted=sortActivityEvents(events,Date.parse('2026-10-31T00:00Z'));assert.equal(sorted[0].event_id,'dia-de-muertos-cubone-2026');assert.equal(sorted.at(-1).event_id,'night-out-los-angeles-2026');assert.equal(JSON.stringify(data),before);
 assert.equal(data.records.length,282);assert.equal(data.records.filter(r=>r.release_state==='needs-verification').length,3);
 for(const id of ['wild-area-sendai-2026','wild-area-mexico-city-2026'])assert.equal(get(id).activity.remote_background.basis,'confirmed');assert.equal(get('dia-de-muertos-mexico-city-2026').activity.remote_background.basis,'pending');
 const html=readFileSync(new URL('../backgrounds.html',import.meta.url),'utf8');assert.equal(html.match(/id="announcedBackgrounds"/g).length,1);
});

test("Manila physical launch remains upcoming while its existing cross-region background stays released",()=>{const e=get("pokexciting-manila-launch-2027");assert.equal(e.release_state,"released");assert.equal(e.activity.schedule.start,"2027-01-23T10:00");assert.equal(activityState(e,Date.parse("2026-10-31T00:00Z")).status,"upcoming");assert.match(e.activity.conditions_en,/one month/);assert.match(activityTimeLines(e).taiwan,/2027\/01\/23 10:00/)});

test('early research opening has its own exact boundary without releasing artwork or changing main-event dates',()=>{
 const r=get('festival-of-lights-2026');const before=JSON.stringify(r);
 assert.equal(activityEarlyAccess(r,Date.parse('2026-11-01T00:29:59Z')).open,false);
 const open=activityEarlyAccess(r,Date.parse('2026-11-01T00:30:00Z'));assert.equal(open.open,true);assert.match(open.taiwan,/2026\/11\/01 08:30/);
 assert.equal(activityState(r,Date.parse('2026-11-02T00:00Z')).status,'upcoming');assert.equal(r.activity.artwork_status,'catalogued');assert.match(r.image_source,/serebii\.net\/pokemongo\/locationcard\/th\/festivaloflights\.jpg$/);assert.equal(r.background_id,'BG-0283');
 assert.equal(activityEarlyAccess(r,Date.parse('2026-11-06T04:30Z')),null);assert.equal(activityState(r,Date.parse('2026-11-06T04:30Z')).status,'in_progress');assert.equal(JSON.stringify(r),before);
 assert.equal(activityEarlyAccess(get('wild-area-sendai-2026'),Date.parse('2026-11-02T00:00Z')),null);
});

test('November calendar includes four missing events without asserting background rewards',()=>{
 for(const id of ['halloween-part-two-2026','minior-leonids-2026','twilight-wishes-2026','super-mega-raid-day-2026-11']){
  const e=get(id);assert.equal(e.activity.kind,'event');assert.ok(e.activity.sources[0].startsWith('https://pokemongo.com/'));
 }
 assert.equal(get('super-mega-raid-day-2026-11').activity.schedule.start,'2026-11-28T14:00');
 assert.equal(get('super-mega-raid-day-2026-11').activity.schedule.end,'2026-11-28T17:00');
 assert.equal(get('minior-leonids-2026').activity.schedule.start,'2026-11-14T17:00');
 assert.equal(get('twilight-wishes-2026').activity.schedule.end,'2026-11-30T20:00');
});
