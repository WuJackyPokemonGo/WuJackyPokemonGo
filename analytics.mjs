import {t} from './storefront-locale.mjs';
import {STAGING_URL,STAGING_PUBLISHABLE_KEY} from './staging-config.mjs';
const ALLOWED=new Set(['page_view','product_view','cart_add','cart_remove','search_results','search_empty','inquiry_copy','line_click','background_referral','bg_cart_add','bg_line_click']);
export function analyticsPayload(event,session,eventId,product=null){if(!ALLOWED.has(event)||typeof session!=='string'||typeof eventId!=='string')throw Error('Unsupported analytics event');return {p_event:event,p_session:session,p_event_id:eventId,p_product:product}}
export function initAnalytics({background=false}={}){
 const button=document.getElementById('analyticsToggle'),status=document.getElementById('analyticsStatus');let disabled=true,session=null;
 const privacy=()=>navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true;
 function render(message){button.textContent=disabled?t('啟用匿名統計'):t('停用匿名統計');button.setAttribute('aria-pressed',String(!disabled));status.textContent=message??(disabled?t('匿名統計已停用'):t('匿名統計已啟用'))}
 function setup(){try{disabled=localStorage.getItem('wj_analytics_optout')==='true'||privacy();if(!disabled){const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());let saved=JSON.parse(sessionStorage.getItem('wj_analytics_session')||'null');if(!saved||saved.day!==day)saved={day,id:crypto.randomUUID()};sessionStorage.setItem('wj_analytics_session',JSON.stringify(saved));session=saved.id}}catch{disabled=true}render()}
 setup();window.addEventListener('wj-language-change',()=>render());button.onclick=()=>{try{disabled=!disabled;localStorage.setItem('wj_analytics_optout',String(disabled));if(disabled){sessionStorage.removeItem('wj_analytics_session');session=null;render()}else if(privacy()){disabled=true;render(t('已依瀏覽器隱私設定停用'))}else setup()}catch{disabled=true;render(t('此瀏覽器無法使用匿名統計'))}};
 async function source(page){const src=visitSource(location.href,document.referrer);if(!src||disabled||!session||location.origin!=='https://wujackypokemongo.github.io')return;const key=page+':'+src;try{if(sessionStorage.getItem('wj_src_'+key))return;sessionStorage.setItem('wj_src_'+key,'1')}catch{}try{await fetch(STAGING_URL+'/rest/v1/rpc/track_background_event',{method:'POST',headers:{apikey:STAGING_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_event:'source_visit',p_session:session,p_event_id:crypto.randomUUID(),p_background:key}),signal:AbortSignal.timeout(5000),keepalive:true})}catch{}}
 const track=async function track(event,product=null){if(disabled||!session||location.origin!=='https://wujackypokemongo.github.io')return;try{const r=await fetch(STAGING_URL+'/rest/v1/rpc/'+(background?'track_background_event':'track_store_event'),{method:'POST',headers:{apikey:STAGING_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(background?{p_event:event,p_session:session,p_event_id:crypto.randomUUID(),p_background:product}:analyticsPayload(event,session,crypto.randomUUID(),product)),signal:AbortSignal.timeout(5000),keepalive:true});if(!r.ok)render(t('匿名統計暫時無法送達'))}catch{render(t('匿名統計暫時無法送達'))}};
 track.source=source;track.emptyTerm=async(page,value)=>{const term=emptySearchTerm(value);if(!term||disabled||!session||location.origin!=='https://wujackypokemongo.github.io')return;try{await fetch(STAGING_URL+'/rest/v1/rpc/track_background_event',{method:'POST',headers:{apikey:STAGING_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_event:'search_term_empty',p_session:session,p_event_id:crypto.randomUUID(),p_background:page+':'+term}),signal:AbortSignal.timeout(5000),keepalive:true})}catch{}};return track;
}

const SOURCES=['threads','reddit','discord','facebook','instagram','line','x','youtube','share'];
const SOURCE_ALIASES={ig:'instagram',fb:'facebook',twitter:'x',yt:'youtube'};
const REFERRER_HOSTS=[[/(^|\.)threads\.(net|com)$/,'threads'],[/(^|\.)reddit\.com$|^redd\.it$/,'reddit'],[/(^|\.)discord(app)?\.com$/,'discord'],[/(^|\.)facebook\.com$|^fb\.me$|^l\.facebook\.com$/,'facebook'],[/(^|\.)instagram\.com$/,'instagram'],[/(^|\.)line\.me$|^lin\.ee$/,'line'],[/(^|\.)(x|twitter)\.com$|^t\.co$/,'x'],[/(^|\.)youtube\.com$|^youtu\.be$/,'youtube']];
// Visitor source from ?src= (preferred) or the referring site; null when unknown or same-site.
export function visitSource(href,referrer=''){
 try{const raw=new URL(href).searchParams.get('src');if(raw!==null){const v=raw.trim().toLowerCase().slice(0,30);const n=SOURCE_ALIASES[v]??v;return SOURCES.includes(n)?n:(v?'other':null)}}catch{}
 try{if(!referrer)return null;const host=new URL(referrer).hostname.toLowerCase();if(host.endsWith('github.io'))return null;for(const [re,name] of REFERRER_HOSTS)if(re.test(host))return name}catch{}
 return null;
}

// Normalised search text worth keeping when nothing matched; drops anything that looks personal.
export function emptySearchTerm(value){const t=String(value??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');if(!t||t.length>40)return null;if(/[@\/\\<>]|\d{7,}|https?|www\./.test(t))return null;return t}
