import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {backgroundArtworkGallery,referenceArtwork,filterBackgrounds,safeBackgroundImage} from '../backgrounds-service.mjs';
import {mergeBackgroundOverrides} from '../backgrounds-admin-service.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const data=read('../data/backgrounds.json'),refs=read('../data/background-reference-facts.json');
const audit=read('../docs/background-coverage-acceptance-2026-10-24.json');
const by=id=>data.records.find(r=>r.background_id===id);
test('every source row resolves to a real entry and every released entry is visible and source-backed',()=>{
 const ids=new Set();
 for(const source of Object.values(audit.sources)){
  assert.equal(source.rows,source.mapping.length);
  for(const item of source.mapping){
   for(const id of item.background_ids??[item.background_id]){assert.ok(by(id),id);ids.add(id)}
  }
 }
 const released=data.records.filter(r=>r.release_state==='released');
 const visible=new Set(filterBackgrounds(data.records).map(r=>r.background_id));
 assert.equal(released.length,audit.released_records);
 for(const r of released){assert.ok(ids.has(r.background_id),r.background_id);assert.ok(visible.has(r.background_id),r.background_id);assert.ok(safeBackgroundImage(referenceArtwork(r,refs)),r.background_id)}
 assert.deepEqual(audit.unmapped_source_assets,[]);assert.deepEqual(audit.missing_released_backgrounds,[]);
 for(const x of audit.excluded_records)assert.ok(!visible.has(x.background_id));
});
test('Patterns of the Wild uses a complete preview while cloud image edits still take precedence',()=>{
 const row=by('BG-0264');assert.match(referenceArtwork(row,refs),/sb-patternwild\.png$/);
 assert.notEqual(referenceArtwork(row,refs),row.image_source);
 const image='https://example.com/owner-corrected.png';
 const [merged]=mergeBackgroundOverrides([row],{[row.background_id]:{background_id:row.background_id,is_visible:true,record:{image_source:image}}});
 assert.equal(referenceArtwork(merged,refs),image);
 assert.equal(backgroundArtworkGallery(merged,refs)[0].image_url,image);
});
test('both Clumber Park catalog depictions are visible within one stable entry',()=>{
 const row=by('BG-0168'),images=backgroundArtworkGallery(row,refs);
 assert.equal(images.length,2);assert.equal(new Set(images.map(r=>r.image_url)).size,2);
 assert.match(images[1].label_en,/Alternate catalog/);
 assert.ok(images.every(i=>safeBackgroundImage(i.image_url)));
 assert.equal(data.records.filter(r=>r.background_id===row.background_id).length,1);
});
test('gallery rejects invalid or duplicate URLs without exposing component textures',()=>{
 const row=by('BG-0264'),main=referenceArtwork(row,refs);
 const images=backgroundArtworkGallery({...row,artwork_variants:[null,{image_url:'javascript:alert(1)'},{image_url:'http://example.com/insecure.jpg'},{image_url:main}]},refs);
 assert.equal(images.length,1);assert.equal(images[0].image_url,main);
 for(const r of filterBackgrounds(data.records))assert.ok(backgroundArtworkGallery(r,refs).length>=1,r.background_id);
});
