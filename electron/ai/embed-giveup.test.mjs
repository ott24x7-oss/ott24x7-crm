// A gateway that will not serve embeddings must stop being asked, whatever excuse it gives.
//
// The first attempt at this classified status codes: 400 and 404 were "permanent", the rest
// "transient". A live gateway then answered 503 on every embedding request, which read as
// "their side, try again shortly" - so it retried forever and the owner kept seeing the same
// red box on every incoming message.
import { test } from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function freshApp(status) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'giveup-'));
  let embedCalls = 0;
  global.fetch = async (url) => {
    if (/embed/i.test(String(url))) {
      embedCalls++;
      return { ok: false, status, text: async () => 'nope' };
    }
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Netflix is 199.' } }] }) };
  };
  // Fresh module instances so the strike counter does not leak between tests.
  delete require.cache[require.resolve('./index.js')];
  delete require.cache[require.resolve('./store.js')];
  delete require.cache[require.resolve('./provider.js')];
  const s2 = require('./store.js');
  const ai = require('./index.js');
  s2.init(dir);
  fs.writeFileSync(path.join(dir, 'ai-settings-a.json'), JSON.stringify({
    mode: 'always', provider: 'heyroute', baseUrl: 'https://heyroute.ai', apiKey: 'k',
    chatModel: 'gpt-5.6-luna', embedModel: 'some-embed-model', consentAccepted: true,
  }));
  fs.writeFileSync(path.join(dir, 'ai-knowledge-a.json'), JSON.stringify(
    Array.from({ length: 237 }, (_, i) => ({ id: 'k' + i, title: 'Note ' + i, body: 'Refunds in 24h. ' + i }))));
  const products = [{ title: 'Netflix Premium', price: '199', currency: 'INR', stock: true, category: 'OTT', url: 'https://x/n' }];
  const send = (text) => ai.generate({ accId: 'a', number: '9199', name: 'R', text, products, history: [] });
  return { ai, store: s2, dir, send, calls: () => embedCalls };
}

test('a gateway answering 503 forever is eventually left alone', async () => {
  const app = freshApp(503);
  for (let i = 0; i < 6; i++) await app.send('netflix ka price kya hai');
  assert.ok(app.calls() <= 3, `kept asking a dead endpoint: ${app.calls()} embed calls over 6 messages`);
  assert.strictEqual(app.store.getSettings('a').embedModel, '',
    '503 on every request is still a gateway that does not do embeddings');
});

test('a stated refusal is acted on immediately, not after three strikes', async () => {
  const app = freshApp(400);
  await app.send('netflix ka price kya hai');
  assert.strictEqual(app.store.getSettings('a').embedModel, '',
    '400 means the request itself is wrong — no reason to repeat it');
  assert.strictEqual(app.calls(), 1);
});

test('customers still get answered while all this happens', async () => {
  const app = freshApp(503);
  const out = await app.send('netflix ka price kya hai');
  assert.strictEqual(out.action, 'send', 'an embedding problem must never cost the customer a reply');
  assert.ok(out.confidence > 0.5, `keyword retrieval should still be confident, got ${out.confidence}`);
});

test('pressing Re-embed gives up on the first failure, not the third', async () => {
  const app = freshApp(503);
  const rows = app.store.getKnowledge('a');
  const r = await app.ai.embedRows('a', rows, 'knowledge');
  assert.strictEqual(r.ok, true, 'the owner asked directly — report it as handled, not as a red error');
  assert.strictEqual(r.disabled, true);
  assert.strictEqual(app.store.getSettings('a').embedModel, '');
});
