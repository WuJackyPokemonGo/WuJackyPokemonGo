import {createCustomersService,buildRoster,filterRoster,rosterCsv,parseHistoryImport,profilePayload,IMPORT_HEADERS} from './customers-service.mjs';
const $=id=>document.getElementById(id);
const money=n=>'NT$ '+Number(n??0).toLocaleString('zh-TW');
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n}
function btn(label,fn,cls='alt'){const b=el('button',label,cls);b.type='button';b.onclick=fn;return b}
function stamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `import-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`}

export function initCustomersUI({client,run,notify,loadOrders,showView}){
 const service=createCustomersService(client);let roster=[],epoch=0,editing=null,parsed=null;
 async function load(){const e=epoch;const [orders,history,profiles]=await Promise.all([loadOrders(),service.history(),service.profiles()]);if(e!==epoch)return;roster=buildRoster({orders,history,profiles});render()}
 function filters(){return {search:$('customerSearch').value,minCount:Number($('customerMinCount').value),inactiveDays:Number($('customerInactive').value),marketableOnly:$('customerMarketable').checked}}
 function render(){const list=filterRoster(roster,filters()),box=$('customerList');box.replaceChildren();box.className='record-list';
  $('customerSummary').textContent=`共 ${roster.length} 位客人，目前篩選 ${list.length} 位；回購 2 次以上 ${roster.filter(c=>c.count>=2).length} 位。`;
  if(!list.length){box.append(el('p','沒有符合條件的客人。','muted'));return}
  for(const c of list){const card=el('article','','record');const head=el('div','','bar');const title=el('h3',c.alias);if(c.doNotMarket)title.append(el('span',' 勿發廣告','tag error'));head.append(title,el('strong',`${c.count} 次・${money(c.total)}`));
   const meta=el('p',`最後購買 ${c.lastDate||'—'}${c.daysSince!=null?`（${c.daysSince} 天前）`:''}${c.contact?'・聯絡：'+c.contact:'・未填聯絡方式'}`,'muted');
   const names=[...c.otherAliases,...c.namesSeen];const items=el('p','買過：'+c.items.slice(0,6).join('、')+(c.items.length>6?`…等 ${c.items.length} 項`:''));
   const actions=el('div','','actions');actions.append(btn('購買明細',()=>detail(c)),btn(c.profileId?'編輯資料':'建立資料',()=>edit(c)));
   card.append(head,meta);if(names.length)card.append(el('p','其他名稱：'+names.join('、'),'muted'));card.append(items,actions);box.append(card)}}
 function detail(c){$('customerDetailTitle').textContent=`${c.alias}（${c.count} 次・${money(c.total)}）`;const body=$('customerDetailBody');body.replaceChildren();
  for(const p of c.purchases){const row=el('div','','record');row.append(el('strong',`${p.date} ${p.time||'未記時'}・${money(p.amount)}`),el('p',p.item),el('p',(p.source==='order'?'後台訂單 '+p.ref:'歷史匯入 '+p.ref)+(p.channel?'・'+p.channel:'')+(p.note?'・'+p.note:''),'muted'));body.append(row)}
  $('customerDetailDialog').showModal()}
 function edit(c){editing=c?.profileId??null;const f=$('customerForm');f.reset();$('customerFormTitle').textContent=c?(c.profileId?'編輯客人資料':'建立客人資料'):'新增客人';
  if(c){f.alias.value=c.alias;f.other_aliases.value=[...c.otherAliases,...(c.profileId?[]:c.namesSeen)].join('、');f.contact_private.value=c.contact;f.do_not_market.checked=c.doNotMarket;f.note_private.value=c.note}
  $('customerDialog').showModal()}
 $('customerForm').onsubmit=event=>{event.preventDefault();run(async()=>{const f=event.target;const payload=profilePayload({alias:f.alias.value,other_aliases:f.other_aliases.value,contact_private:f.contact_private.value,do_not_market:f.do_not_market.checked,note_private:f.note_private.value});
  await service.saveProfile(editing,payload);$('customerDialog').close();notify('客人資料已儲存。');await load()})};
 function previewImport(){const text=$('customerImportText').value;parsed=parseHistoryImport(text);const box=$('customerImportPreview');box.replaceChildren();
  const ok=parsed.rows.length&&!parsed.errors.length;box.append(el('p',`可匯入 ${parsed.rows.length} 筆，錯誤 ${parsed.errors.length} 筆，重複略過 ${parsed.duplicates.length} 筆。`,ok?'':'error'));
  for(const m of [...parsed.errors,...parsed.duplicates].slice(0,30))box.append(el('p',m,'muted'));
  if(parsed.rows.length){const sample=el('ul');for(const r of parsed.rows.slice(0,8))sample.append(el('li',`${r.customer_alias}｜${r.purchased_on} ${r.purchased_time||'未記時'}｜${r.item_text}｜${money(r.amount_twd)}`));box.append(sample)}
  $('confirmCustomerImport').disabled=!ok}
 $('customerImportText').oninput=()=>{parsed=null;$('confirmCustomerImport').disabled=true};
 $('customerImportFile').onchange=event=>run(async()=>{const file=event.target.files?.[0];if(!file)return;if(file.size>2_000_000)throw Error('檔案超過 2MB。');$('customerImportText').value=await file.text();previewImport()});
 $('previewCustomerImport').onclick=()=>run(async()=>previewImport());
 $('confirmCustomerImport').onclick=()=>run(async()=>{if(!parsed||parsed.errors.length||!parsed.rows.length)throw Error('請先預覽並修正錯誤。');const batch=$('customerImportBatch').value.trim()||stamp();
  const r=await service.importHistory(parsed.rows,batch);$('customerImportDialog').close();notify(`已匯入 ${r.inserted} 筆（批次 ${batch}）${r.skipped?`，${r.skipped} 筆先前已匯入過，略過`:''}。`);parsed=null;await load()});
 $('deleteCustomerBatch').onclick=()=>run(async()=>{const batch=$('customerImportBatch').value.trim();if(!batch)throw Error('請在「批次名稱」填要刪除的批次。');if(!confirm(`確定刪除批次「${batch}」的所有歷史購買？後台訂單不受影響。`))return;
  const n=await service.deleteBatch(batch);notify(`已刪除批次 ${batch} 共 ${n} 筆。`);$('customerImportDialog').close();await load()});
 $('openCustomerImport').onclick=()=>{$('customerImportText').value='';$('customerImportBatch').value=stamp();$('customerImportPreview').replaceChildren(el('p','第一列欄位：'+IMPORT_HEADERS.join(',')+'。日期可寫 2026-09-07 或 9/7（預設今年），時間不知道就留空。','muted'));$('confirmCustomerImport').disabled=true;$('customerImportDialog').showModal()};
 $('exportCustomers').onclick=()=>run(async()=>{const list=filterRoster(roster,filters());const blob=new Blob([rosterCsv(list)],{type:'text/csv;charset=utf-8'});const a=el('a');a.href=URL.createObjectURL(blob);a.download=`客人名單-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);notify(`已匯出 ${list.length} 位客人。`)});
 $('addCustomer').onclick=()=>edit(null);
 $('reloadCustomers').onclick=()=>run(load);
 for(const id of ['customerSearch','customerMinCount','customerInactive','customerMarketable'])$(id).addEventListener('input',render);
 $('tabCustomers').onclick=()=>run(async()=>{await load();showView('customers')});
 return {clear(){epoch++;roster=[];editing=null;parsed=null;for(const id of ['customerList','customerDetailBody','customerImportPreview'])$(id).replaceChildren();$('customerImportText').value='';$('customerForm').reset()}};
}
