import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('320px 手機上輪播控制列不會撐出畫面',()=>{
  const css=readFileSync(new URL('../storefront.css',import.meta.url),'utf8');
  const block=css.match(/@media\(max-width:360px\)\{([\s\S]*?)\n\}/);
  assert.ok(block,'有 360px 以下的規則');
  assert.match(block[1],/\.region-carousel-controls\{gap:1px;padding:6px 4px\}/);
  assert.match(block[1],/\.region-carousel-controls \.region-dot\{min-width:24px\}/,'點擊範圍至少 24px');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/storefront\.css\?v=20261120-carousel-320/,'樣式版本更新，手機不會沿用舊樣式');
});
