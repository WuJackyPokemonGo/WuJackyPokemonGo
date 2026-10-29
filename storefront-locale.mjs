export const tr = (zh,en,locale=getLocale()) => locale==='en'?en:zh;
export function resolveLocale(saved,languages=[],fallback='zh-Hant',requested=null){
 if(requested==='zh'||requested==='en')return requested;
 if(saved==='zh'||saved==='en')return saved;
 const preferred=languages.find(value=>typeof value==='string'&&value.trim())||fallback;
 return /^zh(?:-|$)/i.test(preferred)?'zh':'en';
}
let savedLocale=null;try{savedLocale=localStorage.getItem('wj_store_locale')}catch{}
let requestedLocale=null;try{requestedLocale=new URL(location.href).searchParams.get('lang')}catch{}
const browserLanguages=typeof navigator==='undefined'?[]:Array.from(navigator.languages??[]);
let locale=resolveLocale(savedLocale,browserLanguages,typeof navigator==='undefined'?'zh-Hant':navigator.language||'zh-Hant',requestedLocale);
if(requestedLocale==='zh'||requestedLocale==='en'){try{localStorage.setItem('wj_store_locale',locale)}catch{}}
export const getLocale=()=>locale;
export function setLocale(value){locale=value==='en'?'en':'zh';try{localStorage.setItem('wj_store_locale',locale)}catch{};return locale}
export const labels={
"單區：NT$ 100\n四款一套：NT$ 300\n\n爆炸頭髮色對照：\n馬來西亞・吉隆坡：藍綠色\n台灣・台北：粉紅色\n新加坡：藍色\n菲律賓・馬尼拉：紅色\n\n以上為四款爆炸頭髮色，各款附對應地區背景。泰國曼谷橘色款另列為即將推出，不包含在本四色套組。":"Single region: NT$ 100\nSet of four: NT$ 300\n\nAfro hair colors:\nKuala Lumpur, Malaysia: Turquoise\nTaipei, Taiwan: Pink\nSingapore: Blue\nManila, Philippines: Red\n\nThese are the four afro hair colors, each with its corresponding Location Background. The orange Bangkok, Thailand variant is listed separately as Coming soon and is not included in this four-color set.",
"泰國・曼谷：橘色爆炸頭皮卡丘。\nPokéXciting! 曼谷活動預定於 2027/02/13–02/14 舉行。\n即將推出；售價與供貨待確認，暫不開放加入詢價清單。\n此款獨立預告，不包含在現有四色套組。":"Bangkok, Thailand: Orange Afro Pikachu.\nThe PokéXciting! Bangkok event is scheduled for February 13–14, 2027.\nComing soon. Price and availability are to be confirmed; this item cannot be added to the inquiry list yet.\nThis is a separate preview and is not included in the existing four-color set.",

'從喜歡的款式開始，收藏你的下一段旅程。':'Find a favorite. Start your next collection.',
'探索背景圖鑑 ↗':'Explore backgrounds ↗',
'挑選商品，加入清單後透過 LINE 確認。':'Choose your favorites, then confirm your inquiry on LINE.',

'背景收藏圖鑑 ↗':'Background collection ↗',
'官方 LINE ↗':'Official LINE ↗','尋找你的下一隻收藏。':'Find your next collectible.',
'瀏覽商品、整理想詢問的清單，再透過 LINE 與我確認供貨和交付方式。':'Browse the collection, make an inquiry list, then contact me on LINE to confirm availability and delivery.',
'商品供應、最終價格與交付時間，以私訊確認為準。':'Availability, final prices and delivery times are confirmed by private message.',
'搜尋寶可夢、英文名稱、圖鑑編號或分類':'Search Chinese or English names, Pokédex numbers or categories',
'搜尋商品':'Search products','清除':'Clear','商品排序':'Sort products','推薦排序':'Recommended','價格由低至高':'Price: low to high','價格由高至低':'Price: high to low','名稱排序':'Name','商品分類':'Categories','商品目錄':'Collection','正在載入商品…':'Loading products…',
'詢價清單不成立訂單、不保留庫存。請確認供貨後再付款。':'An inquiry list does not place an order or reserve stock. Confirm availability before paying.',
'聯絡 Wu Jacky':'Contact Wu Jacky','管理登入':'Admin login','匿名統計':'Anonymous analytics','停用匿名統計':'Disable anonymous analytics','啟用匿名統計':'Enable anonymous analytics','匿名統計已停用':'Anonymous analytics disabled','匿名統計已啟用':'Anonymous analytics enabled','已依瀏覽器隱私設定停用':'Disabled by your browser privacy settings','此瀏覽器無法使用匿名統計':'Analytics unavailable in this browser','匿名統計暫時無法送達':'Analytics temporarily unavailable',
'匿名統計只累計瀏覽與清單操作，保留 30 天；不記錄姓名、聯絡資料、完整 IP 或搜尋文字，並遵守瀏覽器隱私設定。':'Anonymous analytics count views and list actions for 30 days. Names, contact details, full IP addresses and search text are not recorded. Browser privacy settings are respected.',
'查看詢價清單':'View inquiry list','關閉':'Close','減少數量':'Decrease quantity','增加數量':'Increase quantity','加入詢價清單':'Add to inquiry list','已售罄商品可詢問能否補貨；即將推出商品暫不加入詢價。':'Ask about restocking sold-out items. Coming-soon items cannot be added yet.',
'詢價清單':'Inquiry list','補充說明':'Additional notes','例如希望的交付方式、想確認的細節':'For example, preferred delivery method or questions',
'複製下方內容，貼到官方 LINE 與我確認。清單只用於詢價，尚未成立訂單。':'Copy the text below and send it to me on LINE. This is an inquiry, not a confirmed order.',
'複製詢價文字':'Copy inquiry','可長按全選並複製':'Press and hold to select and copy','全選文字':'Select all','前往官方 LINE ↗':'Open official LINE ↗','清空清單':'Clear list',
'孵蛋':'Egg hatching','色違':'Shiny','背景':'Background','傳說':'Legendary','裝扮':'Costume','超極巨化/極巨化':'Gigantamax / Dynamax','皮卡丘':'Pikachu','水墨色背系列':'Ink background series','三隊伍隊長色背系列':'Team leader background series','本月新庫存':'New this month','即將推出商品（待活動開始）':'Coming soon','LV.1 一等色':'Lv.1 Shiny',
'可供貨':'Available','庫存偏低':'Low stock','已售罄':'Sold out','供貨待確認':'Availability to confirm','即將推出':'Coming soon','庫存待確認':'Stock to confirm',
'私訊詢價':'Ask for price','商品圖片整理中':'Image coming soon','全部':'All','沒有符合的商品':'No matching products','商品陸續整理中':'More products coming soon','試試其他名稱或分類。':'Try another name or category.','新商品會陸續上架，歡迎稍後回來查看。':'New products will be added. Please check back soon.','透過官方 LINE 詢問':'Ask on official LINE','查看商品':'View product','查看另一張商品圖片':'View another product image','移除':'Remove','已售罄，請確認能否補貨':'Sold out — please ask about restocking','清單目前是空的。':'Your list is empty.','公開價格小計：':'Listed-price subtotal: ','（不含詢價商品）':' (excludes unpriced items)','確定清空詢價清單？':'Clear your inquiry list?','已複製，可以貼到官方 LINE。':'Copied. You can paste it into LINE.','請在文字框長按全選後複製。':'Press and hold in the text box to select and copy.','商品資料暫時無法載入，請稍後重試。':'Products could not be loaded. Please try again.','重新載入':'Retry',
'小火龍1/200\\n皮卡丘、傑尼龜、妙蛙種子1/150\\n四隻各一套500':'Charmander: NT$200 each\nPikachu, Squirtle or Bulbasaur: NT$150 each\nOne of each (4 total): NT$500'
};
export const t=(text,lang=getLocale())=>lang==='en'?(labels[text]??text):text;
export const productName=(p,lang=getLocale())=>lang==='en'?(p.name_en?.trim()||p.name):p.name;
export const productDescription=(p,lang=getLocale())=>lang==='en'?(p.description_en||labels[p.description]||labels[String(p.description??'').replaceAll('\n','\\n')]||p.description):p.description;
export function bindStaticTranslations(root=document){
 const texts=[],attrs=[];const walker=document.createTreeWalker(root.body,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){const n=walker.currentNode,key=n.textContent.trim();if(labels[key]&&!['STYLE','SCRIPT'].includes(n.parentElement.tagName))texts.push([n,n.textContent,key])}
 root.querySelectorAll('[placeholder],[aria-label],[data-contact-label]').forEach(n=>{for(const key of ['placeholder','aria-label','data-contact-label']){const value=n.getAttribute(key);if(labels[value])attrs.push([n,key,value])}});
 return ()=>{root.documentElement.lang=getLocale()==='en'?'en':'zh-Hant';root.title=tr('Wu Jacky Pokémon GO｜商品目錄','Wu Jacky Pokémon GO | Collection');for(const[n,original,key]of texts)n.textContent=getLocale()==='en'?original.replace(key,t(key)):original;for(const[n,key,value]of attrs)n.setAttribute(key,t(value))};
}

export function initLanguageHint(){
 try{if(localStorage.getItem('wj_language_hint_seen_v1')==='1')return ()=>{}}catch{}
 const anchor=document.querySelector('.toprow')||document.querySelector('header .top');
 if(!anchor)return ()=>{};
 const hint=document.createElement('aside'),message=document.createElement('span'),close=document.createElement('button');
 hint.className='language-hint';hint.setAttribute('role','status');close.type='button';close.textContent='×';hint.append(message,close);anchor.insertAdjacentElement('afterend',hint);
 const render=()=>{message.textContent=tr('可在頁首「選擇您的語言」切換；網站會記住你的選擇。','Use “Choose your language” at the top of the page to switch. Your choice will be remembered.');close.setAttribute('aria-label',tr('關閉語言提示','Dismiss language tip'))};
 close.onclick=()=>{hint.remove();try{localStorage.setItem('wj_language_hint_seen_v1','1')}catch{}};render();return render;
}
