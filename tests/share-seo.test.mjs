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
