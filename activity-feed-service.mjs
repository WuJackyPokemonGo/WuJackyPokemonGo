// Event time is separate from artwork release and from product inventory.
const parts=(date,zone)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(date)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
export function zonedInstant(local,zone){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw Error('An explicit local date and time is required');
 const [y,m,d,h,min]=local.match(/\d+/g).map(Number),wall=Date.UTC(y,m-1,d,h,min);let value=wall;
 for(let i=0;i<4;i++){const p=parts(value,zone),offset=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-value,next=wall-offset;if(next===value)break;value=next}
 const p=parts(value,zone);if(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`!==local)throw Error('Invalid or nonexistent local time');return value;
}
export function formatZoned(value,zone){const p=parts(value,zone);return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}`}
export function zoneOffset(value,zone){const p=parts(value,zone),minutes=(Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-value)/60000;return 'UTC'+(minutes>=0?'+':'−')+String(Math.floor(Math.abs(minutes)/60)).padStart(2,'0')+':'+String(Math.abs(minutes)%60).padStart(2,'0')}
const calendarDay=(value,zone)=>{const p=parts(value,zone);return `${p.year}-${p.month}-${p.day}`};
export function collectActivityEvents(data){
 const list=[...(data.additional_announced_events??[]),...(data.records??[]).filter(r=>r.activity)];const seen=new Set();
 return list.filter(r=>r.activity).map(r=>({...r,event_id:r.activity.id,background_ids:r.activity.background_ids??(r.background_id?[r.background_id]:[])})).filter(r=>{if(seen.has(r.event_id))return false;seen.add(r.event_id);return true});
}
export function activityState(event,now=Date.now()){
 const s=event.activity.schedule,zone=s.zone||'Asia/Taipei';
 if(s.date_only){const day=calendarDay(now,zone);return {status:day<s.start_date?'upcoming':day>s.end_date?'ended':'time_unknown',basis:day>s.end_date?'inferred':'confirmed',session_open:null}}
 const starts=[s.start,...(s.alternative_starts??[]).map(x=>x.local)].map(x=>zonedInstant(x,zone)).sort((a,b)=>a-b),end=s.end?zonedInstant(s.end,zone):s.open_ended?Infinity:zonedInstant(s.end,zone);
 if(now>=end)return {status:'ended',basis:'confirmed',session_open:false};if(now<starts[0])return {status:'upcoming',basis:'confirmed',session_open:false};
 if(now<starts.at(-1))return {status:'time_unknown',basis:'pending',session_open:null};
 let session=null;if(s.daily){const p=parts(now,zone),clock=`${p.hour}:${p.minute}`;session=clock>=s.daily.start&&clock<s.daily.end}
 return {status:'in_progress',basis:'confirmed',session_open:session};
}
// An early research opening is distinct from the main event and artwork release.
// Hide this preview once the main event starts; this does not assert a research deadline.
export function activityEarlyAccess(event,now=Date.now()){
 const p=event.activity.early_access,s=event.activity.schedule;if(!p||s.date_only)return null;
 const zone=p.zone??s.zone,start=zonedInstant(p.start,zone),mainStart=zonedInstant(s.start,s.zone);
 if(now>=mainStart)return null;
 return {kind:p.kind??'research',open:now>=start,local:formatZoned(start,zone)+' · '+zone+' ('+zoneOffset(start,zone)+')',taiwan:formatZoned(start,'Asia/Taipei')+' · UTC+08:00'};
}
export function sortActivityEvents(events,now=Date.now()){
 const rank={in_progress:0,time_unknown:1,upcoming:2,ended:3},time=e=>{const s=e.activity.schedule;return zonedInstant(s.date_only?s.start_date+'T00:00':s.start,s.zone||'Asia/Taipei')};
 return [...events].sort((a,b)=>{const sa=activityState(a,now).status,sb=activityState(b,now).status;return rank[sa]-rank[sb]||(sa==='ended'?time(b)-time(a):time(a)-time(b))||a.event_id.localeCompare(b.event_id)});
}
export function activityTimeLines(event,locale='zh'){
 const s=event.activity.schedule,zone=s.zone||'Asia/Taipei',zh=locale!=='en';
 if(s.date_only)return {local:`${s.start_date} – ${s.end_date} · ${s.rolling_local?(zh?'日期待各地公告確認':'Regional dates await confirmation'):zone} · ${zh?'起訖時刻待公布':'start/end hours unannounced'}`,taiwan:zh?'台灣起訖時間：待當地時刻確認後換算':'Taiwan start/end: awaiting confirmed local hours'};
 if(s.open_ended&&!s.end){const start=zonedInstant(s.start,zone),tail=zh?'未定結束日':'no end date announced';return s.rolling_local?{local:(zh?'各地當地時間：':'Each region’s local time: ')+s.start.replace('T',' ')+' → '+tail,taiwan:(zh?'台灣：':'Taiwan: ')+formatZoned(start,'Asia/Taipei')+' → '+tail+' · UTC+08:00'}:{local:formatZoned(start,zone)+' → '+tail+` · ${zone} (${zoneOffset(start,zone)})`,taiwan:(zh?'台灣：':'Taiwan: ')+formatZoned(start,'Asia/Taipei')+' → '+tail+' · UTC+08:00'}}
 const start=zonedInstant(s.start,zone),end=zonedInstant(s.end,zone),candidates=[start,...(s.alternative_starts??[]).map(x=>zonedInstant(x.local,zone))];
 const local=candidates.map(x=>formatZoned(x,zone)).join(zh?' 或 ':' or ')+' → '+formatZoned(end,zone)+` · ${zone} (${zoneOffset(start,zone)})`;
 if(s.rolling_local)return {local:(zh?'各地當地時間：':'Each region’s local time: ')+s.start.replace('T',' ')+' → '+s.end.replace('T',' '),taiwan:(zh?'台灣場：':'Taiwan schedule: ')+formatZoned(start,'Asia/Taipei')+' → '+formatZoned(end,'Asia/Taipei')+' · UTC+08:00'+(zh?'；海外依各地當地時間開始，沒有單一台灣換算時刻。':'; overseas regions start in their own local time, not at one shared Taiwan instant.')};
 return {local:(s.reference_local?(zh?'墨西哥城時區示例（各地依當地時間）：':'Mexico City timezone example (each region follows local time): '):'')+local,taiwan:(s.reference_local?(zh?'台灣換算（墨西哥城示例）：':'Taiwan conversion (Mexico City example): '):(zh?'台灣：':'Taiwan: '))+candidates.map(x=>formatZoned(x,'Asia/Taipei')).join(zh?' 或 ':' or ')+' → '+formatZoned(end,'Asia/Taipei')+' · UTC+08:00'};
}
export function activityWindows(event){
 const s=event.activity.schedule,w=event.activity.battle_window??s.daily;if(!w||s.date_only||s.rolling_local||!s.end)return [];
 const zone=s.zone,begin=[s.start.slice(0,10),w.start_date??''].sort().at(-1),finish=[s.end.slice(0,10),w.end_date??s.end.slice(0,10)].sort()[0],startCases=[{local:s.start,label_zh:'官方開始時刻',label_en:'Official start'},...(s.alternative_starts??[])],out=[],seen=new Set();
 for(let day=Date.parse(begin+'T00:00Z'),end=Date.parse(finish+'T00:00Z');day<=end&&out.length<100;day+=86400000){const date=new Date(day).toISOString().slice(0,10);for(const c of startCases){const start=Math.max(zonedInstant(date+'T'+w.start,zone),zonedInstant(c.local,zone)),stop=Math.min(zonedInstant(date+'T'+w.end,zone),zonedInstant(s.end,zone));if(start>=stop)continue;const key=start+':'+stop;if(seen.has(key))continue;seen.add(key);out.push({start,end:stop,local:formatZoned(start,zone)+' → '+formatZoned(stop,zone),taiwan:formatZoned(start,'Asia/Taipei')+' → '+formatZoned(stop,'Asia/Taipei'),basis:w.basis??'confirmed',scenario_zh:c.label_zh,scenario_en:c.label_en})}}
 return out.sort((a,b)=>a.start-b.start||a.end-b.end);
}

// ---- 2026-11 refresh: one activity model for the home page and the atlas ----
const safeHttps=url=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}};
const safeArtwork=url=>{const href=safeHttps(url);try{return href&&/\.(jpe?g|png|webp)$/i.test(new URL(href).pathname)&&!new URL(href).hash?href:''}catch{return ''}};
const slimPokemon=list=>(list??[]).filter(p=>p&&Number.isInteger(p.dex)).map(p=>({dex:p.dex,name_zh:p.name_zh||p.name_en||'',name_en:p.name_en||p.name_zh||''}));
// Build a compact, render-ready model. The source of truth stays data/backgrounds.json;
// data/activity-feed.json is generated from this function at build time.
export function buildActivityFeed(data){
 const records=data.records??[],byId=new Map(records.map(r=>[r.background_id,r])),events=collectActivityEvents(data),backgrounds={};
 const bgFor=e=>[...new Set([...(e.activity.background_ids??[]),...(e.background_id&&!(e.activity.background_ids)?[e.background_id]:[])])];
 const out=events.map(e=>{
  const ids=bgFor(e).filter(id=>byId.has(id));
  for(const id of ids){const r=byId.get(id);backgrounds[id]={background_id:id,name_zh:r.name_zh||r.name_en,name_en:r.name_en||r.name_zh,type:r.type,image:safeArtwork(r.artwork_preview_url)||safeArtwork(r.image_source),release_state:r.release_state,verification:r.verification,start_date:r.start_date??null,end_date:r.end_date??null,region_zh:r.region_zh??'',region_en:r.region_en??'',year:r.year??null,pokemon:slimPokemon(r.pokemon),related_product_ids:[...(r.related_product_ids??[])]}}
  const linked=ids.map(id=>byId.get(id));
  const products=[...new Set([...(e.related_product_ids??[]),...linked.flatMap(r=>r.related_product_ids??[])])];
  return {event_id:e.event_id,name_zh:e.name_zh,name_en:e.name_en,region_zh:e.region_zh??'',region_en:e.region_en??'',series:e.series??'',series_zh:e.series_zh??'',year:e.year??null,activity:e.activity,background_ids:ids,related_product_ids:products,official_sources:[...(e.official_sources??[])],image:linked.map(r=>safeArtwork(r.artwork_preview_url)||safeArtwork(r.image_source)).find(Boolean)||'',pokemon:slimPokemon(e.pokemon),notes_zh:Array.isArray(e.notes)?e.notes.filter(n=>typeof n==='string'):[],notes_en:Array.isArray(e.notes_en)?e.notes_en.filter(n=>typeof n==='string'):[]};
 });
 return {as_of:data.as_of??null,events:out,backgrounds};
}
// Pokémon shown for an event: event list first, else linked backgrounds (deduplicated).
export function eventPokemon(event,feed){
 const seen=new Set(),rows=[];
 for(const p of [...(event.pokemon??[]),...(event.pokemon?.length?[]:(event.background_ids??[]).flatMap(id=>feed?.backgrounds?.[id]?.pokemon??[]))]){const key=p.dex+'|'+p.name_en;if(seen.has(key))continue;seen.add(key);rows.push(p)}
 return rows;
}
// Background availability is separate from the event schedule.
export function eventBackgroundState(event,feed){
 const rows=(event.background_ids??[]).map(id=>feed?.backgrounds?.[id]).filter(Boolean);
 if(!rows.length)return event.activity?.kind==='event'||event.activity?.kind==='feature'?'none':'unlinked';
 if(rows.some(r=>r.release_state==='released'&&['official-event-confirmed','catalog-crosschecked','owner-confirmed'].includes(r.verification)))return 'released';
 if(rows.some(r=>r.release_state==='upcoming'))return 'upcoming';
 return 'pending';
}
export const visitorZone=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Taipei'}catch{return 'Asia/Taipei'}};
// "rolling": each region starts at the same local wall-clock time.
// "fixed": one shared instant, written in the event zone. "date": dates only, hours unannounced.
export function eventTimeKind(event){const s=event.activity.schedule;return s.date_only?'date':s.rolling_local?'rolling':'fixed'}
// The visitor's own clock, keeping the original schedule as the primary line.
export function visitorTimeLine(event,zone=visitorZone(),locale='zh'){
 const s=event.activity.schedule,zh=locale==='zh',kind=eventTimeKind(event);
 if(kind==='date'||!s.start)return null;
 if(kind==='rolling')return zh?`你所在地（${zone}）：同樣依當地時間 ${s.start.slice(11)} 開始`:`Your area (${zone}): also starts at ${s.start.slice(11)} local time`;
 const eventZone=s.zone||'Asia/Taipei';if(zone===eventZone||zone==='Asia/Taipei')return null;
 const start=zonedInstant(s.start,eventZone),end=s.end?zonedInstant(s.end,eventZone):null;
 return (zh?`你的時間（${zone}）：`:`Your time (${zone}): `)+formatZoned(start,zone)+(end?' → '+formatZoned(end,zone):'')+' · '+zoneOffset(start,zone);
}
// Countdown target is explicit: which moment, and in which clock.
export function eventCountdown(event,now=Date.now(),zone=visitorZone()){
 const s=event.activity.schedule,kind=eventTimeKind(event);if(kind==='date'||!s.start)return null;
 const clock=kind==='rolling'?zone:(s.zone||'Asia/Taipei');
 let start,end;try{start=zonedInstant(s.start,clock);end=s.end?zonedInstant(s.end,clock):null}catch{return null}
 if(now<start)return {target:'start',ms:start-now,clock,kind};
 if(end!=null&&now<end)return {target:'end',ms:end-now,clock,kind};
 return null;
}
export function formatDuration(ms,locale='zh'){
 const m=Math.max(0,Math.floor(ms/60000)),d=Math.floor(m/1440),h=Math.floor(m%1440/60),min=m%60,zh=locale==='zh';
 if(d>0)return zh?`${d} 天 ${h} 小時`:`${d}d ${h}h`;if(h>0)return zh?`${h} 小時 ${min} 分`:`${h}h ${min}m`;return zh?`${min} 分鐘`:`${min} min`;
}
// Tabs: in-progress (incl. unresolved start), upcoming, history.
export function eventGroup(event,now=Date.now()){const s=activityState(event,now).status;return s==='ended'?'ended':s==='upcoming'?'upcoming':'live'}
// Short date for collapsed rows. Never invents an hour for date-only events.
export function eventDateLabel(event,locale='zh'){
 const s=event.activity.schedule,zh=locale==='zh',fmt=v=>v.slice(0,10).replace(/-/g,'/');
 if(s.date_only)return fmt(s.start_date)+(s.end_date&&s.end_date!==s.start_date?' – '+fmt(s.end_date).slice(5):'')+(zh?'（時間待公布）':' (hours TBA)');
 const start=fmt(s.start)+' '+s.start.slice(11),end=s.end?(s.end.slice(0,10)===s.start.slice(0,10)?s.end.slice(11):fmt(s.end).slice(5)+' '+s.end.slice(11)):(zh?'未定結束':'no end date');
 return start+' → '+end;
}
