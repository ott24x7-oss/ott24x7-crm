// Tests for the AI assistant's safety-critical logic. Run with: node electron/ai/ai.test.js
//
// These cover the paths where a mistake reaches a paying customer: quoting a price that is
// not real, promising stock that is gone, replying after the owner took over, answering a
// refund dispute, or answering the same message twice.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const rag = require('./rag');
const store = require('./store');
const { ownerAvailability, generate } = require('./index');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wacrm-ai-test-'));
store.init(dir);

let pass = 0, fail = 0;
// A harness that does not await an async test prints PASS before the assertions have run,
// and the process.exit at the bottom then kills them entirely - green with zero coverage.
// A returned promise is tracked, and the summary waits for every one.
const _pending = [];
function t(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      _pending.push(r
        .then(() => { console.log(`  PASS  ${name}`); pass++; })
        .catch((e) => { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }));
      return;
    }
    console.log(`  PASS  ${name}`); pass++;
  }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

const S = { ...store.DEFAULT_SETTINGS };
const PRODUCTS = [
  { title: 'Netflix 1 Month', price: 250, stock: true },
  { title: 'Prime 1 Year', price: 999, stock: false },
];

console.log('AI assistant');

// ---- price validation: the single most damaging failure ----
t('accepts a price that matches the catalog', () => {
  const v = rag.validate('Netflix 1 Month is ₹250.', { settings: S, products: PRODUCTS });
  assert.ok(v.ok, v.problems.join('; '));
});
t('rejects an invented price', () => {
  const v = rag.validate('I can do it for ₹199 today.', { settings: S, products: PRODUCTS });
  assert.ok(!v.ok);
  assert.match(v.problems.join(' '), /not a current price/);
});
t('rejects a price written as Rs with a comma', () => {
  const v = rag.validate('Total Rs 1,499 only.', { settings: S, products: PRODUCTS });
  assert.ok(!v.ok, 'a stale/invented price must never pass');
});

// ---- stock ----
t('rejects promising an out-of-stock product', () => {
  const v = rag.validate('Prime 1 Year is available, I will ship today.', { settings: S, products: PRODUCTS });
  assert.match(v.problems.join(' '), /out of stock/);
});

// ---- claims the assistant may never make ----
t('rejects confirming a payment', () => {
  assert.ok(!rag.validate('Payment received, thank you!', { settings: S, products: PRODUCTS }).ok);
});
t('rejects approving a refund', () => {
  assert.ok(!rag.validate('Your refund is approved.', { settings: S, products: PRODUCTS }).ok);
});
t('rejects inventing a discount', () => {
  assert.ok(!rag.validate('I can give you 20% off.', { settings: S, products: PRODUCTS }).ok);
});
t('rejects a leaked system prompt', () => {
  assert.ok(!rag.validate('HARD RULES: use only the facts given', { settings: S, products: PRODUCTS }).ok);
});
t('rejects revealing itself as an AI', () => {
  assert.ok(!rag.validate('As an AI, I cannot do that.', { settings: S, products: PRODUCTS }).ok);
});
t('rejects an over-long reply', () => {
  assert.ok(!rag.validate('x'.repeat(S.maxResponseChars + 1), { settings: S, products: PRODUCTS }).ok);
});

// ---- forced handover ----
for (const [msg, label] of [
  ['I want a refund now', 'refund'],
  ['I paid but payment not received', 'payment problem'],
  ['give me best price discount', 'discount'],
  ['this is a fraud, worst service', 'angry'],
  ['I will go to consumer court', 'legal'],
]) {
  t(`hands over: ${label}`, () => assert.ok(rag.forcedHandover(msg, S), `"${msg}" must reach a human`));
}
t('does not hand over a plain product question', () => {
  assert.strictEqual(rag.forcedHandover('Netflix ka price kya hai?', S), null);
});

