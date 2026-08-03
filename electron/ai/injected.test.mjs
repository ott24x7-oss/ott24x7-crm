// The scripts injected into the WhatsApp webview are built as template strings, so a
// mistake inside them is invisible to `node --check app.js` and only shows up as a feature
// that quietly does nothing in production. That is exactly how the message listener came to
// be missing: WPP.on threw, an empty catch hid it, and the init flag was already claimed.
//
// These tests extract each injected script, check it parses, and then run the listener
// installation against a fake WPP to prove it survives wa-js not being ready yet.
import { test } from 'node:test';
import assert from 'node:assert';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'renderer', 'app.js'), 'utf8');

// Pull the `const js = ` template out of a named function and resolve its ${} holes with
// harmless stand-ins, so what we parse matches the shape that actually gets injected.
function injectedScript(fnName) {
  const at = src.indexOf(`function ${fnName}(`);
  assert.notStrictEqual(at, -1, `${fnName} not found — this test is stale`);
  const open = src.indexOf('const js = `', at);
  assert.notStrictEqual(open, -1, `no injected template in ${fnName}`);
  const start = open + 'const js = `'.length;
  let end = start;
  while (end < src.length) {                       // find the unescaped closing backtick
    if (src[end] === '\\') { end += 2; continue; }
    if (src[end] === '`') break;
    end++;
  }
  // Interpolations must be replaced with something valid in the position they occupy — a
  // comment turns `x = ${cfg};` into `x = ;`. PH_RESOLVER defines the _ph helper the message
  // handler awaits, so it needs a real stand-in rather than a placeholder.
  const raw = src.slice(start, end)
    .replace(/\$\{PH_RESOLVER\}/g, 'async function _ph(id){return (id&&id.user)||"";}')
    .replace(/\$\{[^}]*\}/g, '(null)');
  // Let JS resolve the escapes exactly as it does when the template is evaluated — reading
  // the raw source would see \\/ where the running script has \/, and misjudge the regexes.
  // eslint-disable-next-line no-new-func
  return new Function('return `' + raw + '`')();
}

test('the lead + message-capture script parses', () => {
  const code = injectedScript('applyLeadButton');
  assert.doesNotThrow(() => new vm.Script(code), 'injected script is not valid JavaScript');
});

test('the group guard script parses', () => {
  const code = injectedScript('applyGuard');
  assert.doesNotThrow(() => new vm.Script(code), 'injected script is not valid JavaScript');
});

test('the message listener attaches once wa-js appears, not before', () => {
  const code = injectedScript('applyLeadButton');
  const listeners = [];
  // The script schedules more than one interval; keep them all rather than the last.
  const timers = [];
  const win = {
    document: { querySelector: () => null, getElementById: () => null, createElement: () => ({ style: {} }) },
    setInterval: (fn) => timers.push(fn),
    clearInterval: () => {},
    setTimeout: () => 1,
  };
  win.window = win;
  const ctx = vm.createContext(win);

  // First run: WhatsApp Web is still booting, exactly as it is when the engine is injected.
  ctx.WPP = undefined;
  new vm.Script(code).runInContext(ctx);
  assert.ok(!win.__ott_lead_init, 'must NOT claim success while WPP is missing — that is the bug');
  assert.ok(Array.isArray(win.__ott_inq), 'the queue should still exist');

  // wa-js finishes loading; the retry must pick it up.
  ctx.WPP = { on: (ev, fn) => listeners.push([ev, fn]) };
  assert.ok(timers.length, 'nothing scheduled a retry — a failed attach would be permanent');
  timers.forEach((fn) => fn());
  assert.strictEqual(listeners.length, 1, 'listener was never attached after WPP appeared');
  assert.strictEqual(listeners[0][0], 'chat.new_message');
  assert.ok(win.__ott_lead_init, 'flag should be set only now that the listener is real');
});

test('an incoming message lands on the queue the poll reads', () => {
  const code = injectedScript('applyLeadButton');
  const listeners = [];
  const win = {
    document: { querySelector: () => null, getElementById: () => null, createElement: () => ({ style: {} }) },
    setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 1,
  };
  win.window = win;
  const ctx = vm.createContext(win);
  ctx.WPP = { on: (ev, fn) => listeners.push([ev, fn]) };
  new vm.Script(code).runInContext(ctx);

  const [, onMsg] = listeners[0];
  onMsg({ from: { user: '919876543210', server: 'c.us', _serialized: '919876543210@c.us' },
          body: 'Netflix ka price kya h?', id: { _serialized: 'M1' }, notifyName: 'Anup' });

  return new Promise((r) => setImmediate(r)).then(() => {
    assert.strictEqual(win.__ott_inq.length, 1, 'the AI never sees a message that is not queued');
    assert.strictEqual(win.__ott_inq[0].body, 'Netflix ka price kya h?');
    assert.strictEqual(win.__ott_inq[0].msgId, 'M1');
    assert.strictEqual(win.__ott_inq[0].isGroup, false);
  });
});

test('the poll reports whether the listener is attached', () => {
  assert.match(src, /o\.hooked\s*=\s*!!window\.__ott_lead_init/,
    'without this a missing listener has no symptom anywhere');
  assert.match(src, /hookMap\[activeId\] === false/,
    'the panel must say so rather than showing a healthy assistant that sees nothing');
});
