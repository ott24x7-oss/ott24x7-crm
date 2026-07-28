// Persistent AI storage.
//
// The spec called for PostgreSQL with pgvector. There is no server in this product — the
// CRM is entirely client-side and the only backend is a licence/storefront that never sees
// a message. So the equivalent lives on the owner's own disk, under Electron's userData:
//
//   ai-settings-<acc>.json    modes, thresholds, business rules
//   ai-knowledge-<acc>.json   knowledge entries + their embedding vectors
//   ai-examples-<acc>.json    approved sales-chat examples (redacted)
//   ai-logs-<acc>.json        reply log, capped
//   ai-state-<acc>.json       per-conversation runtime state
//
// Scoping: every file is keyed by WhatsApp account id, which is this product's tenancy
// boundary — the app runs several accounts side by side and they must never share
// knowledge, examples or logs. A missing/blank account id is rejected rather than silently
// pooled into a shared file.
const fs = require('node:fs');
const path = require('node:path');

let DIR = null;
function init(dir) { DIR = dir; try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) {} }

const SAFE = (s) => String(s || '').replace(/[^\w-]/g, '');

function file(kind, accId) {
  const acc = SAFE(accId);
  if (!acc) throw new Error('AI storage requires an account id — refusing to write unscoped data.');
  return path.join(DIR, `ai-${kind}-${acc}.json`);
}

function read(kind, accId, fallback) {
  try {
    const p = file(kind, accId);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) { return fallback; }
}

// Write via a temp file and rename. A half-written knowledge file would take the whole
// assistant down, and this data is not recoverable from anywhere else.
function write(kind, accId, value) {
  try {
    const p = file(kind, accId);
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, p);
    return true;
  } catch (e) { return false; }
}

// ---------- settings ----------
// Suggestions-only by default, deliberately: the owner must switch on auto-reply after
// testing, never as a side effect of installing an update.
const DEFAULT_SETTINGS = {
  mode: 'suggest',                 // off | suggest | offline | always
  provider: 'ollama',
  baseUrl: 'http://127.0.0.1:11434',
  chatModel: 'qwen3:4b',
  embedModel: 'nomic-embed-text',
  timeoutMs: 150000,

  minConfidence: 0.62,             // at or above -> may send automatically
  suggestConfidence: 0.35,         // between the two -> save as a suggestion
  replyDelayMs: 4000,              // look human, and leave room to cancel
  maxRepliesPerConversation: 5,
  ownerIdleMinutes: 10,
  workingHours: { enabled: false, start: '10:00', end: '20:00', days: [1, 2, 3, 4, 5, 6] },

  languages: ['en', 'hi', 'hinglish'],
  handoverKeywords: ['refund', 'complaint', 'legal', 'lawyer', 'police', 'fraud', 'cheat',
    'scam', 'chargeback', 'discount', 'manager', 'owner', 'human', 'call me',
    'paisa wapas', 'shikayat', 'dhokha'],
  tone: 'friendly',                // friendly | formal | concise
  maxResponseChars: 600,
  labelAiToCustomer: false,        // never tag replies to the customer unless asked for

  allowGroups: false,
  includeContacts: [],             // empty = all contacts allowed
  excludeContacts: [],
  paused: false,                   // temporary global pause
  ownerManualStatus: 'auto',       // auto | online | offline
  consentAccepted: false,
};

const getSettings = (accId) => ({ ...DEFAULT_SETTINGS, ...(read('settings', accId, {}) || {}) });
const saveSettings = (accId, patch) => {
  const next = { ...getSettings(accId), ...(patch || {}) };
  return write('settings', accId, next) ? next : null;
};

// ---------- knowledge ----------
// { id, kind, title, body, tags[], active, approved, source, updatedAt, vec[], vecModel }
const getKnowledge = (accId) => read('knowledge', accId, []) || [];
const saveKnowledge = (accId, rows) => write('knowledge', accId, rows);

// ---------- approved chat examples ----------
// { id, question, reply, product, objection, outcome, language, tags[], approved, active, vec[] }
const getExamples = (accId) => read('examples', accId, []) || [];
const saveExamples = (accId, rows) => write('examples', accId, rows);

// ---------- reply log ----------
const LOG_CAP = 1000;
const getLogs = (accId) => read('logs', accId, []) || [];
function addLog(accId, entry) {
  const rows = getLogs(accId);
  rows.unshift({ id: Date.now() + '-' + Math.round(Math.random() * 1e6), ts: Date.now(), ...entry });
  if (rows.length > LOG_CAP) rows.length = LOG_CAP;
  write('logs', accId, rows);
  return rows[0];
}
function updateLog(accId, id, patch) {
  const rows = getLogs(accId);
  const r = rows.find((x) => x.id === id);
  if (!r) return null;
  Object.assign(r, patch);
  write('logs', accId, rows);
  return r;
}

// ---------- per-conversation state ----------
// { [number]: { replies, lastAiAt, takenOver, lastCustomerMsgId, lastOwnerAt } }
const getState = (accId) => read('state', accId, {}) || {};
const saveState = (accId, s) => write('state', accId, s);
function convo(accId, number) {
  const s = getState(accId);
  return s[number] || { replies: 0, lastAiAt: 0, takenOver: false, lastOwnerAt: 0, seen: [] };
}
function setConvo(accId, number, patch) {
  const s = getState(accId);
  s[number] = { ...convo(accId, number), ...patch };
  saveState(accId, s);
  return s[number];
}

// Deleting everything the assistant has learned or logged, for the privacy control in
// settings. Settings themselves are kept so the owner does not have to reconfigure.
function purge(accId, what) {
  const kinds = what && what.length ? what : ['knowledge', 'examples', 'logs', 'state'];
  let n = 0;
  for (const k of kinds) {
    try { const p = file(k, accId); if (fs.existsSync(p)) { fs.unlinkSync(p); n++; } } catch (e) {}
  }
  return n;
}

module.exports = {
  init, DEFAULT_SETTINGS,
  getSettings, saveSettings,
  getKnowledge, saveKnowledge,
  getExamples, saveExamples,
  getLogs, addLog, updateLog,
  getState, saveState, convo, setConvo,
  purge,
};
