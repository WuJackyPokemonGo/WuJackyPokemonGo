// 客人訊息的意圖（固定規則，不用 AI）。人工優先：議價、付款、售後、帳密一律交給 Jacky。
const RX={
 bargain:/算我|算\s*\d+|\d+\s*(可以|行|收)\s*嗎?|便宜|折扣|打折|優惠|殺價|少一點|cheaper|discount|\bdeal\b/i,
 payment:/匯款|轉帳|轉賬|已匯|已轉|匯好|轉好|付款|付好|街口|line\s?pay|無卡|末[一二三四五六七八九十\d]\s*碼|收據|明細|paid|transfer|payment|paypal|wise/i,
 after_sales:/登不進|登入不了|無法登入|登不上|被登出|綁定|換綁|解綁|改綁|密碼|帳密|驗證碼|沒收到|還沒收到|還沒給|什麼時候給|何時給|can'?t log ?in|password/i,
 buy:/我要|要這|下單|可以買|想買|要買|幫我留|留給我|收這|我收|^收$|預訂|預購|i'?ll take|i want|buy/i,
 stock:/有貨|還有|有沒有|有嗎|現貨|還在嗎|有賣|in stock|available|still have|do you have/i,
 price:/多少|價格|價錢|價位|幾元|怎麼賣|報價|售價|how much|price|cost/i,
 gender:/^(公|母|公的|母的|要公的|要母的|male|female)[喔哦呦唷～~!！。.\s]*$/i,
 thanks:/^(謝謝|感謝|謝啦|好的?|好喔|好唷|好哦|ok|okay|收到|了解|瞭解|知道了|嗯|恩|👍|🙏|讚|thanks?|thx|ty)[～~!！。.\s哥大]*$/i,
};
export const HUMAN_REASONS={bargain:'議價',payment:'付款',after_sales:'售後',photo:'客人傳圖片',unclear:'看不懂'};
// 回傳 {human:原因|null, stock, price, buy, gender:'m'|'f'|null, thanks, empty}
export function classify(text,{photo=false,sticker=false}={}){
 const t=String(text??'').trim();
 if(sticker||(!t&&!photo))return {empty:true};
 if(photo&&!t)return {human:'photo'};
 const human=RX.payment.test(t)?'payment':RX.after_sales.test(t)?'after_sales':RX.bargain.test(t)?'bargain':photo?'photo':null;
 const g=RX.gender.test(t)?(/母|female/i.test(t)?'f':'m'):null;
 return {human,stock:RX.stock.test(t),price:RX.price.test(t),buy:RX.buy.test(t),gender:g,thanks:RX.thanks.test(t)}}
// 購買意願：明確訊號用規則；資訊不足標「待確認」
export function intentLevel(c){if(c.buy||c.human==='payment')return 'hot';if(c.stock||c.price)return 'warm';return 'unknown'}
export const INTENT_LABEL={hot:'🔥高',warm:'🟡中',low:'⚪低',unknown:'待確認'};
// 英文客人：訊息沒有中文字、有英文字母
export const isEnglish=t=>/[a-z]/i.test(t)&&!/[぀-ヿ一-鿿가-힯]/.test(t);
