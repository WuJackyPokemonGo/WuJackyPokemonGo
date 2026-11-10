import {createCheckoutService} from './checkout-service.mjs';
// Show "Proceed to checkout" only while self-checkout is actually open; otherwise the inquiry
// list keeps just "Copy inquiry" and "Open official LINE" so customers never hit a closed page.
export async function initCheckoutEntry({service=null,delay=1500}={}){
 try{
  await new Promise(r=>setTimeout(r,delay));
  const svc=service??createCheckoutService({session:sessionStorage,local:localStorage});
  const config=await svc.call('config');
  if(!config||config.enabled!==true)return false;
  const link=document.createElement('a');link.href='checkout.html';link.className='btn';
  const text=()=>link.textContent=document.documentElement.lang.startsWith('en')?'Proceed to checkout':'前往自助下單';
  text();document.getElementById('cartDialog').append(link);window.addEventListener('wj-language-change',text);return true;
 }catch{return false}
}
