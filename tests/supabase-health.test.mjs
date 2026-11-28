import test from 'node:test';
import assert from 'node:assert/strict';
import {classify,probe} from '../scripts/supabase-health.mjs';
const reply=(status,body='')=>async()=>new Response(body,{status});
test('a 2xx catalog answer is healthy',async()=>{assert.equal((await probe(reply(200,'[]'))).state,'ok')});
test('quota restriction is recognised from 402 or the error code and names the quota',async()=>{const r=await probe(reply(402,'{"code":"exceed_cached_egress_quota"}'));assert.equal(r.state,'quota');assert.match(r.summary,/exceed_cached_egress_quota/);assert.equal(classify(429,'exceed_egress_quota').state,'quota')});
test('server errors and network failures are reported as down, never as healthy',async()=>{assert.equal((await probe(reply(503))).state,'down');assert.equal((await probe(async()=>{throw Error('offline')})).state,'down')});
test('the probe asks for a single catalog row to keep its own traffic negligible',async()=>{let body;await probe(async(_,o)=>{body=JSON.parse(o.body);return new Response('[]',{status:200})});assert.deepEqual(body,{p_offset:0,p_limit:1})});
