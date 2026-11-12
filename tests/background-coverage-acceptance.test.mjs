import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {backgroundArtworkGallery,referenceArtwork,filterBackgrounds,safeBackgroundImage} from '../backgrounds-service.mjs';
import {mergeBackgroundOverrides} from '../backgrounds-admin-service.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const data=read('../data/backgrounds.json'),refs=read('../data/background-reference-facts.json');
const audit=read('../docs/background-coverage-acceptance-2026-10-24.json');
const latest=read('../docs/background-coverage-review-2026-10-28.json');
const by=id=>data.records.find(r=>r.background_id===id);
test('every source row resolves to a real entry and every released entry is visible and source-backed',()=>{
 const owner=read('../docs/background-owner-review-2026-11-02.json'),stamps=read('../docs/background-new-announcements-2026-11-03.json'),recheck=read('../docs/background-source-recheck-2026-11-06.json');const ids=new Set([...latest.new_released_background_ids,...owner.new_released_background_ids,...stamps.new_released_background_ids,...recheck.new_released_background_ids]);
 for(const source of Object.values(audit.sources)){
  assert.equal(source.rows,source.mapping.length);
  for(const item of source.mapping){
   for(const id of item.background_ids??[item.background_id]){assert.ok(by(id),id);ids.add(id)}
  }
 }
 const released=data.records.filter(r=>r.release_state==='released');
 const visible=new Set(filterBackgrounds(data.records).map(r=>r.background_id));
 // October 24 snapshot predates the Los Angeles event and the November 6 Festival of Lights (BG-0283); the two ongoing stamp records were merged into BG-0212/BG-0213 (-2) and BG-0213 became released via the Hawlucha rally (+1); retain its historical receipt.
 assert.equal(released.length,latest.released_records+owner.new_released_background_ids.length+stamps.new_released_background_ids.length+2);// +1 Night Out London BG-0214 released 2026-11-10
 assert.equal(by('BG-0214').release_state,'released');
 assert.equal(by('BG-0211').release_state,'released');
 for(const r of released){assert.ok(ids.has(r.background_id),r.background_id);assert.ok(visible.has(r.background_id),r.background_id);if(r.artwork_status==='pending'){assert.equal(referenceArtwork(r,refs),'');assert.equal(r.verification,'official-event-confirmed');assert.ok(r.official_sources.length)}else assert.ok(safeBackgroundImage(referenceArtwork(r,refs)),r.background_id)}
 assert.deepEqual(audit.unmapped_source_assets,[]);assert.deepEqual(audit.missing_released_backgrounds,[]);
 for(const x of audit.excluded_records)if(!['BG-0211','BG-0212','BG-0213','BG-0214'].includes(x.background_id))assert.ok(!visible.has(x.background_id));
});
test('Patterns of the Wild uses a complete preview while cloud image edits still take precedence',()=>{
 const row=by('BG-0264');assert.match(referenceArtwork(row,refs),/sb-patternwild\.png$/);
 assert.notEqual(referenceArtwork(row,refs),row.image_source);
 const image='https://example.com/owner-corrected.png';
 const [merged]=mergeBackgroundOverrides([row],{[row.background_id]:{background_id:row.background_id,is_visible:true,record:{image_source:image}}});
 assert.equal(referenceArtwork(merged,refs),image);
 assert.equal(backgroundArtworkGallery(merged,refs)[0].image_url,image);
});
test('Clumber Park opens on the current meadow artwork and keeps the previous tree-lined path below',()=>{
 const row=by('BG-0168'),images=backgroundArtworkGallery(row,refs);
 assert.equal(images.length,2);assert.equal(new Set(images.map(r=>r.image_url)).size,2);
 assert.match(images[0].image_url,/pokexperience\.com\/pokemon-variants\/backgrounds\/nationaltrustclumberpark\.jpg/);assert.match(images[1].image_url,/serebii\.net/);assert.match(images[1].label_en,/Previous version · tree-lined path/);
 assert.ok(images.every(i=>safeBackgroundImage(i.image_url)));
 assert.equal(data.records.filter(r=>r.background_id===row.background_id).length,1);
});
test('gallery rejects invalid or duplicate URLs without exposing component textures',()=>{
 const row=by('BG-0264'),main=referenceArtwork(row,refs);
 const images=backgroundArtworkGallery({...row,artwork_variants:[null,{image_url:'javascript:alert(1)'},{image_url:'http://example.com/insecure.jpg'},{image_url:main}]},refs);
 assert.equal(images.length,1);assert.equal(images[0].image_url,main);
 for(const r of filterBackgrounds(data.records)){if(r.artwork_status==='pending')assert.deepEqual(backgroundArtworkGallery(r,refs),[]);else assert.ok(backgroundArtworkGallery(r,refs).length>=1,r.background_id);}
});
