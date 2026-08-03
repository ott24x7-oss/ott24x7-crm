// aiOnIncoming is the last gate before a message reaches the assistant. Anything it drops
// disappears with no record at all — generate() is never called, so there is no skip log
// either, and the Logs screen shows "No AI activity yet" with nothing to explain it.
//
// That is exactly what a customer saw: four messages sent, zero handled, zero errors.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'renderer', 'app.js'), 'utf8');

function extract(name, env) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} not found — this test is stale`);
  let depth = 0, end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  const names = Object.keys(env);
  // eslint-disable-next-line no-new-func
  return new Function(...names, `${src.slice(start, end)}; return ${name};`)(...names.map((n) => env[n]));
}

function harness(cache) {
  const queued = [];
  let initCalls = 0;
  const env = {
    window: { ott: {} },
    ott: { ai: {} },
    aiSettingsCache: cache,
    aiQueue: queued,
    aiDrain: () => {},
    aiInit: () => { initCalls++; },
  };
  return { queued, fn: extract('aiOnIncoming', env), initCalls: () => initCalls };
}

const msg = { number: '919876543210', body: 'Netflix ka price kya h?', msgId: 'M1' };

test('a message is not thrown away just because settings have not loaded', () => {
  const h = harness(null);
  h.fn(msg);
  assert.strictEqual(h.queued.length, 1,
    'dropping here loses the message with no log, no skip, no error — the exact reported symptom');
});

test('an empty cache triggers a reload rather than being ignored forever', () => {
  const h = harness(null);
  h.fn(msg);
  assert.strictEqual(h.initCalls(), 1, 'nothing else retries aiInit; without this it stays empty all session');
});

test('a genuinely disabled assistant still stops here', () => {
  const h = harness({ mode: 'off' });
  h.fn(msg);
  assert.strictEqual(h.queued.length, 0, 'mode off must not queue work');
});

test('the normal case is unchanged', () => {
  const h = harness({ mode: 'always' });
  h.fn(msg);
  assert.strictEqual(h.queued.length, 1);
  assert.strictEqual(h.initCalls(), 0, 'a healthy cache should not re-read settings on every message');
});

test('messages with no text are still ignored', () => {
  const h = harness({ mode: 'always' });
  h.fn({ number: '9199', body: '', msgId: 'M2' });
  assert.strictEqual(h.queued.length, 0, 'reactions and media with no caption are not questions');
});
