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
    // Mirror the real resolver's behaviour: a phone comes back only for @c.us ids. For
    // @lid it returns '' (the engine lookup is absent in tests), which forces the scanner
    // down its fallback chain — exactly the path that must never end at lid digits.
    .replace(/\$\{PH_RESOLVER\}/g, 'async function _ph(id){return (id&&id.server==="c.us"&&id.user)||"";}')
    .replace(/\$\{[^}]*\}/g, '(null)');
  // Let JS resolve the escapes exactly as it does when the template is evaluated — reading
  // the raw source would see \\/ where the running script has \/, and misjudge the regexes.
  // eslint-disable-next-line no-new-func
  return new Function('return `' + raw + '`')();
}


// A fake getMessages as strict as the real one. The bundled engine does
// assertGetChat(firstArg) — hand it anything but a chat-id string and it throws. The
// scanner shipped broken precisely because the previous fake accepted any shape at all,
// so the test proved nothing about the call it existed to protect.
function strictGetMessages(byChat) {
  return async (chatId, opts) => {
    if (typeof chatId !== 'string' || !/@(c|g)\.us$/.test(chatId)) {
      throw new Error('chat not found');           // what assertGetChat does with an object
    }
    if (opts !== undefined && (typeof opts !== 'object' || Array.isArray(opts))) {
      throw new Error('bad options');
    }
    return byChat[chatId] || [];
  };
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

  // wa-js's script loads: WPP.on exists, but it is not wired into WhatsApp yet. Attaching
  // here registers a listener on an emitter nothing feeds - green everywhere, zero messages.
  ctx.WPP = { on: (ev, fn) => listeners.push([ev, fn]), isReady: false };
  timers.forEach((fn) => fn());
  assert.strictEqual(listeners.length, 0, 'must NOT attach before wa-js is wired in');
  assert.ok(!win.__ott_lead_init, 'and must not claim to be listening');

  // wa-js finishes wiring in.
  ctx.WPP.isReady = true;
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
  ctx.WPP = { on: (ev, fn) => listeners.push([ev, fn]), isReady: true };
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

// The event path is registered against a live engine and never fires in the wa-js build
// this app ships: a real customer message arrived five minutes after the listener attached
// and the counter stayed at zero. The scanner is what actually carries messages now, so it
// gets the same scrutiny — parsing is not evidence that it works.
test('the scanner finds a new message without any event firing', async () => {
  const code = injectedScript('applyLeadButton');
  const timers = [];
  const win = {
    document: { querySelector: () => null, getElementById: () => null, createElement: () => ({ style: {} }) },
    setInterval: (fn, ms) => timers.push({ fn, ms }),
    clearInterval: () => {}, setTimeout: () => 1,
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const now = Date.now();
  ctx.WPP = {
    isReady: true,
    on: () => {},                              // registered, but deliberately never fired
    chat: {
      list: async () => [{
        id: { _serialized: '64476619493615@lid' }, unreadCount: 1,
        contact: { name: 'Anup', phoneNumber: { user: '919876543210' } },
        msgs: { getModelsArray: () => [{
          id: { _serialized: 'false_64476619493615@lid_SCAN1', fromMe: false },
          body: 'Netflix ka price kya h?', t: Math.floor((now + 5000) / 1000),
          from: { user: '64476619493615', server: 'lid' }, notifyName: 'Anup',
        }] },
      }],
      getMessages: strictGetMessages({}),
    },
  };
  new vm.Script(code).runInContext(ctx);

  const scan = timers.find((t) => t.ms === 3000);
  assert.ok(scan, 'no scan interval was scheduled — the only working path is missing');
  await scan.fn();

  assert.strictEqual(win.__ott_inq.length, 1, 'a new unread message was not picked up by scanning');
  assert.strictEqual(win.__ott_inq[0].body, 'Netflix ka price kya h?');
  assert.strictEqual(win.__ott_inq[0].msgId, 'false_64476619493615@lid_SCAN1');
  assert.strictEqual(win.__ott_inq[0].isGroup, false);
  // The number must come from the contact record — never from the @lid digits, which are
  // WhatsApp's privacy identifier and would route the reply to a wrong number.
  assert.strictEqual(win.__ott_inq[0].number, '919876543210',
    `lid digits leaked through as a phone number: ${win.__ott_inq[0].number}`);

  await scan.fn();                             // a second pass must not re-queue it
  assert.strictEqual(win.__ott_inq.length, 1, 'the same message was queued twice');
});

test('the scanner ignores the backlog and the owner\'s own messages', async () => {
  const code = injectedScript('applyLeadButton');
  const timers = [];
  const win = {
    document: { querySelector: () => null, getElementById: () => null, createElement: () => ({ style: {} }) },
    setInterval: (fn, ms) => timers.push({ fn, ms }),
    clearInterval: () => {}, setTimeout: () => 1,
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const now = Date.now();
  ctx.WPP = {
    isReady: true, on: () => {},
    chat: {
      list: async () => [{
        id: { _serialized: '919876543210@c.us' }, unreadCount: 3,
        msgs: { getModelsArray: () => [
          { id: { _serialized: 'OLD', fromMe: false }, body: 'sitting unread since this morning',
            t: Math.floor((now - 3600000) / 1000), from: { user: '919876543210', server: 'c.us' } },
          { id: { _serialized: 'MINE', fromMe: true }, body: 'my own reply',
            t: Math.floor((now + 5000) / 1000), from: { user: '919876543210', server: 'c.us' } },
        ] },
      }],
      getMessages: strictGetMessages({}),
    },
  };
  new vm.Script(code).runInContext(ctx);
  await timers.find((t) => t.ms === 3000).fn();
  assert.strictEqual(win.__ott_inq.length, 0,
    'answering a backlog on startup, or replying to the owner, would both be worse than silence');
});

// getMessages returns raw MODELS in this engine, and on a model fromMe lives on the
// MsgKey (m.id.fromMe), not at the top level. The engine's own serializer reads it from
// there. A scanner that checks only m.fromMe answers the owner's own outbound messages.
test('owner messages are skipped even when fromMe only exists on the key', async () => {
  const code = injectedScript('applyLeadButton');
  const timers = [];
  const win = {
    document: { querySelector: () => null, getElementById: () => null, createElement: () => ({ style: {} }) },
    setInterval: (fn, ms) => timers.push({ fn, ms }),
    clearInterval: () => {}, setTimeout: () => 1,
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const now = Date.now();
  ctx.WPP = {
    isReady: true, on: () => {},
    chat: {
      list: async () => [{
        id: { _serialized: '919876543210@c.us' }, unreadCount: 1,
        msgs: { getModelsArray: () => [
          // Model shape: no top-level fromMe anywhere.
          { id: { _serialized: 'true_919876543210@c.us_AAA', fromMe: true }, body: 'reply I typed myself',
            t: Math.floor((now + 4000) / 1000), from: { user: '919876543210', server: 'c.us' } },
          { id: { _serialized: 'false_919876543210@c.us_BBB', fromMe: false }, body: 'customer question',
            t: Math.floor((now + 5000) / 1000), from: { user: '919876543210', server: 'c.us' }, notifyName: 'Anup' },
        ] },
      }],
      getMessages: strictGetMessages({}),
    },
  };
  new vm.Script(code).runInContext(ctx);
  await timers.find((t) => t.ms === 3000).fn();
  assert.strictEqual(win.__ott_inq.length, 1, 'exactly the customer message, never the owner\'s own');
  assert.strictEqual(win.__ott_inq[0].body, 'customer question');
});
