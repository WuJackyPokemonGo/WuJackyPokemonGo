import {BACKGROUNDS_DATA_URL,BACKGROUND_LOCATIONS_URL,WORLD_LAND_URL} from './background-data.mjs';
import {createAtlasMap} from './backgrounds-map.mjs';
import {initAnalytics} from './analytics.mjs';
import {localPokemonName} from './pokemon-names.mjs';
import {localRegionName} from './region-names.mjs';
import {renderActivityFeed,openActivityEvent,activityFeedVariantState} from './activity-feed-ui.mjs';
import {detailPokemonRows,detailPokemonSections,pokemonFormLabel} from './backgrounds-detail-service.mjs';
import {loadBackgroundOverrides,mergeBackgroundOverrides} from './backgrounds-admin-service.mjs';
import {getLocale,localeTag,setLocale,tr,t,productName,initLanguageHint,bindStaticTranslations} from './storefront-locale.mjs';
import {loadPublicCatalog,stockLabel} from './storefront-service.mjs';
import {backgroundState,filterBackgrounds,relatedProducts,safeBackgroundImage,safeSource,sortBackgrounds,referenceArtwork,backgroundArtworkGallery,groupBackgroundCards,filterBackgroundAnnouncements,backgroundProductSummary} from './backgrounds-service.mjs';
const $=id=>document.getElementById(id),PAGE_SIZE=48;
let data=null,products=[],stockState='loading',page=1,active=null,referenceData=null,catalogRequest=null,lastStockUpdate=null,referenceRequest=null,currentList=[],view='list',mapApi=null,mapLoading=null,pendingCity=null;
const track=initAnalytics({background:true});
const title=r=>getLocale()!=='zh'?r.name_en:r.name_zh||r.name_en;
const regionLabel=r=>getLocale()==='zh'?r.region_zh:(localRegionName(r.region_en,getLocale())||r.region_en);
const badgeText=(s,r)=>r?.verification==='owner-confirmed'?tr('管理員已確認','Owner confirmed'):r?.verification==='catalog-crosschecked'?tr('名錄交叉核對','Catalog cross-checked'):({verified:tr('官方活動已核對','Official event checked'),upcoming:tr('即將推出','Upcoming'),pending:tr('待核對','Awaiting verification')})[s];
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
function btn(text,fn){const n=node('button',text);n.type='button';n.onclick=fn;return n}
const translateStatic=bindStaticTranslations();
function translate(){
 translateStatic();
 document.documentElement.lang=localeTag();
 const label=tr('背景收藏圖鑑','Background collection');
 document.title=getLocale()==='zh'?'Wu Jacky Pokémon GO｜'+label:'Wu Jacky Pokémon GO | '+label;
 document.querySelectorAll('[data-zh]').forEach(node=>node.textContent=tr(node.dataset.zh,node.dataset.en));
 document.querySelectorAll('[data-zh-placeholder]').forEach(node=>node.placeholder=tr(node.dataset.zhPlaceholder,node.dataset.enPlaceholder));
}
function options(id,entries,all){const select=$(id),value=select.value;select.replaceChildren();for(const[v,label]of [['',all],...entries]){const o=node('option',label);o.value=v;select.append(o)}if(entries.some(([v])=>v===value))select.value=value}
function buildOptions(){const series=[...new Map([...data.records,...(data.additional_announced_events??[])].map(r=>[r.series,getLocale()==='zh'?r.series_zh:(r.series==='Other'?tr('其他活動','Other'):r.series)])).entries()];options('series',series,tr('全部系列','All series'));const years=[...new Set([...data.records,...(data.additional_announced_events??[])].map(r=>r.year).filter(Boolean))].sort().reverse();options('year',years.map(y=>[y,y]),tr('全部年份','All years'));const regions=[...new Map([...data.records,...(data.additional_announced_events??[])].map(r=>[r.region_en,regionLabel(r)])).entries()].filter(([v])=>v).sort((a,b)=>a[1].localeCompare(b[1]));options('region',regions,tr('全部地區','All regions'))}
function backgroundImage(row){return referenceArtwork(row)}
function picture(row,url=backgroundImage(row)){
 const box=node('span',null,'picture');
 const fallback=()=>{box.classList.add('reference-cover',row.type==='special'?'cover-special':'cover-location');box.replaceChildren(node('span','WJ','cover-mark'),node('span',getLocale()!=='zh'?row.series:row.series_zh||row.series,'cover-series'),node('span',regionLabel(row),'cover-region'),node('span',tr('查看收藏詳情 ↗','Explore this entry ↗'),'cover-hint'))};
 if(!url){fallback();return box}const img=node('img');img.src=url;img.alt=title(row);img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=fallback;box.append(img);return box;
}
function renderReferences(r){
 const host=$('detailReferences');host.replaceChildren();
 const images=backgroundArtworkGallery(r,referenceData);
 host.hidden=!images.length;if(!images.length)return;
 host.append(node('h3',tr('背景圖片','Background images')));
 const links=node('div',null,'image-references');
 images.forEach((entry,i)=>{const a=node('a'),label=tr(entry.label_zh||`背景圖片 ${i+1}`,entry.label_en||`Background image ${i+1}`);if(images.length>1){const img=node('img');img.src=entry.image_url;img.alt=label;img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();a.append(img)}a.append(node('span',label+' ↗'));a.href=entry.image_url;a.target='_blank';a.rel='noopener noreferrer';links.append(a)});host.append(links);
}

