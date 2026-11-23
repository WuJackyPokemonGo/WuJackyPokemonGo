// 從客人訊息找出指的是哪件商品（不用 AI）。
// 1. 先找寶可夢名稱（中文名、英文名、商品別名、CRM 暱稱清單）
// 2. 再用訊息裡的限定詞（地點、活動、公母、尺寸、球種…）縮小範圍
// 3. 只剩一件才算「唯一命中」；只差公母時回 genderOnly，讓 Worker 用固定問句確認
const norm=s=>String(s??'').normalize('NFKC').toLowerCase();
const CJK=/^[一-鿿]{2,10}$/;
// 太常見、不能用來分辨商品的詞
const GENERIC=new Set(['色違','異色','背景','特殊背景','shiny','dm','ds','background','special background','pokemon','pokémon','go','色背','限定','活動','商品','的']);
const isUseful=t=>t&&!GENERIC.has(t)&&!/^\d+$/.test(t)&&(CJK.test(t)||/^[a-z][a-z .'-]{1,40}$/.test(t)||/^(xxl|xxs|lv\.?1)$/.test(t));

// 商品名稱「拉魯拉絲（極巨化）*公-紫黑」→ 寶可夢「拉魯拉絲」、限定詞「極巨化、公、紫黑」
function splitName(name){
 const parts=norm(name).split(/[-–（）()*＊、,，/\s]+/).filter(Boolean);
 return parts}
function speciesOf(p){
 const base=norm(p.name).split(/[-–（(*＊]/)[0];
 const zh=base.split(/[、,，]/).map(s=>s.trim()).filter(s=>CJK.test(s));
 const enBase=norm(p.name_en??'').replace(/^(dynamax|gigantamax|shiny)\s+/,'').split(/\s[-–]\s|[(/]/)[0].split(/\s*\/\s*/);
 const en=enBase.map(s=>s.trim()).filter(s=>/^[a-z][a-z .'-]{2,30}$/.test(s));
 return [...new Set([...zh,...en])]}

// 問句、語氣、數量等不是商品特徵的詞（比對限定詞前先拿掉）
const NOISE=/老闆|大哥|哥|大大|你好|您好|哈囉|hello|hi|請|幫我|看看|問一下|多少錢?|價格|價錢|價位|怎麼賣|報價|售價|有貨|現貨|還有|有沒有|有嗎|還在嗎|請問|一下|可以|嗎|呢|吧|啊|喔|哦|唷|的|我要|想要|想買|要買|這隻|那隻|這個|那個|幾隻|一隻|兩隻|[一二三四五六七八九十兩\d]+隻|how much|is|the|are|still|available|in stock|have|do|you|price|[?？!！,，。.、~～\s]+/gi;
const GENDER=/公的?|母的?|(^|[^a-z])(male|female)([^a-z]|$)/gi;

export function buildCatalogIndex(products=[],nicknames=''){
 const nick=new Map();// 別名 → 正式名稱（寶可夢）
 for(const line of String(nicknames).split(/\r?\n/)){const parts=line.split(/[,，]/).map(x=>norm(x).trim()).filter(Boolean);if(parts.length<2||parts[0].includes('＋'))continue;for(const a of parts.slice(1))if(!nick.has(a))nick.set(a,parts[0])}
 const items=products.map(p=>{
  const species=speciesOf(p);
  // 純寶可夢別名（英文名、簡體字等，不含其他字）也算寶可夢名稱
  for(const a of (p.aliases??[]).map(norm))if(nick.get(a)&&species.includes(nick.get(a)))species.push(a);
  const words=[...splitName(p.name),...splitName(p.name_en),...(p.aliases??[]).map(norm)];
  // 限定詞：去掉寶可夢名稱本身，也去掉「紫黑拉魯拉絲」這種已含寶可夢名稱的複合別名（只有部分款式有，會誤判）
  const quals=[...new Set(words.filter(w=>isUseful(w)&&!species.some(s=>w.includes(s))))];
  const gender=/\*公|（公）|\(male\)/i.test(p.name+' '+(p.name_en??''))?'m':/\*母|（母）|\(female\)/i.test(p.name+' '+(p.name_en??''))?'f':'';
  return {p,species:[...new Set(species)],quals,qualText:quals.join('|'),gender}});
 const speciesTerms=new Map();for(const it of items)for(const s of it.species){if(!speciesTerms.has(s))speciesTerms.set(s,new Set());speciesTerms.get(s).add(it)}
 for(const [alias,canon] of nick){const hit=speciesTerms.get(canon);if(hit&&!speciesTerms.has(alias))speciesTerms.set(alias,hit)}
 // 只屬於一件商品的別名（例如「大阪萬博」）：訊息沒寫寶可夢名稱時用來直接對到商品
 const aliasOwners=new Map();for(const it of items)for(const a of (it.p.aliases??[]).map(norm))if((CJK.test(a)&&a.length>=3)||/^[a-z][a-z .'-]{5,}$/.test(a)){if(!aliasOwners.has(a))aliasOwners.set(a,new Set());aliasOwners.get(a).add(it)}
 const uniqueAliases=[...aliasOwners].filter(([,s])=>s.size===1).map(([a,s])=>[a,[...s][0]]).sort((a,b)=>b[0].length-a[0].length);
 const keys=[...speciesTerms.keys()].sort((a,b)=>b.length-a.length);
 return {items,speciesTerms,keys,uniqueAliases}}

const esc=k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function findSpecies(index,text){let t=norm(text);const found=[];
 for(const k of index.keys){if(k.length<2)continue;const isLatin=/^[a-z]/.test(k);const hit=isLatin?new RegExp(`(^|[^a-z])${esc(k)}($|[^a-z])`).test(t):t.includes(k);
  if(hit){found.push(k);t=t.split(k).join(' ')}}
 return {found,rest:t}}

// 回傳 {candidates, species, unique, genderOnly, fromContext}
export function matchProducts(index,text,{context=[]}={}){
 const t=norm(text);const {found:species,rest}=findSpecies(index,t);let fromContext=false;let pool;
 if(species.length){const sets=species.map(s=>index.speciesTerms.get(s));pool=index.items.filter(it=>sets.every(set=>set.has(it)));if(!pool.length)pool=index.items.filter(it=>sets.some(set=>set.has(it)))}
 else{const a=index.uniqueAliases.find(([alias])=>t.includes(alias));
  if(a)pool=[a[1]];else if(context.length){pool=index.items.filter(it=>context.includes(it.p.id));fromContext=true}
  else return {candidates:[],species:[],unique:null,genderOnly:false,fromContext}}
 // 限定詞：訊息剩下的詞（地點、活動、尺寸、球種…）出現在哪些商品裡
 const tokens=rest.replace(GENDER,' ').replace(NOISE,' ').split(/\s+/).map(x=>x.trim()).filter(x=>x.length>=2&&!/^\d+$/.test(x));
 const score=it=>tokens.filter(tok=>it.qualText.includes(tok)).length;
 const best=Math.max(0,...pool.map(score));if(best>0)pool=pool.filter(it=>score(it)===best);
 const g=/母|(^|[^a-z])female/.test(t)?'f':/公|(^|[^a-z])male/.test(t)?'m':'';
 if(g&&pool.some(it=>it.gender===g))pool=pool.filter(it=>it.gender===g);
 const candidates=pool.map(it=>it.p);
 const strip=n=>norm(n).replace(/\*?[公母]|\((male|female)\)/g,'');
 const genderOnly=candidates.length===2&&!g&&pool.every(it=>it.gender)&&new Set(candidates.map(c=>strip(c.name))).size===1;
 return {candidates,species,unique:candidates.length===1?candidates[0]:null,genderOnly,fromContext,unmatchedTokens:tokens.filter(tok=>!pool.some(it=>it.qualText.includes(tok)))}}
