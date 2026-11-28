import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// 發布前檢查在目前的檔案上必須通過（部署 workflow 會跑同一支程式，失敗就不部署）
test('發布前檢查通過：資料 JSON、打包檔、版本號、後台頁面、背景筆數',()=>{
 const r=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/check-site.mjs',import.meta.url))],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
