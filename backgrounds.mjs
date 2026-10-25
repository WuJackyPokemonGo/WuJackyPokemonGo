import {detailPokemonRows,detailPokemonSections,pokemonFormLabel} from './backgrounds-detail-service.mjs';
import {loadBackgroundOverrides,mergeBackgroundOverrides} from './backgrounds-admin-service.mjs';
import {getLocale,setLocale,tr,productName,initLanguageHint} from './storefront-locale.mjs';
import {loadPublicCatalog,stockLabel} from './storefront-service.mjs';
import {backgroundState,filterBackgrounds,relatedProducts,safeBackgroundImage,safeSource,sortBackgrounds,referenceArtwork,backgroundArtworkGallery,groupBackgroundCards} from './backgrounds-service.mjs';
const $=id=>document.getElementById(id),PAGE_SIZE=48;
let data=null,products=[],stockState='loading',page=1,active=null,referenceData=null;
const title=r=>getLocale()==='en'?r.name_en:r.name_zh||r.name_en;
const badgeText=(s,r)=>r?.verification==='owner-confirmed'?tr('管理員已確認','Owner confirmed'):r?.verification==='catalog-crosschecked'?tr('名錄交叉核對','Catalog cross-checked'):({verified:tr('官方活動已核對','Official event checked'),upcoming:tr('即將推出','Upcoming'),pending:tr('待核對','Awaiting verification')})[s];
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
function btn(text,fn){const n=node('button',text);n.type='button';n.onclick=fn;return n}
function translate(){document.documentElement.lang=getLocale()==='en'?'en':'zh-Hant';document.title=tr('Wu Jacky Pokémon GO｜背景收藏圖鑑','Wu Jacky Pokémon GO | Background collection');document.querySelectorAll('[data-zh]').forEach(n=>n.textContent=n.dataset[getLocale()]);document.querySelectorAll('[data-zh-placeholder]').forEach(n=>n.placeholder=getLocale()==='en'?n.dataset.enPlaceholder:n.dataset.zhPlaceholder)}
function options(id,entries,all){const select=$(id),value=select.value;select.replaceChildren();for(const[v,label]of [['',all],...entries]){const o=node('option',label);o.value=v;select.append(o)}if(entries.some(([v])=>v===value))select.value=value}
function buildOptions(){const series=[...new Map(data.records.map(r=>[r.series,getLocale()==='en'?r.series:r.series_zh])).entries()];options('series',series,tr('全部系列','All series'));const years=[...new Set(data.records.map(r=>r.year).filter(Boolean))].sort().reverse();options('year',years.map(y=>[y,y]),tr('全部年份','All years'));const regions=[...new Map(data.records.map(r=>[r.region_en,getLocale()==='en'?r.region_en:r.region_zh])).entries()].filter(([v])=>v).sort((a,b)=>a[1].localeCompare(b[1]));options('region',regions,tr('全部地區','All regions'))}
function backgroundImage(row){return referenceArtwork(row,referenceData)}
function picture(row){
 const box=node('span',null,'picture'),url=backgroundImage(row);
 const fallback=()=>{box.classList.add('reference-cover',row.type==='special'?'cover-special':'cover-location');box.replaceChildren(node('span','WJ','cover-mark'),node('span',getLocale()==='en'?row.series:row.series_zh||row.series,'cover-series'),node('span',getLocale()==='en'?row.region_en:row.region_zh,'cover-region'),node('span',tr('查看收藏詳情 ↗','Explore this entry ↗'),'cover-hint'))};
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

function filters(){return{query:$('bgSearch').value,type:$('type').value,series:$('series').value,region:$('region').value,year:$('year').value,state:$('state').value,stockOnly:$('stockOnly').checked,products}}
function renderStats(){$('stats').replaceChildren();for(const[value,label,state]of [[data.records.length,tr('全部紀錄','All entries'),'all'],[data.records.filter(r=>backgroundState(r)==='verified').length,tr('已推出','Released'),'verified'],[data.records.filter(r=>backgroundState(r)==='upcoming').length,tr('即將推出','Upcoming'),'upcoming'],[data.records.filter(r=>backgroundState(r)==='pending').length,tr('待核對','Pending'),'pending']]){const box=btn('',()=>{$('state').value=state;page=1;render()});box.className='stat';box.setAttribute('aria-pressed',String($('state').value===state));box.append(node('strong',String(value)),node('span',label));$('stats').append(box)}}

function renderStockStatus(){$('stockStatus').textContent=stockState==='loading'?tr('正在確認相關商品庫存…','Checking related product stock…'):stockState==='error'?tr('暫時無法確認相關商品庫存，請稍後重試。','Related product stock could not be checked. Please try again later.'):tr('相關商品與庫存以目前商品目錄為準。','Related products and stock reflect the current product catalog.');$('stockOnly').disabled=stockState!=='ready'}
function reset(){activityExpansion.clear();$('bgSearch').value='';$('state').value='verified';$('type').value='';$('series').value='';$('year').value='';$('region').value='';$('stockOnly').checked=false;$('sortOrder').value='newest';page=1;render()}
const activityExpansion=new Map();
function backgroundCard(r,{variant=false,matched=false}={}){
  const card=node('article',null,'card'),state=backgroundState(r),open=btn('',()=>openDetail(r));open.className='cardbutton';open.setAttribute('aria-label',tr(`查看 ${title(r)} 背景與寶可夢`,`View ${title(r)} background and Pokémon`));
  const visual=node('span',null,'cardvisual'),type=node('span',r.type==='location'?tr('地標背景','LOCATION'):tr('特殊背景','SPECIAL'),'typeflag '+r.type);
  visual.append(picture(r),type);
  if(state!=='verified')visual.append(node('span',state==='upcoming'?tr('即將推出','UPCOMING'):tr('待核對','PENDING'),'releaseflag '+state));
  const date=node('span',r.start_date||tr(`${r.year||''} 日期待核對`,`${r.year||''} · date to verify`),'dateflag');date.title=tr('活動開始日期；缺少精確日期時保留待核對。','Event start; dates without exact evidence remain unverified.');visual.append(date);
  const body=node('span',null,'cardbody'),species=variant?r.pokemon?.[0]:null;body.append(node('strong',species?(getLocale()==='en'?species.name_en:species.name_zh):title(r),'cardname'),node('span',species?(getLocale()==='en'?species.name_zh:species.name_en):(getLocale()==='en'?(r.name_zh||''):r.name_en),'english'));if(species)body.append(node('span','#'+String(species.dex).padStart(4,'0'),'variantcount'));if(variant)card.classList.add('activity-variant');if(matched)card.classList.add('search-match');
  const original=r.pokemon?.length||0,evolved=r.evolved_pokemon?.length||0,count=node('span',tr(`${original} 款原始${evolved?` · ${evolved} 款進化／合體`:''}`,`${original} encounter${original===1?'':'s'}${evolved?` · ${evolved} evolved/fused`:''}`),'variantcount');body.append(count);
  const bottom=node('span',null,'cardmeta');bottom.append(node('span',badgeText(state,r),'evidence '+state));
  const stock=relatedProducts(r,products).filter(p=>['available','low_stock'].includes(p.status)&&Number.isInteger(p.stock_quantity)&&p.stock_quantity>0);
  if(stock.length)bottom.append(node('span',tr('有商品','In stock'),'stockhint'));body.append(bottom,node('span',tr('詳情 ↗','Details ↗'),'carddetail'));open.append(visual,body);card.append(open);return card;
}
function activityCard(group){
 const card=node('article',null,'card activity-group'),details=node('details'),summary=node('summary',null,'cardbutton activity-summary');
 const visual=node('span',null,'cardvisual activity-mosaic');for(const r of group.members)visual.append(picture(r));
 const body=node('span',null,'cardbody');body.append(node('strong','遠古復甦｜Ancients Recovered','cardname'),node('span',tr('活動日期：2025-06-23','Event date: 2025-06-23'),'english'),node('span',tr('共 6 款特殊背景','6 Special Backgrounds'),'variantcount'));
 if(group.members.length<6)body.append(node('span',tr(`目前篩選顯示 ${group.members.length} 款`,`Current filters show ${group.members.length} variants`),'subtle'));
 const cue=node('span',null,'carddetail');body.append(cue);summary.append(visual,body);
 const variants=node('div',null,'activity-variants');for(const r of group.members)variants.append(backgroundCard(r,{variant:true,matched:!!filters().query.trim()&&group.matchedIds.includes(r.background_id)}));
 const key=JSON.stringify(filters(),(k,v)=>k==='products'?undefined:v),opened=activityExpansion.has(key)?activityExpansion.get(key):!!filters().query.trim();
 const sync=()=>{card.classList.toggle('is-expanded',details.open);cue.textContent=details.open?tr('收合背景 ▴','Collapse backgrounds ▴'):tr('展開背景 ▾','Expand backgrounds ▾')};
 details.open=opened;sync();details.ontoggle=()=>{activityExpansion.set(key,details.open);sync()};details.append(summary,variants);card.append(details);return card;
}

function render(){
 if(!data)return;renderStats();renderStockStatus();
 document.querySelectorAll('.type-tabs button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.type===$('type').value)));
 const list=sortBackgrounds(filterBackgrounds(data.records,filters()),{order:$('sortOrder').value,locale:getLocale()});
 const cards=groupBackgroundCards(list,{eligibleRows:filterBackgrounds(data.records,{...filters(),query:''})});
 const pages=Math.max(1,Math.ceil(cards.length/PAGE_SIZE));page=Math.max(1,Math.min(page,pages));
 $('resultCount').textContent=tr(`${cards.length} 張主卡 · 符合 ${list.length} / ${data.records.length} 筆紀錄`,`${cards.length} cards · ${list.length} / ${data.records.length} matching entries`);
 const grid=$('backgrounds');grid.replaceChildren();
 for(const r of cards.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE))grid.append(r.activity_id?activityCard(r):backgroundCard(r));
 if(!list.length){const empty=node('div',null,'empty');empty.append(node('p',tr('沒有符合的背景，試試其他搜尋或分類。','No matching backgrounds. Try another search or filter.')));if($('state').value!=='all')empty.append(btn(tr('改看全部收錄','Search all entries'),()=>{$('state').value='all';page=1;render()}));empty.append(btn(tr('重設篩選','Reset filters'),reset));grid.append(empty)}
 const prev=btn(tr('上一頁','Previous'),()=>{page--;render();$('resultCount').scrollIntoView({block:'start'})}),next=btn(tr('下一頁','Next'),()=>{page++;render();$('resultCount').scrollIntoView({block:'start'})});prev.disabled=page<=1;next.disabled=page>=pages;$('pagination').replaceChildren(prev,node('span',`${page} / ${pages}`,'subtle'),next);$('pagination').hidden=cards.length<=PAGE_SIZE;
}
function addInfo(text,cls){if(text)$('detailInfo').append(node('p',text,cls))}
function pokemonItem(p){
 const item=node('div',null,'pokemon-item');item.append(node('span',`#${String(p.dex).padStart(4,'0')} ${getLocale()==='en'?p.name_en:p.name_zh+' / '+p.name_en}`));
 const form=pokemonFormLabel(p,getLocale());if(form)item.append(node('small',form,'pokemon-form'));
 if(p.start_date)item.append(node('small',tr('此款開始：','Variant available from: ')+p.start_date));
 const method=getLocale()==='en'?p.method_en:p.method_zh;if(method)item.append(node('small',method));
 if(p.method_status==='unconfirmed')item.append(node('small',tr('取得條件待核對','Acquisition conditions awaiting verification'),'route-pending'));
 return item;
}
function renderDetailPokemon(r){
 const host=$('detailPokemon'),sections=detailPokemonSections(r);host.classList.toggle('has-route-sections',!!sections.length);
 if(!sections.length){for(const p of detailPokemonRows(r))host.append(pokemonItem(p));return}
 host.append(node('p',tr('各區依圖鑑編號排列；同一款若有多種取得方式，會重複列於對應區域，款數不重複累加。','Each section is sorted by Pokédex number. Variants with multiple acquisition routes appear in each relevant section, without increasing the encounter count.'),'route-explanation'));
 for(const section of sections){const box=node('section',null,'pokemon-route'),heading=node('h4',getLocale()==='en'?section.label_en:section.label_zh);box.dataset.route=section.id;box.append(heading);
  const note=getLocale()==='en'?section.note_en:section.note_zh;if(note)box.append(node('p',note,'subtle'));
  if(section.source&&safeSource(section.source)){const source=node('a',tr('活動來源 ↗','Event source ↗'),'route-source');source.href=safeSource(section.source);source.target='_blank';source.rel='noopener noreferrer';box.append(source)}
  const items=node('div',null,'pokemon');for(const p of section.pokemon)items.append(pokemonItem(p));box.append(items);host.append(box);
 }
}
function renderDetail(r){renderReferences(r);$('detailTitle').textContent=title(r);$('detailEnglish').textContent=getLocale()==='en'?(r.name_zh||''):r.name_en;$('detailImage').replaceChildren(picture(r));$('detailInfo').replaceChildren();addInfo(badgeText(backgroundState(r),r));addInfo(getLocale()==='en'?r.region_en:r.region_zh);if(r.start_date)addInfo(tr('活動日期：','Event dates: ')+r.start_date+(r.end_date?' – '+r.end_date:''));else addInfo(tr('來源原始日期（尚待核對）：','Source dates (unverified): ')+(r.dates_source||tr('待確認','To be confirmed')));addInfo(getLocale()==='en'?r.date_note_en:r.date_note_zh);addInfo(getLocale()==='en'?r.artwork_note_en:r.artwork_note_zh,'subtle');addInfo(getLocale()==='en'?r.method_en:r.method_zh);if(!r.method_zh&&!r.method_en)addInfo(tr('取得方式仍在核對中，請以原活動公告為準。','The acquisition method is still being checked. Refer to the original event announcement.'));if(backgroundState(r)==='pending')addInfo(tr('此項資料尚未完成核對，不作為已發放或目前可取得的證明。','This entry awaits verification and is not proof of release or current availability.'),'notice');if(backgroundState(r)==='upcoming')addInfo(tr('活動尚未開始，請以官方最新公告為準。','This event is upcoming. Check the latest official announcement.'),'notice');$('detailPokemon').replaceChildren();$('detailEvolutions').replaceChildren();renderDetailPokemon(r);for(const p of detailPokemonRows(r,{evolved:true}))$('detailEvolutions').append(pokemonItem(p));$('evolutionSection').hidden=!r.evolved_pokemon?.length;$('pokemonCount').textContent=tr(`${r.pokemon?.length||0} 款原始遭遇 · ${r.evolved_pokemon?.length||0} 款進化／合體` ,`${r.pokemon?.length||0} encounter/source variants; ${r.evolved_pokemon?.length||0} evolution or fusion variants.`);if(!r.pokemon?.length)$('detailPokemon').append(node('p',tr('適用寶可夢待確認。','Eligible Pokémon to be confirmed.'),'subtle'));$('detailProducts').replaceChildren();const related=relatedProducts(r,products);for(const p of related){const a=node('a',null,'related');a.href='index.html?product='+encodeURIComponent(p.id);a.append(node('strong',productName(p)),node('span',p.sku+' · '+(p.price==null?tr('私訊詢價','Ask for price'):'NT$ '+p.price.toLocaleString('zh-TW'))+' · '+stockLabel(p,getLocale()).text));$('detailProducts').append(a)}if(!related.length)$('detailProducts').append(node('p',stockState==='ready'?tr('目前商品目錄尚無對應商品，可返回目錄查看其他收藏。','There are no linked products in the current catalog. Browse the collection for other items.'):tr('相關商品資料暫時無法確認。','Related product information is currently unavailable.'),'subtle'));$('detailSources').replaceChildren();for(const url of [...new Set([...(r.official_sources??[]),...(r.catalog_sources??[]),r.artwork_preview_source,...(r.artwork_variants??[]).map(v=>v.source_url),r.source,(referenceData?.entries??[]).some(x=>x.background_id===r.background_id)?referenceData.source:null].filter(Boolean))]){const href=safeSource(url);if(!href)continue;const a=node('a',url.includes('pokemongo.com')?tr('Pokémon GO 官方公告 ↗','Official Pokémon GO announcement ↗'):url.includes('serebii.net')?'Serebii ↗':new URL(url).hostname+' ↗');a.href=href;a.target='_blank';a.rel='noopener noreferrer';$('detailSources').append(a)}}
function openDetail(r){active=r;renderDetail(r);$('backgroundDialog').showModal();const url=new URL(location.href);url.searchParams.set('background',r.background_id);history.replaceState(null,'',url)}
const updateLanguageHint=initLanguageHint();$('closeDetail').onclick=()=>$('backgroundDialog').close();$('reset').onclick=reset;$('language').value=getLocale();$('language').onchange=()=>{setLocale($('language').value);updateLanguageHint();translate();if(data){buildOptions();render();if(active)renderDetail(active)}};for(const id of ['state','type','series','region','year','stockOnly','sortOrder'])$(id).onchange=()=>{page=1;render()};document.querySelectorAll('.type-tabs button').forEach(b=>b.onclick=()=>{$('type').value=b.dataset.type;page=1;render()});$('bgSearch').oninput=()=>{page=1;render()};translate();
async function load(){try{const response=await fetch('data/backgrounds.json?v=20261025-catalog-review',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('catalog unavailable');const nextData=await response.json();if(!Array.isArray(nextData.records))throw Error('invalid catalog');const overrides=await loadBackgroundOverrides();nextData.records=mergeBackgroundOverrides(nextData.records,overrides);data=nextData;try{const res=await fetch('data/background-reference-facts.json?v=20261025-catalog-review',{signal:AbortSignal.timeout(10000)});if(!res.ok)throw Error('reference unavailable');referenceData=await res.json()}catch{referenceData=null}buildOptions();render();$('loadStatus').hidden=true;const id=new URL(location.href).searchParams.get('background');const target=data.records.find(r=>r.background_id===(data.redirects?.[id]||id));if(target)openDetail(target)}catch{$('loadStatus').replaceChildren(node('p',tr('圖鑑暫時無法載入，請稍後重試。','The background collection could not be loaded. Please try again.')),btn(tr('重新載入','Retry'),load))}}
load();loadPublicCatalog().then(rows=>{products=rows;stockState='ready';render();if(active)renderDetail(active)}).catch(()=>{stockState='error';renderStockStatus();if(active)renderDetail(active)});
