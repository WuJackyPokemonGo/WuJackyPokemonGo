// World map view for the background atlas. Uses the same filtered rows as the list view.
// Coordinates come from data/background-locations.json (city / venue-town reference points only).
const NS='http://www.w3.org/2000/svg',W=820,H=390;
export const projectLonLat=(lon,lat)=>[(lon+180)*W/360,(84-lat)*H/142];

// Group filtered rows by place. Rows without a reliable place stay list-only.
export function groupRowsByPlace(rows,locations){
 const places=new Map(),unmapped=[],special=[];
 for(const r of rows){
  if(r.type!=='location'){special.push(r);continue}
  const key=locations?.assignments?.[r.background_id],place=key&&locations.places?.[key];
  if(!place||!Number.isFinite(place.lat)||!Number.isFinite(place.lon)){unmapped.push(r);continue}
  if(!places.has(key)){const [x,y]=projectLonLat(place.lon,place.lat);places.set(key,{key,place,rows:[],x,y})}
  places.get(key).rows.push(r);
 }
 return {places:[...places.values()],unmapped,special};
}
// Greedy screen-space clustering: radius is given in SVG units for the current zoom.
export function clusterPlaces(places,radius){
 const sorted=[...places].sort((a,b)=>b.rows.length-a.rows.length||a.key.localeCompare(b.key)),clusters=[];
 for(const p of sorted){const hit=clusters.find(c=>Math.hypot(c.x-p.x,c.y-p.y)<radius);if(hit){hit.members.push(p);const n=hit.members.length;hit.x=hit.x+(p.x-hit.x)/n;hit.y=hit.y+(p.y-hit.y)/n}else clusters.push({x:p.x,y:p.y,members:[p]})}
 return clusters;
}

