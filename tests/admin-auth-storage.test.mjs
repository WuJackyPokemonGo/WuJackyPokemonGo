import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthStorage} from '../admin-auth-storage.mjs';
const store=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
test('remembered login survives a new tab and logout clears both stores',()=>{
 const disk=store(),tab=store();const first=createAuthStorage(disk,tab,()=>true);
 first.setItem('auth','session');assert.equal(tab.getItem('auth'),null);
 const reopened=createAuthStorage(disk,store(),()=>true);assert.equal(reopened.getItem('auth'),'session');
 reopened.removeItem('auth');assert.equal(first.getItem('auth'),null);
});
test('unchecked login stays in this tab and removes older remembered login',()=>{
 const disk=store(),tab=store();disk.setItem('auth','old');
 const current=createAuthStorage(disk,tab,()=>false);current.setItem('auth','new');
 assert.equal(disk.getItem('auth'),null);assert.equal(current.getItem('auth'),'new');
 assert.equal(createAuthStorage(disk,store(),()=>false).getItem('auth'),null);
 current.removeItem('auth');assert.equal(tab.getItem('auth'),null);
});