// ---- language ----
t('detects Hindi', () => assert.strictEqual(rag.detectLanguage('नमस्ते, कीमत क्या है'), 'hi'));
t('detects Hinglish', () => assert.strictEqual(rag.detectLanguage('bhai price kitna hai'), 'hinglish'));
t('detects English', () => assert.strictEqual(rag.detectLanguage('what is the price'), 'en'));

// ---- redaction before storing a real chat ----
t('redacts phone, email, UPI and card from an example', () => {
  const out = rag.redact('call 9812345678 or a@b.com, upi ravi@okaxis, card 4111 1111 1111 1111');
  assert.ok(!/9812345678|a@b\.com|okaxis|4111/.test(out), out);
});

// ---- confidence ----
// Calibrated against real nomic-embed-text output, measured on this machine: unrelated
// sales text still scores ~0.40 cosine and a genuinely good match lands ~0.75. Normalising
// from zero made noise look like half a match, and a mediocre 0.57 hit auto-sent.
t('a noise-level match does not clear the auto-send bar', () => {
  const c = rag.confidence({ hits: [{ score: 0.41 }], exampleHits: [], intent: { confidence: 0.8 },
    validation: { ok: true }, historyTurns: 2, hasProducts: true });
  assert.ok(c < S.minConfidence, `noise scored ${c}, must stay below ${S.minConfidence}`);
});
t('a strong match does clear it', () => {
  const c = rag.confidence({ hits: [{ score: 0.75 }, { score: 0.6 }], exampleHits: [{ score: 0.6 }],
    intent: { confidence: 0.8 }, validation: { ok: true }, historyTurns: 4, hasProducts: true });
  assert.ok(c >= S.minConfidence, `strong match scored ${c}, must reach ${S.minConfidence}`);
});
t('failed validation zeroes the score outright', () => {
  const c = rag.confidence({ hits: [{ score: 0.9 }], exampleHits: [], intent: { confidence: 0.9 },
    validation: { ok: false }, historyTurns: 4, hasProducts: true });
  assert.strictEqual(c, 0, 'a reply that failed validation must never carry confidence');
});
t('retrieval floor sits above the measured noise level', () => {
  const rows = [{ id: 'n', active: true, approved: true, vec: [1, 0] }];
  // 0.42 cosine — the kind of score unrelated text produces. Must not be retrieved.
  const q = [Math.cos(1.137), Math.sin(1.137)];   // ~0.42 against [1,0]
  assert.strictEqual(rag.search(q, rows).length, 0, 'noise-level matches must not be retrieved');
});
t('delivery questions are not misread as price questions', () => {
  // "kitne din" (how many days) was caught by the bare "kitne" in the price pattern.
  assert.strictEqual(rag.detectIntent('delivery kitne din me hoga?').intent, 'delivery');
  assert.strictEqual(rag.detectIntent('kab tak milega').intent, 'delivery');
  assert.strictEqual(rag.detectIntent('price kitna hai').intent, 'price');
});

t('confidence rises with a good match and falls when validation fails', () => {
  const good = rag.confidence({ hits: [{ score: 0.8 }], exampleHits: [{ score: 0.7 }], intent: { confidence: 0.8 }, validation: { ok: true }, historyTurns: 4, hasProducts: true });
  const bad = rag.confidence({ hits: [], exampleHits: [], intent: { confidence: 0.4 }, validation: { ok: false }, historyTurns: 0, hasProducts: false });
  assert.ok(good > 0.8, `good=${good}`);
  assert.ok(bad < 0.2, `bad=${bad}`);
});

// ---- vector search ----
t('search ignores inactive and unapproved knowledge', () => {
  const rows = [
    { id: 'a', active: true, approved: true, vec: [1, 0] },
    { id: 'b', active: false, approved: true, vec: [1, 0] },
    { id: 'c', active: true, approved: false, vec: [1, 0] },
  ];
  const hits = rag.search([1, 0], rows, { minScore: 0.1 });
  assert.deepStrictEqual(hits.map((h) => h.row.id), ['a']);
});

