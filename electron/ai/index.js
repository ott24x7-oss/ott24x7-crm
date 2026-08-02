// AI orchestration + the IPC surface the renderer talks to.
//
// Everything expensive (model calls, embedding) happens here in the main process, off the
// renderer's thread and away from the WhatsApp page. The renderer hands over the live CRM
// facts with each request — this module never reaches into CRM storage for a price.

const rag = require('./rag');
const { importCatalog } = require('./catalog');
const store = require('./store');
const { createProvider } = require('./provider');

let ipcMain = null;

const providerFor = (s) => createProvider({
  provider: s.provider, baseUrl: s.baseUrl, chatModel: s.chatModel,
  embedModel: s.embedModel, timeoutMs: s.timeoutMs,
});

// ---------- owner availability ----------
// Four inputs, in priority order: a global pause, a manual toggle, business hours, then
// activity. Any one of them can say "the owner is here" and stop the assistant.
function ownerAvailability(settings, { lastActivityAt, now }) {
  const t = now || Date.now();
  if (settings.paused) return { online: true, reason: 'AI paused by owner' };
  if (settings.ownerManualStatus === 'online') return { online: true, reason: 'Owner set themselves online' };
  if (settings.ownerManualStatus === 'offline') return { online: false, reason: 'Owner set themselves offline' };

  const wh = settings.workingHours || {};
  if (wh.enabled) {
    const d = new Date(t);
    const inDay = (wh.days || []).includes(d.getDay());
    const mins = d.getHours() * 60 + d.getMinutes();
    const [sh, sm] = String(wh.start || '00:00').split(':').map(Number);
    const [eh, em] = String(wh.end || '23:59').split(':').map(Number);
    const inHours = mins >= (sh * 60 + sm) && mins <= (eh * 60 + em);
    if (!inDay || !inHours) return { online: false, reason: 'Outside business hours' };
  }

  const idleMs = Math.max(1, Number(settings.ownerIdleMinutes) || 10) * 60000;
  const idle = t - (lastActivityAt || 0);
  if (idle >= idleMs) return { online: false, reason: `No activity for ${Math.round(idle / 60000)} min` };
  return { online: true, reason: 'Owner active' };
}

// ---------- embedding ----------
async function embedRows(accId, rows, kind) {
  const s = store.getSettings(accId);
  const p = providerFor(s);
  const pending = rows.filter((r) => !Array.isArray(r.vec) || !r.vec.length || r.vecModel !== s.embedModel);
  if (!pending.length) return { ok: true, embedded: 0 };

  // Batch, but not unboundedly — a 500-entry base in one request will time out.
  let done = 0;
  for (let i = 0; i < pending.length; i += 16) {
    const batch = pending.slice(i, i + 16);
    const texts = batch.map((r) => (kind === 'example'
      ? `${r.question}\n${r.reply}`
      : `${r.title}\n${r.body}`).slice(0, 4000));
    const e = await p.embed(texts);
    if (!e.ok) return { ok: false, err: e.err, embedded: done };
    batch.forEach((r, j) => { r.vec = e.vectors[j] || []; r.vecModel = s.embedModel; });
    done += batch.length;
  }
  return { ok: true, embedded: done };
}

