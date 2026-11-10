import test from 'node:test';import assert from 'node:assert/strict';
import {initCheckoutEntry} from '../checkout-entry.mjs';
function fakeDom(){const appended=[];globalThis.document={documentElement:{lang:'en'},createElement:()=>({}),getElementById:()=>({append:x=>appended.push(x)})};globalThis.window={addEventListener(){}};return appended}
test('checkout button stays hidden while checkout is closed or its config cannot load',async()=>{
 for(const svc of [{call:async()=>({enabled:false})},{call:async()=>null},{call:async()=>{throw Error('down')}},{call:async()=>({enabled:'yes'})}]){const a=fakeDom();assert.equal(await initCheckoutEntry({service:svc,delay:0}),false);assert.equal(a.length,0)}
});
test('checkout button appears only when checkout is explicitly enabled',async()=>{
 const a=fakeDom();assert.equal(await initCheckoutEntry({service:{call:async n=>{assert.equal(n,'config');return {enabled:true}}},delay:0}),true);assert.equal(a.length,1);assert.equal(a[0].href,'checkout.html');assert.equal(a[0].textContent,'Proceed to checkout');
});
