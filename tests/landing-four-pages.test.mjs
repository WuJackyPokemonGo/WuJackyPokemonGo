import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');

test('four separate pages share one navigation: 首頁、商品目錄、背景圖鑑、世界地圖',()=>{
 for(const [file,current] of [['index.html','index.html'],['shop.html','shop.html'],['backgrounds.html','backgrounds.html'],['map.html','map.html']]){
  const html=read(file),nav=html.match(/<nav class="[^"]*site-nav[^"]*"[^>]*>(.*?)<\/nav>/)[1];
  assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(m=>m[1]),['index.html','shop.html','backgrounds.html','map.html'],file);
  assert.match(nav,new RegExp(`href="${current.replace('.','\\.')}" aria-current="page"`),file);
 }
});
test('home is the hero-video landing; catalog, atlas and map live on their own pages',()=>{
 const home=read('index.html'),shop=read('shop.html'),map=read('map.html');
 assert.match(home,/<video id="heroVideo"[^>]*autoplay[^>]*muted[^>]*loop[^>]*playsinline/);
 assert.match(home,/intro-960\.mp4" type="video\/mp4" media="\(max-width:700px\)"/);
 for(const f of ['assets/hero/intro.mp4','assets/hero/intro-960.mp4','assets/hero/intro.jpg']){assert.ok(existsSync(new URL('../'+f,import.meta.url)),f);assert.ok(statSync(new URL('../'+f,import.meta.url)).size<2.5*1024*1024,f+' stays light')}
 assert.ok(!home.includes('id="products"'),'no catalog grid on the landing');assert.match(home,/id="homeEvents"/);assert.match(home,/class="region-showcase"/);
 assert.match(shop,/id="products"/);assert.ok(!shop.includes('id="homeEvents"'));assert.ok(!shop.includes('heroVideo'));
 assert.match(map,/<body class="atlas-page map-page">/);
});
test('old links keep working: product/search links on the home forward to the shop, ?view=map forwards to map.html',()=>{
 assert.match(read('index.html'),/location\.replace\("shop\.html"\+s/);
 assert.match(read('backgrounds.html'),/location\.replace\("map\.html"/);
 for(const f of ['backgrounds.mjs','activity-feed-ui.mjs','home-refresh.mjs','scripts/build-product-shares.mjs'])assert.ok(!read(f).includes('index.html?product='),f);
});
