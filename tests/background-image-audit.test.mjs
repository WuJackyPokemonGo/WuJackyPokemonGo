import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicBackgroundReferences,referenceArtwork,filterBackgrounds} from '../backgrounds-service.mjs';
import {mergeBackgroundOverrides} from '../backgrounds-admin-service.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const data=read('../data/backgrounds.json'),refs=read('../data/background-reference-facts.json');
const by=id=>data.records.find(r=>r.background_id===id);
test('all 345 source images have one valid disposition and resolve to a stable catalog id',()=>{
 assert.equal(refs.entries.length,345);assert.equal(new Set(refs.entries.map(e=>e.reference_id)).size,345);
 for(const e of refs.entries){assert.ok(by(e.background_id),e.reference_id);assert.ok(['primary','alternate-reference','component'].includes(e.display_role))}
 const ids=new Set(refs.entries.map(e=>e.background_id));
 for(const id of ids)assert.equal(publicBackgroundReferences(by(id),refs).length,1,id);
});
test('six Regi LED patterns preserve six distinct source images and species identities',()=>{
 const rows=['BG-0265','BG-0271','BG-0272','BG-0273','BG-0274','BG-0275'].map(by);
 assert.deepEqual(rows.map(r=>r.pokemon[0].dex),[377,378,379,486,894,895]);
 assert.ok(rows.every(r=>r.pokemon.length===1));assert.equal(new Set(rows.map(r=>referenceArtwork(r,refs))).size,6);
});
test('raw background layers never replace full Moonlight, Arraia or GO Fest depictions',()=>{
 for(const id of ['BG-0263','BG-0253','BG-0254','BG-0265']){
  const row=by(id),image=referenceArtwork(row,refs);
  assert.ok(refs.entries.some(e=>e.background_id===id&&e.display_role==='primary'&&e.image_url===image));
  assert.ok(!refs.entries.some(e=>e.display_role==='component'&&e.image_url===image));
 }
 assert.match(referenceArtwork(by('BG-0263'),refs),/moonlight/);
});
test('public RPC image edits take precedence even when its response omits version',()=>{
 const image='https://example.com/owner-corrected.png',id='BG-0263';
 const [merged]=mergeBackgroundOverrides([by(id)],{[id]:{background_id:id,is_visible:true,record:{image_source:image}}});
 assert.equal(merged.cloud_version,0);assert.equal(referenceArtwork(merged,refs),image);
 assert.notEqual(referenceArtwork(by(id),refs),image);
});
test('duplicate Worlds blue references map to Tinkaton while the retired link has a redirect',()=>{
 assert.equal(data.redirects['BG-0270'],'BG-0261');assert.equal(by('BG-0270'),undefined);
 assert.equal(refs.entries.find(e=>e.reference_id==='world_special_blue').background_id,'BG-0261');
});
test('two newly catalogued assets cannot imply a release date, eligible species or public verified listing',()=>{
 const verified=new Set(filterBackgrounds(data.records).map(r=>r.background_id));
 for(const id of ['BG-0276','BG-0277']){const r=by(id);assert.equal(r.release_state,'needs-verification');assert.ok(!r.start_date);assert.deepEqual(r.pokemon,[]);assert.ok(!verified.has(id))}
});
test('Times Square nightscape remains distinct from the Global anniversary Earth artwork',()=>{
 assert.notEqual(referenceArtwork(by('BG-0161'),refs),referenceArtwork(by('BG-0260'),refs));
 assert.ok(!by('BG-0161').same_artwork_ids?.includes('BG-0260'));
 assert.equal(by('BG-0161').region_en,'United States');
});