// ---------- the reply pipeline ----------
// ctx from the renderer: { accId, number, name, text, msgId, isGroup, history[],
//                          products[], customer{}, lastActivityAt }
async function generate(ctx) {
  const started = Date.now();
  const accId = ctx.accId;
  const s = store.getSettings(accId);
  const number = String(ctx.number || '').replace(/\D/g, '');

  const deny = (reason, extra) => ({ ok: false, action: 'skip', reason, ...extra });

  if (s.mode === 'off') return deny('AI is disabled');
  if (!s.consentAccepted) return deny('Consent not accepted in AI settings');
  if (!number) return deny('No phone number on this chat');
  if (ctx.isGroup && !s.allowGroups) return deny('Group chats are excluded');
  if ((s.excludeContacts || []).includes(number)) return deny('Contact is excluded');
  if ((s.includeContacts || []).length && !(s.includeContacts || []).includes(number)) {
    return deny('Contact is not on the allow-list');
  }

  const cstate = store.convo(accId, number);

  // Idempotency: the same WhatsApp message id must never be answered twice, however many
  // times the poller hands it to us.
  if (ctx.msgId && (cstate.seen || []).includes(ctx.msgId)) return deny('Message already processed');

  if (cstate.takenOver) {
    const mins = Math.max(0, Number(s.takeoverMinutes) || 0);
    const since = Date.now() - (cstate.lastOwnerAt || 0);
    if (!mins || since < mins * 60000) {
      return deny('You are handling this chat', { takenOver: true, sinceMin: Math.round(since / 60000) });
    }
    // Long enough since the owner last touched it — hand it back.
    store.setConvo(accId, number, { takenOver: false });
  }
  if (cstate.replies >= (s.maxRepliesPerConversation || 5)) return deny('Reply limit reached for this conversation');

  const avail = ownerAvailability(s, { lastActivityAt: ctx.lastActivityAt });
  if (s.mode === 'offline' && avail.online) return deny(`Owner is online — ${avail.reason}`);

  // Mark as seen before any await, so two concurrent ticks cannot both proceed.
  const seen = [...(cstate.seen || []), ctx.msgId].filter(Boolean).slice(-50);
  store.setConvo(accId, number, { seen });

  const language = rag.detectLanguage(ctx.text);
  const intent = rag.detectIntent(ctx.text);

  // Forced handover short-circuits before we spend a model call on it.
  const forced = rag.forcedHandover(ctx.text, s);
  if (forced) {
    const log = store.addLog(accId, {
      number, name: ctx.name, customerMessage: ctx.text, language, intent: intent.intent,
      action: 'handover', handoverReason: forced, confidence: 0, ms: Date.now() - started,
    });
    return { ok: true, action: 'handover', reason: forced, language, logId: log.id };
  }

  const p = providerFor(s);

  // Retrieve. A failure here is not fatal — the model can still answer from live product
  // data — but it does cost confidence, which is the correct outcome.
  let hits = [], exampleHits = [];
  const knowledge = store.getKnowledge(accId);
  const examples = store.getExamples(accId);
  const q = await p.embed(ctx.text);
  if (q.ok && q.vectors[0]) {
    hits = rag.search(q.vectors[0], knowledge, { topK: 5 });
    exampleHits = rag.search(q.vectors[0], examples, { topK: 3 });
  }
  // Fall back to term matching when the vector path yields nothing — either the gateway
  // serves no embeddings (HeyRoute and most chat-only routers) or the rows were never
  // embedded. Without this the assistant answers every question with zero knowledge
  // retrieved while still sounding certain, which in "always" mode means auto-sending
  // untrained replies to paying customers. Confidence knows these hits are lexical and
  // scores them on their own, stricter scale.
  if (!hits.length) hits = rag.lexicalSearch(ctx.text, knowledge, { topK: 5 });
  if (!exampleHits.length) exampleHits = rag.lexicalSearch(ctx.text, examples, { topK: 3 });

  const system = rag.buildSystemPrompt({
    settings: s, language, business: s.businessInstructions,
    knowledge: hits, examples: exampleHits,
    products: ctx.products || [], customer: ctx.customer || {},
  });

  const history = (ctx.history || []).slice(-8).map((m) => ({
    role: m.fromMe ? 'assistant' : 'user', content: String(m.text || '').slice(0, 800),
  }));

  const out = await p.chat({
    system, messages: [...history, { role: 'user', content: String(ctx.text || '').slice(0, 2000) }],
    temperature: 0.3, maxTokens: Math.ceil((s.maxResponseChars || 600) / 2),
  });

  if (!out.ok) {
    const log = store.addLog(accId, {
      number, name: ctx.name, customerMessage: ctx.text, language, intent: intent.intent,
      action: 'error', error: out.err, ms: Date.now() - started,
    });
    return { ok: false, action: 'error', err: out.err, logId: log.id };
  }

  const validation = rag.validate(out.text, { settings: s, products: ctx.products || [], language });
  const score = rag.confidence({
    hits, exampleHits, intent, validation,
    historyTurns: history.length, hasProducts: !!(ctx.products || []).length,
  });

  const sources = [
    ...hits.map((h) => ({ type: 'knowledge', id: h.row.id, title: h.row.title, score: Number(h.score.toFixed(3)) })),
    ...exampleHits.map((h) => ({ type: 'example', id: h.row.id, title: (h.row.question || '').slice(0, 60), score: Number(h.score.toFixed(3)) })),
  ];

  // Decide. Auto-send needs a clean validation AND the confidence bar AND a mode that
  // permits it — three independent gates, not one.
  let action = 'suggest';
  if (!validation.ok) action = score < s.suggestConfidence ? 'handover' : 'suggest';
  else if (score >= s.minConfidence && (s.mode === 'always' || (s.mode === 'offline' && !avail.online))) action = 'send';
  else if (score < s.suggestConfidence) action = 'handover';

  const log = store.addLog(accId, {
    number, name: ctx.name, customerMessage: ctx.text, generated: out.text,
    language, intent: intent.intent, confidence: score, sources,
    validation: validation.problems, action, model: out.model,
    ms: Date.now() - started, ownerOnline: avail.online, ownerReason: avail.reason,
  });

  return {
    ok: true, action, text: out.text, confidence: score, sources,
    validation: validation.problems, language, intent: intent.intent,
    delayMs: s.replyDelayMs, logId: log.id,
    ownerOnline: avail.online, ownerReason: avail.reason,
  };
}

