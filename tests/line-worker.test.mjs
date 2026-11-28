// LINE Worker 規則（合成商品與訊息，不含真實客人資料）
import test from 'node:test';import assert from 'node:assert/strict';
import {buildCatalogIndex,matchProducts} from '../line-worker/src/match.mjs';
import {decide,onAlarm,emptyState,AI_COOLDOWN_MS,DEBOUNCE_MS,PAUSE_MS} from '../line-worker/src/session.mjs';
import {verifySignature} from '../line-worker/src/worker.mjs';

const P=(id,name,name_en,status,price,aliases=[])=>({id,name,name_en,status,price,aliases});
const catalog=[
 P('b1','大針蜂-2026世界錦標賽舊金山背景','Beedrill - San Francisco Background','available',800,['大針蜂','Beedrill','舊金山','San Francisco']),
 P('r1','拉魯拉絲（極巨化）*公-紫黑','Dynamax Ralts (Male) - Dark Skies','inquiry_only',400,['拉魯拉絲','Ralts','紫黑','紫黑拉魯拉絲']),
 P('r2','拉魯拉絲（極巨化）*母-紫黑','Dynamax Ralts (Female) - Dark Skies','low_stock',500,['拉魯拉絲','Ralts','紫黑']),
 P('r3','拉魯拉絲-極巨化','Ralts - Dynamax','available',150,['拉魯拉絲','Ralts']),
 P('g1','耿鬼-寶可夢之夜倫敦','Gengar - Pokémon Night Out London','available',100,['耿鬼','Gengar','倫敦','London']),
 P('g2','耿鬼-寶可夢之夜洛杉磯','Gengar - Pokémon Night Out Los Angeles','available',300,['耿鬼','Gengar','洛杉磯']),
 P('m1','鯉魚王（極巨化）*公-紫黑','Dynamax Magikarp (Male) - Dark Skies','available',400,['鯉魚王','紫黑']),
 P('m2','鯉魚王（極巨化）*母-紫黑','Dynamax Magikarp (Female) - Dark Skies','available',400,['鯉魚王','紫黑']),
 P('s1','卡比獸-牛仔帽','Snorlax - Cowboy Hat','sold_out',300,['卡比獸','Snorlax']),
 P('p1','皮卡丘-倫敦','Pikachu - London','available',null,['皮卡丘','Pikachu','倫敦'])];
const index=buildCatalogIndex(catalog,'耿鬼,Gengar,梗鬼\n');
const T0=Date.parse('2026-11-24T04:00:00Z');let n=0;
const ev=(text,{at=T0,user='U1',type='text'}={})=>({type:'message',webhookEventId:'E'+(++n),timestamp:at,replyToken:'R'+n,source:{userId:user},message:type==='text'?{type,text}:{type}});
const run=(state,text,o={})=>decide({state,event:ev(text,o),index,now:o.now??o.at??T0,pausedUntil:o.paused??0,ownerUserId:'OWNER',mode:o.mode??'live'});
const kinds=r=>r.actions.map(a=>a.type);

