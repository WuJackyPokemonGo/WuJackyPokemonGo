import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {searchMatch,inquiryText} from '../storefront-service.mjs';
import {backgroundMatch} from '../backgrounds-service.mjs';
import {POKEMON_NAMES,localPokemonName} from '../pokemon-names.mjs';
import {localRegionName} from '../region-names.mjs';
import {t,supportedLocales} from '../storefront-locale.mjs';
const data=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url),'utf8'));
const by=id=>data.records.find(r=>r.background_id===id);
test('Japanese and Korean names cover every National Pokédex species',()=>{
 for(let dex=1;dex<=1025;dex++){assert.ok(POKEMON_NAMES[dex]?.[0],'ja '+dex);assert.ok(POKEMON_NAMES[dex]?.[1],'ko '+dex)}
 assert.equal(localPokemonName(25,'ja'),'ピカチュウ');assert.equal(localPokemonName(25,'ko'),'피카츄');assert.equal(localPokemonName(25,'th'),'');
});
test('foreign visitors find backgrounds by their own Pokémon and country names',()=>{
 const sendai=by('BG-0212'),mexico=by('BG-0213');
 for(const q of ['ラプラス','라프라스','日本','일본','Nhật Bản','ญี่ปุ่น'])assert.ok(backgroundMatch(sendai,q),q);
 for(const q of ['ルチャブル','루차불','メキシコ','멕시코','เม็กซิโก'])assert.ok(backgroundMatch(mexico,q),q);
 assert.ok(!backgroundMatch(sendai,'ルチャブル'));
 assert.equal(localRegionName('Japan','ko'),'일본');assert.equal(localRegionName('Unknown','ja'),'');
});
test('storefront search matches local names through Pokédex numbers',()=>{
 const p={id:'x',name:'噴火龍-測試',name_en:'Charizard - Test',dex:6,dex_numbers:[6],aliases:[],tags:[],images:[],status:'available',price:100};
 for(const q of ['リザードン','리자몽','Charizard','噴火龍'])assert.ok(searchMatch(p,q),q);
 assert.ok(!searchMatch(p,'ピカチュウ'));
});
test('XXL/XXS tag is translated in every supported language',()=>{
 for(const locale of supportedLocales.filter(l=>l!=='zh'))assert.notEqual(t('XXL/XXS 特殊尺寸',locale),'XXL/XXS 特殊尺寸',locale);
});
test('inquiries in other languages keep the Chinese product name for the owner',()=>{
 const p={id:'x',name:'皮卡丘-測試',name_en:'Pikachu - Test',dex:25,aliases:[],tags:[],images:[],status:'available',price:150};
 const ja=inquiryText([p],[{id:'x',qty:2}],'','ja');assert.match(ja,/Pikachu - Test（皮卡丘-測試） × 2/);
 const zh=inquiryText([p],[{id:'x',qty:1}],'','zh');assert.match(zh,/皮卡丘-測試 × 1/);assert.ok(!zh.includes('（皮卡丘-測試）'));
});
