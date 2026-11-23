import {getLocale,tr} from './storefront-locale.mjs';
import {zonedInstant,activityState,sortActivityEvents,activityTimeLines,activityWindows,activityEarlyAccess,formatZoned,buildActivityFeed,eventPokemon,eventBackgroundState,visitorZone,eventTimeKind,visitorTimeLine,eventCountdown,formatDuration,eventGroup,eventDateLabel} from './activity-feed-service.mjs';

// One renderer for the home page and the background atlas. Rows are always rendered for
// every event (cheap, keeps deep links and counts stable); panel bodies are built lazily.
const OPEN_KEY='wj_activity_feed_open';
const states=new Map(),feedCache=new WeakMap();
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const lang=()=>getLocale()==='zh'?'zh':'en';
const pick=(o,key)=>o?.[key+'_'+(getLocale()!=='zh'?'en':'zh')];
const safeHttps=url=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}};
const storage=kind=>{try{return globalThis[kind]??null}catch{return null}};
const reduceMotion=()=>!!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
const compact=()=>!!globalThis.matchMedia?.('(max-width: 700px)')?.matches;
const eventTitle=e=>pick(e.activity,'title')||(getLocale()!=='zh'?e.name_en:e.name_zh)||e.name_zh||e.name_en||e.event_id;
const statusName=s=>({in_progress:tr('進行中','In progress'),upcoming:tr('即將開始','Starting soon'),ended:tr('已結束','Ended'),time_unknown:tr('開始時刻待確認','Start time unresolved')})[s];
const bgStateName=s=>({released:tr('背景已推出','Background released'),upcoming:tr('背景即將推出','Background upcoming'),pending:tr('背景待核對','Background unverified'),unlinked:tr('背景未連結圖鑑','Background not linked yet'),none:tr('未公布背景','No background announced')})[s];
const evidenceName=s=>({confirmed:tr('官方確認','Officially confirmed'),inferred:tr('依現行規則推定','Inferred from current rules'),pending:tr('待確認','Unconfirmed')})[s]||tr('待確認','Unconfirmed');
const domId=id=>'ev-'+String(id).replace(/[^a-z0-9_-]/gi,'-');

function stateFor(variant){
 if(!states.has(variant)){
  let saved={};try{saved=JSON.parse(storage('sessionStorage')?.getItem('wj_activity_ui_'+variant)||'{}')||{}}catch{}
  let open=false;try{open=storage('localStorage')?.getItem(OPEN_KEY)==='1'}catch{}
  states.set(variant,{tab:['all','live','upcoming'].includes(saved.tab)?saved.tab:'all',expanded:new Set(Array.isArray(saved.expanded)?saved.expanded.slice(0,6):[]),historyOpen:!!saved.historyOpen,feedOpen:open,signature:'',items:new Map(),countdowns:[]});
 }
 return states.get(variant);
}
function persist(variant){const s=stateFor(variant);try{storage('sessionStorage')?.setItem('wj_activity_ui_'+variant,JSON.stringify({tab:s.tab,expanded:[...s.expanded],historyOpen:s.historyOpen}))}catch{}}
function model(data){if(data?.events&&data?.backgrounds)return data;if(!data||typeof data!=='object')return {as_of:null,events:[],backgrounds:{}};if(!feedCache.has(data))feedCache.set(data,buildActivityFeed(data));return feedCache.get(data)}

function badge(text,cls){return el('span',text,'ev-badge '+cls)}
function thumb(event){
 const box=el('span',null,'ev-thumb');
 if(event.image){const img=el('img');img.src=event.image;img.alt='';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.onerror=()=>{box.replaceChildren(placeholder())};box.append(img)}else box.append(placeholder());
 return box;
}
function placeholder(){const p=el('span',null,'ev-placeholder');p.append(el('span','WJ','ev-placeholder-mark'),el('span',tr('活動圖片待補','Event art pending'),'ev-placeholder-note'));return p}
function timeKindLabel(event){
 const k=eventTimeKind(event),s=event.activity.schedule;
 if(k==='rolling')return tr('各地當地時間','Local time in each region');
 if(k==='date')return tr('只公布日期，時間待公布','Dates only · hours TBA');
 return event.region_en==='Global'?tr('全球固定時刻','One global moment')+' · '+s.zone:tr('活動所在地時間','Event local time')+' · '+s.zone;
}

