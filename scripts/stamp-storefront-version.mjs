// 依 storefront.bundle.js 的內容產生版本號，寫回 index.html（含 modulepreload）。
// 程式內容一變（例如每日同步新增商品分享頁），版本號就跟著變，手機與 App 內建瀏覽器不會再沿用舊快取。
import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const bundle=readFileSync(new URL('../assets/storefront.bundle.js',import.meta.url));
const version='c'+createHash('sha256').update(bundle).digest('hex').slice(0,10);
const file=new URL('../index.html',import.meta.url);const html=readFileSync(file,'utf8');
const next=html.replace(/storefront\.bundle\.js\?v=[^"']+/g,'storefront.bundle.js?v='+version);
if(!/storefront\.bundle\.js\?v=/.test(html))throw Error('index.html has no storefront bundle reference');
if(next!==html)writeFileSync(file,next);
console.log('storefront version',version);