// ---- owner availability ----
t('owner is away after the idle timeout', () => {
  const r = ownerAvailability({ ...S, ownerIdleMinutes: 10 }, { lastActivityAt: Date.now() - 20 * 60000 });
  assert.strictEqual(r.online, false);
});
t('owner is present while active', () => {
  assert.strictEqual(ownerAvailability(S, { lastActivityAt: Date.now() }).online, true);
});
t('a global pause counts as the owner being present', () => {
  assert.strictEqual(ownerAvailability({ ...S, paused: true }, { lastActivityAt: 0 }).online, true);
});
t('manual away wins over recent activity', () => {
  assert.strictEqual(ownerAvailability({ ...S, ownerManualStatus: 'offline' }, { lastActivityAt: Date.now() }).online, false);
});
t('outside business hours counts as away', () => {
  const now = new Date(); now.setHours(3, 0, 0, 0);
  const r = ownerAvailability({ ...S, workingHours: { enabled: true, start: '10:00', end: '20:00', days: [0, 1, 2, 3, 4, 5, 6] } },
    { lastActivityAt: now.getTime(), now: now.getTime() });
  assert.strictEqual(r.online, false);
});

// ---- tenant isolation + conversation state ----
t('accounts do not share knowledge', () => {
  store.saveKnowledge('accA', [{ id: 'k1', title: 'A only', body: 'x' }]);
  store.saveKnowledge('accB', [{ id: 'k2', title: 'B only', body: 'y' }]);
  assert.strictEqual(store.getKnowledge('accA').length, 1);
  assert.strictEqual(store.getKnowledge('accA')[0].title, 'A only');
  assert.strictEqual(store.getKnowledge('accB')[0].title, 'B only');
});
t('refuses to store unscoped data', () => {
  // Must fail closed: no write, no shared file, and nothing readable back. It reports
  // false rather than throwing, so a missing account id can never pool one customer's
  // knowledge into another's.
  assert.strictEqual(store.saveKnowledge('', [{ id: 'x', title: 'leak' }]), false);
  assert.deepStrictEqual(store.getKnowledge(''), []);
  assert.ok(!fs.readdirSync(dir).some((f) => /^ai-knowledge--?\.json$/.test(f)), 'wrote an unscoped file');
});
t('conversation reply count and takeover persist', () => {
  store.setConvo('accA', '919812345678', { replies: 2, takenOver: true });
  const c = store.convo('accA', '919812345678');
  assert.strictEqual(c.replies, 2);
  assert.strictEqual(c.takenOver, true);
});
t('purge removes learned data but keeps settings', () => {
  store.saveSettings('accA', { mode: 'suggest' });
  store.purge('accA');
  assert.strictEqual(store.getKnowledge('accA').length, 0);
  assert.strictEqual(store.getSettings('accA').mode, 'suggest');
});

// ---- defaults ----
// The panel showed "Ready qwen3:4b" while every reply failed with "model not installed",
// because "qwen3.5:latest".startsWith("qwen3") is true. The one screen meant to catch this
// confirmed all was well. Readiness is an exact tag match.
t('reports a model ready only on an exact tag', () => {
  const tag = (n) => (String(n || '').includes(':') ? String(n) : String(n) + ':latest');
  const have = new Set(['gemma2:2b', 'qwen3.5:latest', 'nomic-embed-text:latest'].map(tag));
  assert.strictEqual(have.has(tag('qwen3:4b')), false, 'a prefix match must not count as installed');
  assert.strictEqual(have.has(tag('qwen3.5')), true, 'a bare name resolves to :latest');
  assert.strictEqual(have.has(tag('nomic-embed-text')), true);
  assert.strictEqual(have.has(tag('gemma2:2b')), true);
  assert.strictEqual(have.has(tag('llama3')), false);
});