function section(title,cls){const box=el('section',null,'ev-section'+(cls?' '+cls:''));box.append(el('h4',title));return box}
function fact(parent,label,text,basis){const row=el('div',null,'ev-fact');const head=el('p',null,'ev-fact-head');head.append(el('strong',label));if(basis)head.append(badge(evidenceName(basis),'evidence '+basis));row.append(head,el('p',text||tr('尚未公布','Not announced')));parent.append(row)}

function buildPanel(panel,event,ctx){
 const {feed,opts,now,variant}=ctx,meta=event.activity,s=activityState(event,now),bgState=eventBackgroundState(event,feed),pokemon=eventPokemon(event,feed),products=productInfo(event,opts);
 panel.replaceChildren();
 // Actions first: every link keeps its own behaviour.
 const actions=el('div',null,'ev-actions');
 if(event.background_ids.length){const a=el('a',tr('查看相關背景','View related backgrounds'),'ev-action primary');a.href=opts.backgroundHref(event.background_ids[0]);if(opts.onBackground)a.onclick=ev=>{ev.preventDefault?.();opts.onBackground(event.background_ids[0],{event})};actions.append(a)}
 if(event.related_product_ids.length){const b=el('button',tr('查看相關商品','View related products'),'ev-action');b.type='button';b.onclick=()=>{const target=panel.querySelector?.('.ev-products');target?.scrollIntoView?.({block:'nearest',behavior:reduceMotion()?'auto':'smooth'});target?.focus?.({preventScroll:true})};actions.append(b)}
 const share=el('button',tr('複製分享連結','Copy share link'),'ev-action');share.type='button';const shareStatus=el('p',null,'ev-share-status');shareStatus.setAttribute('role','status');
 share.onclick=async()=>{const url=opts.shareUrl(event.event_id);try{await navigator.clipboard.writeText(eventTitle(event)+'\n'+url);shareStatus.textContent=tr('已複製活動連結。','Event link copied.')}catch{const input=el('input');input.value=url;input.readOnly=true;input.className='ev-share-input';input.setAttribute('aria-label',tr('活動連結','Event link'));shareStatus.replaceChildren(input);input.focus?.();input.select?.()}};
 actions.append(share);
 const close=el('button',tr('收起','Collapse'),'ev-action quiet');close.type='button';close.onclick=()=>toggle(variant,event.event_id,false,{focus:true});actions.append(close);
 panel.append(actions,shareStatus);

 const highlights=section(tr('活動重點','Highlights'),'ev-highlights'),list=el('ul');
 list.append(el('li',statusName(s.status)+' · '+bgStateName(bgState)));
 const bgLine=meta.kind==='feature'?tr('展示功能（非新增背景）','Display feature (not a new background)'):meta.kind==='event'?tr('活動行事曆（官方未公布背景）','Event calendar (no background announced)'):meta.background_type==='location'?tr('地點背景','Location Background'):meta.background_type==='special'?tr('特殊背景','Special Background'):tr('背景未公告','Background unannounced');
 const art=({'owner-confirmed-reuse':tr('站長確認沿用同城圖樣','Same-city artwork reuse confirmed by site owner'),'feature-only':tr('分階段開放','Phased rollout'),pending:tr('圖樣待確認','Artwork unconfirmed'),'owner-catch-confirmed':tr('使用者實拍已確認','Confirmed by owner catch screenshots'),'owner-preview-not-released':tr('素材預覽，未發放','Asset preview, unreleased')})[meta.artwork_status];
 list.append(el('li',bgLine+(art?' · '+art:'')));
 if(pick(meta,'eligible'))list.append(el('li',tr('適用：','Eligible: ')+pick(meta,'eligible')));
 highlights.append(list);panel.append(highlights);

 const time=section(tr('時間','Time'),'ev-time'),times=activityTimeLines(event,lang());
 time.append(el('p',timeKindLabel(event),'ev-kind'),el('p',times.local,'ev-line strong'),el('p',times.taiwan,'ev-line'));
 const mine=visitorTimeLine(event,visitorZone(),lang());if(mine)time.append(el('p',mine,'ev-line'));
 if(meta.schedule.date_only)time.append(el('p',s.status==='ended'?tr('已結束依活動日期推定；精確時刻未公布。','Ended status is inferred from the event date; exact hours were not announced.'):tr('日期已公布，開始與結束時刻待公布；網站不把午夜當作開始時間。','Dates are announced; start and end hours are not. Midnight is not assumed.'),'ev-note'));
 if(meta.schedule.rolling_local&&!meta.schedule.date_only)time.append(el('p',tr('狀態依台灣場判定；海外進度依各地時區。','Status follows the Taiwan schedule; overseas progress depends on local time.'),'ev-note'));
 if(meta.schedule.reference_local)time.append(el('p',tr('狀態及台灣換算以墨西哥城為示例；墨西哥其他時區依當地時間。','Status and Taiwan conversion use Mexico City as an example; other Mexican time zones follow local time.'),'ev-note'));
 if(meta.schedule.daily)time.append(el('p',tr('每日時段：','Daily hours: ')+meta.schedule.daily.start+'–'+meta.schedule.daily.end+(s.session_open===false&&s.status==='in_progress'?tr('（目前非開放時段）',' (outside daily hours now)'):''),'ev-line'));
 const early=activityEarlyAccess(event,now);if(early)time.append(el('p',(early.kind==='go-pass'?tr('通行證提前開放：','Early GO Pass access: '):tr('限時調查開放：','Timed Research opens: '))+early.local+' · '+tr('台灣：','Taiwan: ')+early.taiwan,'ev-line'));
 const count=countdownNode(event,now);if(count){time.append(count);ctx.state.countdowns.push({node:count,event})}
 if(pick(meta,'battle_window_label'))time.append(el('p',pick(meta,'battle_window_label'),'ev-line'));
 const windows=activityWindows(event);if(windows.length){const more=el('details',null,'ev-windows');more.append(el('summary',tr('每日時段／台灣換算','Daily windows / Taiwan conversion')));if(pick(meta,'window_note'))more.append(el('p',pick(meta,'window_note'),'ev-note'));const table=el('table'),head=el('tr');for(const t of [tr('當地時段','Local window'),tr('台灣時段','Taiwan window'),tr('依據','Basis')])head.append(el('th',t));const thead=el('thead');thead.append(head);const body=el('tbody');for(const w of windows){const row=el('tr');row.append(el('td',w.local),el('td',w.taiwan),el('td',evidenceName(w.basis)));body.append(row)}table.append(thead,body);const wrap=el('div',null,'ev-table');wrap.append(table);more.append(wrap);time.append(more)}
 panel.append(time);

 const mons=section(tr('登場寶可夢','Featured Pokémon'),'ev-pokemon');
 if(pokemon.length){const chips=el('ul',null,'ev-chips');for(const p of pokemon.slice(0,30))chips.append(el('li','#'+String(p.dex).padStart(4,'0')+' '+(getLocale()==='zh'?p.name_zh||p.name_en:p.name_en||p.name_zh)));mons.append(chips);if(pokemon.length>30)mons.append(el('p',tr(`另有 ${pokemon.length-30} 款，請在背景詳情查看`,`${pokemon.length-30} more in the background entry`),'ev-note'));if(!event.pokemon?.length)mons.append(el('p',tr('依連結背景的適用名單列出；逐款取得條件以背景詳情為準。','Listed from the linked background entries; see each entry for conditions.'),'ev-note'))}
 else mons.append(el('p',tr('官方尚未公布或此活動沒有背景寶可夢名單。','Not announced, or this event has no background Pokémon list.'),'ev-note'));
 panel.append(mons);

 const bgs=section(tr('背景','Backgrounds'),'ev-backgrounds');
 if(event.background_ids.length){const grid=el('div',null,'ev-bg-grid');for(const id of event.background_ids){const b=feed.backgrounds[id];if(!b)continue;const a=el('a',null,'ev-bg');a.href=opts.backgroundHref(id);if(opts.onBackground)a.onclick=ev=>{ev.preventDefault?.();opts.onBackground(id,{event})};const pic=el('span',null,'ev-bg-pic');if(b.image){const img=el('img');img.src=b.image;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>pic.replaceChildren(placeholder());pic.append(img)}else pic.append(placeholder());const label=el('span',null,'ev-bg-text');label.append(el('strong',getLocale()==='zh'?b.name_zh:b.name_en),el('span',id+' · '+(b.release_state==='released'?tr('已推出','Released'):b.release_state==='upcoming'?tr('即將推出','Upcoming'):tr('待核對','Unverified'))+(b.start_date?' · '+b.start_date:'')));a.append(pic,label);grid.append(a)}bgs.append(grid)}
 else bgs.append(el('p',meta.kind==='event'||meta.kind==='feature'?tr('此活動目前沒有公布背景；以官方公告為準。','No background has been announced for this event; follow the official announcement.'):tr('背景尚未建立圖鑑關聯，請先看下方官方公告。','No atlas entry is linked yet; see the official announcement below.'),'ev-note'));
 panel.append(bgs);

 const rules=section(tr('取得方式、資格與限制','How to get it · eligibility · limits'),'ev-rules');
 fact(rules,meta.kind==='feature'?tr('功能條件','Feature conditions'):tr('取得條件','Acquisition'),pick(meta,'conditions'),meta.conditions_basis??'confirmed');
 if(meta.remote_participation)fact(rules,tr('遠距參與','Remote participation'),pick(meta.remote_participation,'text'),meta.remote_participation?.basis);
 if(meta.remote_background)fact(rules,tr('遠距取得背景','Remote background eligibility'),pick(meta.remote_background,'text'),meta.remote_background?.basis);
 if(pick(meta,'reported_info'))fact(rules,tr('社群回報（非官方確認）','Community report (not officially confirmed)'),pick(meta,'reported_info'),'pending');
 if(pick(meta,'uncertainty'))fact(rules,tr('仍待釐清','Still unresolved'),pick(meta,'uncertainty'),'pending');
 panel.append(rules);

 const prod=section(tr('相關商品','Related products'),'ev-products');prod.tabIndex=-1;
 if(!event.related_product_ids.length)prod.append(el('p',tr('目前沒有關聯商品。','No linked products yet.'),'ev-note'));
 else if(products.state==='loading')prod.append(el('p',tr('正在確認商品狀態…','Checking products…'),'ev-note'));
 else if(products.state==='error')prod.append(el('p',tr('商品狀態暫時無法確認，可稍後重試。','Product status is unavailable right now.'),'ev-note'));
 else if(!products.list.length)prod.append(el('p',tr('關聯商品目前未在公開目錄上架。','Linked products are not in the public catalog right now.'),'ev-note'));
 else{const ul=el('ul',null,'ev-product-list');for(const p of products.list.slice(0,12)){const li=el('li'),a=el('a',null,'ev-product');a.href=opts.productHref(p.id);if(opts.onProduct)a.onclick=ev=>{ev.preventDefault?.();opts.onProduct(p.id)};a.append(el('strong',opts.productName?.(p)??p.name),el('span',opts.productStatus?.(p)??''));li.append(a);ul.append(li)}prod.append(ul);if(products.list.length>12)prod.append(el('p',tr(`共 ${products.list.length} 件，另 ${products.list.length-12} 件請在背景詳情查看。`,`${products.list.length} products; see the background entry for ${products.list.length-12} more.`),'ev-note'))}
 panel.append(prod);

 const src=section(tr('資料更新與來源','Data update & sources'),'ev-sources');
 src.append(el('p',tr('最後查核：','Last checked: ')+(meta.checked_on||tr('待確認','To be confirmed'))+(feed.as_of?' · '+tr('資料版本：','Data version: ')+feed.as_of:''),'ev-note'));
 const links=el('div',null,'ev-source-links');for(const url of [...new Set(meta.sources??event.official_sources??[])]){const href=safeHttps(url);if(!href)continue;const a=el('a',(href.includes('pokemongo.com')?tr('Pokémon GO 官方公告','Official Pokémon GO news'):new URL(href).hostname)+' ↗');a.href=href;a.target='_blank';a.rel='noopener noreferrer';links.append(a)}
 if(!links.children?.length&&!links.childNodes?.length)links.append(el('span',tr('來源待補','Source pending'),'ev-note'));
 src.append(links);panel.append(src);
}
function countdownNode(event,now){
 const c=eventCountdown(event,now,visitorZone());if(!c)return null;
 const n=el('p',null,'ev-countdown');updateCountdown(n,event,now);return n;
}
function updateCountdown(node,event,now=Date.now()){
 const c=eventCountdown(event,now,visitorZone());if(!c){node.textContent='';return}
 const target=c.target==='start'?tr('距離開始','Until start'):tr('距離結束','Until end');
 const basis=c.kind==='rolling'?tr(`（倒數對象：你所在時區 ${c.clock} 的當地${c.target==='start'?'開始':'結束'}時間）`,` (counting to the ${c.target} in your local time, ${c.clock})`):tr(`（倒數對象：${c.clock} 公告的${c.target==='start'?'開始':'結束'}時刻）`,` (counting to the announced ${c.target} in ${c.clock})`);
 node.textContent=target+' '+formatDuration(c.ms,lang())+basis;
}
function productInfo(event,opts){
 const p=opts.products?.()??{state:'loading',list:[]};if(p.state!=='ready')return {state:p.state,list:[]};
 const ids=new Set(event.related_product_ids),seen=new Set();return {state:'ready',list:p.list.filter(x=>ids.has(x.id)&&!seen.has(x.id)&&seen.add(x.id))};
}

