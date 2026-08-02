// Drives the renderer's AI pipeline with a stubbed main process, so the decision path from
// "message arrives" to "sent / suggested / handed over" is exercised without Ollama.
// This is the layer where a wrong decision reaches a real customer.
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync('C:/Users/D K/ott24x7-crm/renderer/app.js', 'utf8');
const from = src.indexOf('// ================= AI Sales Assistant (renderer) =================');
const to = src.indexOf('// ---------- panel ----------');
const block = src.slice(from, to);   // runtime only; the panel needs a real DOM

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };

function harness({ generate, sendOk = true, settings = { mode: 'suggest' } }) {
  const sent = [];
  const marked = [];
  const convo = { takenOver: false };
  const db = { ott_quick: [{ title: 'Netflix 1 Month', sell: 250 }], ott_leads: [], ott_deals: [] };

  const ctx = vm.createContext({
    console, JSON, Math, Number, String, Object, Array, Promise, Date, setTimeout, clearTimeout,
    window: { addEventListener() {} },
    document: { querySelector: () => null },
    Notification: class {},
    activeId: 'accA',
    openFeatureId: null,
    refreshPanel: () => {},
    toast: () => {},
    digits: (s) => String(s).replace(/\D/g, ''),
    deriveTitle: (t) => String(t || '').slice(0, 20),
    dealDate: (ms) => new Date(ms).toDateString(),
    el: () => ({}),
    lbl: () => ({}), chk: () => ({}), chkRow: () => ({}),
    RENDER: {},
    store: {
      get: (k, d) => (k in db ? JSON.parse(JSON.stringify(db[k])) : d),
      set: (k, v) => { db[k] = JSON.parse(JSON.stringify(v)); return true; },
    },
    sendTextOn: async (acc, num, text) => { sent.push({ num, text }); return { ok: sendOk }; },
    ott: {
      ai: {
        getSettings: async () => ({ settings }),
        generate,
        convoState: async () => ({ state: convo }),
        setConvoState: async (a, n, p) => { Object.assign(convo, p); return { state: convo }; },
        markSent: async (a, n, id, t) => { marked.push({ n, id, t }); return { ok: true }; },
        updateLog: async () => ({ ok: true }),
        saveKnowledgeRow: async () => ({ ok: true }),
      },
    },
  });
  ctx.globalThis = ctx;
  vm.runInContext(block + '\n;globalThis.T={aiOnIncoming,aiHandle,aiInit,aiProducts,aiCustomer};', ctx);
  return { ctx, T: ctx.T, sent, marked, convo, db };
}

const MSG = { number: '919812345678', body: 'price kya hai?', msgId: 'm1', name: 'Ravi' };

console.log('AI pipeline (renderer)');

// 1. Live catalog facts are read from the CRM, not from the model.
{
  const h = harness({ generate: async () => ({ ok: true, action: 'skip' }) });
  const p = h.T.aiProducts();
  ok(p.length === 1 && p[0].price === 250 && p[0].stock === true,
    `catalog read live (${JSON.stringify(p)})`);
}

// 2. A suggestion is stored for review, never sent.
{
  const h = harness({ generate: async () => ({ ok: true, action: 'suggest', text: 'It is ₹250.', confidence: 0.5, sources: [], logId: 'L1' }) });
  await h.T.aiHandle(MSG);
  ok(h.sent.length === 0, 'a suggestion sends nothing');
  ok((h.db.ott_ai_suggestions || []).length === 1, 'suggestion stored for the owner');
}

// 3. A confident reply goes out and is counted.
{
  const h = harness({ generate: async () => ({ ok: true, action: 'send', text: 'It is ₹250.', confidence: 0.9, delayMs: 0, logId: 'L2' }) });
  await h.T.aiHandle(MSG);
  ok(h.sent.length === 1 && h.sent[0].text === 'It is ₹250.', 'confident reply is sent');
  ok(h.marked.length === 1 && h.marked[0].id === 'L2', 'send is recorded against its log');
}

// 4. Owner taking over during the delay cancels the send. This is the race that would
//    otherwise have the assistant talk over the owner mid-conversation.
{
  const h = harness({ generate: async () => ({ ok: true, action: 'send', text: 'hi', confidence: 0.9, delayMs: 30, logId: 'L3' }) });
  const p = h.T.aiHandle(MSG);
  h.convo.takenOver = true;                 // owner opens the chat while we wait
  await p;
  ok(h.sent.length === 0, 'takeover during the delay cancels the send');
}

// 5. A failed send degrades to a suggestion rather than vanishing.
{
  const h = harness({ sendOk: false, generate: async () => ({ ok: true, action: 'send', text: 'hi', confidence: 0.9, delayMs: 0, logId: 'L4' }) });
  await h.T.aiHandle(MSG);
  ok((h.db.ott_ai_suggestions || []).length === 1, 'failed send becomes a suggestion');
  ok(h.marked.length === 0, 'a failed send is not counted as sent');
}

// 6. Handover produces a card with no draft to send.
{
  const h = harness({ generate: async () => ({ ok: true, action: 'handover', reason: 'refund_dispute', logId: 'L5' }) });
  await h.T.aiHandle(MSG);
  const s = (h.db.ott_ai_suggestions || [])[0];
  ok(s && s.handover === true && !s.text, 'handover card has no draft reply');
  ok(h.sent.length === 0, 'handover sends nothing');
}

// 7. Skip decisions leave no trace.
{
  const h = harness({ generate: async () => ({ ok: true, action: 'skip', reason: 'group' }) });
  await h.T.aiHandle(MSG);
  ok(!(h.db.ott_ai_suggestions || []).length && !h.sent.length, 'a skipped message does nothing');
}

// 8. The queue never runs when the assistant is off, so no IPC is spent per message.
{
  let called = 0;
  const h = harness({ settings: { mode: 'off' }, generate: async () => { called++; return { ok: true, action: 'skip' }; } });
  await h.T.aiInit();
  h.T.aiOnIncoming(MSG);
  await new Promise((r) => setTimeout(r, 20));
  ok(called === 0, 'nothing is generated while the assistant is off');
}

// 9. A message with no body is ignored (media, reactions, system events).
{
  let called = 0;
  const h = harness({ generate: async () => { called++; return { ok: true, action: 'skip' }; } });
  await h.T.aiInit();
  h.T.aiOnIncoming({ number: '919812345678', body: '', msgId: 'm2' });
  await new Promise((r) => setTimeout(r, 20));
  ok(called === 0, 'a message with no text is ignored');
}

console.log(fail ? `\n  ${fail} failing` : '\n  all passing');
process.exit(fail ? 1 : 0);
