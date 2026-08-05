// The night the hosting account lapsed, Railway's gateway JSON reached the verdict path
// and locked out every running customer in five minutes. These pin the difference between
// "the server answered" and "something answered".
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function fresh() {
  delete require.cache[require.resolve('./license.js')];
  return require('./license.js');
}

test('a gateway error page is a network failure, never a revocation', async () => {
  global.fetch = async () => ({
    status: 404,
    json: async () => ({ status: 'error', code: 404, message: 'Application not found' }),
  });
  const lic = fresh();
  const r = await lic.validate('OTT-TEST-KEY');
  assert.strictEqual(r.netFail, true, 'Railway noise must land in the offline-grace path');
  assert.strictEqual(r.valid, false, 'and the gate still stays shut on a fresh activation');
  assert.match(String(r.err || ''), /Application not found/);
});

test('a real signed-shaped verdict still passes through untouched', async () => {
  global.fetch = async () => ({
    status: 200,
    json: async () => ({ valid: false, reason: 'suspended' }),
  });
  const lic = fresh();
  const r = await lic.validate('OTT-TEST-KEY');
  assert.strictEqual(r.netFail, undefined, 'a genuine verdict is not network noise');
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.reason, 'suspended');
});

test('an HTML error page (json throws) also lands in the network path', async () => {
  global.fetch = async () => ({ status: 200, json: async () => { throw new Error('Unexpected token <'); } });
  const lic = fresh();
  const r = await lic.validate('OTT-TEST-KEY');
  assert.strictEqual(r.netFail, true);
});
