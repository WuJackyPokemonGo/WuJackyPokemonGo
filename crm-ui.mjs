// 後台「客人名單」裡的 Threads CRM 區塊：匯入匯出檔、經營篩選、每位客人的案件狀態、歷史成交建議審核、
// 到貨等候、客人資料（聯絡管道／介紹來源／聯絡人類型／語言地區／付款方式）、教學與售後待辦、顯示設定。
// 聊天判斷一律是建議，成交要管理員按「接受」才算數；隱藏特徵只影響畫面，資料保留。
import {parseThreadsExport,readThreadsZip,sha256Hex,chunk,CATEGORY_LABELS,TAG_LABELS} from './crm-threads-import.mjs';
import {CASE_STATUS,CASE_PRIORITY,DEFAULT_SETTINGS,DEFAULT_DISPLAY,FEATURES,CATEGORIES,SORTS,customerFeatures,matchesFilter,searchText,displayLayout,filterByWaitingProduct} from './crm-features.mjs';
import {TASK_KINDS} from './crm-cases.mjs';
const $=id=>document.getElementById(id);
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n}
function btn(label,fn,cls='alt'){const b=el('button',label,cls);b.type='button';b.onclick=fn;return b}
const checked=({data,error})=>{if(error)throw error;return data};
const day=v=>v?new Date(v).toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'}):'—';
const md=v=>v?day(v).slice(5).replace('-','/'):'—';
const twd=n=>'NT$'+Number(n??0).toLocaleString('en-US');
const PAGE=50;
const group=(list,key='customer_id')=>{const m=new Map();for(const x of list??[]){if(!m.has(x[key]))m.set(x[key],[]);m.get(x[key]).push(x)}return m};
const CONTACT_TYPES=[['customer','客人'],['friend','朋友'],['supplier','供應商'],['lottery','抽獎對象']];
const CHANNELS=['Threads','LINE','Instagram','Facebook','面交','其他'];

export async function fetchAll(query,size=1000){const rows=[];for(let from=0;from<200000;from+=size){const part=checked(await query().range(from,from+size-1));rows.push(...part);if(part.length<size)break}return rows}
// 每位客人一列（以 Threads 身分為主，轉 LINE 等其他身分掛在同一位客人下）。網站訂單以客人名稱（customer_alias）對應。
export function crmRows({identities,tags,inquiries,cases=[],deals=[],waits=[],orders=[],tasks=[],metas=[],aliases=new Map(),settings=DEFAULT_SETTINGS,now=Date.now()}){
 const tagMap=group(tags),inqMap=group(inquiries),caseMap=group(cases),dealMap=group(deals),waitMap=group(waits),taskMap=group(tasks),idMap=group(identities);
 const metaMap=new Map(metas.map(m=>[m.customer_id,m]));
 const orderMap=new Map();for(const o of orders){const k=String(o.customer_alias??'').trim().toLowerCase();if(!k)continue;if(!orderMap.has(k))orderMap.set(k,[]);orderMap.get(k).push(o)}
 return [...idMap.entries()].map(([cid,ids])=>{const id=ids.find(x=>(x.platform??'threads')==='threads')??ids[0];
  const inq=(inqMap.get(cid)??[]).sort((a,b)=>String(b.occurred_at).localeCompare(String(a.occurred_at)));
  const counts=new Map();for(const i of inq)for(const t of i.terms??[])counts.set(t,(counts.get(t)??0)+1);
  const own={cases:(caseMap.get(cid)??[]).sort((a,b)=>String(b.last_at).localeCompare(String(a.last_at))),deals:(dealMap.get(cid)??[]).sort((a,b)=>String(b.occurred_at).localeCompare(String(a.occurred_at))),
   waits:waitMap.get(cid)??[],tasks:taskMap.get(cid)??[],identities:ids,meta:metaMap.get(cid)??null,orders:orderMap.get(String(aliases.get(cid)??'').trim().toLowerCase())??[]};
  return {...id,...own,tags:tagMap.get(cid)??[],inquiries:inq,topTerms:[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>x[0]),
   features:customerFeatures({...own,inquiries:inq},settings,now)}})
  .sort(SORTS.recent[1]);
}
// filters：特徵篩選（全部要符合）、status（任一案件狀態）、tag（舊標籤）、query（名稱／商品／關鍵字）、
// category＋categoryMode（買過／問過某品類）、waitingProduct（從商品反查等貨的客人）
export function filterCrm(rows,{query='',tag='',filters=[],status='',sort='recent',productNames,category='',categoryMode='asked',waitingProduct=''}={}){const q=String(query).trim().toLowerCase();
 let out=rows.filter(r=>(!tag||r.tags.some(t=>t.tag===tag))&&(!status||(r.cases??[]).some(c=>c.status===status))
  &&filters.every(k=>!r.features||matchesFilter(r.features,k))&&(!q||searchText(r,productNames).includes(q))
  &&(!category||r.features?.[categoryMode==='bought'?'bought':'asked']?.has(category)));
 if(waitingProduct)out=filterByWaitingProduct(out,waitingProduct,productNames?.get(waitingProduct)??'');
 return SORTS[sort]&&sort!=='recent'?out.sort(SORTS[sort][1]):out}

