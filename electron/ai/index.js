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

// Every field the provider needs, listed explicitly so nothing from settings leaks into a
// provider that has no business seeing it.
//
// apiKey was missing here. It saved correctly and sat in settings, but never reached the
// provider, so a hosted engine reported "No API key set" no matter what was pasted in -
// which looks exactly like a rejected key and sends you to check the wrong thing. This
// list was written when the only engine was local and needed no credential.
const providerFor = (s) => createProvider({
  provider: s.provider, baseUrl: s.baseUrl, apiKey: s.apiKey,
  chatModel: s.chatModel, embedModel: s.embedModel, timeoutMs: s.timeoutMs,
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

// Stop asking for embeddings once it is clear they are not coming.
//
// This started as a list of "permanent" status codes: 400 and 404 meant give up, everything
// else meant retry. That was the wrong shape. A gateway that does not do embeddings can say
// so with 503 just as easily, and then the app reads "their side, try again shortly",
// retries forever, and the owner watches the same red box on every message with a Re-embed
// button that cannot succeed.
//
// So it counts instead of classifying. Whatever the reason - a status nobody predicted, a
// timeout, a gateway that is simply down - a few failures in a row is enough. The cost of
// being wrong is close to nothing: keyword retrieval keeps working, and setting an
// embedding model again re-enables it.
const EMBED_STRIKES = 3;
const strikes = new Map();

function embedFailed(accId, err, permanent) {
  const n = (strikes.get(accId) || 0) + 1;
  strikes.set(accId, n);
  if (!permanent && n < EMBED_STRIKES) return false;
  const s = store.getSettings(accId);
  if (!s.embedModel) return false;
  store.saveSettings(accId, { ...s, embedModel: '' });
  strikes.delete(accId);
  console.warn(`[ai] embeddings disabled for ${accId} after ${n}: ${err}`);
  return true;
}

// A success clears the count, so an outage that recovers does not accumulate toward a
// permanent switch-off across a long-running session.
const embedWorked = (accId) => strikes.delete(accId);

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
    if (!e.ok) {
      // Pressing Re-embed is the owner asking directly, so one failure is answer enough —
      // no point making them click three times to learn the same thing.
      if (embedFailed(accId, e.err, true)) {
        // Not an error to act on: the knowledge stays searchable by keyword.
        return { ok: true, embedded: done, disabled: true, err: e.err };
      }
      return { ok: false, err: e.err, embedded: done };
    }
    embedWorked(accId);
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

  // A skip has to leave a trace.
  //
  // There are eleven ways a message can be dropped here and every one of them used to
  // return in silence: nothing in Logs, nothing in the Inbox, no toast. From the owner's
  // side a customer messaged and the assistant did nothing, with no way to find out why —
  // which is unanswerable without reading this file. The reason was always known at the
  // moment of the decision; it was simply thrown away.
  //
  // `quiet` is for the duplicate-delivery guard, which fires on ordinary re-polls of a
  // message already handled and would bury the reasons worth reading.
  const deny = (reason, extra, quiet) => {
    if (!quiet) {
      try {
        store.addLog(accId, {
          number, name: ctx.name, customerMessage: ctx.text,
          action: 'skip', handoverReason: reason, confidence: 0,
          ms: Date.now() - started,
        });
      } catch (e) { /* logging must never be the thing that breaks a reply */ }
    }
    return { ok: false, action: 'skip', reason, ...extra };
  };

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
  if (ctx.msgId && (cstate.seen || []).includes(ctx.msgId)) return deny('Message already processed', null, true);

  if (cstate.takenOver) {
    const mins = Math.max(0, Number(s.takeoverMinutes) || 0);
    const since = Date.now() - (cstate.lastOwnerAt || 0);
    if (!mins || since < mins * 60000) {
      return deny('You are handling this chat', { takenOver: true, sinceMin: Math.round(since / 60000) });
    }
    // Long enough since the owner last touched it — hand it back.
    store.setConvo(accId, number, { takenOver: false });
  }
  // The cap exists to stop a runaway loop with another bot, but it counted for the LIFETIME
  // of the conversation — a regular customer spent their five replies and the assistant went
  // permanently silent on them, logged as "Reply limit reached" forever after. A quiet spell
  // is the end of a conversation: after four hours without an AI reply the count starts
  // fresh, so the cap only ever brakes a runaway exchange, never a relationship.
  if (cstate.replies && Date.now() - (cstate.lastAiAt || 0) > 4 * 3600000) {
    store.setConvo(accId, number, { replies: 0 });
    cstate.replies = 0;
  }
  if (cstate.replies >= (s.maxRepliesPerConversation || 15)) {
    return deny('Reply limit reached for this conversation (protects against message loops — resets after a few quiet hours)');
  }

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
    return { ok: true, action: 'handover', reason: forced, language, logId: log.id,
      waitText: waitAck(s, accId, number, language) };
  }

  const p = providerFor(s);

  // Retrieve. A failure here is not fatal — the model can still answer from live product
  // data — but it does cost confidence, which is the correct outcome.
  let hits = [], exampleHits = [];
  const knowledge = store.getKnowledge(accId);
  const examples = store.getExamples(accId);
  // Skipped entirely when no embedding model is configured. This ran on every incoming
  // message regardless, so a chat-only gateway returned HTTP 400 each time - a wasted round
  // trip on the reply path and an alarming error toast for a working configuration.
  const q = s.embedModel ? await p.embed(ctx.text) : { ok: false, vectors: [] };
  // On the reply path a stated refusal (400/404) is acted on at once; anything else gets a
  // few tries first, in case the provider really is just having a moment. Either way this
  // stops well short of failing on every message the owner ever receives.
  if (s.embedModel && !q.ok && !q.notConfigured) embedFailed(accId, q.err, !!q.unsupported);
  else if (q.ok) embedWorked(accId);
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

  // Match the question against the catalogue too. The catalogue is the one thing every
  // shop has from day one - answering from it is the whole point - but nothing here ever
  // searched it, so a shop with hundreds of products and no knowledge entries handed every
  // product question to the owner.
  const productHits = rag.lexicalSearch(ctx.text,
    (ctx.products || []).map((p) => ({
      title: p.title,
      body: `${p.category || ''} ${p.price ? '₹' + p.price : ''}${p.stock === false ? ' out of stock' : ''}`,
      tags: [p.category || ''],
    })),
    { topK: 4 });

  const system = rag.buildSystemPrompt({
    settings: s, language, business: s.businessInstructions,
    knowledge: hits, examples: exampleHits,
    products: ctx.products || [], productHits, customer: ctx.customer || {},
  });

  // Photos, stickers and voice notes arrive as turns with no text. Now that history
  // actually loads, one of those became {role:'user', content:''} and the gateway rejected
  // the whole request as invalid (HTTP 400) — so a customer who had ever sent a photo could
  // not be answered at all. An empty turn carries nothing the model can use; drop it.
  const history = (ctx.history || [])
    .filter((m) => m && String(m.text || '').trim())
    .slice(-8).map((m) => ({
      role: m.fromMe ? 'assistant' : 'user', content: String(m.text || '').slice(0, 800),
    }));

  const chatArgs = {
    system, messages: [...history, { role: 'user', content: String(ctx.text || '').slice(0, 2000) }],
    temperature: 0.3, maxTokens: Math.ceil((s.maxResponseChars || 600) / 2),
  };
  let out = await p.chat(chatArgs);

  // A backup brain. The primary gateway answering 503 - or 402, or timing out - used to be
  // the end of it: error logged, customer acked, sale waiting. With a backup configured the
  // SAME request goes straight to the second provider, and the log records which one
  // actually answered. Any OpenAI-compatible endpoint works; the customer never knows.
  const fbUrl = String(s.fallbackBaseUrl || '').trim();
  const fbKey = String(s.fallbackApiKey || '').trim();
  const fbModel = String(s.fallbackChatModel || '').trim();
  // A local address is an Ollama on this machine or LAN: no key exists or is needed.
  // Anything else is an OpenAI-compatible endpoint (OpenRouter, Groq, OpenAI...) with one.
  const fbLocal = /^https?:\/\/(127\.|localhost|0\.0\.0\.0|192\.168\.|10\.)/i.test(fbUrl);
  if (!out.ok && fbUrl && (fbKey || fbLocal)) {
    const fb = createProvider(fbLocal
      ? { provider: 'ollama', baseUrl: fbUrl, chatModel: fbModel || 'qwen2.5:7b', timeoutMs: s.timeoutMs }
      : { provider: 'heyroute', baseUrl: fbUrl, apiKey: fbKey, chatModel: fbModel || s.chatModel, timeoutMs: s.timeoutMs });
    const second = await fb.chat(chatArgs);
    if (second.ok) {
      second.model = 'backup: ' + (fbModel || (fbLocal ? 'qwen2.5:7b' : s.chatModel));
      out = second;
    } else {
      out.err = String(out.err || '') + ' — the backup provider also failed: ' + String(second.err || '');
    }
  }

  if (!out.ok) {
    const log = store.addLog(accId, {
      number, name: ctx.name, customerMessage: ctx.text, language, intent: intent.intent,
      action: 'error', error: out.err, ms: Date.now() - started,
    });
    return { ok: false, action: 'error', err: out.err, logId: log.id,
      waitText: waitAck(s, accId, number, language) };
  }

  const validation = rag.validate(out.text, { settings: s, products: ctx.products || [], language });
  const score = rag.confidence({
    hits, exampleHits, intent, validation,
    productHits,
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
    // A suggest is a draft on the owner's desk — from the customer's side it is silence
    // until approved, so it earns the same acknowledgement a handover does.
    waitText: (action === 'handover' || action === 'suggest') ? waitAck(s, accId, number, language) : null,
  };
}

// A customer whose question stumped the assistant must not face silence. This is the one
// line it may say WITHOUT understanding the message: an acknowledgement that a human will
// answer. Throttled hard - once per conversation per six hours - because three confused
// messages in a row must produce one "please wait", not three. Suppressed entirely while
// the owner has the chat, since a human is already talking.
const WAIT_TEXTS = {
  en: ['Thanks for your message! Our team will reply to you shortly. 🙏',
       'Our team has been informed — you will hear back very soon. 🙏'],
  hi: ['Aapke message ke liye dhanyavad! Hamari team jaldi hi reply karegi. 🙏',
       'Team ko bata diya hai — bas thoda sa intezaar kariye. 🙏'],
};
WAIT_TEXTS.hinglish = WAIT_TEXTS.hi;

function waitAck(s, accId, number, language) {
  if (s.waitReplyEnabled === false) return null;
  const c = store.convo(accId, number);
  if (c.takenOver) return null;
  // Burst guard only. The first cut throttled this to once per six hours, and the owner
  // caught what that really meant: every low-confidence message after the first was pure
  // silence, the one outcome they said is never acceptable. Three messages inside a
  // confused minute still get one ack, but a customer who comes back keeps hearing a
  // voice — with the wording rotated so it does not read like a machine stuck in a loop.
  if (Date.now() - (c.waitAckAt || 0) < 3 * 60000) return null;
  const n = (c.waitCount || 0) + 1;
  store.setConvo(accId, number, { waitAckAt: Date.now(), waitCount: n });
  const custom = String(s.waitReplyText || '').trim();
  if (custom) return custom;
  const list = WAIT_TEXTS[language] || WAIT_TEXTS.en;
  return list[(n - 1) % list.length];
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
