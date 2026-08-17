// Retrieval + validation for the Chrome extension AI (mirrors electron/ai/rag.js).
import * as shop from './shop.js';

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
      score += idf(w) * (title.has(w) ? 2.2 : 1);
    }
    if (!matched) return { row, score: 0 };
    const mass = [...new Set(qt)].reduce((a, w) => a + idf(w), 0) || 1;
    return { row, score: Math.min(1, score / mass), lexical: true };
  })
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function detectLanguage(text) {
  const t = String(text || '');
  if (/[\u0900-\u097F]/.test(t)) return 'hi';
  const hinglish = /\b(kya|kaise|kitna|hai|nahi|haan|bhai|chahiye|milega|karo|kar|paisa|kitne|thik|acha|batao|ji)\b/i;
  if (hinglish.test(t)) return 'hinglish';
  return 'en';
}

const INTENTS = [
  ['delivery', /\b(deliver|delivery|shipping|courier|kab tak|kitne din|kitna time|how long|dispatch)\b/i],
  ['price', /\b(price|cost|rate|kitna|kitne|how much|charges?|fees?)\b/i],
  ['stock', /\b(stock|available|availability|in stock|milega|hai kya)\b/i],
  ['payment', /\b(pay|payment|upi|gpay|paytm|phonepe|bank|account|qr|transfer)\b/i],
  ['warranty', /\b(warranty|guarantee|replace|replacement|garanti)\b/i],
  ['refund', /\b(refund|return|money back|paisa wapas|cancel)\b/i],
  ['order_status', /\b(order status|tracking|where is my|kahan hai|dispatch hua)\b/i],
  ['greeting', /^\s*(hi+|hello+|hey+|hyy+|hlo+|namaste|namaskar|salam|as-?salam|good (morning|evening|afternoon|night))\b/i],
  ['smalltalk', /^\s*(how are (you|u)|kaise ho|kaisi ho|kya haal|kya chal raha|wassup|sup|thank(s| you)|thanku|shukriya|dhanyavad|ok+|okay+|okk+|thik hai|theek hai|acha|accha|hmm+|haan+|yes+|no+|nahi+|bye+|good ?night|gn|take care|who are you|kaun ho|are you (a )?bot|robot ho|ai ho|bahut (badhiya|acha)|nice|great|super)\b/i],
  ['smalltalk', /\b(talk|baat|bolo|speak|chat|reply|message)\b[\s\S]{0,25}\b(hindi|english|hinglish)\b|\b(hindi|english|hinglish)\b[\s\S]{0,25}\b(baat|bolo|batao|talk|speak|reply|karo)\b/i],
];

function detectIntent(text) {
  const t = String(text || '');
  for (const [name, re] of INTENTS) if (re.test(t)) return { intent: name, confidence: 0.8 };
  return { intent: 'general', confidence: 0.4 };
}

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

function buildSystemPrompt(args) {
  return shop.buildSystemPrompt(args);
}

function validate(text, { settings, products }) {
  const problems = [];
  const t = String(text || '').trim();
  if (!t) problems.push('empty reply');
  if (/NEED_HUMAN/i.test(t)) problems.push('model asked for a human');
  if (t.length > (settings.maxResponseChars || 600)) problems.push(`too long (${t.length})`);
  if (/HARD RULES|SYSTEM|BUSINESS KNOWLEDGE|LIVE (PRODUCT DATA|CATALOG)|SHOP FACTS|<think>/i.test(t)) problems.push('leaked internal prompt');
  if (/\bas an ai\b|language model|i am an ai/i.test(t)) problems.push('revealed itself as an AI');

  const quoted = [...t.matchAll(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/gi)].map((m) => Number(m[1].replace(/,/g, '')));
  if (quoted.length) {
    const allowed = new Set((products || []).flatMap((p) => [Number(p.price), Number(p.sell), Number(p.amount)]).filter((n) => n > 0));
    for (const q of quoted) {
      if (!allowed.has(q)) problems.push(`quoted ₹${q}, which is not a current price`);
    }
  }

  if (/\bpayment\b[^.!?]{0,20}\b(received|confirmed|credited|successful)\b|paisa mil gaya|received your payment/i.test(t)) problems.push('confirmed a payment');
  if (/\brefund\b[^.!?]{0,20}\b(approved|processed|done|initiated|issued)\b|refund kar diya|paise wapas kar/i.test(t)) problems.push('approved a refund');
  if (/\b(\d+\s*%\s*(off|discount)|special discount|extra discount)\b/i.test(t)) problems.push('offered a discount');

  const deniesStock = new RegExp([
    'out of stock', 'not available', 'not in stock', 'unavailable', 'sold out',
    'nahi hai', 'nahi milega', 'stock mein nahi', 'khatam', 'abhi nahi',
  ].join('|'), 'i').test(t);

  for (const p of (products || [])) {
    if (p.stock === false && p.title && t.toLowerCase().includes(String(p.title).toLowerCase())) {
      if (!deniesStock) problems.push(`mentioned "${p.title}" without saying it is out of stock`);
    }
  }
  return { ok: problems.length === 0, problems };
}

const LEX_FLOOR = 0.15;
const LEX_GOOD = 0.60;
const simScore = (s) => Math.max(0, Math.min(1, (s - LEX_FLOOR) / (LEX_GOOD - LEX_FLOOR)));

function confidence({ hits, exampleHits, productHits, intent, validation, historyTurns, hasProducts }) {
  if (validation && !validation.ok) return 0;
  const kind = intent && intent.intent;
  if (kind === 'greeting' || kind === 'smalltalk') {
    return Math.max(0.7, Math.min(1, 0.7 + Math.min(1, (historyTurns || 0) / 4) * 0.1));
  }
  const topProd = productHits && productHits.length ? productHits[0].score : 0;
  const topKnow = hits && hits.length ? hits[0].score : 0;
  const top = Math.max(topKnow, topProd);
  const breadth = Math.min(1, ((hits || []).length + (exampleHits || []).length + (productHits || []).length) / 4);
  let score = 0;
  score += simScore(top) * 0.50;
  score += breadth * 0.15;
  score += (intent && intent.confidence ? intent.confidence : 0.4) * 0.15;
  score += Math.min(1, (historyTurns || 0) / 4) * 0.10;
  score += (hasProducts ? 1 : 0) * 0.10;
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

export {
  lexicalSearch, detectLanguage, detectIntent, forcedHandover,
  buildSystemPrompt, validate, confidence,
};