function filters(){return{query:$('bgSearch').value,type:$('type').value,series:$('series').value,region:$('region').value,year:$('year').value,state:$('state').value,includeExactUpcoming:true,stockOnly:$('stockOnly').checked&&stockState==='ready',products}}
function renderStats(){$('stats').replaceChildren();for(const[value,label,state]of [[data.records.length,tr('全部紀錄','All entries'),'all'],[data.records.filter(r=>backgroundState(r)==='verified').length,tr('已推出','Released'),'verified'],[data.records.filter(r=>backgroundState(r)==='upcoming').length,tr('即將推出','Upcoming'),'upcoming'],[data.records.filter(r=>backgroundState(r)==='pending').length,tr('待核對','Pending'),'pending']]){const box=btn('',()=>{$('state').value=state;page=1;render()});box.className='stat';box.setAttribute('aria-pressed',String($('state').value===state));box.append(node('strong',String(value)),node('span',label));$('stats').append(box)}}

function renderStockStatus(){
 const time=lastStockUpdate?new Intl.DateTimeFormat(getLocale()!=='zh'?'en-GB':'zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit'}).format(lastStockUpdate):'';
 $('stockStatus').textContent=stockState==='loading'?tr('正在確認相關商品狀態…','Checking related products…'):stockState==='error'?tr('商品狀態暫時無法確認，請按更新重試。','Product status is unavailable. Refresh to retry.'):tr(`商品狀態已同步 · ${time}（台灣時間）；每分鐘自動更新。`,`Product status updated at ${time} (Taiwan time); refreshes every minute.`);
 $('stockOnly').disabled=stockState!=='ready';$('refreshStock').disabled=!!catalogRequest;
}
function appendProductSummary(host,row,{detail=false}={}){
 if(stockState!=='ready'){
  if(detail||(row.related_product_ids??[]).length)host.append(node(detail?'p':'span',stockState==='error'?tr('商品狀態暫時無法確認','Product status unavailable'):tr('正在確認商品狀態…','Checking products…'),'subtle'));
  return;
 }
 const counts=backgroundProductSummary(row,products),tag=detail?'p':'span';
 if(counts.onSale)host.append(node(tag,tr('{n} 樣商品在售中',counts.onSale===1?'{n} product on sale':'{n} products on sale').replace('{n}',counts.onSale),'stockhint'));
 if(counts.inquiry)host.append(node(tag,tr('{n} 樣供貨待確認',counts.inquiry===1?'{n} product to confirm':'{n} products to confirm').replace('{n}',counts.inquiry),'stockhint pending'));
 if(counts.comingSoon)host.append(node(tag,tr('{n} 樣即將推出',counts.comingSoon===1?'{n} product coming soon':'{n} products coming soon').replace('{n}',counts.comingSoon),'stockhint pending'));
 if(!counts.onSale&&!counts.inquiry&&!counts.comingSoon&&(detail||counts.soldOut))host.append(node(tag,tr('暫無在售商品','No products on sale'),'subtle'));
}

function reset(){activityExpansion.clear();$('bgSearch').value='';$('state').value='verified';$('type').value='';$('series').value='';$('year').value='';$('region').value='';$('stockOnly').checked=false;$('sortOrder').value='newest';page=1;render()}
const activityExpansion=new Map();
function backgroundCard(r,{variant=false,matched=false}={}){
  const card=node('article',null,'card'),state=backgroundState(r),open=btn('',()=>openDetail(r));open.className='cardbutton';open.setAttribute('aria-label',tr(`查看 ${title(r)} 背景與寶可夢`,`View ${title(r)} background and Pokémon`));card.dataset.bg=r.background_id;
  const zoom=btn('',()=>openViewer(currentList,r,zoom));zoom.className='cardzoom';zoom.setAttribute('aria-label',tr(`放大 ${title(r)} 背景圖`,`Enlarge ${title(r)} background`));
  const visual=node('span',null,'cardvisual'),type=node('span',r.type==='location'?tr('地標背景','LOCATION'):tr('特殊背景','SPECIAL'),'typeflag '+r.type);
  visual.append(picture(r),type,node('span','⤢','zoomhint'));
  if(state!=='verified')visual.append(node('span',state==='upcoming'?tr('即將推出','UPCOMING'):tr('待核對','PENDING'),'releaseflag '+state));
  const body=node('span',null,'cardbody'),species=variant?r.pokemon?.[0]:null;
  const speciesName=species&&(getLocale()==='zh'?species.name_zh:localPokemonName(species.dex,getLocale())||species.name_en);
  body.append(node('strong',speciesName||title(r),'cardname'));
  if(species){
    body.append(node('span','#'+String(species.dex).padStart(4,'0'),'dex'));
    if(matched)card.classList.add('matched-variant');
  }
  const date=r.start_date||tr(`${r.year||''} 日期待核對`,`${r.year||''} · date to verify`);
  body.append(node('span',date,'carddate'));
  const bottom=node('span',null,'cardmeta');
  if(r.artwork_status==='pending')bottom.append(node('span',tr('圖樣待確認','Artwork unconfirmed'),'evidence pending'));
  appendProductSummary(bottom,r);
  if(bottom.childNodes.length)body.append(bottom);
  body.append(node('span',tr('詳情 ↗','Details ↗'),'carddetail'));
  zoom.append(visual);open.append(body);card.append(zoom,open);return card;
}
function activityCard(group){
 const card=node('article',null,'card activity-group'),details=node('details'),summary=node('summary',null,'cardbutton activity-summary');
 const visual=node('span',null,'cardvisual activity-mosaic');for(const r of group.members)visual.append(picture(r));
 const body=node('span',null,'cardbody');body.append(node('strong',tr('遠古復甦','Ancients Recovered'),'cardname'),node('span',tr('活動日期：2025-06-23','Event date: 2025-06-23'),'english'),node('span',tr('共 6 款特殊背景','6 Special Backgrounds'),'variantcount'));
 if(group.members.length<6)body.append(node('span',tr('目前篩選顯示 {n} 款','Current filters show {n} variants').replace('{n}',group.members.length),'subtle'));
 const combined={related_product_ids:[...new Set(group.members.flatMap(r=>r.related_product_ids??[]))]},saleSummary=node('span',null,'cardmeta');appendProductSummary(saleSummary,combined);body.append(saleSummary);
 const cue=node('span',null,'carddetail');body.append(cue);summary.append(visual,body);
 const variants=node('div',null,'activity-variants');for(const r of group.members)variants.append(backgroundCard(r,{variant:true,matched:!!filters().query.trim()&&group.matchedIds.includes(r.background_id)}));
 const key=JSON.stringify(filters(),(k,v)=>k==='products'?undefined:v),opened=activityExpansion.has(key)?activityExpansion.get(key):!!filters().query.trim();
 const sync=()=>{card.classList.toggle('is-expanded',details.open);cue.textContent=details.open?tr('收合背景 ▴','Collapse backgrounds ▴'):tr('展開背景 ▾','Expand backgrounds ▾')};
 details.open=opened;sync();details.ontoggle=()=>{activityExpansion.set(key,details.open);sync()};details.append(summary,variants);card.append(details);return card;
}

