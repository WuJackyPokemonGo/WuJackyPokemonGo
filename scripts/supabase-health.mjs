// Hourly health probe for the public Supabase API the shop depends on.
// Reads one catalog row with the public key (a few KB of uncached egress) and classifies the answer.
// Used by .github/workflows/supabase-health.yml to open or close a GitHub issue, so the owner is notified.
import {appendFileSync} from 'node:fs';
import {STAGING_URL,STAGING_PUBLISHABLE_KEY} from '../staging-config.mjs';

export function classify(status,body=''){
 if(status>=200&&status<300)return {state:'ok',summary:'Supabase 正常。'};
 if(status===402||/exceed_[a-z_]*quota/i.test(body)){const quota=(body.match(/exceed_[a-z_]*quota/i)??['流量額度'])[0];return {state:'quota',summary:`Supabase 回傳 ${status}（${quota}）：免費方案額度用完，服務被限制。客人與 LINE 客服小幫手讀不到即時目錄，網站改用備份清單；下單與後台可能無法使用。`}}
 if(status===0)return {state:'down',summary:'連不上 Supabase（逾時或網路錯誤）。'};
 return {state:'down',summary:`Supabase 回傳 HTTP ${status}。`};
}

export async function probe(fetcher=fetch){
 try{
  const r=await fetcher(STAGING_URL+'/rest/v1/rpc/storefront_catalog',{method:'POST',headers:{apikey:STAGING_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_offset:0,p_limit:1}),signal:AbortSignal.timeout(20000)});
  const body=r.ok?'':(await r.text().catch(()=>'')).slice(0,2000);
  return {...classify(r.status,body),status:r.status};
 }catch{return {...classify(0),status:0}}
}

if(import.meta.url===`file://${process.argv[1]}`){
 // Retry once so a single network blip does not open an alert.
 let result=await probe();if(result.state!=='ok')result=await probe();
 console.log(JSON.stringify(result));
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`state=${result.state}\nsummary=${result.summary.replace(/\n/g,' ')}\n`);
}
