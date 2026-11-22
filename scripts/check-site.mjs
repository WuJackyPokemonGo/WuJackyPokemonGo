// 發布前檢查（GitHub Actions 在部署前執行；本機也可跑 node scripts/check-site.mjs）。
// 任何一項失敗就不部署，正式站維持上一個正常版本。
// 2026-11-20、11-21 曾有被截斷的 data/backgrounds.json 與 assets/storefront.bundle.js 上線。
import {readFileSync,readdirSync,existsSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {STOREFRONT_CACHE_EPOCH} from './storefront-cache-epoch.mjs';
const root=new URL('../',import.meta.url);const read=p=>readFileSync(new URL(p,root),'utf8');const problems=[];
// 1. 資料檔都是完整的 JSON
for(const f of readdirSync(new URL('data/',root)).filter(f=>f.endsWith('.json'))){try{JSON.parse(read('data/'+f))}catch(e){problems.push(`data/${f} 不是完整的 JSON：${e.message.slice(0,120)}`)}}
// 2. 三個打包檔語法完整
for(const name of ['storefront','backgrounds','cloud-admin']){const file=new URL(`assets/${name}.bundle.js`,root).pathname;const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0)problems.push(`assets/${name}.bundle.js 語法錯誤：${(r.stderr.split('\n').find(l=>/^\w*Error:/.test(l))??'').trim()}`)}
// 3. 網頁引用的打包檔存在，商品頁版本號與內容一致（避免手機沿用同網址的舊檔）
const index=read('index.html');const v='c'+createHash('sha256').update(STOREFRONT_CACHE_EPOCH+':').update(readFileSync(new URL('assets/storefront.bundle.js',root))).digest('hex').slice(0,10);
for(const ref of index.match(/storefront\.bundle\.js\?v=[^"']+/g)??[])if(ref!=='storefront.bundle.js?v='+v)problems.push(`index.html 的 ${ref} 與打包檔內容不符（應為 ?v=${v}，請重跑 npm run build）`);
for(const page of ['index.html','backgrounds.html','admin.html','cloud-admin.html'])for(const m of read(page).matchAll(/(?:src|href)="(assets\/[^"?]+)/g))if(!existsSync(new URL(m[1],root)))problems.push(`${page} 引用的 ${m[1]} 不存在`);
// 4. 兩個後台頁面必須相同
if(read('admin.html')!==read('cloud-admin.html'))problems.push('admin.html 與 cloud-admin.html 不一致');
// 5. 背景圖鑑筆數不能突然大量減少（防止資料被舊版或截斷檔覆蓋）
let bg={records:[]};try{bg=JSON.parse(read('data/backgrounds.json'))}catch{}if((bg.records?.length??0)<250)problems.push(`data/backgrounds.json 只有 ${bg.records?.length??0} 筆背景，疑似資料遺失`);
if(problems.length){console.error('發布前檢查失敗，這次不會部署：\n- '+problems.join('\n- '));process.exit(1)}
console.log('發布前檢查通過：資料檔 JSON 完整、打包檔語法完整、版本號一致、後台頁面一致、背景 '+bg.records.length+' 筆。');