// The default is now 'always', at the owner's explicit request. The guarantee the previous
// version of this test protected — that a fresh install cannot message customers before it
// is trained — is unchanged, but it is now enforced where it actually belongs: an untrained
// assistant retrieves nothing, so confidence collapses and the reply is never auto-sent
// whatever the mode says. Asserting the mode string only ever protected it by accident.
t('cannot auto-reply until it has been trained, even in always mode', () => {
  assert.strictEqual(store.DEFAULT_SETTINGS.mode, 'always');
  // Still gated: groups off, and consent must be accepted before anything sends.
  assert.strictEqual(store.DEFAULT_SETTINGS.allowGroups, false);
  assert.strictEqual(store.DEFAULT_SETTINGS.consentAccepted, false);

  // An empty knowledge base against a real question must land far below the auto-send bar.
  const question = 'how much is netflix';
  const score = rag.confidence({
    hits: rag.lexicalSearch(question, [], { topK: 5 }),
    exampleHits: [],
    intent: rag.detectIntent(question),
    validation: { ok: true },
    historyTurns: 0,
    hasProducts: false,
  });
  assert.ok(score < store.DEFAULT_SETTINGS.minConfidence,
    `untrained confidence ${score} must stay under the ${store.DEFAULT_SETTINGS.minConfidence} auto-send threshold`);
});

// Retrieval has to survive a gateway with no embeddings — HeyRoute serves chat only — or
// every question is answered with nothing retrieved while still sounding certain.
t('retrieves lexically when no embeddings are available', () => {
  const kb = [
    { id: 1, title: 'Netflix Premium 1 Month', body: 'Shared screen, 1 month. Rs 199.' },
    { id: 2, title: 'Payment methods', body: 'UPI, GPay, PhonePe and Paytm accepted.' },
  ];
  const hits = rag.lexicalSearch('do you accept upi', kb, { topK: 3 });
  assert.ok(hits.length > 0, 'lexical search found nothing');
  assert.strictEqual(hits[0].row.id, 2);
  assert.strictEqual(hits[0].lexical, true, 'hits must be flagged so confidence scores them on the lexical scale');

  // Off-topic must retrieve nothing rather than the least-bad row.
  assert.strictEqual(rag.lexicalSearch('what is the capital of france', kb, { topK: 3 }).length, 0);
});


// Measured against qwen3.5 on a real machine: a correct out-of-stock answer nearly always
// contains the word "available" ("I'll tell you when it becomes available"), and matching
// that alone rejected correct replies — pushing every stock question to manual review.

// A real qwen2.5:3b reply that promised an out-of-stock item in Devanagari passed every
// English/Hinglish promise pattern. The rule now fails closed: mentioning an out-of-stock
// product requires a denial we can recognise.
t('a Hindi promise of an out-of-stock item is held back', () => {
  const v = rag.validate('Prime 1 Year अब ही प्रदान किया जा सकता है, ₹999।', { settings: S, products: PRODUCTS });
  assert.ok(!v.ok, 'a promise of unavailable stock must never pass, in any language');
});
t('a Hindi denial is recognised', () => {
  assert.ok(rag.validate('Prime 1 Year अभी उपलब्ध नहीं है।', { settings: S, products: PRODUCTS }).ok);
});
t('a correct out-of-stock answer is not rejected', () => {
  const v = rag.validate('Prime 1 Year abhi stock mein nahi hai, out of stock hai. Main batata hoon jab available ho jaye.', { settings: S, products: PRODUCTS });
  assert.ok(v.ok, 'correct answer was refused: ' + v.problems.join('; '));
});
t('but falsely promising an out-of-stock item is still rejected', () => {
  const v = rag.validate('Prime 1 Year available hai, main abhi bhej deta hoon.', { settings: S, products: PRODUCTS });
  assert.ok(!v.ok);
});

// ---------- small talk feels human ----------
// "How are you?" was scoring 16% and being handed to the owner: the confidence formula
// asks "how well did retrieval match", which is the wrong question when there is nothing
// to retrieve. These pin the floor and the intent detection that feeds it.
t('greetings and small talk are answerable with an empty knowledge base', () => {
  for (const msg of ['Hello', 'hi', 'Namaste', 'how are you?', 'kaise ho', 'thanks bhai',
                     'ok', 'Can you talk to. Me. In. Hindi?', 'hindi me baat karo', 'are you a bot?']) {
    const intent = rag.detectIntent(msg);
    assert.ok(intent.intent === 'greeting' || intent.intent === 'smalltalk',
      `"${msg}" detected as ${intent.intent} — it would be scored like a product query`);
    const c = rag.confidence({ hits: [], exampleHits: [], productHits: [], intent,
      validation: { ok: true }, historyTurns: 0, hasProducts: false });
    assert.ok(c >= 0.62, `"${msg}" scored ${c} — below the auto-send threshold, so it would be handed over`);
  }
});

