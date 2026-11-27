// Content-hash cache busting for the atlas bundle and shared stylesheets (the storefront bundle is
// stamped by stamp-storefront-version.mjs). When a file changes, every page that loads it gets a new
// ?v=, so phones and in-app browsers never keep stale JS/CSS after a deploy. CI checks they stay in sync.
import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
export const VERSIONED_ASSETS={
 'assets/backgrounds.bundle.js':['backgrounds.html','map.html'],
 'assets/landing.bundle.js':['index.html'],
 'site-refresh.css':['index.html','shop.html','backgrounds.html','map.html'],
 'storefront.css':['index.html','shop.html'],
 'backgrounds.css':['backgrounds.html','map.html'],
};
const root=new URL('../',import.meta.url);
export const assetVersion=asset=>'h'+createHash('sha256').update(readFileSync(new URL(asset,root))).digest('hex').slice(0,10);
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function expectedPages(){const pages=new Map();for(const [asset,files] of Object.entries(VERSIONED_ASSETS)){const v=assetVersion(asset);for(const f of files){const html=pages.get(f)??readFileSync(new URL(f,root),'utf8');const re=new RegExp('(["\'/])'+escape(asset)+'\\?v=[^"\']+','g');if(!re.test(html))throw Error(`${f} does not load ${asset}?v=`);pages.set(f,html.replace(new RegExp('(["\'/])'+escape(asset)+'\\?v=[^"\']+','g'),`$1${asset}?v=${v}`))}}return pages}
if(import.meta.url===`file://${process.argv[1]}`){for(const [f,html] of expectedPages()){const file=new URL(f,root);if(readFileSync(file,'utf8')!==html)writeFileSync(file,html)}console.log('asset versions stamped')}
