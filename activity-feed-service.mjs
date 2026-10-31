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
 const starts=[s.start,...(s.alternative_starts??[]).map(x=>x.local)].map(x=>zonedInstant(x,zone)).sort((a,b)=>a-b),end=zonedInstant(s.end,zone);
 if(now>=end)return {status:'ended',basis:'confirmed',session_open:false};if(now<starts[0])return {status:'upcoming',basis:'confirmed',session_open:false};
 if(now<starts.at(-1))return {status:'time_unknown',basis:'pending',session_open:null};
 let session=null;if(s.daily){const p=parts(now,zone),clock=`${p.hour}:${p.minute}`;session=clock>=s.daily.start&&clock<s.daily.end}
 return {status:'in_progress',basis:'confirmed',session_open:session};
}
export function sortActivityEvents(events,now=Date.now()){
 const rank={in_progress:0,time_unknown:1,upcoming:2,ended:3},time=e=>{const s=e.activity.schedule;return zonedInstant(s.date_only?s.start_date+'T00:00':s.start,s.zone||'Asia/Taipei')};
 return [...events].sort((a,b)=>{const sa=activityState(a,now).status,sb=activityState(b,now).status;return rank[sa]-rank[sb]||(sa==='ended'?time(b)-time(a):time(a)-time(b))||a.event_id.localeCompare(b.event_id)});
}
export function activityTimeLines(event,locale='zh'){
 const s=event.activity.schedule,zone=s.zone||'Asia/Taipei',zh=locale!=='en';
 if(s.date_only)return {local:`${s.start_date} – ${s.end_date} · ${zone} · ${zh?'起訖時刻待公布':'start/end hours unannounced'}`,taiwan:zh?'台灣起訖時間：待當地時刻確認後換算':'Taiwan start/end: awaiting confirmed local hours'};
 const start=zonedInstant(s.start,zone),end=zonedInstant(s.end,zone),candidates=[start,...(s.alternative_starts??[]).map(x=>zonedInstant(x.local,zone))];
 const local=candidates.map(x=>formatZoned(x,zone)).join(zh?' 或 ':' or ')+' → '+formatZoned(end,zone)+` · ${zone} (${zoneOffset(start,zone)})`;
 if(s.rolling_local)return {local:(zh?'各地當地時間：':'Each region’s local time: ')+s.start.replace('T',' ')+' → '+s.end.replace('T',' '),taiwan:(zh?'台灣場：':'Taiwan schedule: ')+formatZoned(start,'Asia/Taipei')+' → '+formatZoned(end,'Asia/Taipei')+' · UTC+08:00'+(zh?'；海外依各地當地時間開始，沒有單一台灣換算時刻。':'; overseas regions start in their own local time, not at one shared Taiwan instant.')};
 return {local:(s.reference_local?(zh?'墨西哥城時區示例（各地依當地時間）：':'Mexico City timezone example (each region follows local time): '):'')+local,taiwan:(s.reference_local?(zh?'台灣換算（墨西哥城示例）：':'Taiwan conversion (Mexico City example): '):(zh?'台灣：':'Taiwan: '))+candidates.map(x=>formatZoned(x,'Asia/Taipei')).join(zh?' 或 ':' or ')+' → '+formatZoned(end,'Asia/Taipei')+' · UTC+08:00'};
}
export function activityWindows(event){
 const s=event.activity.schedule,w=event.activity.battle_window??s.daily;if(!w||s.date_only||s.rolling_local)return [];
 const zone=s.zone,begin=s.start.slice(0,10),finish=s.end.slice(0,10),startCases=[{local:s.start,label_zh:'官方開始時刻',label_en:'Official start'},...(s.alternative_starts??[])],out=[],seen=new Set();
 for(let day=Date.parse(begin+'T00:00Z'),end=Date.parse(finish+'T00:00Z');day<=end&&out.length<100;day+=86400000){const date=new Date(day).toISOString().slice(0,10);for(const c of startCases){const start=Math.max(zonedInstant(date+'T'+w.start,zone),zonedInstant(c.local,zone)),stop=Math.min(zonedInstant(date+'T'+w.end,zone),zonedInstant(s.end,zone));if(start>=stop)continue;const key=start+':'+stop;if(seen.has(key))continue;seen.add(key);out.push({start,end:stop,local:formatZoned(start,zone)+' → '+formatZoned(stop,zone),taiwan:formatZoned(start,'Asia/Taipei')+' → '+formatZoned(stop,'Asia/Taipei'),basis:w.basis??'confirmed',scenario_zh:c.label_zh,scenario_en:c.label_en})}}
 return out.sort((a,b)=>a.start-b.start||a.end-b.end);
}
