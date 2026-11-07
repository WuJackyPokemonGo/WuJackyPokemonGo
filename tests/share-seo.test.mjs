import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
const jpegSize=buf=>{let i=2;while(i<buf.length){if(buf[i]!==0xFF){i++;continue}const m=buf[i+1],len=buf.readUInt16BE(i+2);if(m>=0xC0&&m<=0xC3)return [buf.readUInt16BE(i+7),buf.readUInt16BE(i+5)];i+=2+len}return null};
test('public pages carry share cards, canonical and nine hreflang alternates',()=>{
 for(const [page,img] of [['index.html','assets/og/store.jpg'],['backgrounds.html','assets/og/backgrounds.jpg']]){
  const html=read(page).toString();
  for(const prop of ['og:title','og:description','og:image','og:url','twitter:card'])assert.ok(html.includes(prop),page+' '+prop);
  assert.ok(html.includes(`assets/og/${img.split('/').pop()}`));assert.match(html,/<link rel="canonical" href="https:\/\/wujackypokemongo\.github\.io\/WuJackyPokemonGo\//);
  for(const code of ['zh','en','ja','ko','vi','th','id','es','pt'])assert.ok(html.includes(`?lang=${code}"`),page+' '+code);
  assert.ok(html.includes('hreflang="x-default"'));
  assert.deepEqual(jpegSize(read(img)),[1200,630],img);
 }
});
test('sitemap lists both public pages in nine languages and admin stays out of search',()=>{
 const xml=read('sitemap.xml').toString();assert.equal((xml.match(/<url>/g)||[]).length,18);assert.ok(!xml.includes('admin'));
 for(const p of ['admin.html','cloud-admin.html'])assert.match(read(p).toString(),/<meta name="robots" content="noindex,nofollow">/);
});
test('Google Search Console verification file stays published',async()=>{
 const {readFileSync}=await import('node:fs');
 assert.equal(readFileSync(new URL('../google207adf49eab3425e.html',import.meta.url),'utf8').trim(),'google-site-verification: google207adf49eab3425e.html');
});
test('first load: only the first region slide downloads eagerly and the preloaded bundle matches the script',async()=>{
 const {readFileSync}=await import('node:fs');const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const srcs=[...html.matchAll(/<img (src|data-src)="assets\/regions\/([a-z]+)\.webp"/g)].map(m=>m[1]+':'+m[2]);
 assert.equal(srcs.length,9);assert.equal(srcs[0],'src:kanto');assert.ok(srcs.slice(1).every(s=>s.startsWith('data-src:')));
 const pre=html.match(/rel="modulepreload" href="([^"]+)"/)[1],script=html.match(/<script type="module" src="(assets\/storefront\.bundle\.js[^"]+)"/)[1];assert.equal(pre,script);
 assert.match(html,/rel="preconnect" href="https:\/\/wlrwlqchlxehlvkyesnj\.supabase\.co"/);
});
