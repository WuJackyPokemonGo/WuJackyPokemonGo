// 後台「客人名單」裡的 Threads CRM 區塊：匯入匯出檔、待追蹤、依名稱或寶可夢搜尋客人、看詢問紀錄。
import {parseThreadsExport,readThreadsZip,sha256Hex,chunk,CATEGORY_LABELS,TAG_LABELS} from './crm-threads-import.mjs';
const $=id=>document.getElementById(id);
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n}
function btn(label,fn,cls='alt'){const b=el('button',label,cls);b.type='button';b.onclick=fn;return b}
const checked=({data,error})=>{if(error)throw error;return data};
const day=v=>v?new Date(v).toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'}):'—';
const PAGE=50;

export async function fetchAll(query,size=1000){const rows=[];for(let from=0;from<200000;from+=size){const part=checked(await query().range(from,from+size-1));rows.push(...part);if(part.length<size)break}return rows}
export function crmRows({identities,tags,inquiries}){
 const tagMap=new Map(),inqMap=new Map();
 for(const t of tags){if(!tagMap.has(t.customer_id))tagMap.set(t.customer_id,[]);tagMap.get(t.customer_id).push(t)}
 for(const i of inquiries){if(!inqMap.has(i.customer_id))inqMap.set(i.customer_id,[]);inqMap.get(i.customer_id).push(i)}
 return identities.map(id=>{const inq=(inqMap.get(id.customer_id)??[]).sort((a,b)=>String(b.occurred_at).localeCompare(String(a.occurred_at)));
  const counts=new Map();for(const i of inq)for(const t of i.terms??[])counts.set(t,(counts.get(t)??0)+1);
  return {...id,tags:tagMap.get(id.customer_id)??[],inquiries:inq,topTerms:[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>x[0])}})
  .sort((a,b)=>String(b.last_seen_at??'').localeCompare(String(a.last_seen_at??'')));
}
export function filterCrm(rows,{query='',tag=''}={}){const q=String(query).trim().toLowerCase();
 return rows.filter(r=>(!tag||r.tags.some(t=>t.tag===tag))&&(!q||String(r.display_name).toLowerCase().includes(q)||String(r.narrative??'').toLowerCase().includes(q)||r.inquiries.some(i=>(i.terms??[]).some(t=>t.toLowerCase().includes(q))||String(i.excerpt).toLowerCase().includes(q))))}

