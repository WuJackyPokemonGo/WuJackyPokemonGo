// 固定回覆範本。只在「唯一命中」時使用；最後一行一律標註自動回覆。
export const SITE='https://wujackypokemongo.github.io/WuJackyPokemonGo/';
export const productLink=(p,lang)=>`${SITE}p/${p.id}.html?lang=${lang==='en'?'en':'zh'}`;
const NOTE={zh:'（此為自動回覆）',en:'(Auto reply)'};
const money=v=>'NT$'+Number(v).toLocaleString('en-US');
export const SIMPLE_STATUSES=new Set(['available','low_stock']);
// 有貨＋有公開價格 → 品名、價格、連結；私訊詢價或需詢問供貨 → 只給品名和連結；其他狀態不自動回
export function productReply(p,lang){
 const name=lang==='en'?(p.name_en||p.name):p.name;
 if(SIMPLE_STATUSES.has(p.status)&&p.price!=null)return lang==='en'?`Yes, ${name} is in stock: ${money(p.price)}.\n👉 ${productLink(p,lang)}\n${NOTE.en}`:`有的～${name}\n${money(p.price)}，目前有貨\n👉 ${productLink(p,lang)}\n${NOTE.zh}`;
 if(p.status==='inquiry_only'||(SIMPLE_STATUSES.has(p.status)&&p.price==null))return `${name}\n👉 ${productLink(p,lang)}\n${NOTE[lang==='en'?'en':'zh']}`;
 return null}
export const genderQuestion=lang=>lang==='en'?`Male or female?\n${NOTE.en}`:`請問你要公的還是母的？\n${NOTE.zh}`;
export const ACK='收';