t('product questions still require real retrieval', () => {
  const intent = rag.detectIntent('netflix ka price kya hai');
  assert.notStrictEqual(intent.intent, 'smalltalk');
  const c = rag.confidence({ hits: [], exampleHits: [], productHits: [], intent,
    validation: { ok: true }, historyTurns: 0, hasProducts: false });
  assert.ok(c < 0.5, `a price question with NO catalogue match scored ${c} — it must not get the small-talk floor`);
});

t('forced handovers outrank the small-talk floor', () => {
  // "thanks but I want a refund" must never be auto-answered just because it says thanks.
  assert.ok(rag.forcedHandover('thanks bro but refund my money', {}),
    'refund wording must force a human whatever the intent detector says');
});


// ---------- the customer never faces silence ----------
// When the assistant cannot answer it says a human is coming - once. Forced handover
// short-circuits before any network call, so these run the real generate() end to end.
const WACC = 'waitacc';
store.saveSettings(WACC, { mode: 'always', consentAccepted: true, provider: 'heyroute',
  apiKey: 'k', chatModel: 'm', businessName: 'OTT24x7' });

t('a stumped reply tells the customer a human will answer', async () => {
  const r = await generate({ accId: WACC, number: '919000000001', name: 'R',
    text: 'refund my money now', products: [], history: [] });
  assert.strictEqual(r.action, 'handover');
  assert.ok(r.waitText && /team|reply/i.test(r.waitText), 'no wait message: ' + r.waitText);
});

t('the second confused message does not repeat it', async () => {
  const r = await generate({ accId: WACC, number: '919000000001', name: 'R',
    text: 'refund my money today', products: [], history: [] });
  assert.strictEqual(r.action, 'handover');
  assert.strictEqual(r.waitText, null, 'three confused messages must produce one please-wait, not three');
});

t('hindi customers hear it in hindi', async () => {
  const r = await generate({ accId: WACC, number: '919000000002', name: 'R',
    text: 'paisa wapas karo bhai', products: [], history: [] });
  assert.ok(r.waitText && /dhanyavad|team/i.test(r.waitText), 'got: ' + r.waitText);
});

t('a chat the owner holds gets no wait message', async () => {
  store.setConvo(WACC, '919000000003', { takenOver: true, lastOwnerAt: Date.now() });
  const r = await generate({ accId: WACC, number: '919000000003', name: 'R',
    text: 'refund my money', products: [], history: [] });
  assert.strictEqual(r.waitText, undefined === r.waitText ? r.waitText : null,
    'owner is talking - a bot ack on top is noise');
  assert.ok(!r.waitText);
});

t('the owner can turn it off or reword it', async () => {
  store.saveSettings(WACC, { ...store.getSettings(WACC), waitReplyText: 'Ruko zara, sabar karo.' });
  const r = await generate({ accId: WACC, number: '919000000004', name: 'R',
    text: 'refund my money', products: [], history: [] });
  assert.strictEqual(r.waitText, 'Ruko zara, sabar karo.');
  store.saveSettings(WACC, { ...store.getSettings(WACC), waitReplyEnabled: false });
  const r2 = await generate({ accId: WACC, number: '919000000005', name: 'R',
    text: 'refund my money', products: [], history: [] });
  assert.ok(!r2.waitText, 'disabled means disabled');
});


Promise.all(_pending).then(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  console.log(fail ? `\n  ${fail} failing, ${pass} passing` : `\n  all ${pass} passing`);
  process.exit(fail ? 1 : 0);
});