export function initCrmUI({client,run,notify}){
 let rows=[],followups=[],shown=PAGE,pending=null,loaded=false;
 const host=$('crmPanel');if(!host)return {load(){}};
 host.replaceChildren();
 const head=el('div',null,'bar');head.append(el('h3','Threads 客人（CRM）'));
 const file=el('input');file.type='file';file.accept='.zip,application/zip';file.hidden=true;file.id='crmThreadsFile';
 const pick=el('label','匯入 Threads 匯出檔（.zip）','alt crm-file');pick.append(file);
 const actions=el('div',null,'actions');actions.append(pick);head.append(actions);
 const intro=el('p','匯出檔在你的瀏覽器裡解析，私訊原文不會上傳；只存遮蔽後的短摘錄、詢問的商品與證據位置。重複匯入同一份或更新的匯出檔不會產生重複資料。分類都是關鍵字判斷：「疑似付款」「疑似棄單」需你自己確認。','muted');
 const report=el('div');report.id='crmImportReport';
 const filters=el('div',null,'filters');const search=el('input');search.type='search';search.placeholder='客人名稱、寶可夢或關鍵字';search.id='crmSearch';
 const tagSel=el('select');tagSel.id='crmTag';tagSel.append(new Option('全部標籤',''),...Object.entries(TAG_LABELS).map(([k,v])=>new Option(v,k)));
 const l1=el('label','搜尋');l1.append(search);const l2=el('label','標籤');l2.append(tagSel);filters.append(l1,l2);
 const fuBox=el('div');fuBox.id='crmFollowups';const summary=el('p',null,'muted');summary.id='crmSummary';const list=el('div');list.id='crmList';
 host.append(head,intro,report,el('h4','待追蹤'),fuBox,filters,summary,list);
 search.oninput=()=>{shown=PAGE;render()};tagSel.onchange=()=>{shown=PAGE;render()};

 file.onchange=()=>run(async()=>{const f=file.files[0];file.value='';if(!f)return;
  report.replaceChildren(el('p','正在讀取匯出檔…','notice'));
  const products=checked(await client.from('products').select('id,name:name_zh,name_en,aliases').is('archived_at',null));
  let nicknames='';try{const res=await fetch('data/crm-nicknames.txt?v='+Date.now(),{cache:'no-store'});if(res.ok)nicknames=await res.text()}catch{}
  const files=await readThreadsZip(f);const {rows:parsed,stats}=parseThreadsExport(files,{products,nicknames});stats.nicknames=nicknames.split(/\n/).filter(x=>x.trim()).length;
  pending={rows:parsed,stats,sha:await sha256Hex(f),name:f.name};
  report.replaceChildren(statsTable(stats),el('p',`即將匯入 ${parsed.length} 位客人、${stats.inquiries} 筆詢問紀錄、${stats.followups} 筆待追蹤。確認數量無誤後再按「確認匯入」。`,'notice'),
   btn('確認匯入',()=>run(doImport),''),btn('取消',()=>{pending=null;report.replaceChildren()}));
 });
 async function doImport(){if(!pending)return;const {rows:parsed,stats,sha}=pending;pending=null;
  const batch=checked(await client.from('crm_import_batches').insert({source:'threads',file_sha256:sha,stats}).select('id').single()).id;
  const total={};const parts=chunk(parsed,40);const prog=el('p','','notice');report.replaceChildren(prog);
  for(const [n,part] of parts.entries()){prog.textContent=`匯入中… ${n+1}／${parts.length}`;const res=checked(await client.rpc('admin_crm_import_threads',{p_batch:batch,p_rows:part}));for(const [k,v] of Object.entries(res))total[k]=(total[k]??0)+v}
  checked(await client.from('crm_import_batches').update({result:total,finished_at:new Date().toISOString()}).eq('id',batch));
  report.replaceChildren(resultTable(stats,total));notify('Threads 匯入完成。');await load(true);
 }
 function statsTable(s){const t=el('table');const rowsData=[['JSON 檔',s.json_files],['私訊檔',s.message_files],['對話',s.conversations],['私訊則數',s.messages],['略過：群組',s.groups_skipped],['略過：空白',s.empty_skipped],['讀取失敗',s.failed_files.length],['可匯入客人',s.imported],['詢問紀錄',s.inquiries],['待追蹤',s.followups],['資料期間',day(s.date_from)+' → '+day(s.date_to)],['暱稱清單',(s.nicknames??0)+' 行']];
  for(const [k,v] of rowsData){const tr=el('tr');tr.append(el('th',k),el('td',String(v)));t.append(tr)}const w=el('div',null,'table-scroll');w.append(t);return w}
 function resultTable(s,r){const w=statsTable(s);const t=w.querySelector('table');
  for(const [k,v] of [['新建客人',r.customers_created],['已存在（更新）',r.customers_matched],['新增詢問紀錄',r.inquiries_new],['更新品項辨識',r.inquiries_updated],['重複略過的詢問',r.inquiries_skipped],['新增待追蹤',r.followups_new]]){const tr=el('tr');tr.append(el('th',k),el('td',String(v??0)));t.append(tr)}
  const ok=(r.customers_created??0)+(r.customers_matched??0)===s.imported;w.append(el('p',ok?`核對通過：新建＋更新＝${s.imported}，與可匯入客人數一致。`:'核對不一致，請截圖給 Claude。',ok?'notice':'notice error'));return w}

 async function load(force=false){if(loaded&&!force)return;
  const [identities,tags,inquiries,fu]=await Promise.all([
   fetchAll(()=>client.from('crm_identities').select('id,customer_id,display_name,folder,first_seen_at,last_seen_at,message_count,customer_message_count,last_sender,summary,narrative').order('last_seen_at',{ascending:false})),
   fetchAll(()=>client.from('crm_tags').select('customer_id,tag,source')),
   fetchAll(()=>client.from('crm_inquiries').select('customer_id,occurred_at,category,terms,excerpt,evidence').order('occurred_at',{ascending:false})),
   fetchAll(()=>client.from('crm_followups').select('id,customer_id,reason,excerpt,status,due_on,created_at').eq('status','open').order('created_at',{ascending:false}))]);
  rows=crmRows({identities,tags,inquiries});followups=fu;loaded=true;render();
 }
 function render(){
  const byCustomer=new Map(rows.map(r=>[r.customer_id,r]));
  fuBox.replaceChildren();if(!followups.length)fuBox.append(el('p','目前沒有待追蹤事項。','muted'));
  for(const f of followups){const r=byCustomer.get(f.customer_id);const card=el('article',null,'product');
   card.append(el('strong',`${day(f.created_at)}｜${r?.display_name??'客人'}`),el('p',f.reason,'order-detail-line'),el('small',(f.excerpt?'「'+f.excerpt+'」 ':'')+(r?.folder??'')));
   const a=el('div',null,'actions');a.append(btn('已處理',()=>run(()=>resolve(f,'done'))),btn('略過',()=>run(()=>resolve(f,'dismissed'))));card.append(a);fuBox.append(card)}
  const list2=filterCrm(rows,{query:search.value,tag:tagSel.value});
  summary.textContent=`共 ${rows.length} 位 Threads 客人，符合 ${list2.length} 位。`;
  list.replaceChildren();for(const r of list2.slice(0,shown))list.append(card(r));
  if(list2.length>shown)list.append(btn(`顯示更多（還有 ${list2.length-shown} 位）`,()=>{shown+=PAGE;render()}));
 }
 function card(r){const c=el('article',null,'product');
  c.append(el('strong',r.display_name||'（未命名）'),el('small',`最近 ${day(r.last_seen_at)}・首次 ${day(r.first_seen_at)}・私訊 ${r.message_count} 則・詢問 ${r.inquiries.length} 筆${r.last_sender==='customer'?'・最後一則是客人':''}`));
  if(r.narrative)c.append(el('p','摘要：'+r.narrative,'order-detail-line'));else if(r.summary)c.append(el('p',r.summary,'muted'));
  if(r.tags.length)c.append(el('p',r.tags.map(t=>(TAG_LABELS[t.tag]??t.tag)+(t.source==='manual'?'（手動）':'')).join('・'),'order-detail-line'));
  if(r.topTerms.length)c.append(el('p','問過：'+r.topTerms.join('、'),'order-detail-line'));
  const more=btn('詢問紀錄',()=>{if(c.querySelector('.crm-detail')){c.querySelector('.crm-detail').remove();return}const d=el('div',null,'crm-detail');
   for(const i of r.inquiries.slice(0,30)){const ev=i.evidence??{};const marks=[...(ev.pending??[]).map(x=>x+'（待確認）'),...(ev.unverified??[]).map(x=>x+'（目錄無對應，待核對）')];
    d.append(el('p',`${day(i.occurred_at)}｜${CATEGORY_LABELS[i.category]??i.category}${(i.terms??[]).length?'｜'+i.terms.join('、'):''}｜${i.excerpt}${(ev.cues??[]).length?'｜線索：'+ev.cues.join('、'):''}${marks.length?'｜'+marks.join('、'):''}`,'order-detail-line'))}
   if(r.inquiries.length>30)d.append(el('p',`另有 ${r.inquiries.length-30} 筆較早的紀錄。`,'muted'));d.append(el('small','原始對話位置：'+r.folder,'muted'));c.append(d)});
  const a=el('div',null,'actions');a.append(more);c.append(a);return c}
 async function resolve(f,status){checked(await client.from('crm_followups').update({status,resolved_at:new Date().toISOString()}).eq('id',f.id));followups=followups.filter(x=>x.id!==f.id);render()}
 return {load};
}