export function createAtlasMap(ui){
 const {svg,markers,land,shell,tr,getLocale}=ui;
 let locations=null,groups={places:[],unmapped:[],special:[]},view={x:0,y:0,w:W,h:H},selected=null,selectedRow=null,openSeries=null,drag=null,moved=false,ready=false;
 const svgEl=(name,attrs={})=>{const n=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n};
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
 const placeName=p=>getLocale()==='zh'?p.place.zh:p.place.en;
 const precisionText=p=>({city:tr('座標為城市代表點','Pinned at the city reference point'),site:tr('座標為場館所在城鎮（約略）','Pinned at the venue town (approximate)'),prefecture:tr('座標為縣代表點','Pinned at the prefecture reference point')})[p.place.precision]||'';
 const scale=()=>W/view.w;
 function clampView(){view.w=Math.min(W,Math.max(W/12,view.w));view.h=view.w*H/W;view.x=Math.min(W-view.w,Math.max(0,view.x));view.y=Math.min(H-view.h,Math.max(0,view.y))}
 function applyView(){clampView();svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);svg.style.touchAction=scale()>1.01?'none':'pan-y';ui.zoomOut.disabled=scale()<=1.01;ui.reset.disabled=scale()<=1.01;ui.zoomIn.disabled=scale()>=11.9;drawMarkers()}
 function zoomTo(factor,cx=view.x+view.w/2,cy=view.y+view.h/2){const w=Math.min(W,Math.max(W/12,view.w/factor));view={x:cx-w/2,y:cy-(w*H/W)/2,w,h:w*H/W};applyView()}
 function fit(points){
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  let w=Math.max((maxX-minX)*1.6,(maxY-minY)*1.6*W/H,W/12);w=Math.min(w,view.w/2);
  view={x:(minX+maxX)/2-w/2,y:(minY+maxY)/2-(w*H/W)/2,w,h:w*H/W};applyView();
 }
 function pxPerUnit(){return (shell.clientWidth||W)/view.w}
 function drawMarkers(){
  if(!ready)return;markers.replaceChildren();
  const ppu=pxPerUnit(),k=1/ppu,chosen=groups.places.find(p=>p.key===selected),clusters=[...clusterPlaces(groups.places.filter(p=>p!==chosen),30/ppu),...(chosen?[{x:chosen.x,y:chosen.y,members:[chosen]}]:[])];
  for(const c of clusters){
   const rows=c.members.reduce((n,p)=>n+p.rows.length,0),single=c.members.length===1,p=c.members[0],isSel=single&&selected===p.key;
   const g=svgEl('g',{class:'map-marker'+(single?'':' is-cluster')+(isSel?' is-selected':''),transform:`translate(${c.x} ${c.y}) scale(${k})`,role:'button',tabindex:'0'});
   g.setAttribute('aria-label',single?tr(`${placeName(p)}，${rows} 筆背景紀錄`,`${placeName(p)}, ${rows} background entries`):tr(`${c.members.length} 個地點、${rows} 筆背景紀錄，放大查看`,`${c.members.length} places, ${rows} background entries — zoom in`));
   if(single)g.setAttribute('aria-pressed',String(isSel));
   g.append(svgEl('circle',{r:22,class:'hit'}),svgEl('circle',{r:single?(rows>9?13:11):16,class:'pin'}));
   const t=svgEl('text',{'text-anchor':'middle',y:4,class:'count'});t.textContent=String(rows);g.append(t);
   if(single&&(isSel||scale()>=4)){const label=svgEl('text',{x:16,y:5,class:'label'});label.textContent=placeName(p);g.append(label)}
   const act=()=>{if(moved)return;if(single)select(p.key,{center:false});else fit(c.members)};
   g.addEventListener('click',act);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act()}});
   markers.append(g);
  }
 }
 function renderList(){
  const host=ui.placeList,term=(ui.placeFilter.value||'').trim().toLowerCase();host.replaceChildren();
  const list=[...groups.places].sort((a,b)=>b.rows.length-a.rows.length||placeName(a).localeCompare(placeName(b))).filter(p=>!term||[p.place.zh,p.place.en,p.rows[0]?.region_zh,p.rows[0]?.region_en].some(v=>String(v||'').toLowerCase().includes(term)));
  for(const p of list){const li=node('li'),b=node('button',null,'place-item');b.type='button';b.setAttribute('aria-pressed',String(selected===p.key));b.dataset.key=p.key;b.append(node('strong',placeName(p)),node('span',(getLocale()==='zh'?p.rows[0]?.region_zh:p.rows[0]?.region_en)||'','subtle'),node('span',String(p.rows.length),'place-count'));b.onclick=()=>{select(p.key,{center:true});if(matchMedia('(max-width:780px)').matches)shell.scrollIntoView?.({block:'start'})};li.append(b);host.append(li)}
  if(!list.length)host.append(node('li',groups.places.length?tr('沒有符合的地點。','No matching places.'):tr('目前篩選沒有可放上地圖的地點。','No mappable places for the current filters.'),'subtle'));
 }
 function renderSpotlight(){
  const host=ui.spotlight;host.replaceChildren();const p=groups.places.find(x=>x.key===selected);
  host.classList.toggle('is-open',!!p);document.querySelector('.map-view')?.classList.toggle('has-city',!!p);
  if(!p){host.append(node('p',groups.places.length?tr('點地圖上的標記或下方地點，查看當地背景。','Select a marker or a place below to see its backgrounds.'):tr('沒有可顯示的地點。','No places to show.'),'subtle'));return}
  const rows=[...p.rows].sort((a,b)=>String(b.start_date||b.year||'').localeCompare(String(a.start_date||a.year||'')));
  if(!rows.includes(selectedRow))selectedRow=rows[0];
  const close=node('button',tr('關閉','Close'),'map-close');close.type='button';close.setAttribute('aria-label',tr(`關閉 ${placeName(p)}`,`Close ${placeName(p)}`));
  close.onclick=()=>{const key=selected;selected=null;selectedRow=null;openSeries=null;drawMarkers();renderList();renderSpotlight();ui.onSelect?.(null);(markers.querySelector('[aria-pressed="true"]')||ui.placeList.querySelector(`[data-key="${key}"]`))?.focus?.({preventScroll:true})};
  host.append(close);
  host.append(node('p',tr('地點','Place'),'map-eyebrow'),node('h3',placeName(p)+((getLocale()==='zh'?rows[0].region_zh:rows[0].region_en)?' · '+(getLocale()==='zh'?rows[0].region_zh:rows[0].region_en):'')),node('p',tr(`${rows.length} 筆背景紀錄・${precisionText(p)}`,`${rows.length} background entries · ${precisionText(p)}`),'subtle'));
  // Activities at this place: each opens to Pokémon cards; a card shows that background below.
  // One activity = one year of a named series; generic series ("其他活動") fall back to the record name without its place suffix.
  const GENERIC=/^(其他活動|other( events?)?|)$/i;
  const seriesOf=r=>{const series=String((getLocale()==='zh'?r.series_zh||r.series:r.series)||'').trim();const name=GENERIC.test(series)?String(ui.titleOf(r)).replace(/\s*[-－–]\s*[^-－–]*$/,'').trim()||ui.titleOf(r):series;return (r.year&&!name.startsWith(String(r.year))?r.year+' · ':'')+name};
  const groupsBySeries=new Map();
  for(const r of rows){const k=seriesOf(r);if(!groupsBySeries.has(k))groupsBySeries.set(k,[]);groupsBySeries.get(k).push(r)}
  const acts=node('div',null,'map-activities');
  for(const [name,list] of groupsBySeries){
   const d=node('details',null,'map-activity');d.open=openSeries===name||(openSeries==null&&list.includes(selectedRow)&&groupsBySeries.size===1);
   d.append(node('summary',name));
   d.addEventListener('toggle',()=>{if(d.open){openSeries=name;d.scrollIntoView?.({block:'nearest'});for(const o of acts.querySelectorAll('details'))if(o!==d)o.open=false}else if(openSeries===name)openSeries=''});
   const grid=node('ul',null,'pokemon-grid');grid.setAttribute('aria-label',tr(`${name} 適用寶可夢`,`${name} Pokémon`));
   for(const r of list){const mons=(r.pokemon??[]).length?r.pokemon:[{name_zh:ui.titleOf(r),name_en:ui.titleOf(r)}];
    for(const m of mons){const li=node('li'),b=node('button',null,'pokemon-card');b.type='button';b.setAttribute('aria-pressed',String(r===selectedRow));
     const pic=node('span',null,'pokemon-pic'),url=ui.imageOf(r);if(url){const img=node('img');img.src=url;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';pic.append(img)}else pic.append(node('span',tr('圖片暫缺','No image'),'subtle'));
     b.append(pic,node('strong',getLocale()==='zh'?m.name_zh||m.name_en:m.name_en||m.name_zh));
     b.onclick=()=>{selectedRow=r;openSeries=name;renderSpotlight();host.querySelector('.map-entry')?.scrollIntoView?.({block:'nearest'})};li.append(b);grid.append(li)}}
   d.append(grid);acts.append(d);
  }
  host.append(acts);
  const r=selectedRow,card=node('div',null,'map-entry'),zoom=node('button',null,'map-entry-pic');zoom.type='button';zoom.setAttribute('aria-label',tr(`放大 ${ui.titleOf(r)} 背景圖`,`Enlarge ${ui.titleOf(r)}`));
  const url=ui.imageOf(r);if(url){const img=node('img');img.src=url;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>img.replaceWith(node('span',tr('圖片暫缺','Image unavailable'),'subtle'));zoom.append(img)}else zoom.append(node('span',tr('圖片暫缺','Image unavailable'),'subtle'));
  zoom.onclick=()=>ui.onZoom(rows,rows.indexOf(r),zoom);
  const info=node('div',null,'map-entry-info');info.append(node('strong',ui.titleOf(r)),node('span',r.background_id+' · '+(r.start_date||r.year||tr('日期待核對','Date to verify')),'subtle'),node('span',tr('活動：','Event: ')+(getLocale()==='zh'?r.series_zh||r.series:r.series),'subtle'));
  const mons=[...(r.pokemon??[])];if(mons.length)info.append(node('span',tr('適用寶可夢：','Pokémon: ')+mons.slice(0,6).map(m=>getLocale()==='zh'?m.name_zh||m.name_en:m.name_en).join('、')+(mons.length>6?tr(` 等 ${mons.length} 款`,` +${mons.length-6} more`):''),'subtle'));
  const products=ui.productSummary(r);if(products)info.append(node('span',products,'stockhint'));
  const actions=node('div',null,'map-entry-actions'),big=node('button',tr('放大檢視','View larger'),'quiet');big.type='button';big.onclick=()=>ui.onZoom(rows,rows.indexOf(r),big);
  const detail=node('a',tr('背景詳情','Background details'),'quiet');detail.href='backgrounds.html?background='+encodeURIComponent(r.background_id)+'&lang='+getLocale();detail.onclick=e=>{e.preventDefault();ui.onOpenDetail(r)};
  actions.append(big,detail);info.append(actions);card.append(zoom,info);host.append(card);
 }
 function select(key,{center=false}={}){
  selected=key;selectedRow=null;openSeries=null;const p=groups.places.find(x=>x.key===key);
  if(p&&center&&scale()<6)zoomTo(6/scale(),p.x,p.y);else if(p&&center){view.x=p.x-view.w/2;view.y=p.y-view.h/2;applyView()}else drawMarkers();
  renderList();renderSpotlight();ui.onSelect?.(key);
 }
 function renderCounts(){
  const n=groups.places.reduce((s,p)=>s+p.rows.length,0);
  ui.count.textContent=tr(`地圖：${groups.places.length} 個地點・${n} 筆背景紀錄（符合目前篩選）。數字代表背景紀錄，不是不重複圖樣款數。`,`Map: ${groups.places.length} places · ${n} background entries for the current filters. Numbers count entries, not unique designs.`);
  ui.unmappedNote.textContent=tr(`另有 ${groups.unmapped.length} 筆地點背景缺可靠座標、${groups.special.length} 筆特殊背景不屬單一城市，請用列表或「全球特殊背景」瀏覽。`,`${groups.unmapped.length} location entries lack a reliable place and ${groups.special.length} special backgrounds are not tied to one city; browse them in the list or under Global special backgrounds.`);
 }
 // Panning by drag; markers keep their screen size.
 svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,vx:view.x,vy:view.y,id:e.pointerId};moved=false});
 svg.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!moved&&Math.hypot(dx,dy)<5)return;if(scale()<=1.01)return;moved=true;svg.setPointerCapture?.(e.pointerId);const ppu=pxPerUnit();view.x=drag.vx-dx/ppu;view.y=drag.vy-dy/ppu;applyView()});
 const endDrag=()=>{drag=null;setTimeout(()=>{moved=false},0)};svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',endDrag);
 svg.addEventListener('dblclick',e=>{const r=svg.getBoundingClientRect();zoomTo(2,view.x+(e.clientX-r.left)/r.width*view.w,view.y+(e.clientY-r.top)/r.height*view.h)});
 svg.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();const r=svg.getBoundingClientRect();zoomTo(e.deltaY<0?1.25:0.8,view.x+(e.clientX-r.left)/r.width*view.w,view.y+(e.clientY-r.top)/r.height*view.h)},{passive:false});
 ui.zoomIn.onclick=()=>zoomTo(2);ui.zoomOut.onclick=()=>zoomTo(.5);ui.reset.onclick=()=>{view={x:0,y:0,w:W,h:H};applyView()};
 ui.placeFilter.oninput=renderList;
 if(typeof ResizeObserver==='function')new ResizeObserver(()=>drawMarkers()).observe(shell);
 return {
  setData(locs,landPath){locations=locs;land.setAttribute('d',landPath||'');ready=true;applyView()},
  get ready(){return ready},
  update(rows,{keepSelection=true}={}){
   groups=groupRowsByPlace(rows,locations);
   if(!keepSelection||!groups.places.some(p=>p.key===selected)){selected=null;selectedRow=null}
   drawMarkers();renderList();renderSpotlight();renderCounts();
  },
  select,
  get selected(){return selected},
  counts:()=>({places:groups.places.length,mapped:groups.places.reduce((s,p)=>s+p.rows.length,0),unmapped:groups.unmapped.length,special:groups.special.length}),
 };
}
