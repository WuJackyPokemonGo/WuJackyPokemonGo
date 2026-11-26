// Home (landing) page: full-screen hero video, live counters, entry cards, activity feed and regions.
// The catalog itself lives on shop.html; old product links (index.html?product=… / ?q=) are forwarded there.
import {getLocale,setLocale,productName,bindStaticTranslations,initLanguageHint,tr} from './storefront-locale.mjs';
import {initContactLinks} from './contact.mjs';
import {initAnalytics} from './analytics.mjs';
import {loadCatalogWithFallback,stockLabel} from './storefront-service.mjs';
import {initHomeRefresh} from './home-refresh.mjs';
import {ACTIVITY_FEED_URL} from './background-data.mjs';
import {eventGroup} from './activity-feed-service.mjs';

const $=id=>document.getElementById(id);
const translateStatic=bindStaticTranslations();translateStatic();initContactLinks();const track=initAnalytics();
const updateLanguageHint=initLanguageHint();
let products=[];

// Product links should open in the shop. Hero video: muted autoplay loop; still poster when the visitor asks for less motion.
const video=$('heroVideo');
if(video){
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const apply=()=>{if(reduce.matches){video.removeAttribute('autoplay');video.pause()}else{video.muted=true;video.play?.().catch(()=>{})}};
 apply();reduce.addEventListener?.('change',apply);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)video.pause();else if(!reduce.matches)video.play?.().catch(()=>{})});
}

function syncCrossLinks(){
 for(const a of document.querySelectorAll('a[href^="shop.html"],a[href^="backgrounds.html"],a[href^="map.html"]')){
  const u=new URL(a.getAttribute('href'),location.href);u.searchParams.set('lang',getLocale());a.setAttribute('href',u.pathname.split('/').pop()+u.search+u.hash);
 }
}
syncCrossLinks();
const lang=$('language');if(lang){lang.value=getLocale();lang.onchange=()=>{setLocale(lang.value);updateLanguageHint();translateStatic();initContactLinks();syncCrossLinks();renderCounters();window.dispatchEvent(new Event('wj-language-change'))}}

const counts={products:null,live:null};
function renderCounters(){
 const host=$('heroCounts');if(!host)return;
 const parts=[];
 if(counts.products!=null)parts.push(tr(`${counts.products} 件商品`,`${counts.products} items`));
 parts.push(tr('285+ 筆背景紀錄','285+ backgrounds'));
 host.textContent='⭐ '+parts.join(' · ');
 const live=$('heroLive');if(live&&counts.live!=null){live.hidden=!counts.live;live.querySelector('span').textContent=tr(`目前 ${counts.live} 個活動進行中`,`${counts.live} events live right now`)}
}
renderCounters();

window.addEventListener('wj-open-product',e=>{location.href='shop.html?product='+encodeURIComponent(e.detail)+'&lang='+getLocale()});
initHomeRefresh({getProducts:()=>products,productName,stockText:p=>stockLabel(p,getLocale()).text});
loadCatalogWithFallback().then(r=>{products=r.products;counts.products=products.filter(p=>p.status!=='sold_out').length;renderCounters();window.dispatchEvent(new CustomEvent('wj-products-ready',{detail:products}))}).catch(()=>window.dispatchEvent(new Event('wj-products-error')));
fetch(ACTIVITY_FEED_URL).then(r=>r.ok?r.json():null).then(feed=>{
 if(!Array.isArray(feed?.events))return;
 counts.live=feed.events.filter(e=>{try{return eventGroup(e)==='live'}catch{return false}}).length;renderCounters();
}).catch(()=>{});
document.addEventListener('click',e=>{if(e.target.closest?.('a[data-contact-line]'))track('line_click')});
track('page_view');track.source?.('home');
