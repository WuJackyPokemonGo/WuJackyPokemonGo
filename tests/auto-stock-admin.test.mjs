import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('product editor excludes automatic recent stock categories and preserves manual selections',()=>{
 const source=readFileSync(new URL('../cloud-admin.mjs',import.meta.url),'utf8');
 const fn=source.match(/function renderCategoryChecks\(p\)\{[^\n]+/)[0];
 const container={children:[],replaceChildren(){this.children=[]},append(child){this.children.push(child)}};
 const element=()=>({children:[],append(...children){this.children.push(...children)}});
 const context={categories:[{id:'old',name:'本月新庫存'},{id:'recent',name:'最近新庫存'},{id:'shiny',name:'色違'}],RECENT_STOCK_TAG:'最近新庫存',
 $:()=>container,node:element,document:{createElement:element,createTextNode:text=>text}};
 vm.runInNewContext(fn+";renderCategoryChecks({category_assignments:[{category_id:'recent'},{category_id:'shiny'}]})",context);
 assert.equal(container.children.length,1);
 assert.equal(container.children[0].children[0].value,'shiny');
 assert.equal(container.children[0].children[0].checked,true);
});
