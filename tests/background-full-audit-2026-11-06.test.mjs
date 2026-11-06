import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const d=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url),'utf8'));
const iso=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s));
test('282 records, unique ids, every id gap is a redirect to a live record',()=>{
 const ids=d.records.map(r=>r.background_id);assert.equal(ids.length,282);assert.equal(new Set(ids).size,282);
 const nums=new Set(ids.map(x=>+x.slice(3)));const gaps=[];for(let n=1;n<=Math.max(...nums);n++)if(!nums.has(n))gaps.push(n);
 assert.deepEqual(gaps,[270,281,282]);assert.equal(d.redirects['BG-0270'],'BG-0261');assert.equal(d.redirects['BG-0281'],'BG-0212');assert.equal(d.redirects['BG-0282'],'BG-0213');for(const to of Object.values(d.redirects))assert.ok(ids.includes(to),to);
});
test('dates are valid ISO, end is not before start, released records have a start date',()=>{
 for(const r of d.records){if(r.start_date)assert.ok(iso(r.start_date),r.background_id);if(r.end_date)assert.ok(iso(r.end_date),r.background_id);
  if(r.start_date&&r.end_date)assert.ok(r.end_date>=r.start_date,r.background_id);if(r.release_state==='released')assert.ok(r.start_date,r.background_id)}
});
test('declared review counts match the records that are still pending',()=>{
 const date=d.records.filter(r=>!r.start_date).map(r=>r.background_id);
 const method=d.records.filter(r=>['unconfirmed','partial'].includes(r.method_status)).map(r=>r.background_id);
 assert.deepEqual(date,['BG-0072','BG-0276','BG-0277','BG-0285']);assert.deepEqual(method,['BG-0072','BG-0276','BG-0277']);assert.deepEqual(d.owner_retained_pending_ids,['BG-0072','BG-0276','BG-0277']);
 assert.deepEqual(d.review_counts,{date_details_pending:4,acquisition_method_pending:3,backgrounds_pending:3});
});
test('form variants carry a Chinese form label and no record repeats an identical encounter',()=>{
 for(const r of d.records)for(const p of [...r.pokemon??[],...r.evolved_pokemon??[]])
  if(/Origin|Therian|Attack|Defense|Speed|Drive/.test(p.name_en??'')&&[386,483,484,487,641,642,645,649,905].includes(p.dex))assert.match(p.name_zh,/（.+(形態|卡帶)）$/,r.background_id+' '+p.name_en);
 const dupes=[];for(const r of d.records){const seen=new Map();for(const p of r.pokemon??[]){const k=p.dex+'|'+p.name_zh+'|'+p.name_en+'|'+(p.variant_id??'');seen.set(k,(seen.get(k)??0)+1)}for(const [k,n] of seen)if(n>1)dupes.push(r.background_id+' '+k)}
 assert.deepEqual(dupes,[],'no record lists the same encounter twice');
});
