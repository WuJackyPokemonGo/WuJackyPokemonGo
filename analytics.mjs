import {t} from './storefront-locale.mjs';
import {STAGING_URL,STAGING_PUBLISHABLE_KEY} from './staging-config.mjs';
const ALLOWED=new Set(['page_view','product_view','cart_add','cart_remove','search_results','search_empty','inquiry_copy']);
export function analyticsPayload(event,session,eventId,product=null){if(!ALLOWED.has(event)||typeof session!=='string'||typeof eventId!=='string')throw Error('Unsupported analytics event');return {p_event:event,p_session:session,p_event_id:eventId,p_product:product}}
export function initAnalytics(){
 const button=document.getElementById('analyticsToggle'),status=document.getElementById('analyticsStatus');let disabled=true,session=null;
 const privacy=()=>navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true;
 function render(message){button.textContent=disabled?t('啟用匿名統計'):t('停用匿名統計');button.setAttribute('aria-pressed',String(!disabled));status.textContent=message??(disabled?t('匿名統計已停用'):t('匿名統計已啟用'))}
 function setup(){try{disabled=localStorage.getItem('wj_analytics_optout')==='true'||privacy();if(!disabled){const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());let saved=JSON.parse(sessionStorage.getItem('wj_analytics_session')||'null');if(!saved||saved.day!==day)saved={day,id:crypto.randomUUID()};sessionStorage.setItem('wj_analytics_session',JSON.stringify(saved));session=saved.id}}catch{disabled=true}render()}
 setup();window.addEventListener('wj-language-change',()=>render());button.onclick=()=>{try{disabled=!disabled;localStorage.setItem('wj_analytics_optout',String(disabled));if(disabled){sessionStorage.removeItem('wj_analytics_session');session=null;render()}else if(privacy()){disabled=true;render(t('已依瀏覽器隱私設定停用'))}else setup()}catch{disabled=true;render(t('此瀏覽器無法使用匿名統計'))}};
 return async function track(event,product=null){if(disabled||!session||location.origin!=='https://wujackypokemongo.github.io')return;try{const r=await fetch(STAGING_URL+'/rest/v1/rpc/track_store_event',{method:'POST',headers:{apikey:STAGING_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(analyticsPayload(event,session,crypto.randomUUID(),product)),signal:AbortSignal.timeout(5000),keepalive:true});if(!r.ok)render(t('匿名統計暫時無法送達'))}catch{render(t('匿名統計暫時無法送達'))}};
}
