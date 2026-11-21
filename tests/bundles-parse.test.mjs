import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// 防止被截斷或損壞的打包檔上線（2026-11-21 商品頁曾因此一直顯示「正在載入商品…」）。
for(const name of ['storefront','backgrounds','cloud-admin']){
  test(`assets/${name}.bundle.js 語法完整`,()=>{
    const file=fileURLToPath(new URL(`../assets/${name}.bundle.js`,import.meta.url));
    const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    assert.equal(r.status,0,r.stderr.split('\n').slice(-6).join('\n'));
  });
}