function row(event,ctx){
 const {now,state}=ctx,s=activityState(event,now),bg=eventBackgroundState(event,ctx.feed),id=domId(event.event_id);
 const li=el('li',null,'ev-item '+s.status);li.dataset.eventId=event.event_id;li.id='event-'+event.event_id;li.dataset.group=eventGroup(event,now);
 const heading=el('h3',null,'ev-heading'),button=el('button',null,'ev-toggle');button.type='button';button.id=id+'-btn';button.setAttribute('aria-controls',id+'-panel');
 const text=el('span',null,'ev-text'),badges=el('span',null,'ev-badges');
 badges.append(badge(statusName(s.status),'status '+s.status));if(event.activity.schedule.date_only)badges.append(badge(tr('時間待公布','Hours TBA'),'pending'));if(event.activity.schedule.basis==='pending')badges.append(badge(tr('時間有歧異','Time conflict'),'pending'));badges.append(badge(bgStateName(bg),'bg '+bg));
 text.append(badges,el('span',eventTitle(event),'ev-title'),el('span',eventDateLabel(event,lang())+' · '+((getLocale()!=='zh'?event.region_en:event.region_zh)||tr('地區待確認','Region to confirm')),'ev-meta'));
 const cue=el('span',null,'ev-cue');cue.setAttribute('aria-hidden','true');
 button.append(thumb(event),text,cue);heading.append(button);
 const panel=el('div',null,'ev-panel');panel.id=id+'-panel';panel.setAttribute('role','region');panel.setAttribute('aria-labelledby',button.id);
 li.append(heading,panel);
 const item={li,button,panel,cue,event,built:false};state.items.set(event.event_id,item);
 button.onclick=()=>toggle(ctx.variant,event.event_id,!state.expanded.has(event.event_id));
 applyExpanded(item,state.expanded.has(event.event_id),ctx);
 return li;
}
function applyExpanded(item,open,ctx){
 item.button.setAttribute('aria-expanded',String(open));item.panel.hidden=!open;item.cue.textContent=open?tr('收起 ▴','Collapse ▴'):tr('展開 ▾','Expand ▾');
 item.li.classList?.toggle('is-open',open);
 if(open&&!item.built){buildPanel(item.panel,item.event,ctx);item.built=true}
}
// Expand or collapse in place. On phones one event is open at a time.
export function toggle(variant,eventId,open,{focus=false,scroll=true}={}){
 const state=stateFor(variant),item=state.items.get(eventId);if(!item)return;
 const ctx=state.ctx;
 if(open&&compact())for(const other of state.expanded)if(other!==eventId){const o=state.items.get(other);if(o)applyExpanded(o,false,ctx);state.expanded.delete(other)}
 open?state.expanded.add(eventId):state.expanded.delete(eventId);applyExpanded(item,open,ctx);persist(variant);
 if(focus)item.button.focus?.({preventScroll:true});
 if(scroll){const r=item.li.getBoundingClientRect?.();if(r&&(r.top<0||(open&&r.top>(globalThis.innerHeight??800)*0.75)))item.li.scrollIntoView?.({block:'start',behavior:reduceMotion()?'auto':'smooth'})}
}
// Deep link: ?event=id or #event-id. Opens the feed, the right tab or history, then expands.
export function openActivityEvent(host,variant,eventId){
 const state=stateFor(variant),item=state.items.get(eventId);if(!item)return false;
 if(state.setFeedOpen)state.setFeedOpen(true);
 const group=item.li.dataset.group;
 if(group==='ended'){state.historyOpen=true;if(state.historyNode)state.historyNode.open=true}
 else if(state.tab!=='all'&&state.tab!==group){state.tab='all';state.applyTab?.()}
 if(item.li.hidden){state.tab='all';state.showAll=true;state.applyTab?.()}
 if(!state.expanded.has(eventId))toggle(variant,eventId,true,{scroll:false});
 persist(variant);
 const go=()=>{item.li.scrollIntoView?.({block:'start',behavior:'auto'});item.button.focus?.({preventScroll:true})};
 if(globalThis.requestAnimationFrame)requestAnimationFrame(go);else go();
 return true;
}

