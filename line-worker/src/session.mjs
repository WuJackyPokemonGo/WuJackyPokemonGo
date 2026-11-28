// 每位客人的對話狀態與決策（純函式，方便測試）。Worker 的 Durable Object 只負責保存狀態和執行動作。
// 動作：reply（用 replyToken 免費回覆）、forward（交給 Grok 擬稿或標待人工）、alarm（排定稍後再處理）、log（試跑紀錄）、control（暫停／恢復）
import {matchProducts} from './match.mjs';
import {classify,intentLevel,INTENT_LABEL,HUMAN_REASONS,isEnglish} from './intent.mjs';
import {productReply,genderQuestion,productLink,ACK} from './templates.mjs';
import {maskText} from './mask.mjs';

export const MERGE_MS=3*60*1000;     // 3 分鐘內的連續訊息合併成一句理解
export const DEBOUNCE_MS=60*1000;    // 最後一則後等 60 秒，沒有被規則處理才交給 AI
export const AI_COOLDOWN_MS=10*60*1000; // 同一位客人 10 分鐘最多呼叫一次 AI（訊息照收，之後合併送出）
export const CONTEXT_MS=10*60*1000;  // 記住剛剛講過的商品 10 分鐘
export const PAUSE_MS=30*60*1000;    // #我來／#接手 暫停 30 分鐘
export const REPLY_TOKEN_MS=50*1000; // LINE 要求 1 分鐘內使用 replyToken，留 10 秒餘裕
const LOG_KEEP=30;

export const emptyState=()=>({log:[],pending:[],candidates:[],candidatesAt:0,lastAiAt:0,aiDueAt:0,seen:{},level:'unknown'});

const textOf=e=>e.message?.type==='text'?String(e.message.text??''):'';
const short=s=>maskText(s).replace(/\s+/g,' ').slice(0,200);

