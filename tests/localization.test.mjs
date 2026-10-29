import test from 'node:test';
import assert from 'node:assert/strict';
import {searchMatch,inquiryText,stockLabel,loadPublicCatalog} from '../storefront-service.mjs';
import {setLocale,t,productName,productDescription,resolveLocale} from '../storefront-locale.mjs';
const expo={id:'expo',sku:'02',name:'皮卡丘、小火龍、傑尼龜、妙蛙種子-大阪萬博',name_en:'Pikachu / Charmander / Squirtle / Bulbasaur – EXPO 2025 Osaka',dex:1,aliases:['0001','0004','0007','0025'],tags:['背景'],images:[],status:'available',price:500};
test('bundle search matches every name and dex in either locale; numbers do not match unrelated years or substrings',()=>{for(const lang of ['zh','en']){setLocale(lang);for(const q of ['皮卡丘','小火龍','傑尼龜','妙蛙種子','Pikachu','Charmander','Squirtle','Bulbasaur','1','4','7','25','0001','0004','0007','0025','#0007','０００７'])assert.equal(searchMatch(expo,q),true,q);for(const q of ['2025','0002','9999'])assert.equal(searchMatch(expo,q),false,q)}setLocale('zh')});
test('language switches both ways without changing original product names, prices or category values',()=>{setLocale('en');assert.equal(t('背景'),'Background');assert.equal(productName(expo),expo.name_en);assert.equal(searchMatch(expo,'background'),true);setLocale('zh');assert.equal(t('背景'),'背景');assert.equal(productName(expo),expo.name);assert.equal(expo.price,500);assert.deepEqual(expo.tags,['背景'])});
test('English inquiry hides SKU and preserves product name, quantity, price and buyer notes',()=>{const text=inquiryText([expo],[{id:'expo',qty:2}],'Please confirm','en');assert.match(text,/Pikachu/);assert.ok(!text.includes('02｜'));assert.match(text,/× 2/);assert.match(text,/NT\$ 1,000/);assert.match(text,/not a confirmed order/);assert.match(text,/Please confirm/)});
test('English low-stock labels retain accurate quantity and tone',()=>assert.deepEqual(stockLabel({status:'low_stock',stock_quantity:5},'en'),{text:'5 left',tone:'low'}));
test('Osaka individual-price notes translate both saved newline representations without changing amounts',()=>{for(const sep of ['\n','\\n']){const description=['小火龍1/200','皮卡丘、傑尼龜、妙蛙種子1/150','四隻各一套500'].join(sep);const translated=productDescription({description},'en');assert.match(translated,/Charmander: NT\$200/);assert.match(translated,/NT\$150/);assert.match(translated,/NT\$500/);assert.equal(productDescription({description},'zh'),description)}});

test('first visit follows the preferred browser language; Chinese locales use Traditional Chinese and other languages use English',()=>{assert.equal(resolveLocale(null,['en-US']),'en');assert.equal(resolveLocale(null,['vi-VN','zh-TW']),'en');assert.equal(resolveLocale(null,['zh-TW','en-US']),'zh');assert.equal(resolveLocale(null,['zh-CN']),'zh');assert.equal(resolveLocale(null,[],'en-GB'),'en')});
test('explicit visitor language preference overrides browser language',()=>{assert.equal(resolveLocale('zh',['en-US']),'zh');assert.equal(resolveLocale('en',['zh-TW']),'en');assert.equal(resolveLocale('invalid',['en-US']),'en')});
test('share-link language takes priority; unsupported values retain normal fallback',()=>{assert.equal(resolveLocale('zh',['zh-TW'],'zh-Hant','en'),'en');assert.equal(resolveLocale('en',['en-US'],'en-US','zh'),'zh');for(const value of [null,'','fr','EN'])assert.equal(resolveLocale('zh',['en-US'],'en-US',value),'zh')});
test('share links initialize and remember language while preserving background selection, even with storage blocked',async()=>{
 const previousLocation=Object.getOwnPropertyDescriptor(globalThis,'location'),previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 try{
  for(const blocked of [false,true]){
   let saved='zh';
   Object.defineProperty(globalThis,'location',{configurable:true,value:{href:'https://example.com/backgrounds.html?background=BG-0001&lang=en'}});
   Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem(){if(blocked)throw Error('blocked');return saved},setItem(key,value){if(blocked)throw Error('blocked');saved=value}}});
   const module=await import('../storefront-locale.mjs?share-link-test='+blocked);
   assert.equal(module.getLocale(),'en');if(!blocked)assert.equal(saved,'en');
   assert.equal(new URL(location.href).searchParams.get('background'),'BG-0001');
   module.setLocale('zh');assert.equal(module.getLocale(),'zh');
  }
 }finally{
  if(previousLocation)Object.defineProperty(globalThis,'location',previousLocation);else delete globalThis.location;
  if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else delete globalThis.localStorage;
 }
});
