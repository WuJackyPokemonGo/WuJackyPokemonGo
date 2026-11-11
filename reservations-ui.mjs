// 訂單管理：帳號保留結果（逐項訂購／已保留／已交付／待叫貨）與試算表同步狀態。
// 後端尚未部署時（RPC 不存在）整個區塊自動隱藏，不影響原本的訂單流程。
const checked=({data,error})=>{if(error)throw error;return data};
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n}
function btn(label,fn,cls='alt'){const b=el('button',label,cls);b.type='button';b.onclick=fn;return b}
export function allocationRows(rows=[]){return rows.map(r=>({product:r.product||'商品',ordered:Number(r.ordered??0),reserved:Number(r.reserved??0),delivered:Number(r.delivered??0),backorder:Number(r.backorder??0)}))}
export function allocationSummary(rows){const t=allocationRows(rows).reduce((a,r)=>({ordered:a.ordered+r.ordered,reserved:a.reserved+r.reserved,delivered:a.delivered+r.delivered,backorder:a.backorder+r.backorder}),{ordered:0,reserved:0,delivered:0,backorder:0});
 return t.backorder?`待叫貨 ${t.backorder} 份（已保留 ${t.reserved}、已交付 ${t.delivered}）`:`全部到位（已保留 ${t.reserved}、已交付 ${t.delivered}）`}
export function initReservationsUI({client,run,notify}){
 let available=null;const panel=el('div',null,'notice');panel.id='sheetSyncPanel';panel.hidden=true;
 const status=el('span');const actions=el('div',null,'actions');panel.append(el('strong','帳號保留與試算表同步　'),status,actions);
 const invoke=async action=>{const {data,error}=await client.functions.invoke('sheet-sync',{body:{action}});if(error)throw Error('試算表同步服務尚未設定或暫時無法連線：'+(error.message||error));return data};
 actions.append(
  btn('從試算表更新帳號',()=>run(async()=>{const r=await invoke('pull');notify(`已讀取 ${r.rows} 個帳號：新增 ${r.inserted}、更新 ${r.updated}、已保留不覆蓋 ${r.kept_reserved}${r.unknown_sku.length?`、找不到商品編號 ${r.unknown_sku.length} 個`:''}。`);await refresh()})),
  btn('同步到試算表',()=>run(async()=>{const r=await invoke('push');notify(`已寫入 ${r.done} 筆，失敗 ${r.failed} 筆。`);await refresh()})),
  btn('重試失敗項目',()=>run(async()=>{checked(await client.rpc('admin_retry_sheet_sync'));const r=await invoke('push');notify(`重試完成：寫入 ${r.done} 筆，失敗 ${r.failed} 筆。`);await refresh()})),
  btn('補保留待叫貨訂單',()=>run(async()=>{const n=checked(await client.rpc('admin_fill_backorders'));notify(`已依成立順序重新檢查 ${n} 張進行中訂單。`);await refresh()})));
 async function refresh(){try{const s=checked(await client.rpc('admin_sheet_sync_status'));available=true;panel.hidden=false;
   status.textContent=`待同步 ${s.pending} 筆・失敗 ${s.failed} 筆${s.failed?'（'+String(s.last_error||'').slice(0,80)+'）':''}${s.last_done_at?'・最後成功 '+new Date(s.last_done_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):''}`;panel.classList.toggle('error',s.failed>0)}
  catch{available=false;panel.hidden=true}}
 async function decorateOrder(body,o){if(available===false)return;let rows;try{rows=checked(await client.rpc('admin_order_allocation',{p_order:o.id}))}catch{return}
  const box=el('div');box.append(el('h3','帳號保留'),el('p',allocationSummary(rows),'order-detail-line'));
  const t=el('table');const h=el('tr');for(const x of ['商品','訂購','已保留','已交付','待叫貨'])h.append(el('th',x));t.append(h);
  for(const r of allocationRows(rows)){const tr=el('tr');for(const v of [r.product,r.ordered,r.reserved,r.delivered,r.backorder])tr.append(el('td',String(v)));t.append(tr)}
  const w=el('div',null,'table-scroll');w.append(t);box.append(w);
  if(allocationRows(rows).some(r=>r.backorder))box.append(btn('重新檢查保留',()=>run(async()=>{checked(await client.rpc('admin_reserve_order',{p_order:o.id}));box.remove();await decorateOrder(body,o);await refresh()})));
  body.append(box)}
 return {panel,refresh,decorateOrder};
}
