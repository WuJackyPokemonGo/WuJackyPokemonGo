// 試算表同步核心（Edge Function 與測試共用）。只讀「帳號明細」的標題列與帳號編號欄，只寫狀態與訂單編號兩欄；
// 帳密欄位不讀不寫。一筆佇列＝某帳號的某個版本，寫入是「覆寫儲存格」，重試不會產生重複資料列。
export const DEFAULT_SHEET_CONFIG={tab:'帳號明細',columns:{code:'帳號編號',sku:'商品編號',status:'狀態',order:'訂單編號'}};
export function colLetter(index){let n=index+1,s='';while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26)}return s}
const q=tab=>"'"+String(tab).replace(/'/g,"''")+"'";
export async function runSheetSync({claim,finish,sheet,config=DEFAULT_SHEET_CONFIG,limit=200}){
 const jobs=await claim(limit);if(!jobs.length)return {claimed:0,done:0,failed:0};
 const fail=(list,error)=>list.map(j=>({id:j.id,error}));
 let failed=[],done=[];
 try{
  const header=(await sheet.getValues(`${q(config.tab)}!1:1`))[0]??[];
  const idx=k=>header.findIndex(h=>String(h).trim()===config.columns[k]);
  const ci=idx('code'),si=idx('status'),oi=idx('order');
  if(ci<0||si<0||oi<0){failed=fail(jobs,`試算表缺少欄位：${['code','status','order'].filter((k,i)=>[ci,si,oi][i]<0).map(k=>config.columns[k]).join('、')}`);}
  else{
   const col=colLetter(ci);const codes=await sheet.getValues(`${q(config.tab)}!${col}2:${col}`);
   const rowOf=new Map();codes.forEach((r,i)=>{const c=String(r?.[0]??'').trim();if(c&&!rowOf.has(c))rowOf.set(c,i+2)});
   const data=[];const ok=[];
   for(const j of jobs){const row=rowOf.get(String(j.unit_code).trim());
    if(!row){failed.push({id:j.id,error:'試算表找不到帳號編號 '+j.unit_code});continue}
    data.push({range:`${q(config.tab)}!${colLetter(si)}${row}`,values:[[j.status_label]]},{range:`${q(config.tab)}!${colLetter(oi)}${row}`,values:[[j.order_number?String(j.order_number):'']]});ok.push(j.id)}
   if(data.length){await sheet.batchUpdate(data);done=ok}
  }
 }catch(e){failed=fail(jobs.filter(j=>!failed.some(f=>f.id===j.id)),String(e?.message??e).slice(0,300)).concat(failed);done=[]}
 await finish(done,failed);
 return {claimed:jobs.length,done:done.length,failed:failed.length};
}
