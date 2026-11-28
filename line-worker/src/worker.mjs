// Cloudflare Worker：LINE Webhook → 規則處理簡單的庫存／價格詢問 → 其餘交給 Grok 擬稿。
// 部署前先用 MODE=shadow 試跑：Worker 只記錄「本來會回什麼」，照常交給 Grok；比對無誤再改 MODE=live。
//
// 環境變數（wrangler secret）：
//   LINE_CHANNEL_SECRET        驗證 Webhook 簽章（外露過的請先重新產生）
//   LINE_CHANNEL_ACCESS_TOKEN  用 replyToken 回覆、查客人顯示名稱
//   OWNER_USER_ID              Jacky 的 LINE userId（只有他能用 #我來／#接手／#交給你）
//   GROK_FORWARD_URL           交給 Grok routine 的網址（沿用目前 Worker 轉發的目的地）
//   GROK_FORWARD_TOKEN         （選填）轉發時帶的 Authorization
//   REPORT_KEY                 讀取試跑報告用的密鑰
// 一般變數：MODE=shadow|live
// Durable Objects：CUSTOMER（每位客人一個，保存對話狀態、合併訊息、AI 冷卻）、CONTROL（暫停開關、試跑紀錄）
import {decide,onAlarm,emptyState} from './session.mjs';
import {buildCatalogIndex} from './match.mjs';
import {SITE} from './templates.mjs';
import {STAGING_URL,STAGING_PUBLISHABLE_KEY} from '../../staging-config.mjs';

const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json'}});

export async function verifySignature(secret,body,signature){
 if(!secret||!signature)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)));
 const expected=btoa(String.fromCharCode(...mac));
 if(expected.length!==signature.length)return false;let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^signature.charCodeAt(i);return diff===0}

// 商品目錄：公開唯讀 RPC storefront_catalog，快取 5 分鐘；暱稱清單取自網站
let cached={at:0,index:null};
export async function catalogIndex(fetcher=fetch,now=Date.now()){
 if(cached.index&&now-cached.at<5*60*1000)return cached.index;
 const rows=[];for(let offset=0;offset<=5000;offset+=100){const r=await fetcher(STAGING_URL+'/rest/v1/rpc/storefront_catalog',{method:'POST',headers:{apikey:STAGING_PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify({p_offset:offset,p_limit:100})});
  if(!r.ok)throw Error('catalog '+r.status);const batch=await r.json();rows.push(...batch);if(batch.length<100)break}
 let nicknames='';try{const r=await fetcher(SITE+'data/crm-nicknames.txt');if(r.ok)nicknames=await r.text()}catch{}
 cached={at:now,index:buildCatalogIndex(rows,nicknames)};return cached.index}

async function lineReply(env,replyToken,text){
 const r=await fetch('https://api.line.me/v2/bot/message/reply',{method:'POST',headers:{authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN,'content-type':'application/json'},body:JSON.stringify({replyToken,messages:[{type:'text',text}]})});
 return r.ok}
async function displayName(env,userId){
 if(!env.LINE_CHANNEL_ACCESS_TOKEN||!userId)return '';
 try{const r=await fetch('https://api.line.me/v2/bot/profile/'+encodeURIComponent(userId),{headers:{authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN}});return r.ok?(await r.json()).displayName??'':''}catch{return ''}}
async function forwardToGrok(env,payload){
 if(!env.GROK_FORWARD_URL)return false;
 const r=await fetch(env.GROK_FORWARD_URL,{method:'POST',headers:{'content-type':'application/json',...(env.GROK_FORWARD_TOKEN?{authorization:'Bearer '+env.GROK_FORWARD_TOKEN}:{})},body:JSON.stringify(payload)});
 return r.ok}
const control=env=>env.CONTROL.get(env.CONTROL.idFromName('global'));
async function pausedUntil(env){const r=await control(env).fetch('https://control/pause');return (await r.json()).until??0}

export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/report'){if(!env.REPORT_KEY||url.searchParams.get('key')!==env.REPORT_KEY)return json({error:'forbidden'},403);return control(env).fetch('https://control/report')}
  if(request.method!=='POST')return json({ok:true});
  const body=await request.text();
  if(!await verifySignature(env.LINE_CHANNEL_SECRET,body,request.headers.get('x-line-signature')))return json({error:'bad signature'},401);
  const {events=[]}=JSON.parse(body);
  // 依客人分送；同一位客人的訊息在同一個 Durable Object 依序處理
  for(const e of events){const userId=e.source?.userId;if(!userId)continue;
   const stub=env.CUSTOMER.get(env.CUSTOMER.idFromName(userId));
   ctx.waitUntil(stub.fetch('https://customer/event',{method:'POST',body:JSON.stringify(e)}))}
  return json({ok:true})}
};

export class Customer{
 constructor(state,env){this.state=state;this.env=env}
 async load(){return (await this.state.storage.get('s'))??emptyState()}
 async run(actions,s){
  for(const a of actions){
   if(a.type==='control')await control(this.env).fetch('https://control/pause',{method:'POST',body:JSON.stringify({until:a.until})});
   else if(a.type==='reply'){
    // 送出前再確認一次暫停狀態（主人的「收」不受影響）
    if(!a.owner&&await pausedUntil(this.env)>Date.now())continue;
    await lineReply(this.env,a.replyToken,a.text)}
   else if(a.type==='forward'){if(!s.displayName)s.displayName=await displayName(this.env,a.payload.userId);await forwardToGrok(this.env,{...a.payload,displayName:s.displayName??''})}
   else if(a.type==='alarm')await this.state.storage.setAlarm(a.at);
   else if(a.type==='log')await control(this.env).fetch('https://control/log',{method:'POST',body:JSON.stringify(a.entry)})}
  await this.state.storage.put('s',s)}
 async fetch(request){
  const event=JSON.parse(await request.text());const s0=await this.load();
  const {state,actions}=decide({state:s0,event,index:await catalogIndex(),now:Date.now(),pausedUntil:await pausedUntil(this.env),ownerUserId:this.env.OWNER_USER_ID??'',mode:this.env.MODE==='live'?'live':'shadow'});
  state.userId=event.source?.userId??state.userId;state.displayName=s0.displayName;
  await this.run(actions,state);return json({ok:true,actions:actions.map(a=>a.type)})}
 async alarm(){
  const s0=await this.load();
  const {state,actions}=onAlarm({state:s0,now:Date.now(),pausedUntil:await pausedUntil(this.env),index:await catalogIndex(),userId:s0.userId});
  state.userId=s0.userId;state.displayName=s0.displayName;await this.run(actions,state)}
}

// 暫停開關放在 Durable Object：#我來 之後立即生效（KV 有跨節點同步延遲）
export class Control{
 constructor(state){this.state=state}
 async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==='/pause'&&request.method==='GET')return json({until:(await this.state.storage.get('pausedUntil'))??0});
  if(url.pathname==='/pause'){const {until}=JSON.parse(await request.text());await this.state.storage.put('pausedUntil',until||0);return json({ok:true})}
  if(url.pathname==='/log'){const entry=JSON.parse(await request.text());const log=(await this.state.storage.get('log'))??[];log.push(entry);await this.state.storage.put('log',log.slice(-500));return json({ok:true})}
  if(url.pathname==='/report'){const log=(await this.state.storage.get('log'))??[];const count=k=>log.filter(x=>x.result===k).length;
   return json({entries:log.length,product_reply:count('product_reply'),ask_gender:count('ask_gender'),paused:count('paused'),shadow:log.filter(x=>x.shadow).length,recent:log.slice(-100)})}
  return json({error:'not found'},404)}
}
