// The daily status gate decides whether the 30-second popup appears, and what Deny,
// Dismiss and a failed send do afterwards. Lifted out of renderer/app.js so a change
// to those rules fails here instead of posting (or skipping) a customer's status.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'renderer', 'app.js'), 'utf8');

function extract(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} not found`);
  let depth = 0, end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  return new Function(`${src.slice(start, end)}; return ${name};`)();
}

const statusDayDecision = extract('statusDayDecision');
const statusPromptOutcome = extract('statusPromptOutcome');
const statusItemsToPost = extract('statusItemsToPost');

const today = '2026-09-24';
const pack = (over) => ({ auto: true, items: [{ kind: 'text', text: 'offer' }], lastDay: '', today, connected: true, ...over });

test('an empty pack never prompts', () => {
  assert.strictEqual(statusDayDecision(pack({ items: [] })), 'skip');
});

test('auto-post off never prompts', () => {
  assert.strictEqual(statusDayDecision(pack({ auto: false })), 'skip');
});

test('a day already posted or denied does not ask again', () => {
  assert.strictEqual(statusDayDecision(pack({ lastDay: today })), 'skip');
});

test('whatsapp still loading waits instead of prompting', () => {
  assert.strictEqual(statusDayDecision(pack({ connected: false })), 'wait');
});

test('a connected account with a pack prompts', () => {
  assert.strictEqual(statusDayDecision(pack()), 'prompt');
});

test('deny cancels the post and burns the day', () => {
  const o = statusPromptOutcome('deny');
  assert.strictEqual(o.post, false);
  assert.strictEqual(o.markDay, true);
  assert.strictEqual(o.result, 'denied');
});

test('dismiss hides the card and still posts when the timer ends', () => {
  const d = statusPromptOutcome('dismiss');
  assert.strictEqual(d.post, false);
  assert.strictEqual(d.markDay, false);
  assert.strictEqual(d.hide, true);
  const t = statusPromptOutcome('timeout');
  assert.strictEqual(t.post, true);
  assert.strictEqual(t.markDay, false);
});

test('a failed send does not mark the day done', () => {
  const o = statusPromptOutcome('fail');
  assert.strictEqual(o.markDay, false);
  assert.strictEqual(o.post, false);
});

test('a successful post is what marks the day', () => {
  const o = statusPromptOutcome('posted');
  assert.strictEqual(o.markDay, true);
  assert.strictEqual(o.result, 'posted');
});

test('the pack is the offer text plus every checked file', () => {
  const items = statusItemsToPost({
    text: 'Buy today',
    includeText: true,
    items: [
      { selected: true, data: 'data:image/png;base64,a', caption: '' },
      { selected: false, data: 'data:image/png;base64,b', caption: 'nope' },
      { selected: true, kind: 'video', data: 'data:video/mp4;base64,c', caption: 'clip' },
    ],
  });
  assert.deepStrictEqual(items.map((x) => x.kind), ['text', 'image', 'video']);
  assert.strictEqual(items[0].text, 'Buy today');
  assert.strictEqual(items[1].caption, 'Buy today');
  assert.strictEqual(items[2].caption, 'clip');
});

test('include-text off posts media only', () => {
  const items = statusItemsToPost({
    text: 'Buy today',
    includeText: false,
    items: [{ selected: true, data: 'data:image/png;base64,a' }],
  });
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].kind, 'image');
});
