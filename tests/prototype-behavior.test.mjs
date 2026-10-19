import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext, runInContext} from 'node:vm';

const admin=await readFile(new URL('../admin.html',import.meta.url),'utf8');
const front=await readFile(new URL('../index.html',import.meta.url),'utf8');
function harness(html, skipInitialRender){
  const elements=new Map(), alerts=[], confirmations=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',hidden:false,textContent:'',classList:{add(){},remove(){},toggle(){}},addEventListener(type,fn){this[type]=fn},querySelectorAll:()=>[],focus(){this.focused=true},select(){this.selected=true},setSelectionRange(a,b){this.selection=[a,b]}});
    return elements.get(id);
  };
  const context=createContext({structuredClone,console,setTimeout(){},localStorage:{getItem:()=>null,setItem(){}},navigator:{},document:{getElementById:element,querySelectorAll:()=>[],addEventListener(){},execCommand:()=>false},alert:msg=>alerts.push(msg),confirm:msg=>{confirmations.push(msg);return true}});
  let source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  source=source.replace(skipInitialRender,'');
  runInContext(source,context);
  return {context,element,alerts,confirmations,run:code=>runInContext(code,context),snapshot:()=>JSON.parse(runInContext('JSON.stringify({products,moves})',context))};
}
function adminHarness(){const h=harness(admin,/render\(\);\s*$/);h.run('render=()=>{}');h.importCSV=async text=>{const target={files:[{text:async()=>text}],value:'chosen.csv'};await h.element('import').onchange({target});assert.equal(target.value,'');};return h;}

for(const separator of ['\n','\r\n','\r'])test(`CSV export round trip with ${JSON.stringify(separator)} and quoted Chinese fields`,async()=>{
  const h=adminHarness();
  await h.importCSV('\uFEFFid,name,stock,price,threshold,desc'+separator+'NEW-1,"皮卡丘, 異色",5,100,0,"第一行\n第二行 ""限定"""'+separator);
  assert.deepEqual(h.alerts,[]);
  const {products,moves}=h.snapshot(),p=products.find(p=>p.id==='NEW-1');
  assert.equal(p.name,'皮卡丘, 異色');assert.equal(p.stock,5);assert.equal(p.threshold,0);assert.equal(p.desc,'第一行\n第二行 "限定"');
  assert.equal(moves.length,1);assert.equal(moves[0].change,5);
});

test('CSV updates preserve inventory and create movements only for new stock',async()=>{
  const h=adminHarness();await h.importCSV('id,name,stock,price\nDEMO-001,更新名稱,2,150\nNEW-2,新商品,3,\n');
  const {products,moves}=h.snapshot();assert.deepEqual(h.alerts,[]);
  assert.equal(products.find(p=>p.id==='DEMO-001').stock,100);
  assert.equal(products.find(p=>p.id==='DEMO-001').price,150);
  assert.equal(products.find(p=>p.id==='NEW-2').price,null);
  assert.equal(moves.length,1);assert.equal(moves[0].change,3);
});

for(const [label,csv] of [
  ['negative stock','id,name,stock\nX,商品,-1'],
  ['decimal stock','id,name,stock\nX,商品,1.5'],
  ['missing stock','id,name,stock\nX,商品,'],
  ['unsafe integer','id,name,stock\nX,商品,9007199254740993'],
  ['negative price','id,name,stock,price\nX,商品,1,-1'],
  ['unsafe price','id,name,stock,price\nX,商品,1,9007199254740993'],
  ['negative threshold','id,name,stock,threshold\nX,商品,1,-1'],
  ['duplicate ID','id,name,stock\nX,商品,1\nX,商品二,2'],
  ['duplicate header','id,name,stock,stock\nX,商品,1,2'],
  ['missing column','id,name,stock\nX,商品'],
  ['extra column','id,name,stock\nX,商品,1,多餘'],
  ['unmatched quote','id,name,stock\nX,"商品,1'],
  ['quote in unquoted field','id,name,stock\nX,商"品",1'],
  ['text after quote','id,name,stock\nX,"商品"多餘,1'],
  ['invalid second row rolls back entire import','id,name,stock\nX,有效商品,1\nY,無效商品,-1']
])test(`CSV rejects ${label} without partial writes`,async()=>{
  const h=adminHarness(),before=h.snapshot();await h.importCSV(csv);
  assert.equal(h.alerts.length,1);assert.deepEqual(h.snapshot(),before);assert.equal(h.confirmations.length,0);
});

test('canceling import leaves all products and movements intact',async()=>{
  const h=adminHarness(),before=h.snapshot();h.context.confirm=()=>false;
  await h.importCSV('id,name,stock\nX,新商品,5');assert.deepEqual(h.snapshot(),before);
});

function frontHarness(){const h=harness(front,/renderTags\(\);renderProducts\(\);renderCart\(\);\s*$/);h.run('cart=[{id:"demo-001",qty:2},{id:"demo-002",qty:1},{id:"demo-003",qty:1}]');return h;}
test('successful clipboard copy includes totals, sold-out notice, inquiry-only price and note',async()=>{
  const h=frontHarness();let text;h.context.navigator.clipboard={writeText:async t=>{text=t}};h.element('orderNote').value='請確認背景';
  await h.element('copyOrder').onclick();
  assert.match(text,/公開價格小計：NT\$ 3,297/);assert.match(text,/目前已售罄/);assert.match(text,/私訊詢價/);assert.match(text,/備註：請確認背景/);assert.match(text,/不代表訂單成立/);assert.equal(h.element('manualCopy').hidden,true);
});
for(const mode of ['missing clipboard','denied clipboard','legacy copy throws'])test(`manual inquiry text remains selectable when ${mode}`,async()=>{
  const h=frontHarness();if(mode!=='missing clipboard')h.context.navigator.clipboard={writeText:async()=>{throw Error('denied')}};
  if(mode==='legacy copy throws')h.context.document.execCommand=()=>{throw Error('unsupported')};
  await h.element('copyOrder').onclick();assert.equal(h.element('manualCopy').hidden,false);assert.match(h.element('inquiryText').value,/Wu Jacky/);assert.match(h.element('copyHint').textContent,/長按全選/);assert.equal(h.element('inquiryText').selected,true);
  h.element('selectInquiry').onclick();assert.equal(h.element('inquiryText').selection[1],h.element('inquiryText').value.length);
  h.element('orderNote').input();assert.equal(h.element('manualCopy').hidden,true);assert.equal(h.element('inquiryText').value,'');
});
