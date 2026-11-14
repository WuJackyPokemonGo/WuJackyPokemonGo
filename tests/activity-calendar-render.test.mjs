import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderActivityFeed} from '../activity-feed-ui.mjs';

test('calendar events render alongside background events without remote eligibility fields',()=>{
 const previous=globalThis.document;
 class Element {
  children=[];
  dataset={};
  append(...children){this.children.push(...children)}
  replaceChildren(...children){this.children=[...children]}
  setAttribute(){}
 }
 globalThis.document={createElement:()=>new Element()};
 try{
  const host=new Element();
  const data=JSON.parse(readFileSync(new URL('../data/backgrounds.json',import.meta.url)));
  renderActivityFeed(host,data,{now:Date.parse('2026-11-05T04:00Z')});
  const nodes=[];
  const visit=node=>{nodes.push(node);for(const child of node.children??[])visit(child)};
  visit(host);
  const eventIds=nodes.map(node=>node.dataset?.eventId).filter(Boolean);
  assert.equal(eventIds.length,32);
  assert.ok(eventIds.includes('halloween-part-two-2026'));
  assert.ok(eventIds.includes('super-mega-raid-day-2026-11'));
 }finally{globalThis.document=previous}
});