function renderAnnouncementPreviews(){
 const feed=$('announcedBackgrounds');
 renderActivityFeed(feed,data,{variant:'atlas',onBackground:id=>{const row=data.records.find(r=>r.background_id===id);if(row)openDetail(row)},
  products:()=>({state:stockState==='ready'?'ready':stockState==='error'?'error':'loading',list:products}),productName,
  productStatus:p=>(p.price==null?tr('私訊詢價','Ask for price'):'NT$ '+p.price.toLocaleString('zh-TW'))+' · '+stockLabel(p,getLocale()).text,
  productHref:id=>'index.html?product='+encodeURIComponent(id)+'&lang='+getLocale()+'&from=bg'});
 $('activityShortcut').hidden=feed.hidden;
}

function render(){
 if(!data)return;renderStats();renderStockStatus();renderAnnouncementPreviews();
 document.querySelectorAll('.type-tabs button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.type===$('type').value)));
 const list=sortBackgrounds(filterBackgrounds(data.records,filters()),{order:$('sortOrder').value,locale:getLocale()==='zh'?'zh':'en'});
 currentList=list;
 const cards=groupBackgroundCards(list,{eligibleRows:filterBackgrounds(data.records,{...filters(),query:''})});
 const pages=Math.max(1,Math.ceil(cards.length/PAGE_SIZE));page=Math.max(1,Math.min(page,pages));
 $('resultCount').textContent=(getLocale()==='zh'?'{cards} 張主卡 · 符合 {matches} / {total} 筆紀錄':tr('主卡與符合紀錄數','{cards} cards · {matches} / {total} matching entries')).replace('{cards}',cards.length).replace('{matches}',list.length).replace('{total}',data.records.length);
 const grid=$('backgrounds'),had=document.activeElement?.closest?.('#backgrounds [data-bg]'),focusKey=had&&[had.dataset.bg,document.activeElement.classList.contains('cardzoom')?'.cardzoom':'.cardbutton'];grid.replaceChildren();
 for(const r of cards.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE))grid.append(r.activity_id?activityCard(r):backgroundCard(r));
 if(!list.length){const empty=node('div',null,'empty');empty.append(node('p',filterBackgroundAnnouncements(data.additional_announced_events??[],filters()).length?tr('尚無符合的已核對圖樣紀錄；可在活動快訊查看公告。','No matching catalog artwork yet; see Event updates for announcements.'):tr('沒有符合的背景，試試其他搜尋或分類。','No matching backgrounds. Try another search or filter.')));if($('state').value!=='all')empty.append(btn(tr('改看全部收錄','Search all entries'),()=>{$('state').value='all';page=1;render()}));empty.append(btn(tr('重設篩選','Reset filters'),reset));grid.append(empty)}
 const prev=btn(tr('上一頁','Previous'),()=>{page--;render();$('resultCount').scrollIntoView({block:'start'})}),next=btn(tr('下一頁','Next'),()=>{page++;render();$('resultCount').scrollIntoView({block:'start'})});prev.disabled=page<=1;next.disabled=page>=pages;$('pagination').replaceChildren(prev,node('span',`${page} / ${pages}`,'subtle'),next);$('pagination').hidden=cards.length<=PAGE_SIZE||view==='map';
 // Periodic product refreshes rebuild the grid; keep keyboard focus on the same card.
 if(focusKey)[...grid.querySelectorAll('[data-bg]')].find(n=>n.dataset.bg===focusKey[0])?.querySelector(focusKey[1])?.focus({preventScroll:true});
 renderViewState();if(view==='map'&&mapApi?.ready)mapApi.update(list);syncUrl();
}
function addInfo(text,cls){if(text)$('detailInfo').append(node('p',text,cls))}
function pokemonItem(p){
 const english=getLocale()!=='zh';
 const local=localPokemonName(p.dex,getLocale()),base=english?(p.name_en||p.name_zh):(p.name_zh||p.name_en);
 const name=local&&!base.includes(local)?`${local} (${base})`:base;
 const form=pokemonFormLabel(p,getLocale()==='zh'?'zh':'en');
 const label=`#${String(p.dex).padStart(4,'0')} ${name}${form&&!name.includes(form)?' · '+form:''}`;
 const method=english?(p.method_en||p.method_zh):(p.method_zh||p.method_en);
 const pending=p.method_status==='unconfirmed';
 if(!p.start_date&&!method&&!pending){
  const item=node('div',null,'pokemon-item');
  item.append(node('span',label));
  return item;
 }

 const item=node('details',null,'pokemon-item pokemon-conditions');
 item.append(node('summary',label));
 if(p.start_date)item.append(node('small',tr('此款開始：','Variant available from: ')+p.start_date));
 if(method)item.append(node('small',method));
 if(pending)item.append(node('small',tr('取得條件待核對','Acquisition conditions awaiting verification'),'route-pending'));
 return item;
}
function renderAdditionalPokemon(r){
 for(const [key,zh,en,nzh,nen] of [
  ['go_pass_pokemon',`2026 巨大足跡｜GO Pass（${r.go_pass_pokemon?.length ?? 0} 款）`,`2026 Dynamax Trails · GO Pass (${r.go_pass_pokemon?.length ?? 0} variants)`,'依站長名單及 Leek Duck 通行證遭遇池核對；各款實際捕獲回報另行標示。','Cross-checked against the owner’s list and the Leek Duck GO Pass pool. Individual catch reports are marked where available.'],
  ['upcoming_pokemon','2026 巨大足跡｜極巨對戰','2026 Dynamax Trails · Max Battles','依活動名錄列出，逐款背景發放與異色資格仍待確認。','Based on the event catalog. Individual background and Shiny availability are still under review.'],
  ['unconfirmed_pokemon','名錄待核對｜尚無確認取得途徑','Unresolved catalog entries · no verified route','保留來源線索，不視為已發放。','Retained as catalog leads, not confirmed releases.']
 ]){if(!r[key]?.length)continue;const section=node('section',null,'pokemon-route');section.dataset.route=key;section.append(node('h4',tr(zh,en)),node('p',tr(nzh,nen),'subtle'));const items=node('div',null,'pokemon');for(const p of detailPokemonRows({pokemon:r[key]}))items.append(pokemonItem(p));section.append(items);$('detailPokemon').append(section)}
}
function renderDetailPokemon(r){
 const host=$('detailPokemon'),sections=detailPokemonSections(r);host.classList.toggle('has-route-sections',!!sections.length);
 if(!sections.length){for(const p of detailPokemonRows(r))host.append(pokemonItem(p));return}
 host.append(node('p',tr('各區依圖鑑編號排列；同一款若有多種取得方式，會重複列於對應區域，款數不重複累加。','Each section is sorted by Pokédex number. Variants with multiple acquisition routes appear in each relevant section, without increasing the encounter count.'),'route-explanation'));
 for(const section of sections){const box=node('section',null,'pokemon-route'),heading=node('h4',getLocale()!=='zh'?section.label_en:section.label_zh);box.dataset.route=section.id;box.append(heading);
  const note=getLocale()!=='zh'?section.note_en:section.note_zh;if(note)box.append(node('p',note,'subtle'));
  if(section.source&&safeSource(section.source)){const source=node('a',tr('活動來源 ↗','Event source ↗'),'route-source');source.href=safeSource(section.source);source.target='_blank';source.rel='noopener noreferrer';box.append(source)}
  const items=node('div',null,'pokemon');for(const p of section.pokemon)items.append(pokemonItem(p));box.append(items);host.append(box);
 }
}
function renderDetail(r){renderReferences(r);$('detailTitle').textContent=title(r);$('detailEnglish').textContent=getLocale()!=='zh'?(r.name_zh||''):r.name_en;$('detailImage').replaceChildren(picture(r,referenceArtwork(r,referenceData)));$('detailInfo').replaceChildren();addInfo(badgeText(backgroundState(r),r));addInfo(regionLabel(r));if(r.start_date)addInfo(tr('活動日期：','Event dates: ')+r.start_date+(r.end_date?' – '+r.end_date:''));else addInfo(tr('來源原始日期（尚待核對）：','Source dates (unverified): ')+(r.dates_source||tr('待確認','To be confirmed')));addInfo(getLocale()!=='zh'?r.date_note_en:r.date_note_zh);addInfo(getLocale()!=='zh'?r.artwork_note_en:r.artwork_note_zh,'subtle');addInfo(getLocale()!=='zh'?r.method_en:r.method_zh);addInfo(getLocale()!=='zh'?r.return_note_en:r.return_note_zh,'notice');if(!r.method_zh&&!r.method_en)addInfo(tr('取得方式仍在核對中，請以原活動公告為準。','The acquisition method is still being checked. Refer to the original event announcement.'));if(backgroundState(r)==='pending')addInfo(tr('此項資料尚未完成核對，不作為已發放或目前可取得的證明。','This entry awaits verification and is not proof of release or current availability.'),'notice');if(backgroundState(r)==='upcoming')addInfo(tr('活動尚未開始，請以官方最新公告為準。','This event is upcoming. Check the latest official announcement.'),'notice');$('detailPokemon').replaceChildren();$('detailEvolutions').replaceChildren();renderDetailPokemon(r);renderAdditionalPokemon(r);const pendingMethods=[r.pokemon,r.evolved_pokemon,r.upcoming_pokemon,r.unconfirmed_pokemon].some(rows=>rows?.some(p=>p.method_status==='unconfirmed'));const notice=$('pokemonMethodNotice');notice.hidden=!pendingMethods;notice.textContent=tr('部分款式的取得條件仍待核對，可點選名稱查看個別說明。','Some acquisition conditions are still being checked. Select a Pokémon to see its details.');for(const p of detailPokemonRows(r,{evolved:true}))$('detailEvolutions').append(pokemonItem(p));$('evolutionSection').hidden=!r.evolved_pokemon?.length;$('pokemonCount').textContent=tr('{a} 款原始遭遇 · {b} 款進化／合體','{a} encounter/source variants; {b} evolution or fusion variants.').replace('{a}',r.pokemon?.length||0).replace('{b}',r.evolved_pokemon?.length||0);if(!r.pokemon?.length)$('detailPokemon').append(node('p',tr('適用寶可夢待確認。','Eligible Pokémon to be confirmed.'),'subtle'));$('detailProducts').replaceChildren();appendProductSummary($('detailProducts'),r,{detail:true});const related=stockState==='ready'?relatedProducts(r,products):[];for(const p of related){const a=node('a',null,'related');a.href='index.html?product='+encodeURIComponent(p.id)+'&lang='+getLocale()+'&from=bg';a.addEventListener('click',()=>track('background_product_click',r.background_id));a.append(node('strong',productName(p)),node('span',(p.price==null?tr('私訊詢價','Ask for price'):'NT$ '+p.price.toLocaleString('zh-TW'))+' · '+stockLabel(p,getLocale()).text));$('detailProducts').append(a)}if(!related.length&&stockState==='ready')$('detailProducts').append(node('p',stockState==='ready'?tr('目前商品目錄尚無對應商品，可返回目錄查看其他收藏。','There are no linked products in the current catalog. Browse the collection for other items.'):tr('相關商品資料暫時無法確認。','Related product information is currently unavailable.'),'subtle'));renderDetailSources(r)}
function renderDetailSources(r){$('detailSources').replaceChildren();for(const url of [...new Set([...(r.official_sources??[]),...(r.catalog_sources??[]),r.artwork_preview_source,...(r.artwork_variants??[]).map(v=>v.source_url),r.source,(referenceData?.entries??[]).some(x=>x.background_id===r.background_id)?referenceData.source:null].filter(Boolean))]){const href=safeSource(url);if(!href)continue;const a=node('a',url.includes('pokemongo.com')?tr('Pokémon GO 官方公告 ↗','Official Pokémon GO announcement ↗'):url.includes('serebii.net')?'Serebii ↗':new URL(url).hostname+' ↗');a.href=href;a.target='_blank';a.rel='noopener noreferrer';$('detailSources').append(a)}}
function loadReferenceDetails(){
 if(!referenceRequest)referenceRequest=fetch('data/background-reference-facts.json?v=20261106-form-labels',{signal:AbortSignal.timeout(10000)})
  .then(response=>{if(!response.ok)throw Error('reference unavailable');return response.json()})
  .then(value=>{
   referenceData=value;
   if(active&&$('backgroundDialog').open){
    const image=$('detailImage').querySelector('img')?.src;
    const updated=referenceArtwork(active,referenceData);
    if(updated&&updated!==image)$('detailImage').replaceChildren(picture(active,updated));
    renderReferences(active);renderDetailSources(active);
   }
  }).catch(()=>{referenceRequest=null});
}
function openDetail(r){active=r;$('backgroundLinkStatus').textContent='';$('backgroundLinkText').hidden=true;renderDetail(r);$('backgroundDialog').showModal();loadReferenceDetails();track('background_view',r.background_id);const url=new URL(location.href);url.searchParams.set('background',r.background_id);history.replaceState(null,'',url)}
$('copyBackgroundLink').onclick=async()=>{
 const row=active;
 if(!row)return;
 const locale=getLocale();
 const url=/^BG-\d{4}$/.test(row.background_id)?new URL('bg/'+row.background_id+'.html',location.href):new URL(location.pathname,location.origin);
 if(!url.pathname.includes('/bg/'))url.searchParams.set('background',row.background_id);
 url.searchParams.set('lang',locale);
 const text=title(row)+'\n'+url.href;
 const status=$('backgroundLinkStatus'),input=$('backgroundLinkText');
 const isCurrent=()=>active===row&&getLocale()===locale&&$('backgroundDialog').open;
 try{
  await navigator.clipboard.writeText(text);
  if(!isCurrent())return;
  input.hidden=true;
  status.textContent=tr('背景連結已複製，可直接分享。','Background link copied. Ready to share.');
 }catch{
  if(!isCurrent())return;
  input.value=text;
  input.hidden=false;
  input.focus();
  input.select();
  input.setSelectionRange(0,input.value.length);
  status.textContent=t('請在文字框長按全選後複製。');
 }
};
const updateLanguageHint=initLanguageHint();$('closeDetail').onclick=()=>$('backgroundDialog').close();$('reset').onclick=reset;$('language').value=getLocale();$('language').onchange=()=>{setLocale($('language').value);syncCrossLinks();updateLanguageHint();translate();window.dispatchEvent(new Event('wj-language-change'));if(data){buildOptions();render();if(active){$('backgroundLinkStatus').textContent='';$('backgroundLinkText').hidden=true;renderDetail(active)}}};for(const id of ['state','type','series','region','year','stockOnly','sortOrder'])$(id).onchange=()=>{page=1;render()};document.querySelectorAll('.type-tabs button').forEach(b=>b.onclick=()=>{$('type').value=b.dataset.type;page=1;render()});let bgSearchTimer=null,lastBgSearch='';$('bgSearch').oninput=()=>{page=1;render();clearTimeout(bgSearchTimer);bgSearchTimer=setTimeout(()=>{const term=$('bgSearch').value.trim();if(!term||term===lastBgSearch||!data)return;lastBgSearch=term;if(!filterBackgrounds(data.records,{query:term,state:'all',includeExactUpcoming:true}).length)track.emptyTerm('atlas',term)},900)};translate();
// ---- Large image viewer: browses the current filtered results (or one place on the map). ----
const viewerState={list:[],index:0,opener:null,scrollY:0,skipRestore:false};
function openViewer(list,row,opener){
 const rows=Array.isArray(list)&&list.length?list:[row];let i=rows.findIndex(x=>x.background_id===row.background_id);
 viewerState.list=i<0?[row]:rows;viewerState.index=Math.max(0,i);viewerState.opener=opener||document.activeElement;viewerState.scrollY=window.scrollY;viewerState.skipRestore=false;
 renderViewer();if(!$('bgViewer').open)$('bgViewer').showModal();loadReferenceDetails();
}
function viewerStep(delta){const next=viewerState.index+delta;if(next<0||next>=viewerState.list.length)return;viewerState.index=next;renderViewer()}
function renderViewer(){
 const r=viewerState.list[viewerState.index];if(!r)return;const total=viewerState.list.length;
 $('viewerCounter').textContent=`${viewerState.index+1} / ${total}`;$('viewerTitle').textContent=title(r);
 const fig=$('viewerFigure'),url=referenceArtwork(r,referenceData);fig.replaceChildren();
 if(url){const img=node('img');img.src=url;img.alt=title(r);img.referrerPolicy='no-referrer';img.decoding='async';img.onerror=()=>fig.replaceChildren(picture(r,''));fig.append(img)}else fig.append(picture(r,''));
 const dates=r.start_date?r.start_date+(r.end_date&&r.end_date!==r.start_date?' – '+r.end_date:''):tr('日期待核對','Date to verify');
 $('viewerInfo').textContent=[getLocale()!=='zh'?r.series:(r.series_zh||r.series),regionLabel(r),dates,r.background_id,tr(`${r.pokemon?.length||0} 款寶可夢`,`${r.pokemon?.length||0} Pokémon`)].filter(Boolean).join(' · ');
 const actions=$('viewerActions');actions.replaceChildren();
 const detail=btn(tr('背景詳情','Background details'),()=>{viewerState.skipRestore=$('backgroundDialog').open;$('bgViewer').close();if($('backgroundDialog').open){active=r;renderDetail(r);const url=new URL(location.href);url.searchParams.set('background',r.background_id);history.replaceState(history.state,'',url)}else openDetail(r)});detail.className='primary';actions.append(detail);
 if(stockState!=='ready'){if((r.related_product_ids??[]).length)actions.append(node('span',stockState==='error'?tr('商品狀態暫時無法確認','Product status unavailable'):tr('正在確認商品狀態…','Checking products…'),'subtle'))}
 else{const related=relatedProducts(r,products);for(const p of related.slice(0,3)){const a=node('a',null,'related');a.href='index.html?product='+encodeURIComponent(p.id)+'&lang='+getLocale()+'&from=bg';a.addEventListener('click',()=>track('background_product_click',r.background_id));a.append(node('strong',tr('相關商品：','Product: ')+productName(p)),node('span',(p.price==null?tr('私訊詢價','Ask for price'):'NT$ '+p.price.toLocaleString('zh-TW'))+' · '+stockLabel(p,getLocale()).text));actions.append(a)}
  if(related.length>3)actions.append(node('span',tr(`另有 ${related.length-3} 件，請看背景詳情`,`${related.length-3} more in the details`),'subtle'));
  if(!related.length){const a=node('a',tr('目前沒有相關商品，前往商品目錄 ↗','No linked products — browse the collection ↗'),'quiet');a.href='index.html?lang='+getLocale();actions.append(a)}}
 $('viewerPrev').disabled=viewerState.index<=0;$('viewerNext').disabled=viewerState.index>=total-1;
 for(const d of [-1,1]){const n=viewerState.list[viewerState.index+d],u=n&&referenceArtwork(n,referenceData);if(u){const img=new Image();img.referrerPolicy='no-referrer';img.src=u}}
}
$('viewerPrev').onclick=()=>viewerStep(-1);$('viewerNext').onclick=()=>viewerStep(1);$('viewerClose').onclick=()=>$('bgViewer').close();
$('bgViewer').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();viewerStep(-1)}else if(e.key==='ArrowRight'){e.preventDefault();viewerStep(1)}});
$('bgViewer').addEventListener('click',e=>{if(e.target===$('bgViewer'))$('bgViewer').close()});
{let sx=null;$('viewerFigure').addEventListener('pointerdown',e=>{sx={x:e.clientX,y:e.clientY}});$('viewerFigure').addEventListener('pointerup',e=>{if(!sx)return;const dx=e.clientX-sx.x,dy=e.clientY-sx.y;sx=null;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.4)viewerStep(dx<0?1:-1)})}
// Closing returns focus to the card of the image last viewed (same scroll position when it is not on this page).
$('bgViewer').addEventListener('close',()=>{
 if(viewerState.skipRestore){viewerState.skipRestore=false;return}
 const r=viewerState.list[viewerState.index],card=r&&!$('backgroundDialog').open&&view==='list'?[...document.querySelectorAll('#backgrounds [data-bg]')].find(n=>n.dataset.bg===r.background_id)?.querySelector('.cardzoom'):null;
 if(card){card.focus({preventScroll:true});const rect=card.getBoundingClientRect();if(rect.bottom<0||rect.top>window.innerHeight)card.scrollIntoView({block:'center'});return}
 if(viewerState.opener?.isConnected)viewerState.opener.focus({preventScroll:true});if(!$('backgroundDialog').open)window.scrollTo(0,viewerState.scrollY);
});
$('zoomDetail').onclick=()=>{if(!active)return;const inList=currentList.some(r=>r.background_id===active.background_id);openViewer(inList?currentList:[active],active,$('zoomDetail'))};
$('detailImage').addEventListener('click',e=>{if(e.target.closest('img')&&active)$('zoomDetail').click()});

