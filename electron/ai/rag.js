// Retrieval, prompt construction, validation and confidence.
//
// The rule that shapes this whole file: embeddings may inform TONE and PHRASING, never
// FACTS. Prices, stock and payment details are read from the live CRM data passed in with
// the request, and any reply quoting a number that is not in that live data is refused.
// A stale embedded price is a wrong price, and a wrong price is a real loss for the owner.

// ---------- vector search ----------
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Brute force is the right call here: a knowledge base is hundreds of rows, not millions,
// and an exact scan of 2k x 768 floats is ~1ms. An ANN index would add failure modes for
// no measurable gain at this size.
function search(queryVec, rows, { topK = 6, minScore = 0.45 } = {}) {
  if (!queryVec || !queryVec.length) return [];
  return rows
    .filter((r) => r.active !== false && r.approved !== false && Array.isArray(r.vec) && r.vec.length)
    .map((r) => ({ row: r, score: cosine(queryVec, r.vec) }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ---------- lexical search ----------
// The vector path above needs an embedding endpoint. Hosted routers frequently serve chat
// only — HeyRoute publishes /v1/chat/completions, /v1/responses and /v1/messages and no
// embeddings at any tier — and without this, search() returns nothing for every question,
// every reply is generated with zero knowledge retrieved, and in "always" mode the
// assistant confidently auto-sends untrained answers to paying customers.
//
// So retrieval degrades to term overlap rather than to nothing. Deliberately simple:
// idf-weighted, title-boosted overlap, which on a few hundred rows of sales knowledge is
// close enough to a real ranker and has no tuning surface to get wrong.
const STOP = new Set(('a an the is are was were be been being do does did of to in on at for with and or but if then '
  + 'this that these those it its as by from you your me my we our i he she they them so not no yes can could would '
  + 'should will just how what when where which who why kya hai ka ki ke ko me mein hi bhi ye wo').split(/\s+/));

function terms(text) {
  return String(text || '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

const rowText = (r) => `${r.title || r.question || ''} ${r.body || r.reply || ''} ${(r.tags || []).join(' ')}`;

// Raw overlap favours long rows simply for containing more words, so each score is divided by
// the row's own length. idf stops "price" — in every row of a price list — from carrying
// the same weight as the one term that actually distinguishes a row.
function lexicalSearch(query, rows, { topK = 6, minScore = 0.12 } = {}) {
  const qt = terms(query);
  if (!qt.length) return [];
  const live = rows.filter((r) => r.active !== false && r.approved !== false);
  if (!live.length) return [];

  const docs = live.map((r) => ({ row: r, t: terms(rowText(r)) }));
  const df = new Map();
  for (const d of docs) for (const w of new Set(d.t)) df.set(w, (df.get(w) || 0) + 1);
  const idf = (w) => Math.log(1 + live.length / (1 + (df.get(w) || 0)));

  return docs.map(({ row, t }) => {
    const set = new Set(t);
    const title = new Set(terms(row.title || row.question || ''));
    let score = 0, matched = 0;
    for (const w of new Set(qt)) {
      if (!set.has(w)) continue;
      matched++;
      // A hit in the title is a hit on what the row is *about*, not merely text it contains.
      score += idf(w) * (title.has(w) ? 2.2 : 1);
    }
    if (!matched) return { row, score: 0 };
    // Normalised by the query's own idf mass, so the result is a 0..1 "how much of what
    // was asked did this row actually cover" rather than an unbounded sum.
    const mass = [...new Set(qt)].reduce((a, w) => a + idf(w), 0) || 1;
    return { row, score: Math.min(1, score / mass), lexical: true };
  })
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ---------- language + intent ----------
// Cheap, deterministic and offline. Asking the model to classify first would double
// latency and cost for something a few regexes get right often enough to gate on.
function detectLanguage(text) {
  const t = String(text || '');
  if (/[ऀ-ॿ]/.test(t)) return 'hi';                       // Devanagari
  const hinglish = /\b(kya|kaise|kitna|hai|nahi|haan|bhai|chahiye|milega|karo|kar|paisa|kitne|thik|acha|batao|ji)\b/i;
  if (hinglish.test(t)) return 'hinglish';
  return 'en';
}

// Order matters — first match wins. Delivery is checked before price because "kitne din"
// (how many days) would otherwise be caught by the bare "kitne" in the price pattern, and
// a delivery question answered as a price question is a confidently wrong reply.
const INTENTS = [
  ['delivery', /\b(deliver|delivery|shipping|courier|kab tak|kitne din|kitna time|how long|dispatch)\b/i],
  ['price', /\b(price|cost|rate|kitna|kitne|how much|charges?|fees?)\b/i],
  ['stock', /\b(stock|available|availability|in stock|milega|hai kya)\b/i],
  ['payment', /\b(pay|payment|upi|gpay|paytm|phonepe|bank|account|qr|transfer)\b/i],
  ['warranty', /\b(warranty|guarantee|replace|replacement|garanti)\b/i],
  ['refund', /\b(refund|return|money back|paisa wapas|cancel)\b/i],
  ['order_status', /\b(order status|tracking|where is my|kahan hai|dispatch hua)\b/i],
  ['greeting', /^\s*(hi+|hello+|hey+|hyy+|hlo+|namaste|namaskar|salam|as-?salam|good (morning|evening|afternoon|night))\b/i],
  // Small talk carries no product question, so it must be answerable with no knowledge-base
  // match at all — "how are you?" was scoring 16% and being handed to the owner, which is
  // exactly the moment a customer decides they are talking to a machine.
  ['smalltalk', /^\s*(how are (you|u)|kaise ho|kaisi ho|kya haal|kya chal raha|wassup|sup|thank(s| you)|thanku|shukriya|dhanyavad|ok+|okay+|okk+|thik hai|theek hai|acha|accha|hmm+|haan+|yes+|no+|nahi+|bye+|good ?night|gn|take care|who are you|kaun ho|are you (a )?bot|robot ho|ai ho|bahut (badhiya|acha)|nice|great|super|👍|🙏|❤️|😊)\b/i],
  // A language switch can be phrased any way at all — a real customer wrote "Can you talk
  // to. Me. In. Hindi?" — so this one is not anchored to the start of the message.
  ['smalltalk', /\b(talk|baat|bolo|speak|chat|reply|message)\b[\s\S]{0,25}\b(hindi|english|hinglish)\b|\b(hindi|english|hinglish)\b[\s\S]{0,25}\b(baat|bolo|batao|talk|speak|reply|karo)\b/i],
];

function detectIntent(text) {
  const t = String(text || '');
  for (const [name, re] of INTENTS) if (re.test(t)) return { intent: name, confidence: 0.8 };
  return { intent: 'general', confidence: 0.4 };
}

// ---------- forced handover ----------
// These are not confidence calls. Whatever the model produces, a human answers these.
// Discount/reseller is NOT forced here — shop facts teach the reseller programme
// (same as railway_final); inventing a personal rate is still blocked by validate().
const FORCE_HANDOVER = [
  ['refund_dispute', /\b(refund|return|money back|paisa wapas|chargeback)\b/i],
  ['payment_mismatch', /\b(paid but|payment (failed|not received|nahi hua)|debited|deducted|wrong amount)\b/i],
  ['angry', /\b(worst|fraud|cheat|scam|useless|pathetic|bakwas|dhokha|complaint|shikayat)\b/i],
  ['legal', /\b(legal|lawyer|court|police|consumer forum|sue)\b/i],
];

function forcedHandover(text, settings) {
  const t = String(text || '');
  for (const [reason, re] of FORCE_HANDOVER) if (re.test(t)) return reason;
  for (const k of (settings.handoverKeywords || [])) {
    if (k && new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t)) return 'keyword:' + k;
  }
  return null;
}

// ---------- prompt (railway_final-style live catalog + shop facts) ----------
const shop = require('./shop');

function buildSystemPrompt(args) {
  return shop.buildSystemPrompt(args);
}

// ---------- validation ----------
// Runs on every generated reply before it can be sent. Anything that fails here becomes a
// suggestion for the owner instead of a message to the customer.
function validate(text, { settings, products, language }) {
  const problems = [];
  const t = String(text || '').trim();

  if (!t) problems.push('empty reply');
  if (/NEED_HUMAN/i.test(t)) problems.push('model asked for a human');
  if (t.length > settings.maxResponseChars) problems.push(`too long (${t.length} > ${settings.maxResponseChars})`);

  // Leaked instructions or reasoning.
  if (/HARD RULES|SYSTEM|BUSINESS KNOWLEDGE|LIVE (PRODUCT DATA|CATALOG)|SHOP FACTS|<think>/i.test(t)) problems.push('leaked internal prompt');
  if (/\bas an ai\b|language model|i am an ai/i.test(t)) problems.push('revealed itself as an AI');

  // Any rupee figure in the reply must exist in the live product data. This is the check
  // that stops a hallucinated or stale price reaching a customer.
  const quoted = [...t.matchAll(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/gi)].map((m) => Number(m[1].replace(/,/g, '')));
  if (quoted.length) {
    const allowed = new Set((products || []).flatMap((p) => [Number(p.price), Number(p.sell), Number(p.amount)]).filter((n) => n > 0));
    for (const q of quoted) {
      if (!allowed.has(q)) problems.push(`quoted ₹${q}, which is not a current price`);
    }
  }

  // Claims the assistant is never allowed to make.
  // Deliberately loose: these match a claim however it is phrased ("refund approved",
  // "your refund is approved", "refund has been processed"). A false positive costs the
  // owner one click; a false negative is a refund the business never agreed to.
  if (/\bpayment\b[^.!?]{0,20}\b(received|confirmed|credited|successful)\b|paisa mil gaya|received your payment/i.test(t)) problems.push('confirmed a payment');
  if (/\brefund\b[^.!?]{0,20}\b(approved|processed|done|initiated|issued)\b|refund kar diya|paise wapas kar/i.test(t)) problems.push('approved a refund');
  if (/\breturn\b[^.!?]{0,20}\b(approved|accepted)\b/i.test(t)) problems.push('approved a return');
  if (/\b(\d+\s*%\s*(off|discount)|special discount|extra discount)\b/i.test(t)) problems.push('offered a discount');
  if (/\b(guarantee[d]? (delivery|refund)|100% (safe|guaranteed))\b/i.test(t)) problems.push('made an absolute promise');

  // Out-of-stock products, and the one rule here that FAILS CLOSED.
  //
  // Looking for promise words ("available", "milega") only works in the languages those
  // words are written in. A real qwen2.5:3b reply in Devanagari — "Prime 1 Year अब ही
  // प्रदान किया जा सकता है, ₹999" ("can be provided right now") — matched none of them and
  // passed, promising an item that was gone. Detecting a promise across three languages is
  // not something a regex can be trusted to do.
  //
  // So the rule is inverted: mentioning an out-of-stock product requires a denial we can
  // actually recognise. No recognisable denial means the reply is held back for the owner.
  // A correct Hindi answer occasionally landing in review is a fair price for never
  // promising stock that does not exist.
  const deniesStock = new RegExp([
    'out of stock', 'not available', 'not in stock', 'unavailable', 'sold out',
    'nahi hai', 'nahi milega', 'stock mein nahi', 'khatam', 'abhi nahi',
    'उपलब्ध नहीं', 'स्टॉक में नहीं', 'नहीं है', 'खत्म', 'अभी नहीं',
  ].join('|'), 'i').test(t);

  for (const p of (products || [])) {
    if (p.stock === false && p.title && t.toLowerCase().includes(String(p.title).toLowerCase())) {
      if (!deniesStock) problems.push(`mentioned "${p.title}" without saying it is out of stock`);
    }
  }

  return { ok: problems.length === 0, problems };
}

// ---------- confidence ----------
// Deliberately blended: a high similarity score alone is not enough to message a paying
// customer, and a model that "sounds sure" tells us nothing.
// Measured against nomic-embed-text on real sales questions: unrelated text still scores
// about 0.40 cosine, and a genuinely good match lands around 0.75. Normalising from zero
// therefore treated pure noise as half a match, and a mediocre 0.57 hit sailed past the
// auto-send bar. Subtract the noise floor so the score reflects real signal.
const SIM_FLOOR = 0.40;
const SIM_GOOD = 0.75;
// Lexical scores are term coverage, not cosine, and their distribution is completely
// different — noise sits near 0 rather than 0.40, so the cosine floor would flatter every
// weak match. They are also weaker evidence: overlapping words is not the same as meaning
// the same thing. Held to a higher bar for "good" so a lexical hit has to cover most of
// the question before it can push a reply past the auto-send threshold.
const LEX_FLOOR = 0.15;
const LEX_GOOD = 0.60;
const simScore = (s, lexical) => (lexical
  ? Math.max(0, Math.min(1, (s - LEX_FLOOR) / (LEX_GOOD - LEX_FLOOR)))
  : Math.max(0, Math.min(1, (s - SIM_FLOOR) / (SIM_GOOD - SIM_FLOOR))));

function confidence({ hits, exampleHits, productHits, intent, validation, historyTurns, hasProducts }) {
  // Validation is a gate, not a contributor: the caller refuses to auto-send when it fails,
  // and paying 0.20 simply for "said nothing forbidden" gave every empty reply a free floor.
  if (validation && !validation.ok) return 0;

  // Small talk is scored on its own terms. The formula below is built around "how well did
  // retrieval match", which is the right question for a product query and a nonsense
  // question for "hello" or "how are you?" — there is nothing to retrieve, so greetings
  // scored ~16% and were handed to the owner. Nothing feels less human than a support chat
  // that cannot say hello back. Forced handovers run before any of this, and the validator
  // still gates anything the model invents, so the floor cannot leak prices or promises.
  const kind = intent && intent.intent;
  if (kind === 'greeting' || kind === 'smalltalk') {
    return Math.max(0.7, Math.min(1, 0.7 + Math.min(1, (historyTurns || 0) / 4) * 0.1));
  }

  // A catalogue match is evidence, and it was not being counted as any. hasProducts paid a
  // flat 0.10 whether the customer asked about a listed product or about the weather, so a
  // shop with 237 products and no knowledge entries scored 0.295 on "netflix ka price kya
  // hai" and handed it over. Answering from the catalogue is the main thing this is for.
  const topProd = productHits && productHits.length ? productHits[0].score : 0;
  const topKnow = hits && hits.length ? hits[0].score : 0;
  const top = Math.max(topKnow, topProd);
  // Which retriever produced the hit decides how the score is read — the two scales are
  // not comparable, and treating a lexical 0.5 as a cosine 0.5 would roughly double it.
  const isLex = topProd >= topKnow
    ? !!(productHits && productHits.length && productHits[0].lexical)
    : !!(hits && hits.length && hits[0].lexical);
  const breadth = Math.min(1, ((hits || []).length + (exampleHits || []).length
    + (productHits || []).length) / 4);

  let score = 0;
  score += simScore(top, isLex) * 0.50;                 // how well knowledge actually matched
  score += breadth * 0.15;                              // corroboration across sources
  score += (intent && intent.confidence ? intent.confidence : 0.4) * 0.15;
  score += Math.min(1, (historyTurns || 0) / 4) * 0.10; // context we actually have
  score += (hasProducts ? 1 : 0) * 0.10;

  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

// ---------- redaction ----------
// Applied before a real conversation is stored as a training example. Phone numbers,
// emails, UPI handles, card-like digit runs and order ids are the ones that actually turn
// up in sales chats.
function redact(text) {
  return String(text || '')
    .replace(/\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, '[phone]')
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '[email]')
    .replace(/\b[\w.-]{2,}@(?:ok\w+|paytm|ybl|upi|axl|apl)\b/gi, '[upi]')
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}(?:[-\s]?\d{4})?\b/g, '[card]')
    .replace(/\b(?:order|txn|ref|utr)[\s#:]*[A-Z0-9-]{6,}\b/gi, '[reference]');
}

module.exports = {
  cosine, search, lexicalSearch,
  detectLanguage, detectIntent, forcedHandover,
  buildSystemPrompt, validate, confidence, redact,
};
