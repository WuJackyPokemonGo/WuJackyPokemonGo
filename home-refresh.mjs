import {ACTIVITY_FEED_URL} from './background-data.mjs';
import {getLocale,tr} from './storefront-locale.mjs';
import {renderActivityFeed,openActivityEvent} from './activity-feed-ui.mjs';

// Home page additions: a quick product search at the top, the shared event feed (same data and
// status logic as the atlas), deep links (?event= / ?q=) and scroll restoration on Back.
export function initHomeRefresh({getProducts,productName,stockText}={}){
 if(typeof document==='undefined')return;
 const $=id=>document.getElementById(id),host=$('homeEvents');
 let feed=null,productState='loading',request=null,openedDeepLink=false;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
 const params=new URL(location.href).searchParams;

 // Quick search mirrors the catalog search; Enter jumps to the results.
 const quick=$('quickSearch'),main=$('search'),form=$('quickSearchForm'),status=$('quickSearchStatus');
 const syncStatus=()=>{if(!status)return;const term=quick.value.trim();status.replaceChildren();if(!term)return;const count=productState==='ready'?$('count')?.textContent||'':productState==='error'?tr('商品暫時無法載入','Products unavailable'):'';const jump=el('a',tr('查看結果 ↓','See results ↓'),'quick-jump');jump.href='#products';status.append(el('span',count||tr('商品載入中…','Loading products…')),jump)};
 if(quick&&main){
  quick.addEventListener('input',()=>{main.value=quick.value;main.dispatchEvent(new Event('input'));syncStatus()});
  main.addEventListener('input',()=>{if(document.activeElement!==quick){quick.value=main.value;syncStatus()}});
  $('reset')?.addEventListener('click',()=>{quick.value='';syncStatus()});
  form?.addEventListener('submit',event=>{event.preventDefault();main.value=quick.value;main.dispatchEvent(new Event('input'));syncStatus();quick.blur();(document.querySelector('.sectionhead')||$('products'))?.scrollIntoView({block:'start'})});
 }

 const options=()=>({variant:'home',limit:document.body.classList.contains('landing-page')?3:8,
  products:()=>({state:productState,list:getProducts?.()??[]}),
  onProduct:id=>window.dispatchEvent(new CustomEvent('wj-open-product',{detail:id})),
  productName,productStatus:stockText,
  productHref:id=>'shop.html?product='+encodeURIComponent(id)+'&lang='+getLocale(),
  backgroundHref:id=>'backgrounds.html?background='+encodeURIComponent(id)+'&lang='+getLocale(),
  moreHref:()=>'backgrounds.html?lang='+getLocale()+'#announcedBackgrounds',
  historyHref:()=>'backgrounds.html?lang='+getLocale()+'&events=history#announcedBackgrounds'});
 function render(force=false){
  if(!host||!feed)return;
  renderActivityFeed(host,feed,{...options(),force});
  if(!openedDeepLink){openedDeepLink=true;const id=params.get('event')||(location.hash.match(/^#event-(.+)$/)?.[1]??'');if(id&&!openActivityEvent(host,'home',decodeURIComponent(id))){const note=el('p',null,'ev-note ev-deeplink');const a=el('a',tr('這個活動不在目前清單（可能已結束），到背景圖鑑查看 →','This event is not in the current list (it may have ended). Open it in the atlas →'));a.href='backgrounds.html?event='+encodeURIComponent(id)+'&lang='+getLocale()+'#event-'+encodeURIComponent(id);note.append(a);host.prepend(note)}}
 }
 function loadFeed(){
  if(!host)return;
  if(!request){
   host.setAttribute('aria-busy','true');
   request=fetch(ACTIVITY_FEED_URL,{signal:AbortSignal.timeout?.(12000)})
    .then(r=>{if(!r.ok)throw Error('feed unavailable');return r.json()})
    .then(value=>{if(!Array.isArray(value?.events))throw Error('invalid feed');feed=value;host.removeAttribute('aria-busy');render(true);restoreScroll()})
    .catch(()=>{request=null;host.removeAttribute('aria-busy');host.replaceChildren(el('p',tr('活動資料暫時無法載入。','Events could not be loaded.'),'ev-error'));const retry=el('button',tr('重新載入活動','Retry'),'btn alt');retry.type='button';retry.onclick=()=>{host.replaceChildren(el('p',tr('正在載入活動…','Loading events…'),'ev-loading'));loadFeed()};host.append(retry)});
  }
  return request;
 }
 window.addEventListener('wj-products-ready',()=>{productState='ready';render(true);syncStatus();
  const q=params.get('q');if(q&&main&&!main.value){main.value=q;if(quick)quick.value=q;main.dispatchEvent(new Event('input'));syncStatus()}
  restoreScroll()});
 window.addEventListener('wj-products-error',()=>{productState='error';render(true)});
 window.addEventListener('wj-language-change',()=>{render(true);syncStatus()});
 setInterval(()=>{if(document.visibilityState!=='hidden')render()},60000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')render()});

 // Back/forward: restore the reading position once the async content has rendered.
 const KEY='wj_scroll_home';let pendingY=null;
 try{const nav=performance.getEntriesByType?.('navigation')?.[0];if(nav?.type==='back_forward'){const saved=JSON.parse(sessionStorage.getItem(KEY)||'null');if(saved&&saved.path===location.pathname+location.search)pendingY=saved.y}}catch{}
 function restoreScroll(){if(pendingY==null||!feed||productState==='loading')return;const y=pendingY;pendingY=null;requestAnimationFrame(()=>window.scrollTo(0,y))}
 window.addEventListener('pagehide',()=>{try{sessionStorage.setItem(KEY,JSON.stringify({y:window.scrollY,path:location.pathname+location.search}))}catch{}});
 loadFeed();
}
