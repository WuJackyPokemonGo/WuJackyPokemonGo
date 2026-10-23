import {createBackgroundAdminService,mergeBackgroundOverrides,backgroundEditPayload,backgroundPokemonText} from './backgrounds-admin-service.mjs';
import {backgroundMatch,safeBackgroundImage} from './backgrounds-service.mjs';
const $=id=>document.getElementById(id);
function node(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n}
function button(text,fn){const b=node('button',text,'alt');b.type='button';b.onclick=fn;return b}
export function initBackgroundAdminUI({client,journal,run,notify,getProducts,showView}){
 const service=createBackgroundAdminService(client,journal);let base=[],rows=[],editing=null,page=0,pageCount=1,epoch=0,loaded=false;
 const statuses={'official-event-confirmed':'官方活動已核對','catalog-crosschecked':'名錄交叉核對','owner-confirmed':'管理員已確認','catalogued-needs-event-check':'待核對'};
 function sync(){$('adminBackgroundPrev').disabled=page<=0;$('adminBackgroundNext').disabled=page>=pageCount-1;const p=service.pending;$('backgroundPending').hidden=!p;$('backgroundPendingText').textContent=p?`背景 ${p.payload.background_id} 的上次修改結果尚未確認，請重試原修改。`:''}
 function render(){
  const term=$('adminBackgroundSearch').value,visibility=$('adminBackgroundVisibility').value;
  const matches=rows.filter(r=>backgroundMatch(r,term)&&(visibility==='all'||r.is_visible===(visibility==='visible')));
  const pages=Math.max(1,Math.ceil(matches.length/20));pageCount=pages;page=Math.max(0,Math.min(page,pages-1));
  $('adminBackgroundStats').textContent=`共 ${rows.length} 組；符合 ${matches.length} 組。儲存後會更新正式圖鑑。`;
  const list=$('adminBackgroundList');list.replaceChildren();
  for(const r of matches.slice(page*20,page*20+20)){
   const article=node('article',null,'product bar'),info=node('div'),actions=node('div',null,'actions');
   info.append(node('strong',r.name_zh||r.name_en),node('small',`${r.background_id} · ${r.is_visible?'顯示中':'已隱藏'} · ${statuses[r.verification]||'待核對'}${r.cloud_version?' · 已自行修改':''}`),node('small',r.name_en||''));
   actions.append(button('編輯背景',()=>openEditor(r)));
   if(r.is_visible){const link=node('a','查看圖鑑','background-admin-link');link.href='backgrounds.html?background='+encodeURIComponent(r.background_id);link.target='_blank';link.rel='noopener noreferrer';actions.append(link)}
   article.append(info,actions);list.append(article);
  }
  if(!matches.length)list.append(node('p','沒有符合條件的背景。','muted'));
  $('adminBackgroundPage').textContent=`${page+1} / ${pages}`;$('adminBackgroundPrev').disabled=page===0;$('adminBackgroundNext').disabled=page>=pages-1;sync();
 }
 async function load(){
  const version=epoch;
  const response=await fetch('data/backgrounds.json?v=20261023-catalog-admin',{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('無法載入背景基礎資料。');
  const data=await response.json();const overrides=await service.list();if(version!==epoch)return;
  base=data.records;rows=mergeBackgroundOverrides(base,overrides,{includeHidden:true});loaded=true;render();
 }
 function productsOptions(row){
  const select=$('backgroundRelatedProducts');select.replaceChildren();const selected=new Set(row.related_product_ids??[]),products=getProducts();
  for(const p of products){const o=node('option',`${p.sku}｜${p.name_zh}${p.publication_status==='published'&&p.is_live?'':'（尚未公開）'}`);o.value=p.id;o.selected=selected.has(p.id);select.append(o)}
  // Preserve relations to archived records absent from the current admin list.
  for(const id of selected)if(!products.some(p=>p.id===id)){const o=node('option',`既有關聯商品 ${id}`);o.value=id;o.selected=true;select.append(o)}
 }
 function previewImage(){const url=safeBackgroundImage($('backgroundEditForm').elements.image_source.value),img=$('backgroundImagePreview');img.hidden=!url;if(url)img.src=url;else img.removeAttribute('src')}
 function openEditor(row=null){
  if(service.pending){notify('請先重試上一筆圖鑑修改，再編輯其他背景。',true);return}
  editing=row??{background_id:'BG-U-'+crypto.randomUUID(),cloud_version:0,is_visible:false,name_zh:'',name_en:'',type:'location',series:'Other',series_zh:'其他活動',release_state:'needs-verification',verification:'catalogued-needs-event-check',pokemon:[],evolved_pokemon:[],related_product_ids:[]};
  const form=$('backgroundEditForm');form.reset();$('backgroundEditTitle').textContent=row?'編輯背景':'新增背景';$('backgroundEditId').textContent=editing.background_id;
  for(const control of form.elements){if(!control.name||control.type==='submit')continue;const value=editing[control.name];if(control.name==='related_product_ids')continue;if(control.type==='checkbox')control.checked=Boolean(value);else if(['pokemon','evolved_pokemon'].includes(control.name))control.value=backgroundPokemonText(value);else if(['notes','notes_en','official_sources','catalog_sources'].includes(control.name))control.value=(value??[]).join('\n');else control.value=value??''}
  productsOptions(editing);previewImage();$('backgroundEditDialog').showModal();
 }
 $('tabBackgrounds').onclick=()=>run(async()=>{showView('backgrounds');if(!loaded)await load();else render()});
 $('reloadBackgrounds').onclick=()=>run(load);
 $('addBackground').onclick=()=>{if(!loaded){notify('請先重新載入圖鑑。',true);return}openEditor()};
 $('adminBackgroundSearch').oninput=$('adminBackgroundVisibility').onchange=()=>{page=0;render()};
 $('adminBackgroundPrev').onclick=()=>{page--;render()};$('adminBackgroundNext').onclick=()=>{page++;render()};
 $('backgroundEditForm').elements.image_source.oninput=previewImage;
 $('backgroundEditForm').onsubmit=event=>{event.preventDefault();run(async()=>{
  const form=$('backgroundEditForm'),values=Object.fromEntries(new FormData(form));values.related_product_ids=[...$('backgroundRelatedProducts').selectedOptions].map(o=>o.value);
  const record=backgroundEditPayload(values,editing),visible=form.elements.is_visible.checked;
  try{await service.save(editing,record,visible)}finally{sync()}
  $('backgroundEditDialog').close();
  try{await load();notify(visible?'背景已儲存並更新正式圖鑑。':'背景已儲存，正式圖鑑中已隱藏。')}catch{notify('背景已儲存，但清單重新載入失敗。請重新載入確認，不要重做同一筆修改。',true)}
 })};
 $('retryBackgroundSave').onclick=()=>run(async()=>{try{await service.retry();$('backgroundEditDialog').close();try{await load();notify('原圖鑑修改已確認儲存。')}catch{notify('原修改已確認儲存，但清單重新載入失敗。請重新載入確認。',true)}}finally{sync()}});
 return {sync,attach(id){epoch++;loaded=false;service.attach(id);sync()},clear(){epoch++;loaded=false;base=[];rows=[];editing=null;service.attach(null);$('adminBackgroundList').replaceChildren();$('backgroundEditForm').reset();$('adminBackgroundSearch').value='';$('adminBackgroundStats').textContent='';$('backgroundImagePreview').removeAttribute('src');sync()}};
}
