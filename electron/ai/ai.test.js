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
const { ownerAvailability } = require('./index');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wacrm-ai-test-'));
store.init(dir);

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
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
t('ships in suggestions-only mode, never auto-replying out of the box', () => {
  assert.strictEqual(store.DEFAULT_SETTINGS.mode, 'suggest');
  assert.strictEqual(store.DEFAULT_SETTINGS.allowGroups, false);
  assert.strictEqual(store.DEFAULT_SETTINGS.consentAccepted, false);
});


// Measured against qwen3.5 on a real machine: a correct out-of-stock answer nearly always
// contains the word "available" ("I'll tell you when it becomes available"), and matching
// that alone rejected correct replies — pushing every stock question to manual review.
t('a correct out-of-stock answer is not rejected', () => {
  const v = rag.validate('Prime 1 Year abhi stock mein nahi hai, out of stock hai. Main batata hoon jab available ho jaye.', { settings: S, products: PRODUCTS });
  assert.ok(v.ok, 'correct answer was refused: ' + v.problems.join('; '));
});
t('but falsely promising an out-of-stock item is still rejected', () => {
  const v = rag.validate('Prime 1 Year available hai, main abhi bhej deta hoon.', { settings: S, products: PRODUCTS });
  assert.ok(!v.ok);
});

try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
console.log(fail ? `\n  ${fail} failing, ${pass} passing` : `\n  all ${pass} passing`);
process.exit(fail ? 1 : 0);