export function renderActivityFeed(host,data,opts={}){
 if(!host)return;
 const variant=opts.variant||'atlas',now=opts.now??Date.now(),feed=model(data),state=stateFor(variant);
 const defaults={backgroundHref:id=>'backgrounds.html?background='+encodeURIComponent(id)+'&lang='+getLocale(),productHref:id=>'index.html?product='+encodeURIComponent(id)+'&lang='+getLocale()+'&from=bg',shareUrl:id=>{try{const u=new URL(globalThis.location.href);for(const k of [...u.searchParams.keys()])if(k!=='lang')u.searchParams.delete(k);u.searchParams.set('event',id);u.searchParams.set('lang',getLocale());u.hash='event-'+id;return u.href}catch{return '?event='+encodeURIComponent(id)}}};
 opts={...defaults,...opts};
 const events=sortActivityEvents(feed.events,now),productState=opts.products?.()?.state??'none';
 const next=JSON.stringify([getLocale(),variant,productState,formatZoned(now,'Asia/Taipei').slice(0,10),events.map(r=>[r.event_id,r.activity.checked_on,activityState(r,now).status,activityEarlyAccess(r,now)?.open])]);
 if(next===state.signature&&!opts.force)return;state.signature=next;
 const focusedId=globalThis.document?.activeElement?.closest?.('.ev-item')?.dataset?.eventId;
 state.items=new Map();state.countdowns=[];const ctx={feed,opts,now,variant,state};state.ctx=ctx;
 host.hidden=!events.length;host.replaceChildren();host.classList?.add('ev-feed','ev-'+variant);if(!events.length)return;
 const endOf=e=>{const s=e.activity.schedule;try{return s.date_only?zonedInstant(s.end_date+'T23:59',s.zone||'Asia/Taipei'):s.end?zonedInstant(s.end,s.zone||'Asia/Taipei'):Infinity}catch{return Infinity}};
 // In progress: the ones ending soonest first; open-ended programmes after them.
 const live=events.filter(e=>eventGroup(e,now)==='live').sort((a,b)=>endOf(a)-endOf(b)||a.event_id.localeCompare(b.event_id)),soon=events.filter(e=>eventGroup(e,now)==='upcoming'),past=events.filter(e=>eventGroup(e,now)==='ended');

 const heading=el('div',null,'ev-feed-head'),titleWrap=el('div',null,'ev-feed-title');
 titleWrap.append(el('h2',tr('活動快訊','Event updates')),el('p',tr('狀態截至：','Status as of: ')+formatZoned(now,'Asia/Taipei')+' · UTC+08:00'+(feed.as_of?' · '+tr('資料更新：','Data updated: ')+feed.as_of:''),'ev-asof'));
 heading.append(titleWrap);host.append(heading);
 const body=el('div',null,'ev-feed-body');body.id='activityFeedBody-'+variant;

 if(variant==='atlas'){
  // Keep the existing collapsible event area (default collapsed, remembered).
  const toggleBtn=el('button',null,'ev-feed-toggle');toggleBtn.type='button';toggleBtn.setAttribute('aria-controls',body.id);heading.append(toggleBtn);
  const peek=el('div',null,'ev-peek');peek.append(el('p',tr('進行中 {a}・即將開始 {b}','{a} in progress · {b} starting soon').replace('{a}',live.length).replace('{b}',soon.length),'ev-peek-count'));
  const peekList=el('ul',null,'ev-peek-list');for(const e of [...live,...soon].slice(0,3)){const li=el('li'),b=el('button',null,'ev-peek-item');b.type='button';b.append(badge(statusName(activityState(e,now).status),'status '+activityState(e,now).status),el('span',eventTitle(e),'ev-peek-name'),el('span',eventDateLabel(e,lang()).slice(5,10),'ev-peek-date'));b.onclick=()=>openActivityEvent(host,variant,e.event_id);li.append(b);peekList.append(li)}
  peek.append(peekList);host.append(peek);
  state.setFeedOpen=open=>{state.feedOpen=open;try{storage('localStorage')?.setItem(OPEN_KEY,open?'1':'0')}catch{}body.hidden=!open;peek.hidden=open;toggleBtn.textContent=open?tr('收起 ▴','Collapse ▴'):tr('展開 ▾','Expand ▾');toggleBtn.setAttribute('aria-expanded',String(open));host.classList?.toggle('is-open',open)};
  toggleBtn.onclick=()=>state.setFeedOpen(!state.feedOpen);
 }else state.setFeedOpen=null;
 host.append(body);
 body.append(el('p',tr('點活動圖片或名稱即可在此展開。活動狀態不等於背景已發放或商品有庫存；未確認資訊保留標示。','Select an event image or title to expand it here. Event status is not proof of background release or stock; unconfirmed details stay marked.'),'ev-intro'));

 const tabs=el('div',null,'ev-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label',tr('活動分類','Event filter'));
 const tabButtons=[];for(const [value,label,count] of [['all',tr('全部','All'),live.length+soon.length],['live',tr('進行中','In progress'),live.length],['upcoming',tr('即將開始','Starting soon'),soon.length]]){const b=el('button',label+' '+count,'ev-tab');b.type='button';b.dataset.tab=value;b.onclick=()=>{state.tab=value;state.showAll=false;persist(variant);applyTab()};tabButtons.push(b);tabs.append(b)}
 body.append(tabs);
 const list=el('ul',null,'ev-list');for(const e of [...live,...soon])list.append(row(e,ctx));body.append(list);
 const empty=el('p',tr('這個分類目前沒有活動。','No events in this category right now.'),'ev-empty');body.append(empty);
 const limit=opts.limit??Infinity,moreWrap=el('div',null,'ev-more');body.append(moreWrap);
 function applyTab(){
  for(const b of tabButtons)b.setAttribute('aria-pressed',String(b.dataset.tab===state.tab));
  let shown=0;for(const e of [...live,...soon]){const item=state.items.get(e.event_id),match=state.tab==='all'||item.li.dataset.group===state.tab;const visible=match&&(state.showAll||shown<limit||state.expanded.has(e.event_id));item.li.hidden=!visible;if(visible)shown++}
  const matching=[...live,...soon].filter(e=>state.tab==='all'||eventGroup(e,now)===state.tab).length;
  empty.hidden=matching>0;moreWrap.replaceChildren();
  if(Number.isFinite(limit)&&matching>shown){if(opts.moreHref){const a=el('a',tr(`查看全部活動（${matching}）→`,`See all events (${matching}) →`),'ev-more-link');a.href=opts.moreHref();moreWrap.append(a)}else{const b=el('button',tr(`顯示其餘 ${matching-shown} 個活動`,`Show ${matching-shown} more`),'ev-more-link');b.type='button';b.onclick=()=>{state.showAll=true;applyTab()};moreWrap.append(b)}}
  // The first visible event doubles as the visual spotlight on wide screens.
  let first=true;for(const e of [...live,...soon]){const item=state.items.get(e.event_id);item.li.classList?.toggle('is-feature',first&&!item.li.hidden);if(!item.li.hidden)first=false}
 }
 state.applyTab=applyTab;applyTab();

 if(variant==='atlas'){
  const history=el('details',null,'ev-history');history.open=state.historyOpen;history.ontoggle=()=>{state.historyOpen=history.open;persist(variant)};
  history.append(el('summary',tr(`歷史活動・已結束（${past.length}）｜背景紀錄保留`,`Past events (${past.length}) · background entries retained`)));
  const old=el('ul',null,'ev-list ev-list-history');for(const e of past)old.append(row(e,ctx));history.append(old);body.append(history);state.historyNode=history;
 }else if(opts.historyHref&&past.length){const a=el('a',tr(`歷史活動（${past.length}）→`,`Past events (${past.length}) →`),'ev-history-link');a.href=opts.historyHref();body.append(a)}
 if(state.setFeedOpen)state.setFeedOpen(state.feedOpen);
 if(focusedId)state.items.get(focusedId)?.button.focus?.({preventScroll:true});
 startTicker();
}
let ticker=null;
function startTicker(){
 if(ticker||typeof globalThis.document?.addEventListener!=='function'||typeof setInterval!=='function')return;
 ticker=setInterval(()=>{if(globalThis.document.visibilityState==='hidden')return;for(const s of states.values())for(const c of s.countdowns)updateCountdown(c.node,c.event)},30000);
}
export function activityFeedVariantState(variant){return stateFor(variant)}
