// No secrets or buyer details are logged. Production entry injects server-only values.
export function createCheckoutHandler({client,origins,turnstileSecret,turnstileHostname,fetcher=fetch}) {
 const allowed=new Set(origins),json=(body,status,origin)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'content-type,apikey,authorization','Access-Control-Allow-Methods':'POST,OPTIONS'}});
 return async request=>{
  const origin=request.headers.get('origin')||'';
  if(!allowed.has(origin))return new Response('Forbidden',{status:403});
  if(request.method==='OPTIONS')return json({},200,origin);
  if(request.method!=='POST')return json({error:'method_not_allowed'},405,origin);
  try {
   if(Number(request.headers.get('content-length')||0)>16384)return json({error:'request_too_large'},413,origin);
   // Stream limit also covers chunked requests and dishonest content-length headers.
   const reader=request.body?.getReader();if(!reader)return json({error:'invalid_request'},400,origin);
   const chunks=[];let size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return json({error:'request_too_large'},413,origin)}chunks.push(value)}
   const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
   const body=JSON.parse(new TextDecoder().decode(bytes));
   if(!['config','create','lookup','report','cancel'].includes(body.action))return json({error:'invalid_request'},400,origin);
   const ip=(request.headers.get('x-forwarded-for')||'unknown').slice(-200);
   const fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip)))].map(v=>v.toString(16).padStart(2,'0')).join('');
   const rate=await client.rpc('self_checkout',{p_action:'throttle',p_payload:{fingerprint},p_secret:null});
   if(rate.error)return json({error:rate.error.code==='PT429'?'rate_limited':'unavailable'},rate.error.code==='PT429'?429:503,origin);
   if(body.action==='create'){
    if(!turnstileSecret||!turnstileHostname)return json({error:'unavailable'},503,origin);
    if(typeof body.captcha!=='string'||!body.captcha||body.captcha.length>2048)return json({error:'captcha_required'},400,origin);
    const verification=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:turnstileSecret,response:body.captcha,idempotency_key:body.payload?.request_id||''}),signal:AbortSignal.timeout(10000)});
    if(!verification.ok)return json({error:'unavailable'},503,origin);
    const verdict=await verification.json();
    if(!verdict.success||verdict.hostname!==turnstileHostname||verdict.action!=='checkout')return json({error:'captcha_failed'},400,origin);
   }
   const result=await client.rpc('self_checkout',{p_action:body.action,p_payload:body.payload??{},p_secret:body.secret??null});
   if(result.error){const code=result.error.code;return json({error:code==='PT503'?'closed':code==='PT404'?'not_found':code==='PT409'?'price_changed':code==='PT429'?'rate_limited':code==='23505'?'conflict':'check_order',...(code==='PT409'?{refresh:true}:{})},code==='PT404'?404:code==='PT503'?503:code==='PT429'?429:code==='PT409'||code==='23505'?409:400,origin)}
   return json({data:result.data},200,origin);
  }catch{return json({error:'unavailable'},503,origin)}
 };
}
