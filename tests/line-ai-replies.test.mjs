import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { createLineHandler, createReply } from '../supabase/functions/line-ai-replies/worker.mjs';

const product = { id: 'example', name: '皮卡丘-倫敦', aliases: ['倫敦色背皮卡'], status: 'available', stock_quantity: 2, price: 100 };
const classify = async () => ({ intent: 'lookup', query: '倫敦色背皮卡' });

test('LINE reply uses public price, stock and link', async () => {
  const reply = await createReply('倫敦色背皮卡還有嗎', { classify, catalog: async () => [product] });
  assert.match(reply, /NT\$100｜庫存：2 帳/);
  assert.match(reply, /product=example/);
});

test('LINE reply asks which product or hands uncertain quantities to a person', async () => {
  const ambiguous = await createReply('查價', { classify, catalog: async () => [product, { ...product, id: 'other', name: '皮卡丘-倫敦（異色）' }] });
  assert.match(ambiguous, /哪一款/);
  assert.doesNotMatch(ambiguous, /NT\$/);
  const unknown = await createReply('查庫存', { classify, catalog: async () => [{ ...product, stock_quantity: null }] });
  assert.match(unknown, /數量請洽詢/);
  assert.match(unknown, /人工確認/);
});

test('payment inquiry bypasses AI and catalog', async () => {
  const unexpected = () => assert.fail('unexpected lookup');
  assert.match(await createReply('我已匯款', { classify: unexpected, catalog: unexpected }), /人工確認/);
});

test('LINE endpoint verifies signatures and replies only to pilot accounts', async () => {
  const tasks = [];
  const sent = [];
  const secret = 'local-test-secret';
  const handler = createLineHandler({
    secret, token: 'local-test-token', allowedUsers: new Set(['pilot']), classify,
    defer: task => tasks.push(task), catalog: async () => [product],
    fetcher: async (_url, options) => { sent.push(JSON.parse(options.body)); return new Response(); },
  });
  const event = { type: 'message', mode: 'active', source: { type: 'user', userId: 'pilot' }, message: { type: 'text', text: '查價' }, replyToken: 'pilot-reply' };
  const body = JSON.stringify({ events: [event, { ...event, source: { type: 'user', userId: 'other' } }, { ...event, deliveryContext: { isRedelivery: true } }] });
  const signature = createHmac('sha256', secret).update(body).digest('base64');
  const request = (content, sig) => new Request('https://example.test/', { method: 'POST', body: content, headers: { 'x-line-signature': sig } });
  assert.equal((await handler(request(body + ' ', signature))).status, 401);
  assert.equal((await handler(request(body, signature))).status, 200);
  await Promise.all(tasks);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].replyToken, 'pilot-reply');
  assert.match(sent[0].messages[0].text, /NT\$100/);
});
