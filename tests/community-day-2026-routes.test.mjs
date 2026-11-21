import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const data=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url),'utf8'));
const r=data.records.find(x=>x.background_id==='BG-0240');

test('社群日 2026 年度背景：六隻寶可夢都有取得途徑和證據等級',()=>{
  for(const name of ['敲音猴','六尾','涼脊龍','淚眼蜥','偷兒狐','圓陸鯊']){
    const p=r.pokemon.find(x=>x.name_zh===name);
    assert.ok(p?.method_zh&&p.method_en&&p.method_evidence,name);
  }
  assert.ok(r.official_sources.includes('https://pokemongo.com/en/news/communityday-july-2026-sobble'));
});