// Called by the renderer once a reply has actually gone out, so the conversation's reply
// budget and the log both reflect what the customer really received.
function markSent(accId, number, logId, finalText) {
  const n = String(number || '').replace(/\D/g, '');
  const c = store.convo(accId, n);
  store.setConvo(accId, n, { replies: (c.replies || 0) + 1, lastAiAt: Date.now() });
  if (logId) store.updateLog(accId, logId, { sent: true, sentText: finalText, sentAt: Date.now() });
  return true;
}

function register(ipc, dataDir) {
  ipcMain = ipc;
  store.init(dataDir);

  const H = (name, fn) => ipcMain.handle(name, async (_e, ...args) => {
    try { return await fn(...args); } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
  });

  // settings
  H('ai:getSettings', (accId) => ({ ok: true, settings: store.getSettings(accId) }));
  H('ai:saveSettings', (accId, patch) => ({ ok: true, settings: store.saveSettings(accId, patch) }));

  // provider
  H('ai:health', async (accId) => {
    const s = store.getSettings(accId);
    const p = providerFor(s);
    const h = await p.health();
    if (!h.ok) return { ok: false, err: h.err };
    const m = await p.models();
    const names = (m.models || []).map((x) => x.name);
    // Ollama treats a bare name as ":latest"; compare on the same footing.
    const tag = (n) => (String(n || '').includes(':') ? String(n) : String(n) + ':latest');
    const have = new Set(names.map(tag));
    return {
      ok: true, version: h.version, ms: h.ms, models: m.models || [],
      // Exact tag match, with :latest filled in the way Ollama does. A prefix match said
      // "qwen3:4b ready" because "qwen3.5:latest" starts with "qwen3" — the panel showed
      // Ready and every reply then failed with "model not installed".
      // Hosted gateways are keyed, not installed: what the provider lists is what is
      // callable. Reported honestly either way, because claiming a model was ready when it
      // was not is the single failure that cost this feature its trust.
      hosted: s.provider !== 'ollama',
      chatReady: have.has(tag(s.chatModel)),
      // null, not false, when embeddings are deliberately switched off — HeyRoute serves
      // no embedding endpoint at any tier, and retrieval runs on term matching instead.
      // Reporting false made the panel warn that "" was not installed, which reads as a
      // fault rather than a configuration.
      embedReady: s.embedModel ? have.has(tag(s.embedModel)) : null,
      // When the configured model is missing, name one that is actually here so the owner
      // can fix it in a click instead of guessing.
      chatSuggestion: have.has(tag(s.chatModel)) ? null
        : (names.find((n) => !/embed|bge|minilm|e5|gte/i.test(n)) || null),
      embedSuggestion: (!s.embedModel || have.has(tag(s.embedModel))) ? null
        : (names.find((n) => /embed|bge|minilm|e5|gte/i.test(n)) || null),
    };
  });

  // knowledge
  H('ai:getKnowledge', (accId) => ({ ok: true, rows: store.getKnowledge(accId).map(stripVec) }));
  H('ai:saveKnowledgeRow', async (accId, row) => {
    const rows = store.getKnowledge(accId);
    // Match on id, or failing that on kind+title — an import has no id to offer, and
    // without this every re-import added a second copy of everything.
    const key = (r) => `${r.kind || 'note'}::${String(r.title || '').trim().toLowerCase()}`;
    let i = row.id ? rows.findIndex((r) => r.id === row.id) : -1;
    if (i < 0 && row.title) i = rows.findIndex((r) => key(r) === key(row));
    const next = { active: true, approved: true, updatedAt: Date.now(), ...row };
    // Content changed -> the old vector is wrong, drop it so it is re-embedded.
    if (i > -1) { if (rows[i].title !== next.title || rows[i].body !== next.body) next.vec = []; rows[i] = { ...rows[i], ...next }; }
    else { next.id = 'k' + Date.now() + Math.round(Math.random() * 1e4); rows.unshift(next); }
    store.saveKnowledge(accId, rows);
    return { ok: true, id: next.id };
  });
  H('ai:deleteKnowledge', (accId, id) => {
    store.saveKnowledge(accId, store.getKnowledge(accId).filter((r) => r.id !== id));
    return { ok: true };
  });
  // One-shot cleanup for knowledge bases that already accumulated copies. Keeps the
  // newest of each kind+title, and prefers a row that is already embedded so the cleanup
  // does not force a full re-embed.
  H('ai:dedupeKnowledge', (accId) => {
    const rows = store.getKnowledge(accId);
    const best = new Map();
    for (const r of rows) {
      const k = `${r.kind || 'note'}::${String(r.title || '').trim().toLowerCase()}`;
      const cur = best.get(k);
      if (!cur) { best.set(k, r); continue; }
      const better = (Array.isArray(r.vec) && r.vec.length ? 1 : 0) - (Array.isArray(cur.vec) && cur.vec.length ? 1 : 0)
        || (r.updatedAt || 0) - (cur.updatedAt || 0);
      if (better > 0) best.set(k, r);
    }
    const kept = [...best.values()];
    const removed = rows.length - kept.length;
    if (removed > 0) store.saveKnowledge(accId, kept);
    return { ok: true, removed, kept: kept.length };
  });

  H('ai:embedAll', async (accId) => {
    const k = store.getKnowledge(accId);
    const rk = await embedRows(accId, k, 'knowledge');
    if (rk.ok) store.saveKnowledge(accId, k);
    const ex = store.getExamples(accId);
    const re = await embedRows(accId, ex, 'example');
    if (re.ok) store.saveExamples(accId, ex);
    if (!rk.ok || !re.ok) return { ok: false, err: rk.err || re.err, embedded: rk.embedded + (re.embedded || 0) };
    return { ok: true, embedded: rk.embedded + re.embedded };
  });

  // chat examples
  H('ai:getExamples', (accId) => ({ ok: true, rows: store.getExamples(accId).map(stripVec) }));
  H('ai:saveExample', (accId, row) => {
    const rows = store.getExamples(accId);
    const i = rows.findIndex((r) => r.id === row.id);
    // Redact on the way in. Once a real conversation is stored it is too late to ask.
    const next = {
      approved: false, active: true, ...row,
      question: rag.redact(row.question), reply: rag.redact(row.reply),
    };
    if (i > -1) { if (rows[i].question !== next.question || rows[i].reply !== next.reply) next.vec = []; rows[i] = { ...rows[i], ...next }; }
    else { next.id = 'e' + Date.now() + Math.round(Math.random() * 1e4); rows.unshift(next); }
    store.saveExamples(accId, rows);
    return { ok: true, id: next.id };
  });
  H('ai:deleteExample', (accId, id) => {
    store.saveExamples(accId, store.getExamples(accId).filter((r) => r.id !== id));
    return { ok: true };
  });

  // pipeline
  H('ai:generate', (ctx) => generate(ctx));
  H('ai:markSent', (accId, number, logId, text) => ({ ok: markSent(accId, number, logId, text) }));
  H('ai:availability', (accId, lastActivityAt) => ({ ok: true, ...ownerAvailability(store.getSettings(accId), { lastActivityAt }) }));

  // per-conversation control
  H('ai:pausedConvos', (accId) => {
    const s = store.getSettings(accId);
    const mins = Math.max(0, Number(s.takeoverMinutes) || 0);
    const out = [];
    for (const [number, v] of Object.entries(store.getState(accId))) {
      if (!v || !v.takenOver) continue;
      const since = Date.now() - (v.lastOwnerAt || 0);
      out.push({
        number,
        sinceMin: Math.round(since / 60000),
        resumesInMin: mins ? Math.max(0, Math.ceil((mins * 60000 - since) / 60000)) : null,
        replies: v.replies || 0,
      });
    }
    return { ok: true, rows: out };
  });

  H('ai:convoState', (accId, number) => ({ ok: true, state: store.convo(accId, String(number || '').replace(/\D/g, '')) }));
  H('ai:setConvoState', (accId, number, patch) => ({ ok: true, state: store.setConvo(accId, String(number || '').replace(/\D/g, ''), patch) }));

  // catalog import from a website
  H('ai:importCatalog', (opts) => importCatalog(opts || {}));

  // logs + privacy
  H('ai:getLogs', (accId, limit) => ({ ok: true, rows: store.getLogs(accId).slice(0, limit || 200) }));
  H('ai:updateLog', (accId, id, patch) => ({ ok: true, row: store.updateLog(accId, id, patch) }));
  H('ai:purge', (accId, what) => ({ ok: true, removed: store.purge(accId, what) }));
}

// Vectors are hundreds of floats per row and the renderer never needs them; sending them
// over IPC would make the knowledge screen crawl.
const stripVec = (r) => { const { vec, ...rest } = r; return { ...rest, embedded: Array.isArray(vec) && vec.length > 0 }; };

module.exports = { register, generate, ownerAvailability, embedRows, providerFor };