// ---- List / map views share the same filters. ----
function specialCount(){return data?filterBackgrounds(data.records,{...filters(),type:'special'}).length:0}
function renderViewState(){
 document.querySelectorAll('.view-switch button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
 document.querySelectorAll('[data-view-link]').forEach(a=>{if(a.dataset.viewLink===view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
 $('mapView').hidden=view!=='map';$('backgrounds').hidden=view==='map';
 const n=specialCount(),label=tr(`全球特殊背景（${n}）`,`Global special backgrounds (${n})`);$('globalEntry').textContent=label;$('globalEntryMap').textContent=label;
}
function setView(next){view=next==='map'?'map':'list';if(view==='map')ensureMap().then(()=>{if(view==='map')render()});render()}
function ensureMap(){
 if(mapApi?.ready)return Promise.resolve();
 if(!mapLoading){
  $('mapStatus').textContent=tr('正在載入地圖…','Loading map…');
  const get=url=>fetch(url,{signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw Error('map data unavailable');return r.json()});
  mapLoading=Promise.all([get(BACKGROUND_LOCATIONS_URL),get(WORLD_LAND_URL)]).then(([locations,land])=>{
   mapApi??=createAtlasMap({svg:$('worldMap'),markers:$('mapMarkers'),land:$('mapLand'),shell:document.querySelector('.map-shell'),zoomIn:$('mapZoomIn'),zoomOut:$('mapZoomOut'),reset:$('mapReset'),count:$('mapCount'),spotlight:$('mapSpotlight'),placeList:$('placeList'),placeFilter:$('placeFilter'),unmappedNote:$('unmappedNote'),tr,getLocale,
    titleOf:title,imageOf:r=>referenceArtwork(r,referenceData),onOpenDetail:openDetail,onZoom:(rows,i,opener)=>openViewer(rows,rows[i],opener),onSelect:()=>syncUrl(),
    productSummary:r=>{if(stockState!=='ready')return '';const c=backgroundProductSummary(r,products);return c.onSale?tr(`${c.onSale} 樣商品在售中`,`${c.onSale} on sale`):''}});
   mapApi.setData(locations,land.land);$('mapStatus').textContent='';
   if(pendingCity){mapApi.update(currentList);mapApi.select(pendingCity,{center:true});pendingCity=null}
  }).catch(()=>{mapLoading=null;$('mapStatus').replaceChildren(node('span',tr('地圖資料暫時無法載入。','The map could not be loaded.')),btn(tr('重試','Retry'),()=>ensureMap().then(render)))});
 }
 return mapLoading;
}
document.querySelectorAll('.view-switch button').forEach(b=>b.onclick=()=>setView(b.dataset.view));
for(const id of ['globalEntry','globalEntryMap'])$(id).onclick=()=>{$('type').value='special';page=1;setView('list');$('resultCount').scrollIntoView({block:'start'})};
document.querySelectorAll('[data-view-link]').forEach(a=>a.addEventListener('click',e=>{if(!data)return;e.preventDefault();setView(a.dataset.viewLink);document.querySelector('.atlas-results')?.scrollIntoView({block:'start'})}));
// Filters, view and page live in the URL so Back, reload and shared links restore them.
function syncUrl(){
 if(!data)return;const u=new URL(location.href),set=(k,v)=>v?u.searchParams.set(k,v):u.searchParams.delete(k);
 set('q',$('bgSearch').value.trim());set('type',$('type').value);set('series',$('series').value);set('region',$('region').value);set('year',$('year').value);
 set('state',$('state').value==='verified'?'':$('state').value);set('sort',$('sortOrder').value==='newest'?'':$('sortOrder').value);
 set('view',view==='map'?'map':'');set('page',page>1&&view==='list'?String(page):'');set('city',view==='map'?mapApi?.selected||pendingCity||'':'');
 if(u.href!==location.href)history.replaceState(history.state,'',u);
}
function applyUrlState(){
 const p=new URL(location.href).searchParams,choose=(id,v)=>{if(v!=null&&[...$(id).options].some(o=>o.value===v))$(id).value=v};
 $('bgSearch').value=p.get('q')||'';if(['location','special'].includes(p.get('type')))$('type').value=p.get('type');
 choose('series',p.get('series'));choose('region',p.get('region'));choose('year',p.get('year'));choose('state',p.get('state'));choose('sortOrder',p.get('sort'));
 page=Math.max(1,parseInt(p.get('page'),10)||1);view=p.get('view')==='map'?'map':'list';pendingCity=p.get('city');
 const feed=activityFeedVariantState('atlas');if(p.get('events')==='history'){feed.historyOpen=true;feed.feedOpen=true}if(location.hash==='#announcedBackgrounds'||p.get('event'))feed.feedOpen=true;
}
let pendingScroll=null;
try{const nav=performance.getEntriesByType?.('navigation')?.[0];if(nav?.type==='back_forward'){const saved=JSON.parse(sessionStorage.getItem('wj_scroll_atlas')||'null');if(saved&&saved.path===location.pathname)pendingScroll=saved.y}}catch{}
window.addEventListener('pagehide',()=>{try{sessionStorage.setItem('wj_scroll_atlas',JSON.stringify({y:window.scrollY,path:location.pathname}))}catch{}});
$('activityShortcut').addEventListener('click',()=>activityFeedVariantState('atlas').setFeedOpen?.(true));
async function load(){
 try{
  const catalog=fetch(BACKGROUNDS_DATA_URL,{signal:AbortSignal.timeout(15000)}).then(response=>{if(!response.ok)throw Error('catalog unavailable');return response.json()});
  const [nextData,overrides]=await Promise.all([catalog,loadBackgroundOverrides()]);
  if(!Array.isArray(nextData.records))throw Error('invalid catalog');
  nextData.records=mergeBackgroundOverrides(nextData.records,overrides);data=nextData;
  buildOptions();applyUrlState();if(view==='map')ensureMap().then(()=>{if(view==='map')render()});render();$('loadStatus').hidden=true;
  const id=new URL(location.href).searchParams.get('background');
  const target=data.records.find(r=>r.background_id===(data.redirects?.[id]||id));
  track('background_page_view');track.source('atlas');if(target)openDetail(target);
  const params=new URL(location.href).searchParams,eventId=params.get('event')||decodeURIComponent(location.hash.match(/^#event-(.+)$/)?.[1]??'');
  if(eventId&&!target)openActivityEvent($('announcedBackgrounds'),'atlas',eventId);
  else if((location.hash==='#announcedBackgrounds'||params.get('events')==='history')&&!target)requestAnimationFrame(()=>$('announcedBackgrounds').scrollIntoView({block:'start'}));
  else if(pendingScroll!=null&&!target){const y=pendingScroll;pendingScroll=null;requestAnimationFrame(()=>window.scrollTo(0,y))}
 }catch{
  $('loadStatus').replaceChildren(node('p',tr('圖鑑暫時無法載入，請稍後重試。','The background collection could not be loaded. Please try again.')),btn(tr('重新載入','Retry'),load));
 }
}
async function refreshProducts(){
 if(catalogRequest)return catalogRequest;
 catalogRequest=(async()=>{
  try{products=await loadPublicCatalog();stockState='ready';lastStockUpdate=new Date()}
  catch{products=[];stockState='error'}
  finally{catalogRequest=null;render();renderStockStatus();if(active)renderDetail(active)}
 })();renderStockStatus();return catalogRequest;
}
$('refreshStock').onclick=refreshProducts;
window.addEventListener('focus',()=>{if(document.visibilityState!=='hidden')refreshProducts()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshProducts()});
setInterval(()=>{if(document.visibilityState!=='hidden')refreshProducts()},60000);
load();refreshProducts();

setInterval(()=>{if(data&&document.visibilityState!=='hidden')renderAnnouncementPreviews()},60000);
document.addEventListener('visibilitychange',()=>{if(data&&document.visibilityState==='visible')renderAnnouncementPreviews()});
// Keep the visitor's language when returning to the collection.
function syncCrossLinks(){document.querySelectorAll('a[href^="index.html"],a[href^="backgrounds.html"]').forEach(a=>{const page=a.getAttribute('href').startsWith('index.html')?'index.html':'backgrounds.html',u=new URL(a.getAttribute('href'),location.href);u.searchParams.set('lang',getLocale());a.setAttribute('href',page+u.search+u.hash)})}
syncCrossLinks();
