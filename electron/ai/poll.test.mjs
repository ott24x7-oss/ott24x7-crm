// The poll loop is what turns an incoming WhatsApp message into an AI reply. It had three
// faults that all present identically to the owner: the assistant simply never speaks.
//
// Rather than boot Electron, this lifts the real pollTick body out of renderer/app.js and
// runs it against fake webviews. If the source changes shape the extraction fails loudly,
// which is the point — a test that silently stops covering the code is worse than none.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'renderer', 'app.js'), 'utf8');

function pollTickFrom(src, env) {
  const start = src.indexOf('async function pollTick()');
  assert.notStrictEqual(start, -1, 'pollTick not found — the extraction below is stale');
  // Walk braces to the end of the function so the test always runs the current body.
  let depth = 0, i = src.indexOf('{', start), end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  const body = src.slice(start, end);
  const names = Object.keys(env);
  // eslint-disable-next-line no-new-func
  return new Function(...names, `${body}; return pollTick;`)(...names.map((n) => env[n]));
}

const wv = (acc, injected, info) => ({
  dataset: { acc, injected: injected ? '1' : '' },
  executeJavaScript: async () => info,
});

const emptyInfo = (over) => ({ s: 'connected', leads: [], incoming: [], cmds: [], acts: [], ...over });

// Overrides must be applied before the function is built — it closes over these by value.
function harness(webviews, overrides = {}) {
  const seen = [];
  const env = {
    document: { querySelectorAll: () => webviews, hidden: false },
    statusMap: {},
    POLL_EXPR: '',
    saveLead: () => {},
    markRepliedLeads: () => {},
    aiOnIncoming: (m) => seen.push(m),
    processInvoiceCommand: () => {},
    handleChatAction: async () => {},
    renderTabs: () => {},
    activeId: 'accA',
    _pollBusy: false,
    ...overrides,
  };
  return { seen, env, tick: pollTickFrom(src, env) };
}

test('a message on a background account still reaches the AI', async () => {
  const { seen, tick } = harness([
    wv('accA', true, emptyInfo()),
    wv('accB', true, emptyInfo({ incoming: [{ number: '9199', body: 'netflix price?', msgId: 'm1' }] })),
  ]);
  await tick();
  assert.strictEqual(seen.length, 1, 'the non-visible account was not drained');
  assert.strictEqual(seen[0].body, 'netflix price?');
});

test('each message carries the account it arrived on', async () => {
  const { seen, tick } = harness([
    wv('accA', true, emptyInfo({ incoming: [{ number: '111', body: 'hi', msgId: 'a' }] })),
    wv('accB', true, emptyInfo({ incoming: [{ number: '222', body: 'hello', msgId: 'b' }] })),
  ]);
  await tick();
  assert.deepStrictEqual(seen.map((m) => m.accId).sort(), ['accA', 'accB'],
    'without accId a reply is drafted from whichever tab happens to be open');
});

test('a hidden window keeps polling', async () => {
  const { seen, env, tick } = harness([
    wv('accA', true, emptyInfo({ incoming: [{ number: '111', body: 'still there?', msgId: 'a' }] })),
  ]);
  env.document.hidden = true;   // minimised
  await tick();
  assert.strictEqual(seen.length, 1, 'minimising the window stopped the 24x7 assistant');
});

test('accounts that have not injected yet are skipped, not fatal', async () => {
  const { seen, tick } = harness([
    wv('accA', false, emptyInfo({ incoming: [{ number: '111', body: 'too early', msgId: 'a' }] })),
    wv('accB', true, emptyInfo({ incoming: [{ number: '222', body: 'ready', msgId: 'b' }] })),
  ]);
  await tick();
  assert.deepStrictEqual(seen.map((m) => m.body), ['ready']);
});

test('one account throwing does not stop the others', async () => {
  const bad = wv('accA', true, null);
  bad.executeJavaScript = async () => { throw new Error('webview gone'); };
  const { seen, tick } = harness([
    bad,
    wv('accB', true, emptyInfo({ incoming: [{ number: '222', body: 'survives', msgId: 'b' }] })),
  ]);
  await tick();
  assert.deepStrictEqual(seen.map((m) => m.body), ['survives']);
});

test('tabs redraw only when a status actually changes', async () => {
  let redraws = 0;
  const views = [wv('accA', true, emptyInfo({ s: 'connected' }))];
  const { tick } = harness(views, { renderTabs: () => { redraws++; } });
  await tick();
  assert.strictEqual(redraws, 1, 'first observation should paint');
  await tick();
  assert.strictEqual(redraws, 1, 'unchanged status must not repaint');
  views[0].executeJavaScript = async () => emptyInfo({ s: 'qr' });
  await tick();
  assert.strictEqual(redraws, 2, 'a real change must repaint');
});