test('唯一命中、有貨、有公開價格 → 固定範本回品名、價格、連結與自動回覆標註',()=>{
 const r=run(emptyState(),'舊金山大針蜂有貨嗎？多少？');const reply=r.actions.find(a=>a.type==='reply');
 assert.ok(reply);assert.match(reply.text,/大針蜂-2026世界錦標賽舊金山背景/);assert.match(reply.text,/NT\$800/);assert.match(reply.text,/p\/b1\.html\?lang=zh/);assert.match(reply.text,/（此為自動回覆）$/);
 assert.ok(!kinds(r).includes('forward'),'已回答的不交給 Grok');
});
test('私訊詢價或需詢問供貨 → 只回品名和連結；已售完不自動回',()=>{
 const a=run(emptyState(),'紫黑拉魯拉絲 公的多少');const t=a.actions.find(x=>x.type==='reply').text;
 assert.match(t,/拉魯拉絲（極巨化）\*公-紫黑/);assert.doesNotMatch(t,/NT\$/);
 const s=run(emptyState(),'牛仔帽卡比獸還有嗎');assert.ok(!kinds(s).includes('reply'));assert.ok(kinds(s).includes('alarm'),'已售完交給 Grok／人工');
});
test('只差公母 → 固定問句；「拉魯拉絲」→「母的」→「多少」合併後回答',()=>{
 let r=run(emptyState(),'鯉魚王多少');assert.match(r.actions.find(a=>a.type==='reply').text,/請問你要公的還是母的？/);
 r=run(emptyState(),'紫黑拉魯拉絲',{at:T0});assert.ok(!kinds(r).includes('reply'));
 r=run(r.state,'母的',{at:T0+20000});assert.ok(!kinds(r).includes('reply'));
 r=run(r.state,'多少',{at:T0+40000});const reply=r.actions.find(a=>a.type==='reply');
 assert.ok(reply,'第三句回答');assert.match(reply.text,/\*母-紫黑/);assert.match(reply.text,/NT\$500/);assert.equal(r.state.pending.length,0);
 // 候選不只公母（還有非紫黑款）→ 不自動問，交給 Grok
 const x=run(emptyState(),'拉魯拉絲多少');assert.ok(!kinds(x).includes('reply'));
});
test('議價、付款、售後、圖片 → 人工優先，就算有命中商品也不自動回；冷卻期間照樣標待人工',()=>{
 const b=run(emptyState(),'倫敦耿鬼有貨嗎？算我 80 可以嗎？');assert.ok(!kinds(b).includes('reply'));
 const f=b.actions.find(a=>a.type==='forward');assert.equal(f.payload.needs_human,true);assert.equal(f.payload.human_reason,'議價');
 const p=run(b.state,'我已轉帳 末五碼 45678',{at:T0+60000});const f2=p.actions.find(a=>a.type==='forward');
 assert.ok(f2,'冷卻期間付款訊息仍立即標待人工');assert.equal(f2.payload.human_reason,'付款');assert.ok(!JSON.stringify(f2.payload).includes('45678'),'轉帳末碼遮蔽');
 const img=run(emptyState(),'',{type:'image'});assert.ok(!kinds(img).includes('forward'),'圖片受冷卻限制');
 assert.equal(onAlarm({state:img.state,now:T0+DEBOUNCE_MS,index,userId:'U1'}).actions.find(a=>a.type==='forward').payload.human_reason,'客人傳圖片');
});
test('其他訊息：等 60 秒合併，同一位客人 10 分鐘最多交給 AI 一次，後續訊息照收',()=>{
 let r=run(emptyState(),'想問一下怎麼交易比較快',{at:T0});assert.deepEqual(r.actions.find(a=>a.type==='alarm').at,T0+DEBOUNCE_MS);
 r=run(r.state,'我人在高雄',{at:T0+30000});
 let a=onAlarm({state:r.state,now:T0+30000+DEBOUNCE_MS,index,userId:'U1'});const f=a.actions.find(x=>x.type==='forward');
 assert.equal(f.payload.messages.length,2,'兩句合併一次送');assert.equal(f.payload.reason,'ai_draft');
 r=run(a.state,'對了週末可以嗎',{at:T0+120000});assert.equal(r.actions.find(x=>x.type==='alarm').at,a.state.lastAiAt+AI_COOLDOWN_MS,'冷卻中排到 10 分鐘後');
 a=onAlarm({state:r.state,now:T0+120000+DEBOUNCE_MS,index,userId:'U1'});assert.ok(!a.actions.some(x=>x.type==='forward'));
 a=onAlarm({state:r.state,now:r.state.lastAiAt+AI_COOLDOWN_MS,index,userId:'U1'});assert.equal(a.actions.find(x=>x.type==='forward').payload.messages.length,1,'冷卻後送出，沒有遺漏');
});
test('LINE 重送同一事件 → 以 webhookEventId 去重',()=>{
 const e=ev('倫敦耿鬼多少');const r1=decide({state:emptyState(),event:e,index,now:T0,mode:'live'});const r2=decide({state:r1.state,event:e,index,now:T0+1000,mode:'live'});
 assert.ok(kinds(r1).includes('reply'));assert.deepEqual(r2.actions,[]);
});
test('暫停暗號只認 Jacky 的 userId；暫停期間不回、不叫 AI',()=>{
 const o=run(emptyState(),'#我來',{user:'OWNER'});assert.deepEqual(o.actions[0],{type:'control',command:'pause',until:T0+PAUSE_MS});assert.equal(o.actions[1].text,'收');
 const x=run(emptyState(),'#我來',{user:'U2'});assert.ok(!x.actions.some(a=>a.type==='control'),'別人傳暗號無效');
 const p=run(emptyState(),'倫敦耿鬼多少',{paused:T0+1000});assert.deepEqual(kinds(p),['log']);
 assert.equal(run(emptyState(),'#交給你',{user:'OWNER'}).actions[0].command,'resume');
});
test('試跑模式：不回覆客人，只記錄本來會回什麼，照常交給 Grok 並附上比對內容',()=>{
 let r=run(emptyState(),'倫敦耿鬼多少',{mode:'shadow'});assert.ok(!kinds(r).includes('reply'));
 const log=r.actions.find(a=>a.type==='log').entry;assert.equal(log.shadow,true);assert.match(log.text,/NT\$100/);
 const a=onAlarm({state:r.state,now:T0+DEBOUNCE_MS,index,userId:'U1'});assert.match(a.actions.find(x=>x.type==='forward').payload.worker_would_reply[0],/NT\$100/);
});
test('英文客人用 ?lang=en；replyToken 超過時限不回；有對不到的限定詞不自動回',()=>{
 assert.match(run(emptyState(),'how much is the London Gengar').actions.find(a=>a.type==='reply').text,/lang=en[\s\S]*\(Auto reply\)/);
 assert.ok(!kinds(run(emptyState(),'倫敦耿鬼多少',{at:T0,now:T0+70000})).includes('reply'),'超過 1 分鐘不用 replyToken');
 assert.ok(!kinds(run(emptyState(),'東京大針蜂多少')).includes('reply'),'客人指定的款式目錄沒有');
 assert.ok(!kinds(run(emptyState(),'耿鬼多少')).includes('reply'),'多件候選交給 Grok');
 assert.equal(matchProducts(index,'梗鬼洛杉磯還有嗎').unique.id,'g2','CRM 暱稱也能對到');
});
test('問完之後的接話（「14」「對」）不會再觸發回覆，也不叫 AI；同一件商品不重複回',()=>{
 let r=run(emptyState(),'倫敦耿鬼多少',{at:T0});assert.ok(kinds(r).includes('reply'));
 for(const [i,t] of ['14','對','好的哥'].entries()){r=run(r.state,t,{at:T0+10000*(i+1)});assert.deepEqual(kinds(r),[],t)}
 r=run(r.state,'倫敦耿鬼還有嗎',{at:T0+60000});assert.ok(!kinds(r).includes('reply'),'10 分鐘內同一件不重複回');
});
test('Webhook 簽章驗證',async()=>{
 const body='{"events":[]}',secret='s3cret';const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)))));
 assert.equal(await verifySignature(secret,body,sig),true);assert.equal(await verifySignature(secret,body+' ',sig),false);assert.equal(await verifySignature('',body,sig),false);
});
