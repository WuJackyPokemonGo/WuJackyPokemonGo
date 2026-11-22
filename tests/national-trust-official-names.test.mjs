import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {backgroundMatch} from '../backgrounds-service.mjs';

const data=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url),'utf8'));
const byId=id=>data.records.find(r=>r.background_id===id);
const RENAMED={'BG-0164':['Belton House','Belton Estate'],'BG-0166':['Chirk','Chirk Castle and Garden'],'BG-0170':['Fountains Abbey Estate','Fountains Abbey'],'BG-0172':['Hanbury','Hanbury Hall'],
 'BG-0177':['Lyme Park','Lyme'],'BG-0181':['Polesden','Polesden Lacey'],'BG-0184':['Stowe Garden Park','Stowe Gardens'],'BG-0188':['Wimpole','Wimpole Estate']};

test('英國國民信託：名稱改成官方名稱，中文只換「－」後面的英文',()=>{
 for(const [id,[,name]] of Object.entries(RENAMED)){const r=byId(id);
  assert.equal(r.name_en,'National Trust '+name,id);assert.equal(r.name_zh,'英國國民信託－'+name,id);
  assert.equal(r.start_date,'2026-07-18',id);assert.equal(r.end_date,'2026-12-31',id)}
});

test('舊名稱仍搜得到同一筆（沿用 search_aliases）',()=>{
 for(const [id,[old,name]] of Object.entries(RENAMED)){const r=byId(id);
  for(const q of [old,'National Trust '+old,'英國國民信託－'+old,name])assert.ok(backgroundMatch(r,q),`${id} 搜尋「${q}」`)}
});

test('reference_ids 只新增不刪除，Dittobase 原拼法保留',()=>{
 assert.deepEqual(byId('BG-0171').reference_ids,['national_trust_gibslide','nationaltrustgibside','national_trust_gibside']);
 assert.deepEqual(byId('BG-0188').reference_ids,['national_trust_whimpole','nationaltrustwhimpole','national_trust_wimpole','nationaltrustwimpole']);
});

test('分享頁由產生器重建，顯示新名稱',()=>{
 for(const [id,[,name]] of Object.entries(RENAMED)){const html=readFileSync(new URL(`../bg/${id}.html`,import.meta.url),'utf8');assert.ok(html.includes(name),id)}
});
