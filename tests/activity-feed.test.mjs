import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {zonedInstant,formatZoned,zoneOffset,collectActivityEvents,activityState,sortActivityEvents,activityTimeLines,activityWindows} from '../activity-feed-service.mjs';
const data=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url)));const events=collectActivityEvents(data),get=id=>events.find(r=>r.event_id===id);
test('IANA conversions preserve Mexico, half-hour India and date-specific daylight saving',()=>{
 assert.equal(formatZoned(zonedInstant('2026-10-31T10:00','America/Mexico_City'),'Asia/Taipei'),'2026/11/01 00:00');
 assert.equal(formatZoned(zonedInstant('2026-10-31T14:00','America/Mexico_City'),'Asia/Taipei'),'2026/11/01 04:00');
 assert.equal(formatZoned(zonedInstant('2026-11-06T10:00','Asia/Kolkata'),'Asia/Taipei'),'2026/11/06 12:30');
 assert.equal(zoneOffset(zonedInstant('2026-10-24T12:00','America/Los_Angeles'),'America/Los_Angeles'),'UTC−07:00');
 assert.equal(zoneOffset(zonedInstant('2026-11-10T12:00','Europe/London'),'Europe/London'),'UTC+00:00');
 assert.throws(()=>zonedInstant('2026-03-08T02:30','America/Los_Angeles'));assert.throws(()=>zonedInstant('2026-02-30T10:00','Asia/Taipei'));
});
test('conflicting starts remain unresolved between candidates and end boundary is exclusive',()=>{
 const r=get('dia-de-muertos-mexico-city-2026');
 for(const [time,status]of [['2026-10-31T15:59Z','upcoming'],['2026-10-31T16:00Z','time_unknown'],['2026-10-31T19:59Z','time_unknown'],['2026-10-31T20:00Z','in_progress'],['2026-11-06T02:00Z','ended']])assert.equal(activityState(r,Date.parse(time)).status,status,time);
 const t=activityTimeLines(r);assert.match(t.taiwan,/2026\/11\/01 00:00 或 2026\/11\/01 04:00/);assert.match(t.taiwan,/2026\/11\/06 10:00/);
});
test('daily Max windows exclude overnight and retain both first-day scenarios without duplicate later days',()=>{
 const windows=activityWindows(get('dia-de-muertos-mexico-city-2026'));assert.equal(windows.length,7);assert.equal(new Set(windows.map(x=>x.start+':'+x.end)).size,7);
 assert.match(windows[0].local,/10:00/);assert.match(windows[1].local,/14:00/);assert.ok(windows.every(x=>x.basis==='inferred'));assert.match(windows.at(-1).local,/2026\/11\/05 20:00$/);assert.match(windows.at(-1).taiwan,/2026\/11\/06 10:00$/);
 for(const w of windows)assert.ok(w.end>w.start&&w.end-w.start<=15*3600000);
 const daily=get('wild-area-sendai-2026');assert.equal(activityState(daily,Date.parse('2026-11-06T12:00Z')).session_open,false);assert.equal(activityState(daily,Date.parse('2026-11-06T01:00Z')).session_open,true);assert.equal(activityWindows(daily).length,3);
});
test('date-only events never invent midnight and worldwide local-time events identify Taiwan status basis',()=>{
 const r=get('night-out-los-angeles-2026');assert.equal(activityState(r,Date.parse('2026-10-25T08:00Z')).status,'ended');assert.equal(activityState(r,Date.parse('2026-10-24T20:00Z')).status,'time_unknown');assert.equal(activityState(r,Date.parse('2026-10-25T08:00Z')).basis,'inferred');assert.match(activityTimeLines(r).taiwan,/待當地時刻確認/);assert.doesNotMatch(activityTimeLines(r).local,/00:00/);
 const global=get('wild-area-global-2026');assert.match(activityTimeLines(global,'en').taiwan,/not at one shared Taiwan instant/);assert.equal(activityState(global,Date.parse('2026-11-14T02:00Z')).status,'in_progress');assert.equal(activityWindows(global).length,0);
});
test('feed contains 14 unique events with complete evidence fields without mutating catalog release states',()=>{
 const before=JSON.stringify(data);assert.equal(events.length,14);assert.equal(new Set(events.map(r=>r.event_id)).size,14);
 const statuses=events.map(r=>activityState(r,Date.parse('2026-10-31T00:00Z')).status);assert.equal(statuses.filter(s=>s==='in_progress').length,1);assert.equal(statuses.filter(s=>s==='upcoming').length,12);assert.equal(statuses.filter(s=>s==='ended').length,1);
 for(const r of events){for(const f of ['conditions_zh','conditions_en','eligible_zh','eligible_en','checked_on','background_type','artwork_status'])assert.ok(r.activity[f],r.event_id+' '+f);assert.ok(r.activity.sources.length);for(const f of ['remote_participation','remote_background'])assert.ok(['confirmed','inferred','pending'].includes(r.activity[f].basis));}
 const sorted=sortActivityEvents(events,Date.parse('2026-10-31T00:00Z'));assert.equal(sorted[0].event_id,'dia-de-muertos-cubone-2026');assert.equal(sorted.at(-1).event_id,'night-out-los-angeles-2026');assert.equal(JSON.stringify(data),before);
 assert.equal(data.records.length,278);assert.equal(data.records.filter(r=>r.release_state==='needs-verification').length,3);
 for(const id of ['wild-area-sendai-2026','wild-area-mexico-city-2026'])assert.equal(get(id).activity.remote_background.basis,'confirmed');assert.equal(get('dia-de-muertos-mexico-city-2026').activity.remote_background.basis,'pending');
 const html=readFileSync(new URL('../backgrounds.html',import.meta.url),'utf8');assert.equal(html.match(/id="announcedBackgrounds"/g).length,1);
});

test("Manila physical launch remains upcoming while its existing cross-region background stays released",()=>{const e=get("pokexciting-manila-launch-2027");assert.equal(e.release_state,"released");assert.equal(e.activity.schedule.start,"2027-01-23T10:00");assert.equal(activityState(e,Date.parse("2026-10-31T00:00Z")).status,"upcoming");assert.match(e.activity.conditions_en,/one month/);assert.match(activityTimeLines(e).taiwan,/2027\/01\/23 10:00/)});
