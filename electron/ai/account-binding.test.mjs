// Every step of an AI reply must act on the account the message ARRIVED on, never the tab
// the owner happens to be looking at. Getting this wrong sends one business's customer a
// reply out of a different business's WhatsApp — visible to the customer, and not
// something a log would obviously show.
//
// This reads the source rather than executing it: aiHandle is welded to the DOM, IPC and
// the webviews, and a test that stubs all three would mostly be testing the stubs. Reading
// the call sites catches the regression that actually happens here, which is someone
// adding a step and reaching for activeId out of habit.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'renderer', 'app.js'), 'utf8');

function fn(name) {
  const start = src.indexOf(`async function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} not found — this test is stale`);
  let depth = 0, end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  return src.slice(start, end);
}

test('aiHandle pins the account once, from the message', () => {
  const body = fn('aiHandle');
  assert.match(body, /const acc = msg\.accId \|\| activeId;/,
    'the account must be taken from the message that triggered this reply');
  assert.match(body, /if \(!acc\) return;/, 'no account means nothing safe to do');
});

test('aiHandle never reaches for the visible tab after that', () => {
  const body = fn('aiHandle');
  // Strip comments — they discuss activeId deliberately.
  const code = body.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const uses = [...code.matchAll(/activeId/g)];
  assert.strictEqual(uses.length, 1,
    `activeId should appear once (the fallback in "msg.accId || activeId"), found ${uses.length}`);
});

test('the send, state and log calls all take the pinned account', () => {
  const body = fn('aiHandle');
  for (const call of [
    /sendTextOn\(acc,/,          // the reply itself — wrong account = wrong sender
    /convoState\(acc,/,          // owner-takeover state is per account
    /markSent\(acc,/,            // the log must attribute to the right account
    /aiFetchChat\(number, 20, acc\)/, // history read from the right webview
    /accId: acc, number/,        // what the model is asked to answer
  ]) assert.match(body, call, `not bound to the arriving account: ${call}`);
});

test('every suggestion records the account that raised it', () => {
  const body = fn('aiHandle');
  const calls = [...body.matchAll(/aiAddSuggestion\(\{\s*([^,]+),/g)].map((m) => m[1].trim());
  assert.ok(calls.length >= 3, `expected the handover/suggest/send-failed paths, found ${calls.length}`);
  for (const first of calls) {
    assert.strictEqual(first, 'accId: acc',
      'a suggestion without its account sends from whichever tab is open when it is approved');
  }
});

test('approving a suggestion sends from the account it came in on', () => {
  assert.match(src, /sendTextOn\(sg\.accId \|\| activeId, sg\.number, t\)/,
    'Approve & send must use the suggestion\'s own account');
  assert.match(src, /markSent\(sg\.accId \|\| activeId, sg\.number/,
    'the sent-log must follow the same account');
});

test('aiFetchChat reads the account it is given', () => {
  const body = fn('aiFetchChat');
  assert.match(body, /waExecOn\(accId \|\| activeId, expr\)/,
    'reading history off the visible tab returns another account\'s conversation');
});