// 主人暗號（只認 OWNER_USER_ID）
export function ownerCommand(text){const t=String(text??'').trim();if(/^#(我來|接手)$/.test(t))return 'pause';if(t==='#交給你')return 'resume';return null}

export function decide({state:prev,event,index,now,pausedUntil=0,ownerUserId='',mode='shadow'}){
 const state=structuredClone(prev??emptyState());const actions=[];const id=event.webhookEventId;
 // LINE 重送同一事件：以 webhookEventId 去重
 if(id&&state.seen[id])return {state,actions};
 if(id)state.seen[id]=now;for(const [k,v] of Object.entries(state.seen))if(now-v>86400000)delete state.seen[k];
 if(event.type!=='message')return {state,actions};
 const userId=event.source?.userId??'';const text=textOf(event);const ts=event.timestamp??now;
 const tokenOk=event.replyToken&&now-ts<=REPLY_TOKEN_MS;
 if(ownerUserId&&userId===ownerUserId){const cmd=ownerCommand(text);
  if(cmd){actions.push({type:'control',command:cmd,until:cmd==='pause'?now+PAUSE_MS:0});if(tokenOk)actions.push({type:'reply',replyToken:event.replyToken,text:ACK,owner:true});return {state,actions}}}
 const photo=event.message?.type==='image',sticker=event.message?.type==='sticker';
 state.log.push({at:ts,from:'customer',text:photo?'[圖片]':sticker?'[貼圖]':short(text)});state.log=state.log.slice(-LOG_KEEP);
 // 主人接手中：Worker 不回、不叫 AI
 if(pausedUntil>now){state.pending=[];state.aiDueAt=0;actions.push({type:'log',entry:{at:now,userId,result:'paused'}});return {state,actions}}
 const c=classify(text,{photo,sticker});
 if(c.empty)return {state,actions};
 const lang=isEnglish(text)?'en':'zh';
 state.pending=state.pending.filter(p=>now-p.at<=Math.max(MERGE_MS,AI_COOLDOWN_MS));
 const turn=state.pending.filter(p=>now-p.at<=MERGE_MS);
 const level=intentLevel(c);if(level==='hot'||(level==='warm'&&state.level!=='hot'))state.level=level;
 const item={at:ts,text:photo?'[圖片]':short(text),lang};
 // 需要人工：議價、付款、售後、圖片 → 立即交給 Grok 並標待人工（不受 AI 冷卻限制），Worker 不自動回
 // 圖片：標待人工、跟著下一次交給 Grok（受 10 分鐘冷卻限制）；文字的議價、付款、售後才立即送出
 if(c.human==='photo'){state.pending.push({...item,human:'photo'});state.aiDueAt=Math.max(now+DEBOUNCE_MS,state.lastAiAt+AI_COOLDOWN_MS);actions.push({type:'alarm',at:state.aiDueAt});return {state,actions}}
 if(c.human){state.pending.push(item);actions.push(forward(state,{userId,now,reason:'needs_human',human:c.human,index}));state.pending=[];state.lastAiAt=now;state.aiDueAt=0;return {state,actions}}
 if(c.thanks&&!c.stock&&!c.price&&!c.buy)return {state,actions};
 // 短的接話（「對」「可以」「好的哥」「14」）：沒有問句、商品或購買訊號 → 只記錄，不叫 AI（Jacky 正在聊的機率高）
 const chatter=text.trim().length<=8&&!c.stock&&!c.price&&!c.buy&&!c.gender&&!/[?？]|嗎|呢|請問/.test(text);
 // 商品：這句有寶可夢或專屬別名就用這句；沒有就用剛剛講過的商品，再用這句的公母／限定詞縮小
 const context=now-state.candidatesAt<=CONTEXT_MS?state.candidates:[];
 const m=matchProducts(index,text,{context});
 if(m.candidates.length){state.candidates=m.candidates.slice(0,40).map(p=>p.id);state.candidatesAt=now}
 // 這句本身有提供商品資訊（寶可夢、專屬別名、公母、限定詞），才算補完前面的問題
 const addsInfo=m.species.length>0||Boolean(c.gender)||(!m.fromContext&&m.candidates.length>0);
 const asking=c.stock||c.price||(turn.some(p=>p.ask)&&addsInfo);
 // 接話本身不叫 AI；若之後本來就要交給 Grok，會跟著當前文送出
 if(chatter&&!addsInfo){state.pending.push({...item,chatter:true});return {state,actions}}
 state.pending.push({...item,ask:c.stock||c.price});
 if(asking&&!c.buy){
  // 同一件商品 10 分鐘內只自動回一次
  const repeat=m.unique&&state.lastReply?.id===m.unique.id&&now-state.lastReply.at<CONTEXT_MS;
  const safe=m.unique&&!(m.unmatchedTokens??[]).length&&!repeat;
  const reply=safe?productReply(m.unique,lang):(m.genderOnly?genderQuestion(lang):null);
  if(reply){
   const entry={at:now,userId,result:m.genderOnly?'ask_gender':'product_reply',product:m.unique?.id??null,text:reply,merged:turn.length+1};
   if(!m.genderOnly)state.lastReply={id:m.unique.id,at:now};
   if(mode==='live'&&tokenOk){actions.push({type:'reply',replyToken:event.replyToken,text:reply});state.log.push({at:now,from:'worker',text:reply});
    // 已回答：清掉這一輪；只問公母時保留，等客人回答
    if(!m.genderOnly){state.pending=[];state.aiDueAt=0}
    actions.push({type:'log',entry});return {state,actions}}
   // 試跑：只記錄「本來會回什麼」，照常交給 Grok，比對後再切換
   state.pending.at(-1).wouldReply=reply;actions.push({type:'log',entry:{...entry,shadow:true,tokenExpired:!tokenOk}})}
 }
 // 其他：等 60 秒看客人是否還在補充；AI 每 10 分鐘最多一次
 state.aiDueAt=Math.max(now+DEBOUNCE_MS,state.lastAiAt+AI_COOLDOWN_MS);
 actions.push({type:'alarm',at:state.aiDueAt});
 return {state,actions}}

export function onAlarm({state:prev,now,pausedUntil=0,index,userId}){
 const state=structuredClone(prev??emptyState());const actions=[];
 if(pausedUntil>now){state.pending=[];state.aiDueAt=0;return {state,actions}}
 if(!state.pending.length||!state.aiDueAt||state.pending.every(p=>p.chatter)){state.aiDueAt=0;return {state,actions}}
 if(now<state.aiDueAt){actions.push({type:'alarm',at:state.aiDueAt});return {state,actions}}
 if(now-state.lastAiAt<AI_COOLDOWN_MS){state.aiDueAt=state.lastAiAt+AI_COOLDOWN_MS;actions.push({type:'alarm',at:state.aiDueAt});return {state,actions}}
 actions.push(forward(state,{userId,now,reason:'ai_draft',index}));state.pending=[];state.lastAiAt=now;state.aiDueAt=0;
 return {state,actions}}

// 交給 Grok 的內容：合併後的客人訊息（已遮蔽帳密、帳號、末碼等）、前文、可能的商品、試跑時 Worker 本來會回的內容
function forward(state,{userId,now,reason,human=null,index}){
 const lang=state.pending.at(-1)?.lang??'zh';
 const byId=new Map((index?.items??[]).map(it=>[it.p.id,it.p]));
 const candidates=state.candidates.slice(0,5).map(id=>byId.get(id)).filter(Boolean).map(p=>({id:p.id,name:p.name,status:p.status,price:p.price??null,link:productLink(p,lang)}));
 const photoHuman=!human&&state.pending.some(p=>p.human==='photo');
 return {type:'forward',payload:{userId,at:now,reason,needs_human:reason==='needs_human'||photoHuman,human_reason:human?HUMAN_REASONS[human]:photoHuman?HUMAN_REASONS.photo:null,
  intent:INTENT_LABEL[state.level]??'待確認',lang,messages:state.pending.map(p=>({at:p.at,text:p.text})),
  worker_would_reply:state.pending.map(p=>p.wouldReply).filter(Boolean),candidates,context:state.log.slice(-10)}}}
