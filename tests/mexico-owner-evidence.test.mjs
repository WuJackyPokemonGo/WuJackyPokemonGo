import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {collectActivityEvents} from '../activity-feed-service.mjs';import {filterBackgrounds,groupBackgroundCards,backgroundArtworkGallery} from '../backgrounds-service.mjs';
const data=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url)));const by=id=>data.records.find(r=>r.background_id===id),r=by('BG-0280');
test('Mexico owner catches become one released independent record without duplicate announcement or stock',()=>{
 assert.equal(r.artwork_reuse.background_id,'BG-0008');assert.equal(r.artwork_reuse.basis,'visual-comparison');assert.match(r.artwork_note_zh,/不是新增背景圖樣/);assert.equal(r.release_state,'released');assert.equal(r.type,'location');assert.deepEqual(r.pokemon.map(p=>p.dex),[94,355]);assert.equal(r.pokemon[0].variant_id,'gengar-gigantamax');assert.deepEqual(r.evolved_pokemon.map(p=>p.dex),[356,477]);assert.ok(r.evolved_pokemon.every(p=>p.acquisition==='evolution'));
 assert.equal(collectActivityEvents(data).filter(e=>e.event_id==='dia-de-muertos-mexico-city-2026').length,1);assert.ok(!data.additional_announced_events.some(e=>e.activity?.id==='dia-de-muertos-mexico-city-2026'));
 assert.ok(filterBackgrounds(data.records).includes(r));assert.deepEqual(r.related_product_ids,[]);assert.equal(r.activity.remote_background.basis,'pending');assert.equal(r.activity.schedule.basis,'pending');assert.equal(r.activity.artwork_status,'owner-catch-confirmed');
 assert.equal(by('BG-0213').release_state,'upcoming');assert.deepEqual(by('BG-0278').pokemon.map(p=>p.dex),[104]);assert.deepEqual(groupBackgroundCards(data.records).filter(c=>c.activity_id).map(c=>c.activity_id),['ancients-recovered']);
});
test('both original screenshot assets remain byte-identical to owner evidence with no fabricated clean background',()=>{
 assert.equal(r.owner_evidence.length,2);assert.equal(backgroundArtworkGallery(r,null).length,2);assert.match(r.artwork_note_en,/not clean background assets/);
 for(const p of r.owner_evidence){const path=new URL(p.image_url).pathname.replace('/WuJackyPokemonGo/','');const bytes=readFileSync(new URL('../'+path,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),p.sha256)}
});
