// 試算表同步 Edge Function 的處理邏輯（可在 Node 測試）。
// push：把佇列中的保留結果寫回「帳號明細」的狀態與訂單編號欄（service_role 取佇列）。
// pull：讀「帳號明細」的帳號編號、商品編號、狀態三欄，交給 admin_upsert_account_units（以呼叫者的管理員身分寫入）。
// 任何時候都不讀帳密欄位；Google 金鑰只存在 Edge Function secrets。
import {runSheetSync,colLetter,DEFAULT_SHEET_CONFIG} from './core.mjs';
const json=(status,body,cors)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...cors}});
export function createSheetSyncHandler({url,anonKey,serviceKey,origins=[],cronSecret='',config=DEFAULT_SHEET_CONFIG,makeSheet,fetcher=fetch}){
 const rpc=async(name,body,bearer)=>{const r=await fetcher(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:bearer===serviceKey?serviceKey:anonKey,Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:JSON.stringify(body??{})});const t=await r.text();if(!r.ok)throw Object.assign(Error(t.slice(0,200)||r.statusText),{status:r.status});return t?JSON.parse(t):null};
 return async req=>{
  const origin=req.headers.get('origin')||'';const cors=origins.includes(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type,apikey,x-sync-secret','Access-Control-Allow-Methods':'POST,OPTIONS',Vary:'Origin'}:{};
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return json(405,{error:'method'},cors);
  let body={};try{body=await req.json()}catch{}
  const action=body.action;const bearer=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const isCron=cronSecret&&req.headers.get('x-sync-secret')===cronSecret;
  if(!isCron){try{await rpc('admin_sheet_sync_status',{},bearer)}catch{return json(403,{error:'forbidden'},cors)}}
  if(isCron&&action!=='push')return json(403,{error:'forbidden'},cors);
  try{
   const sheet=await makeSheet();
   if(action==='push'){const result=await runSheetSync({claim:n=>rpc('sheet_sync_claim',{p_limit:n},serviceKey),finish:(d,f)=>rpc('sheet_sync_finish',{p_done:d,p_failed:f},serviceKey),sheet,config});return json(200,result,cors)}
   if(action==='pull'){
    const tab="'"+config.tab.replace(/'/g,"''")+"'";const header=(await sheet.getValues(`${tab}!1:1`))[0]??[];const col=k=>header.findIndex(h=>String(h).trim()===config.columns[k]);
    const ci=col('code'),ki=col('sku'),si=col('status');if(ci<0||ki<0||si<0)return json(422,{error:'試算表缺少帳號編號、商品編號或狀態欄'},cors);
    const read=async i=>(await sheet.getValues(`${tab}!${colLetter(i)}2:${colLetter(i)}`)).map(r=>String(r?.[0]??'').trim());
    const [codes,skus,states]=await Promise.all([read(ci),read(ki),read(si)]);
    const rows=codes.map((c,i)=>({unit_code:c,sku:skus[i]??'',status:states[i]??''})).filter(r=>r.unit_code);
    const total={rows:rows.length,inserted:0,updated:0,kept_reserved:0,unknown_sku:[]};
    for(let i=0;i<rows.length;i+=500){const r=await rpc('admin_upsert_account_units',{p_rows:rows.slice(i,i+500)},bearer);total.inserted+=r.inserted;total.updated+=r.updated;total.kept_reserved+=r.kept_reserved;total.unknown_sku.push(...r.unknown_sku)}
    return json(200,total,cors)}
   return json(400,{error:'unknown action'},cors);
  }catch(e){return json(502,{error:String(e?.message??e).slice(0,300)},cors)}
 };
}
// Google 服務帳號 → 存取權杖（RS256 JWT），只要求試算表權限。
export async function googleSheet({serviceAccount,spreadsheetId,fetcher=fetch,now=()=>Math.floor(Date.now()/1000)}){
 const sa=typeof serviceAccount==='string'?JSON.parse(serviceAccount):serviceAccount;
 const b64=x=>btoa(typeof x==='string'?x:String.fromCharCode(...new Uint8Array(x))).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
 const enc=s=>b64(String.fromCharCode(...new TextEncoder().encode(s)));
 const t=now();const unsigned=enc(JSON.stringify({alg:'RS256',typ:'JWT'}))+'.'+enc(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:t,exp:t+3000}));
 const der=Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g,'')),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(unsigned));
 const tok=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion='+unsigned+'.'+b64(sig)});
 if(!tok.ok)throw Error('Google 授權失敗：'+tok.status);const {access_token}=await tok.json();
 const api=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;const auth={Authorization:'Bearer '+access_token};
 return {async getValues(range){const r=await fetcher(`${api}/values/${encodeURIComponent(range)}`,{headers:auth});if(!r.ok)throw Error('讀取試算表失敗：'+r.status);return (await r.json()).values??[]},
  async batchUpdate(data){const r=await fetcher(`${api}/values:batchUpdate`,{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({valueInputOption:'RAW',data})});if(!r.ok)throw Error('寫入試算表失敗：'+r.status)}};
}
