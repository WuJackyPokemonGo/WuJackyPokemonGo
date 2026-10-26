import {STAGING_URL,STAGING_PUBLISHABLE_KEY} from './staging-config.mjs';
export const CHECKOUT_ENDPOINT=STAGING_URL+'/functions/v1/self-checkout';
export function newLookupSecret(random=crypto){return [...random.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('')}
export function parseLookupCode(code){const [id,secret,...extra]=String(code).trim().split('.');if(extra.length||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)||!/^[a-f0-9]{64}$/.test(secret))throw Error('查詢碼格式不正確 / Invalid lookup code');return {id,secret}}
export function checkoutPayload(values,cart,products,config,requestId){
 const name=String(values.name??'').trim(),contact=String(values.contact??'').trim(),note=String(values.note??'').trim();
 if(!name||name.length>120||contact.length<3||contact.length>500||note.length>2000)throw Error('請完整填寫聯絡資料 / Please complete your contact details');
 if(!['line','email','facebook','instagram','other'].includes(values.contact_channel))throw Error('請選聯絡方式 / Choose a contact method');
 if(!values.accepted_terms)throw Error('請閱讀並同意交易說明 / Please accept the terms');
 if(!Array.isArray(cart)||!cart.length||cart.length>20||new Set(cart.map(i=>i.id)).size!==cart.length)throw Error('請確認購物清單 / Check your cart');
 const items=cart.map(i=>{const p=products.find(p=>p.id===i.id);if(!p||!['available','low_stock'].includes(p.status)||!Number.isSafeInteger(p.price)||p.price<=0||!Number.isInteger(i.qty)||i.qty<1||i.qty>99||!Number.isInteger(p.stock_quantity)||p.stock_quantity<i.qty)throw Error('部分商品需先詢問或庫存不足 / Some items need confirmation or are unavailable');return {id:p.id,qty:i.qty,expected_price:p.price}});
 return {request_id:requestId,name,contact,contact_channel:values.contact_channel,note,accepted_terms:true,terms_version:config.terms_version,items};
}
export function createCheckoutService({session,local,fetcher=fetch,random=crypto}={}){
 const key='wj_checkout_pending_v1';let pending=null;
 try{pending=JSON.parse(session.getItem(key)||'null');if(pending){parseLookupCode(pending.payload.request_id+'.'+pending.secret);if(!Array.isArray(pending.payload.items))throw Error('invalid')}}catch{throw Error('待確認下單紀錄無法讀取，請先核對訂單 / Unable to read pending order')}
 async function call(action,payload={},secret=null,captcha){let response;try{response=await fetcher(CHECKOUT_ENDPOINT,{method:'POST',headers:{apikey:STAGING_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({action,payload,secret,captcha}),signal:AbortSignal.timeout(20000)})}catch{throw Error('連線結果未確認，請保留查詢碼並重試原訂單 / Connection interrupted; retry the same order')}
  const result=await response.json();if(!response.ok){const e=Error(({closed:'目前暫停下單 / Checkout is closed',price_changed:'價格已更新，請重新整理商品 / Prices changed; refresh the cart',not_found:'找不到訂單，請核對完整查詢碼 / Order not found',captcha_failed:'驗證失敗，請重新驗證 / Please complete verification again',captcha_required:'請先完成驗證 / Complete verification first',rate_limited:'操作較頻繁，請稍後再試 / Too many requests; try again later',conflict:'資料與上次不同，請用原查詢碼確認 / Request conflict; check your original order',check_order:'請檢查庫存、付款期限與填寫內容 / Check stock, deadline and entered details'})[result.error]||'暫時無法確認結果，請稍後重試原操作 / Unable to confirm; retry the same action');e.code=result.error;e.status=response.status;throw e}return result.data;
 }
 function remember(id,secret){const code=id+'.'+secret;try{local.setItem('wj_checkout_last_code_v1',code)}catch{throw Error('無法保存查詢碼，請啟用瀏覽器儲存 / Enable browser storage before ordering')}return code}
 return {call,get pending(){return pending?structuredClone(pending):null},
  async create(payload,captcha){if(!pending){const secret=newLookupSecret(random);pending={payload:structuredClone(payload),secret};session.setItem(key,JSON.stringify(pending));remember(payload.request_id,secret)}
   try{const result=await call('create',pending.payload,pending.secret,captcha);session.removeItem(key);pending=null;return result}catch(e){if(['check_order','price_changed','closed'].includes(e.code)){session.removeItem(key);pending=null}throw e}},
  get lastCode(){return local.getItem('wj_checkout_last_code_v1')||''},
  lookup(code){const {id,secret}=parseLookupCode(code);return call('lookup',{id},secret)},
  report(code,report){const {id,secret}=parseLookupCode(code);return call('report',{id,report},secret)},
  cancel(code){const {id,secret}=parseLookupCode(code);return call('cancel',{id},secret)}
 };
}
