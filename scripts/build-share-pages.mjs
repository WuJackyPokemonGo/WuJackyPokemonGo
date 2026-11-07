// Generates one tiny share page per background (bg/BG-0001.html) so links pasted into
// Threads, Discord, Reddit or LINE preview that background's own picture and name.
// Each page forwards visitors to the atlas detail, keeping ?lang and ?src.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,rmSync} from 'node:fs';
const SITE='https://wujackypokemongo.github.io/WuJackyPokemonGo/';
const root=new URL('../',import.meta.url),outDir=new URL('bg/',root);
const data=JSON.parse(readFileSync(new URL('data/backgrounds.json',root),'utf8'));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cut=(s,n)=>{s=String(s??'').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1).trimEnd()+'…':s};
const image=u=>{try{const x=new URL(u);return x.protocol==='https:'&&/\.(jpe?g|png|webp)$/i.test(x.pathname)?x.href:''}catch{return ''}};
export function sharePage(r,target=r.background_id){
 const name=r.name_en||r.name_zh||target,dates=r.start_date?(r.start_date+(r.end_date&&r.end_date!==r.start_date?' – '+r.end_date:'')):'';
 const count=(r.pokemon??[]).length,desc=cut([dates,count?count+' eligible Pokémon':'',r.method_en].filter(Boolean).join(' · '),220);
 const img=image(r.image_source)||SITE+'assets/og/backgrounds.jpg?v=20261106',atlas=SITE+'backgrounds.html?background='+encodeURIComponent(target);
 const title=name+' – Pokémon GO special background';
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="robots" content="noindex,follow"><link rel="canonical" href="${esc(atlas)}"><meta name="description" content="${esc(desc)}"><meta property="og:type" content="article"><meta property="og:site_name" content="Wu Jacky Pokémon GO Background Atlas"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(SITE+'bg/'+target+'.html')}"><meta property="og:image" content="${esc(img)}"><meta property="og:image:alt" content="${esc(name)}"><meta name="twitter:card" content="summary_large_image"><meta http-equiv="refresh" content="1;url=../backgrounds.html?background=${esc(encodeURIComponent(target))}&amp;lang=en"><script>(function(){var q=new URLSearchParams(location.search),lang=/^(zh|en|ja|ko|vi|th|id|es|pt)$/.test(q.get('lang')||'')?q.get('lang'):'en',src=q.get('src');if(!src&&document.referrer){try{var h=new URL(document.referrer).hostname,m=[[/threads\\.(net|com)$/,'threads'],[/reddit\\.com$|^redd\\.it$/,'reddit'],[/discord(app)?\\.com$/,'discord'],[/facebook\\.com$|^fb\\.me$/,'facebook'],[/instagram\\.com$/,'instagram'],[/line\\.me$|^lin\\.ee$/,'line'],[/(^|\\.)(x|twitter)\\.com$|^t\\.co$/,'x'],[/youtube\\.com$|^youtu\\.be$/,'youtube']];for(var i=0;i<m.length;i++)if(m[i][0].test(h)){src=m[i][1];break}}catch(e){}}location.replace('../backgrounds.html?background=${encodeURIComponent(target)}&lang='+lang+(src?'&src='+encodeURIComponent(src.slice(0,30)):''))})();</script></head><body><p><a href="../backgrounds.html?background=${esc(encodeURIComponent(target))}&amp;lang=en">${esc(name)}</a></p></body></html>\n`;
}
export function buildSharePages(){
 const pages=new Map();
 for(const r of data.records)if(/^BG-\d{4}$/.test(r.background_id))pages.set(r.background_id,sharePage(r));
 for(const [from,to] of Object.entries(data.redirects??{})){const r=data.records.find(x=>x.background_id===to);if(r&&/^BG-\d{4}$/.test(from))pages.set(from,sharePage(r,to))}
 return pages;
}
if(import.meta.url===`file://${process.argv[1]}`){
 const pages=buildSharePages();mkdirSync(outDir,{recursive:true});
 for(const f of readdirSync(outDir))if(/^BG-\d{4}\.html$/.test(f)&&!pages.has(f.slice(0,-5)))rmSync(new URL(f,outDir));
 for(const [id,html] of pages)writeFileSync(new URL(id+'.html',outDir),html);
 console.log('share pages:',pages.size);
}