export function initCrmUI({client,run,notify}){
 let rows=[],followups=[],shown=PAGE,pending=null,loaded=false,settings={...DEFAULT_SETTINGS},display={...DEFAULT_DISPLAY},productNames=new Map();const active=new Set();
 const host=$('crmPanel');if(!host)return {load(){}};
 host.replaceChildren();
 const head=el('div',null,'bar');head.append(el('h3','Threads 客人（CRM）'));
 const file=el('input');file.type='file';file.accept='.zip,application/zip';file.hidden=true;file.id='crmThreadsFile';
 const pick=el('label','匯入 Threads 匯出檔（.zip）','alt crm-file');pick.append(file);
 const actions=el('div',null,'actions');actions.append(pick);head.append(actions);
 const intro=el('p','匯出檔在你的瀏覽器裡解析，私訊原文不會上傳。成交、付款都只是「建議」：成交要你按「接受」才計入熟客與成交額；聊天提到已匯款只會變成「待核款」。重新匯入不會產生重複，你改過的內容也不會被覆蓋。','muted');
 const report=el('div');report.id='crmImportReport';
 const search=el('input');search.type='search';search.placeholder='搜尋客人、商品（例如 烈空坐、耿鬼）';search.id='crmSearch';
 const chips=el('div',null,'crm-chips');chips.id='crmChips';
 const more=el('details',null,'crm-more');more.append(el('summary','更多篩選與設定'));
 const moreChips=el('div',null,'crm-chips');moreChips.id='crmMoreChips';
 const statusSel=el('select');statusSel.id='crmStatus';statusSel.append(new Option('全部案件狀態',''),...CASE_PRIORITY.map(k=>new Option(CASE_STATUS[k],k)));
 const tagSel=el('select');tagSel.id='crmTag';tagSel.append(new Option('全部舊標籤',''),...Object.entries(TAG_LABELS).map(([k,v])=>new Option(v,k)));
 const sortSel=el('select');sortSel.id='crmSort';for(const [k,[label]] of Object.entries(SORTS))sortSel.append(new Option('排序：'+label,k));
 const catSel=el('select');catSel.id='crmCategory';catSel.append(new Option('全部品類',''),...CATEGORIES.map(([k,l])=>new Option(l,k)));
 const catMode=el('select');catMode.id='crmCategoryMode';catMode.append(new Option('問過','asked'),new Option('買過（已接受成交）','bought'));
 const waitSel=el('select');waitSel.id='crmWaitingProduct';
 const hv=el('input');hv.type='number';hv.min='0';hv.step='100';hv.id='crmHighValue';const lp=el('input');lp.type='number';lp.min='1';lp.step='1';lp.id='crmLapsed';
 const grid=el('div',null,'crm-more-grid');const lab=(t,n)=>{const l=el('label',t);l.append(n);return l};
 grid.append(lab('案件狀態',statusSel),lab('偏好品類（由商品名稱推斷）',catSel),lab('品類範圍',catMode),lab('從商品反查等貨的客人',waitSel),lab('舊標籤（關鍵字判斷）',tagSel),lab('排序',sortSel),lab('高單價／高預算門檻（NT$）',hv),lab('回購客久未成交（天）',lp));
 const saveSet=btn('儲存門檻',()=>run(async()=>{settings={high_value_twd:Math.max(0,Number(hv.value)||DEFAULT_SETTINGS.high_value_twd),lapsed_days:Math.max(1,Number(lp.value)||DEFAULT_SETTINGS.lapsed_days)};
  checked(await client.from('crm_settings').upsert({key:'features',value:settings,updated_at:new Date().toISOString()}));notify('門檻已儲存。');await load(true)}));
 const displayBox=el('details',null,'crm-more');displayBox.append(el('summary','顯示設定（首頁特徵、排序、隱藏）'));const displayList=el('div');displayList.id='crmDisplay';displayBox.append(displayList);
 more.append(moreChips,grid,saveSet,displayBox);
 const sl=el('label','搜尋');sl.append(search);
 const fuBox=el('div');fuBox.id='crmFollowups';const summary=el('p',null,'muted');summary.id='crmSummary';const list=el('div');list.id='crmList';
 const fuWrap=el('details',null,'crm-more');fuWrap.append(el('summary','待追蹤（舊版，最後一則是客人）'),fuBox);
 host.append(head,intro,report,sl,chips,more,summary,list,fuWrap);
 search.oninput=()=>{shown=PAGE;render()};for(const n of [statusSel,tagSel,sortSel,catSel,catMode,waitSel])n.onchange=()=>{shown=PAGE;render()};

 function chip(k,label){const b=btn(label,()=>{active.has(k)?active.delete(k):active.add(k);shown=PAGE;render()},'crm-chip'+(active.has(k)?' on':''));b.dataset.filter=k;b.setAttribute('aria-pressed',active.has(k));return b}
 function renderChips(){const lay=displayLayout(display);for(const [k] of lay.hidden)active.delete(k);
  const cnt=k=>rows.filter(r=>matchesFilter(r.features,k)).length;
  chips.replaceChildren(...lay.top.map(([k,l])=>chip(k,`${l} ${cnt(k)}`)));moreChips.replaceChildren(...lay.more.map(([k,l])=>chip(k,`${l} ${cnt(k)}`)));
  renderDisplay(lay)}
 function renderDisplay(lay){displayList.replaceChildren(el('p','「首頁」會顯示在搜尋列下方；「隱藏」只是不顯示，歷史資料都保留，隨時可以重新顯示。','muted'));
  const top=[...lay.top.map(([k])=>k)];const hidden=new Set(lay.hidden.map(([k])=>k));
  for(const [k,label] of FEATURES){const row=el('div',null,'crm-display-row');row.dataset.feature=k;
   const state=hidden.has(k)?'已隱藏':top.includes(k)?`首頁第 ${top.indexOf(k)+1} 個`:'更多篩選';
   row.append(el('span',label),el('small',state,'muted'));
   const a=el('div',null,'actions');
   if(hidden.has(k))a.append(btn('重新顯示',()=>saveDisplay({...display,hidden:display.hidden.filter(x=>x!==k)})));
   else{a.append(top.includes(k)?btn('移出首頁',()=>saveDisplay({...display,top:display.top.filter(x=>x!==k)})):btn('放到首頁',()=>saveDisplay({...display,top:[...display.top.filter(x=>x!==k),k]})));
    if(top.includes(k)&&top.indexOf(k)>0)a.append(btn('往前',()=>{const t=[...display.top];const i=t.indexOf(k);[t[i-1],t[i]]=[t[i],t[i-1]];saveDisplay({...display,top:t})}));
    a.append(btn('隱藏',()=>saveDisplay({...display,hidden:[...new Set([...(display.hidden??[]),k])],top:display.top.filter(x=>x!==k)})))}
   row.append(a);displayList.append(row)}}
 const saveDisplay=next=>run(async()=>{display={...DEFAULT_DISPLAY,...next};checked(await client.from('crm_settings').upsert({key:'display',value:display,updated_at:new Date().toISOString()}));renderChips();render()});

 file.onchange=()=>run(async()=>{const f=file.files[0];file.value='';if(!f)return;
  report.replaceChildren(el('p','正在讀取匯出檔…','notice'));
  const products=checked(await client.from('products').select('id,name:name_zh,name_en,aliases').is('archived_at',null));
  let nicknames='';try{const res=await fetch('data/crm-nicknames.txt?v='+Date.now(),{cache:'no-store'});if(res.ok)nicknames=await res.text()}catch{}
  const files=await readThreadsZip(f);const {rows:parsed,stats}=parseThreadsExport(files,{products,nicknames,suggestScope:'A'});stats.nicknames=nicknames.split(/\n/).filter(x=>x.trim()).length;
  pending={rows:parsed,stats,sha:await sha256Hex(f),name:f.name};
  report.replaceChildren(statsTable(stats),el('p',`即將匯入 ${parsed.length} 位客人、${stats.inquiries} 筆詢問紀錄；並替 A 層 ${stats.suggested_customers} 位產生 ${stats.cases} 筆案件、${stats.deals} 筆成交建議、${stats.tasks} 筆教學／售後待辦（第一輪只做 A 層）。確認數量無誤後再按「確認匯入」。`,'notice'),
   btn('確認匯入',()=>run(doImport),''),btn('取消',()=>{pending=null;report.replaceChildren()}));
 });
 async function doImport(){if(!pending)return;const {rows:parsed,stats,sha}=pending;pending=null;
  const batch=checked(await client.from('crm_import_batches').insert({source:'threads',file_sha256:sha,stats}).select('id').single()).id;
  const total={};const parts=chunk(parsed,40);const prog=el('p','','notice');report.replaceChildren(prog);
  const add=res=>{for(const [k,v] of Object.entries(res))total[k]=(total[k]??0)+v};
  for(const [n,part] of parts.entries()){prog.textContent=`匯入中… ${n+1}／${parts.length}`;
   add(checked(await client.rpc('admin_crm_import_threads',{p_batch:batch,p_rows:part})));
   const sug=part.filter(r=>r.cases?.length||r.deals?.length||r.waits?.length).map(r=>({external_key:r.external_key,cases:r.cases,deals:r.deals,waits:r.waits}));
   if(sug.length)add(checked(await client.rpc('admin_crm_import_suggestions',{p_batch:batch,p_rows:sug})));
   const tk=part.filter(r=>r.tasks?.length).map(r=>({external_key:r.external_key,tasks:r.tasks}));
   if(tk.length)add(checked(await client.rpc('admin_crm_import_tasks',{p_rows:tk})))}
  checked(await client.from('crm_import_batches').update({result:total,finished_at:new Date().toISOString()}).eq('id',batch));
  report.replaceChildren(resultTable(stats,total));notify('Threads 匯入完成。');await load(true);
 }
 function table(pairs){const t=el('table');for(const [k,v] of pairs){const tr=el('tr');tr.append(el('th',k),el('td',String(v??0)));t.append(tr)}const w=el('div',null,'table-scroll');w.append(t);return w}
 function statsTable(s){return table([['JSON 檔',s.json_files],['私訊檔',s.message_files],['對話',s.conversations],['私訊則數',s.messages],['略過：群組',s.groups_skipped],['略過：空白',s.empty_skipped],['讀取失敗',s.failed_files.length],['可匯入客人',s.imported],['詢問紀錄',s.inquiries],['待追蹤',s.followups],['資料期間',day(s.date_from)+' → '+day(s.date_to)],['暱稱清單',(s.nicknames??0)+' 行'],
  ['產生建議的客人（A 層）',s.suggested_customers],['案件',s.cases],...Object.entries(s.case_status??{}).map(([k,v])=>['　'+(CASE_STATUS[k]??k),v]),['成交建議',s.deals],['　其中找得到金額',s.deals_with_amount],['到貨等候',s.waits],['教學／售後待辦',s.tasks]])}
 function resultTable(s,r){const w=statsTable(s);const t=w.querySelector('table');
  for(const [k,v] of [['新建客人',r.customers_created],['已存在（更新）',r.customers_matched],['新增詢問紀錄',r.inquiries_new],['更新品項辨識',r.inquiries_updated],['重複略過的詢問',r.inquiries_skipped],['新增待追蹤',r.followups_new],
   ['新增案件',r.cases_new],['更新案件',r.cases_updated],['案件不變',r.cases_unchanged],['新增成交建議',r.deals_new],['更新成交建議',r.deals_updated],['成交建議不變（含已接受／略過）',r.deals_unchanged],['新增到貨等候',r.waits_new],['新增教學／售後待辦',r.tasks_new]]){const tr=el('tr');tr.append(el('th',k),el('td',String(v??0)));t.append(tr)}
  const ok=(r.customers_created??0)+(r.customers_matched??0)===s.imported&&!(r.customers_missing>0);w.append(el('p',ok?`核對通過：新建＋更新＝${s.imported}，與可匯入客人數一致。`:'核對不一致，請截圖給 Claude。',ok?'notice':'notice error'));return w}

 async function load(force=false){if(loaded&&!force)return;
  const opt=async(q)=>{try{return await q()}catch{return []}};// 新表尚未建立時不擋舊功能
  const [identities,tags,inquiries,fu,cases,deals,waits,orders,profiles,products,set,tasks,metas]=await Promise.all([
   fetchAll(()=>client.from('crm_identities').select('id,customer_id,platform,external_key,display_name,folder,first_seen_at,last_seen_at,message_count,customer_message_count,last_sender,summary,narrative').order('last_seen_at',{ascending:false})),
   fetchAll(()=>client.from('crm_tags').select('customer_id,tag,source')),
   fetchAll(()=>client.from('crm_inquiries').select('customer_id,occurred_at,category,terms,product_ids,excerpt,evidence').order('occurred_at',{ascending:false})),
   fetchAll(()=>client.from('crm_followups').select('id,customer_id,reason,excerpt,status,due_on,created_at').eq('status','open').order('created_at',{ascending:false})),
   opt(()=>fetchAll(()=>client.from('crm_cases').select('id,customer_id,opened_at,last_at,status,status_source,suggested_status,items,product_ids,excerpt,evidence,note').order('last_at',{ascending:false}))),
   opt(()=>fetchAll(()=>client.from('crm_deals').select('id,customer_id,occurred_at,items,product_ids,qty,amount_twd,refund_twd,status,evidence,note').order('occurred_at',{ascending:false}))),
   opt(()=>fetchAll(()=>client.from('crm_stock_waits').select('id,customer_id,item_text,product_ids,channel,follow_on,status,excerpt,note,created_at').neq('status','closed'))),
   opt(()=>fetchAll(()=>client.from('orders').select('id,customer_alias,status,completed_at,created_at,public_subtotal_twd,received_amount_twd,refund_amount_twd').eq('status','completed'))),
   fetchAll(()=>client.from('customer_profiles').select('id,alias')),
   opt(()=>fetchAll(()=>client.from('products').select('id,name_zh'))),
   opt(async()=>checked(await client.from('crm_settings').select('key,value'))),
   opt(()=>fetchAll(()=>client.from('crm_tasks').select('id,customer_id,case_source_key,kind,title,status,source,excerpt,created_at,resolved_at').order('created_at',{ascending:false}))),
   opt(()=>fetchAll(()=>client.from('crm_customer_meta').select('*')))]);
  const setMap=new Map(set.map(x=>[x.key,x.value]));settings={...DEFAULT_SETTINGS,...(setMap.get('features')??{})};display={...DEFAULT_DISPLAY,...(setMap.get('display')??{})};
  hv.value=settings.high_value_twd;lp.value=settings.lapsed_days;
  productNames=new Map(products.map(p=>[p.id,p.name_zh]));
  rows=crmRows({identities,tags,inquiries,cases,deals,waits,orders,tasks,metas,aliases:new Map(profiles.map(p=>[p.id,p.alias])),settings});followups=fu;loaded=true;
  const waitIds=[...new Set(rows.flatMap(r=>r.waits.filter(w=>w.status==='waiting').flatMap(w=>w.product_ids??[])))];
  waitSel.replaceChildren(new Option('（不限）',''),...waitIds.map(id=>new Option(productNames.get(id)??id,id)));
  renderChips();render();
 }
 function render(){
  const byCustomer=new Map(rows.map(r=>[r.customer_id,r]));
  fuBox.replaceChildren();if(!followups.length)fuBox.append(el('p','目前沒有待追蹤事項。','muted'));
  for(const f of followups){const r=byCustomer.get(f.customer_id);const card=el('article',null,'product');
   card.append(el('strong',`${day(f.created_at)}｜${r?.display_name??'客人'}`),el('p',f.reason,'order-detail-line'),el('small',(f.excerpt?'「'+f.excerpt+'」 ':'')+(r?.folder??'')));
   const a=el('div',null,'actions');a.append(btn('已處理',()=>run(()=>resolve(f,'done'))),btn('略過',()=>run(()=>resolve(f,'dismissed'))));card.append(a);fuBox.append(card)}
  const list2=filterCrm(rows,{query:search.value,tag:tagSel.value,status:statusSel.value,filters:[...active],sort:sortSel.value,productNames,category:catSel.value,categoryMode:catMode.value,waitingProduct:waitSel.value});
  for(const b of host.querySelectorAll('.crm-chip'))b.classList.toggle('on',active.has(b.dataset.filter));
  summary.textContent=`共 ${rows.length} 位 Threads 客人，符合 ${list2.length} 位。`;
  list.replaceChildren();for(const r of list2.slice(0,shown))list.append(card(r));
  if(list2.length>shown)list.append(btn(`顯示更多（還有 ${list2.length-shown} 位）`,()=>{shown+=PAGE;render()}));
 }
 const pill=(status)=>el('span',CASE_STATUS[status]??status,'crm-pill crm-'+status);
 function card(r){const f=r.features;const c=el('article',null,'crm-card');c.dataset.customer=r.customer_id;
  const top=el('div',null,'crm-card-head');top.append(el('strong',r.display_name||'（未命名）'),el('span',f.channel,'crm-channel'));c.append(top);
  const badges=el('div',null,'crm-badges');if(f.regular)badges.append(el('span','熟客','crm-badge'));if(f.highValue)badges.append(el('span','高單價','crm-badge'));if(f.budget)badges.append(el('span','高預算','crm-badge'));if(f.lapsed)badges.append(el('span','久未成交','crm-badge muted-badge'));
  const types=(r.meta?.contact_types??[]).filter(t=>t!=='customer');for(const t of types)badges.append(el('span',CONTACT_TYPES.find(x=>x[0]===t)?.[1]??t,'crm-badge muted-badge'));if(badges.childNodes.length)c.append(badges);
  c.append(el('p',f.dealCount?`成交 ${f.dealCount} 次・累計 ${twd(f.total)}・最近 ${day(f.lastDealAt)}`:`尚無已確認的成交${f.lastInquiryAt?'・最近詢價 '+day(f.lastInquiryAt):''}`,'crm-deal-line'));
  if(f.review)c.append(el('p',`成交建議 ${f.review} 筆待你確認`,'crm-review'));
  if(f.waiting.length)c.append(el('p','等貨：'+f.waiting.map(w=>w.item_text||'（未寫品項）').join('、'),'crm-wait'));
  else if(f.frequent.length)c.append(el('p','常問：'+f.frequent.slice(0,3).map(x=>`${x.term}（${x.count} 次${x.pending?'，待確認':''}）`).join('、'),'muted'));
  else if(r.topTerms.length)c.append(el('p','關注：'+r.topTerms.slice(0,3).join('、'),'muted'));
  if(f.budget)c.append(el('small',`高預算意向：${twd(f.budget.amount)}・${(f.budget.items??[]).slice(0,2).join('、')||'品項未辨識'}・${day(f.budget.ts)}（${f.budget.kind==='offer'?'客人出價':'接受報價'}）`,'muted'));
  if(f.next){const n=el('p',null,'crm-next');n.append(el('span','下一步 ','muted'),pill(f.next.status),el('span',' '+[(f.next.items??[]).slice(0,2).join('、'),md(f.next.last_at)+(f.next.excerpt?'「'+f.next.excerpt+'」':'')].filter(Boolean).join('｜')));c.append(n);
   if(f.openCases.length>1)c.append(el('small',`另有 ${f.openCases.length-1} 件進行中：`+f.openCases.slice(1,4).map(x=>CASE_STATUS[x.status]+((x.items??[])[0]?' '+x.items[0]:'')).join('、'),'muted'))}
  if(f.openTasks.length)c.append(el('small',`待辦：`+f.openTasks.slice(0,3).map(t=>TASK_KINDS[t.kind]??t.kind).join('、'),'crm-review'));
  if(r.narrative)c.append(el('p','摘要：'+r.narrative,'crm-narrative'));else if(r.summary)c.append(el('p',r.summary,'muted'));
  const panel=el('div',null,'crm-detail');panel.hidden=true;
  const show=(fn)=>()=>{const same=panel.dataset.view===fn.name&&!panel.hidden;panel.hidden=same;panel.dataset.view=fn.name;if(!same){panel.replaceChildren();fn(r,panel)}};
  const a=el('div',null,'actions crm-actions');
  a.append(btn(`案件 ${r.cases.length}`,show(casesView)),btn(`成交 ${r.deals.length}`,show(dealsView)),btn(`等貨 ${r.waits.length}`,show(waitsView)),btn(`待辦 ${f.openTasks.length}`,show(tasksView)),btn('客人資料',show(metaView)),btn('詢問紀錄',show(inquiriesView)));
  c.append(a,panel);return c}
 function casesView(r,d){if(!r.cases.length){d.append(el('p','這位客人還沒有案件（第一輪只替 A 層產生）。','muted'));return}
  for(const k of r.cases){const row=el('div',null,'crm-row');row.append(el('strong',`${md(k.opened_at)}–${md(k.last_at)}｜${(k.items??[]).join('、')||'（未辨識品項）'}`));
   if(k.excerpt)row.append(el('small','「'+k.excerpt+'」','muted'));
   const sel=el('select');sel.setAttribute('aria-label','案件狀態');for(const s of CASE_PRIORITY)sel.append(new Option(CASE_STATUS[s],s));sel.value=k.status;
   sel.onchange=()=>run(async()=>{checked(await client.from('crm_cases').update({status:sel.value,status_source:'manual',updated_at:new Date().toISOString()}).eq('id',k.id));k.status=sel.value;k.status_source='manual';refresh(r)});
   const meta=el('small',k.status_source==='manual'?(k.suggested_status&&k.suggested_status!==k.status?`你改過（系統建議：${CASE_STATUS[k.suggested_status]}）`:'你改過'):'系統建議','muted');
   row.append(sel,meta);
   if(k.status==='payment_to_verify')row.append(el('small','確認入帳與交付請走「訂單」流程；這裡只記錄聊天中的付款線索。','muted'));
   d.append(row)}}
 function dealsView(r,d){if(!r.deals.length&&!r.orders.length){d.append(el('p','沒有成交建議或網站訂單。','muted'));return}
  for(const o of r.orders)d.append(el('p',`網站訂單 #${o.id.slice(0,8)}｜${day(o.completed_at)}｜${twd((o.public_subtotal_twd??o.received_amount_twd??0)-(o.refund_amount_twd??0))}`,'order-detail-line'));
  for(const x of r.deals){const row=el('div',null,'crm-row');const ev=x.evidence??{};
   row.append(el('strong',`${day(x.occurred_at)}｜${(x.items??[]).map(i=>i.text).join(' + ')}（${x.qty} 隻，算 1 筆）`));
   row.append(el('small',`金額來源：${ev.amount_basis??'—'}${ev.amount_excerpt?'「'+ev.amount_excerpt+'」':''}`,'muted'));
   const amt=el('input');amt.type='number';amt.min='0';amt.value=x.amount_twd??'';amt.setAttribute('aria-label','成交金額');
   const ref=el('input');ref.type='number';ref.min='0';ref.value=x.refund_twd??0;ref.setAttribute('aria-label','退款金額');
   const g=el('div',null,'crm-deal-form');g.append(lab2('成交金額 NT$',amt),lab2('退款 NT$',ref));row.append(g);
   row.append(el('small',{suggested:'待確認',accepted:'已接受（計入成交）',rejected:'已略過（不計入）'}[x.status],'crm-deal-status'));
   const save=async status=>{const amount=amt.value===''?null:Number(amt.value),refund=Number(ref.value)||0;
    if(status==='accepted'&&amount==null)throw Error('請先填成交金額再接受。');if(amount!=null&&refund>amount)throw Error('退款不能大於成交金額。');
    checked(await client.from('crm_deals').update({status,amount_twd:amount,refund_twd:refund,decided_at:status==='suggested'?null:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',x.id));
    Object.assign(x,{status,amount_twd:amount,refund_twd:refund});refresh(r)};
   const act=el('div',null,'actions');act.append(btn(x.status==='accepted'?'更新':'接受',()=>run(()=>save('accepted')),''),btn('略過',()=>run(()=>save('rejected'))));if(x.status!=='suggested')act.append(btn('改回待確認',()=>run(()=>save('suggested'))));
   row.append(act);d.append(row)}}
 const lab2=(t,n)=>{const l=el('label',t);l.append(n);return l};
 function waitsView(r,d){if(!r.waits.length)d.append(el('p','沒有等貨紀錄。','muted'));
  for(const w of r.waits){const row=el('div',null,'crm-row');row.append(el('strong',`${w.item_text||'（未寫品項）'}｜${w.channel||'—'}｜${{waiting:'待通知',notified:'已通知',closed:'已結束'}[w.status]}`));if(w.excerpt)row.append(el('small','「'+w.excerpt+'」','muted'));
   const date=el('input');date.type='date';date.value=w.follow_on??'';date.setAttribute('aria-label','下次追蹤日');
   const upd=async patch=>{checked(await client.from('crm_stock_waits').update({...patch,updated_at:new Date().toISOString()}).eq('id',w.id));Object.assign(w,patch);refresh(r)};
   const act=el('div',null,'actions');act.append(lab2('下次追蹤日',date),btn('存日期',()=>run(()=>upd({follow_on:date.value||null}))),btn('已通知',()=>run(()=>upd({status:'notified'}))),btn('結束',()=>run(()=>upd({status:'closed'}))));
   row.append(act);d.append(row)}
  const item=el('input');item.placeholder='等哪個商品（例如 超夢 XXL 大師球）';item.setAttribute('aria-label','等貨品項');
  const pickP=el('select');pickP.setAttribute('aria-label','對應商品');pickP.append(new Option('（不指定商品）',''),...[...productNames.entries()].map(([id,n])=>new Option(n,id)));
  const ch=el('select');ch.setAttribute('aria-label','聯絡管道');for(const x of CHANNELS)ch.append(new Option(x,x));ch.value=(r.features.channel.split('→').at(-1)||'Threads').trim();
  const row=el('div',null,'crm-row');row.append(item,pickP,ch,btn('新增等貨',()=>run(async()=>{if(!item.value.trim()&&!pickP.value)throw Error('請寫等哪個商品。');
   const w=checked(await client.from('crm_stock_waits').insert({customer_id:r.customer_id,item_text:(item.value.trim()||productNames.get(pickP.value)||'').slice(0,120),product_ids:pickP.value?[pickP.value]:[],channel:ch.value,source:'manual'}).select('id,customer_id,item_text,product_ids,channel,follow_on,status,excerpt,note,created_at').single());r.waits.push(w);refresh(r)})));d.append(row)}
 function tasksView(r,d){if(!r.tasks.length)d.append(el('p','沒有教學或售後待辦。','muted'));
  for(const t of r.tasks){const row=el('div',null,'crm-row');row.append(el('strong',`${TASK_KINDS[t.kind]??t.kind}｜${t.title||''}`),el('small',`${day(t.created_at)}・${{open:'待處理',done:'已處理',dismissed:'已略過'}[t.status]}・${t.source==='manual'?'手動':'聊天判斷'}${t.excerpt?'「'+t.excerpt+'」':''}`,'muted'));
   const upd=async status=>{checked(await client.from('crm_tasks').update({status,resolved_at:status==='open'?null:new Date().toISOString()}).eq('id',t.id));t.status=status;refresh(r)};
   const act=el('div',null,'actions');if(t.status==='open')act.append(btn('已處理',()=>run(()=>upd('done'))),btn('略過',()=>run(()=>upd('dismissed'))));else act.append(btn('重新打開',()=>run(()=>upd('open'))));
   row.append(act);d.append(row)}
  const kind=el('select');kind.setAttribute('aria-label','待辦種類');for(const [k,l] of Object.entries(TASK_KINDS))kind.append(new Option(l,k));
  const title=el('input');title.placeholder='待辦內容（例如 教他綁 Google 再解綁）';title.setAttribute('aria-label','待辦內容');
  const row=el('div',null,'crm-row');row.append(kind,title,btn('新增待辦',()=>run(async()=>{const t=checked(await client.from('crm_tasks').insert({customer_id:r.customer_id,kind:kind.value,title:title.value.trim().slice(0,200)||TASK_KINDS[kind.value],source:'manual'}).select('id,customer_id,case_source_key,kind,title,status,source,excerpt,created_at,resolved_at').single());r.tasks.unshift(t);refresh(r)})));d.append(row)}
 function metaView(r,d){const m={first_channel:'',current_channel:'',referral_source:'',contact_types:['customer'],language:'',region:'',payment_preferred:'',payment_last:'',note:'',...(r.meta??{})};
  d.append(el('p','只填客人明確提供或你確認過的資料。付款方式不要填帳號。','muted'));
  const inp=(k,label,ph='')=>{const i=el('input');i.value=m[k]??'';i.placeholder=ph;i.dataset.key=k;return lab2(label,i)};
  const selc=(k,label)=>{const s=el('select');s.dataset.key=k;s.append(new Option('（未填）',''),...CHANNELS.map(x=>new Option(x,x)));s.value=m[k]??'';return lab2(label,s)};
  const g=el('div',null,'crm-more-grid');g.append(selc('first_channel','最初來源'),selc('current_channel','目前聯絡管道'),inp('referral_source','介紹來源','例如 403 介紹、FB 抽獎'),inp('language','語言','例如 中文、英文'),inp('region','地區','例如 台灣、日本'),inp('payment_preferred','偏好付款方式','例如 匯款、無卡、8591'),inp('payment_last','上次實際付款方式','例如 街口轉帳'));
  const types=el('div',null,'checks');for(const [k,l] of CONTACT_TYPES){const lb=el('label');const cb=el('input');cb.type='checkbox';cb.value=k;cb.checked=m.contact_types.includes(k);lb.append(cb,document.createTextNode(l));types.append(lb)}
  const note=el('textarea');note.value=m.note??'';note.rows=2;note.dataset.key='note';
  d.append(g,el('strong','聯絡人類型（可複選）'),types,lab2('備註',note));
  const saveRow=el('div',null,'actions');d.append(saveRow);saveRow.append(btn('儲存客人資料',()=>run(async()=>{const payload={customer_id:r.customer_id,updated_at:new Date().toISOString(),contact_types:[...types.querySelectorAll('input:checked')].map(x=>x.value)};
   for(const n of d.querySelectorAll('[data-key]'))payload[n.dataset.key]=n.value.trim();
   if(!payload.contact_types.length)payload.contact_types=['customer'];
   const saved=checked(await client.from('crm_customer_meta').upsert(payload).select('*').single());r.meta=saved;notify('客人資料已儲存。');refresh(r)}),''));
  // 轉 LINE：確認是同一個人後，才把 LINE 身分關聯到這位客人（不會自動合併）
  const others=r.identities.filter(i=>i.platform!=='threads');
  d.append(el('hr'),el('strong','其他管道身分（轉 LINE 等）'),el('p',others.length?others.map(i=>`${i.platform==='line'?'LINE':i.platform}：${i.display_name||i.external_key}`).join('、'):'尚未關聯其他管道。','muted'));
  const plat=el('select');plat.setAttribute('aria-label','平台');plat.append(new Option('LINE','line'),new Option('Instagram','instagram'),new Option('其他','other'));
  const handle=el('input');handle.placeholder='對方在該平台的名稱或 ID';handle.setAttribute('aria-label','對方名稱或 ID');
  const row=el('div',null,'crm-row');row.append(plat,handle,btn('確認是同一人，關聯',()=>run(async()=>{const h=handle.value.trim();if(!h)throw Error('請填對方名稱或 ID。');
   const idn=checked(await client.from('crm_identities').insert({customer_id:r.customer_id,platform:plat.value,external_key:h.slice(0,200),display_name:h.slice(0,120)}).select('id,customer_id,platform,external_key,display_name').single());
   r.identities.push(idn);if(!r.meta?.current_channel){const label=plat.value==='line'?'LINE':plat.value==='instagram'?'Instagram':'其他';r.meta=checked(await client.from('crm_customer_meta').upsert({customer_id:r.customer_id,first_channel:r.meta?.first_channel||'Threads',current_channel:label,updated_at:new Date().toISOString()}).select('*').single())}
   notify('已關聯。');refresh(r)})));d.append(row)}
 function inquiriesView(r,d){for(const i of r.inquiries.slice(0,30)){const ev=i.evidence??{};const marks=[...(ev.pending??[]).map(x=>x+'（待確認）'),...(ev.unverified??[]).map(x=>x+'（目錄無對應，待核對）')];
   d.append(el('p',`${day(i.occurred_at)}｜${CATEGORY_LABELS[i.category]??i.category}${(i.terms??[]).length?'｜'+i.terms.join('、'):''}｜${i.excerpt}${(ev.cues??[]).length?'｜線索：'+ev.cues.join('、'):''}${marks.length?'｜'+marks.join('、'):''}`,'order-detail-line'))}
  if(r.inquiries.length>30)d.append(el('p',`另有 ${r.inquiries.length-30} 筆較早的紀錄。`,'muted'));d.append(el('small','原始對話位置：'+r.folder,'muted'))}
 // 單一客人資料變動後，重算特徵並只重畫這張卡
 function refresh(r){r.features=customerFeatures(r,settings);const old=list.querySelector(`[data-customer="${r.customer_id}"]`);const view=old?.querySelector('.crm-detail')?.dataset.view;const n=card(r);old?.replaceWith(n);
  if(view){const b=[...n.querySelectorAll('.crm-actions button')].find(x=>x.textContent.startsWith({casesView:'案件',dealsView:'成交',waitsView:'等貨',tasksView:'待辦',metaView:'客人資料',inquiriesView:'詢問'}[view]));b?.click()}
  renderChips()}
 async function resolve(f,status){checked(await client.from('crm_followups').update({status,resolved_at:new Date().toISOString()}).eq('id',f.id));followups=followups.filter(x=>x.id!==f.id);render()}
 return {load};
}
