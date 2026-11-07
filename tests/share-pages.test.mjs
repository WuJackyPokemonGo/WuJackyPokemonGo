import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {buildSharePages} from '../scripts/build-share-pages.mjs';
const data=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url),'utf8'));
test('every background has a share page with its own preview and a redirect to the atlas',()=>{
 for(const r of data.records){if(!/^BG-\d{4}$/.test(r.background_id))continue;const f=new URL('../bg/'+r.background_id+'.html',import.meta.url);assert.ok(existsSync(f),r.background_id+' missing: run npm run build');
  const html=readFileSync(f,'utf8');assert.match(html,new RegExp('og:url" content="[^"]+/bg/'+r.background_id+'\\.html"'));assert.match(html,/og:image" content="https:\/\//);assert.match(html,new RegExp("backgrounds\\.html\\?background="+r.background_id));assert.match(html,/noindex,follow/)}
});
test('share pages escape text, keep only known languages and pass the source along',()=>{
 const pages=buildSharePages();const html=pages.get('BG-0254');
 assert.ok(!/<title>[^<]*<[a-z]/i.test(html));assert.match(html,/\(zh\|en\|ja\|ko\|vi\|th\|id\|es\|pt\)/);assert.match(html,/&src='\+encodeURIComponent/);assert.match(html,/threads\\\.\(net\|com\)\$/);
 for(const f of readdirSync(new URL('../bg/',import.meta.url)))assert.ok(pages.has(f.replace(/\.html$/,'')),'stale page '+f);
});
