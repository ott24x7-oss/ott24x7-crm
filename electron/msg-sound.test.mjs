// Message sound is on only when both switches allow it, and a voice note is not a chime.
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

const msgSoundOn = extract('msgSoundOn');
const isNotifyChime = extract('isNotifyChime');

test('both switches on means the message chime may play', () => {
  assert.strictEqual(msgSoundOn(true, true), true);
  assert.strictEqual(msgSoundOn(true, undefined), true);
});

test('the CRM mute wins', () => {
  assert.strictEqual(msgSoundOn(false, true), false);
});

test('WhatsApp notification sound off wins', () => {
  assert.strictEqual(msgSoundOn(true, false), false);
});

test('a voice note inside a chat is not the notification chime', () => {
  assert.strictEqual(isNotifyChime({ inChat: true, src: 'blob:ptt', duration: 12 }), false);
  assert.strictEqual(isNotifyChime({ src: 'https://web.whatsapp.com/ptt/opus', duration: 1 }), false);
});

test('a short hidden clip is the notification chime', () => {
  assert.strictEqual(isNotifyChime({ src: 'blob:abc', duration: 0.4 }), true);
  assert.strictEqual(isNotifyChime({ controls: true, duration: 0.4 }), false);
  assert.strictEqual(isNotifyChime({ duration: 20 }), false);
});

test('the injected guard is valid JavaScript', () => {
  const start = src.indexOf('function applyMsgSound(');
  let depth = 0, end = -1, q = '';
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { end = i + 1; break; }
  }
  const store = { get: () => true };
  let script = '';
  const apply = new Function('store', `${src.slice(start, end)}; return applyMsgSound;`)(store);
  apply({ executeJavaScript: (s) => { script = s; return Promise.resolve(); } });
  assert.ok(script.includes('opts.silent=true'));
  assert.ok(script.includes('__ott_msg_sound=true'));
  new Function(script);
});
