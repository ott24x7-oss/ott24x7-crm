// Catalog-first AI reply pipeline for the Chrome extension.
import * as rag from './rag.js';
import { mdToWhatsApp } from './shop.js';
import { createProvider } from './provider.js';
import * as store from './store.js';

const WAIT_TEXTS = {
  en: ['Thanks for your message! Our team will reply to you shortly. 🙏',
    'Our team has been informed — you will hear back very soon. 🙏'],
  hi: ['Aapke message ke liye dhanyavad! Hamari team jaldi hi reply karegi. 🙏',
    'Team ko bata diya hai — bas thoda sa intezaar kariye. 🙏'],
};
WAIT_TEXTS.hinglish = WAIT_TEXTS.hi;

async function waitAck(s, number, language) {
  if (s.waitReplyEnabled === false) return null;
  const c = await store.convo(number);
  if (c.takenOver) return null;
  if (Date.now() - (c.waitAckAt || 0) < 3 * 60000) return null;
  const n = (c.waitCount || 0) + 1;
  await store.setConvo(number, { waitAckAt: Date.now(), waitCount: n });
  const custom = String(s.waitReplyText || '').trim();
  if (custom) return custom;
  const list = WAIT_TEXTS[language] || WAIT_TEXTS.en;
  return list[(n - 1) % list.length];
}

export async function generate(ctx) {
  const started = Date.now();
  const s = await store.getSettings();
  const number = String(ctx.number || '').replace(/\D/g, '');

  const deny = async (reason, extra, quiet) => {
    if (!quiet) {
      try {
        await store.addLog({
          number, name: ctx.name, customerMessage: ctx.text,
          action: 'skip', handoverReason: reason, confidence: 0,
          ms: Date.now() - started,
        });
      } catch (e) { /* ignore */ }
    }
    return { ok: false, action: 'skip', reason, ...extra };
  };

  if (s.mode === 'off') return deny('AI is disabled');
  if (!s.consentAccepted) return deny('Consent not accepted in AI settings');
  if (s.paused) return deny('AI paused');
  if (!number) return deny('No phone number on this chat');
  if (ctx.isGroup && !s.allowGroups) return deny('Group chats are excluded');

  let cstate = await store.convo(number);
  if (ctx.msgId && (cstate.seen || []).includes(ctx.msgId)) {
    return deny('Message already processed', null, true);
  }

  if (cstate.takenOver) {
    const mins = Math.max(0, Number(s.takeoverMinutes) || 0);
    const since = Date.now() - (cstate.lastOwnerAt || 0);
    if (!mins || since < mins * 60000) {
      return deny('You are handling this chat', { takenOver: true });
    }
    await store.setConvo(number, { takenOver: false });
    cstate = await store.convo(number);
  }

  if (cstate.replies && Date.now() - (cstate.lastAiAt || 0) > 4 * 3600000) {
    await store.setConvo(number, { replies: 0 });
    cstate.replies = 0;
  }
  if ((cstate.replies || 0) >= (s.maxRepliesPerConversation || 15)) {
    return deny('Reply limit reached for this conversation');
  }

  const seen = [...(cstate.seen || []), ctx.msgId].filter(Boolean).slice(-50);
  await store.setConvo(number, { seen });

  const language = rag.detectLanguage(ctx.text);
  const intent = rag.detectIntent(ctx.text);

  const forced = rag.forcedHandover(ctx.text, s);
  if (forced) {
    const log = await store.addLog({
      number, name: ctx.name, customerMessage: ctx.text, language, intent: intent.intent,
      action: 'handover', handoverReason: forced, confidence: 0, ms: Date.now() - started,
    });
    return {
      ok: true, action: 'handover', reason: forced, language, logId: log.id,
      waitText: await waitAck(s, number, language),
    };
  }

  const knowledge = await store.getKnowledge();
  const examples = await store.getExamples();
  const products = ctx.products || [];

  let hits = rag.lexicalSearch(ctx.text, knowledge, { topK: 5 });
  let exampleHits = rag.lexicalSearch(ctx.text, examples, { topK: 3 });
  const productHits = rag.lexicalSearch(ctx.text,
    products.map((p) => ({
      title: p.title || p.name,
      body: `${p.category || p.cat || ''} ${p.price ? '₹' + p.price : ''} ${p.text || p.description || ''}${p.stock === false ? ' out of stock' : ''}`,
      tags: [p.category || p.cat || ''],
    })),
    { topK: 4 });

  const system = rag.buildSystemPrompt({
    settings: s, language,
    knowledge: knowledge.map((r) => ({ row: r })),
    examples: exampleHits,
    products, productHits, customer: ctx.customer || {},
  });

  const history = (ctx.history || [])
    .filter((m) => m && String(m.text || '').trim())
    .slice(-8).map((m) => ({
      role: m.fromMe ? 'assistant' : 'user', content: String(m.text || '').slice(0, 800),
    }));

  const p = createProvider(s);
  const out = await p.chat({
    system,
    messages: [...history, { role: 'user', content: String(ctx.text || '').slice(0, 2000) }],
    temperature: 0.3,
    maxTokens: Math.ceil((s.maxResponseChars || 600) / 2),
  });

  if (!out.ok) {
    const log = await store.addLog({
      number, name: ctx.name, customerMessage: ctx.text, language, intent: intent.intent,
      action: 'error', error: out.err, ms: Date.now() - started,
    });
    return {
      ok: false, action: 'error', err: out.err, logId: log.id,
      waitText: await waitAck(s, number, language),
    };
  }

  const validation = rag.validate(out.text, { settings: s, products });
  const score = rag.confidence({
    hits, exampleHits, intent, validation, productHits,
    historyTurns: history.length, hasProducts: !!products.length,
  });

  let action = 'suggest';
  if (!validation.ok) action = score < s.suggestConfidence ? 'handover' : 'suggest';
  else if (score >= s.minConfidence && (s.mode === 'always' || s.mode === 'offline')) action = 'send';
  else if (score < s.suggestConfidence) action = 'handover';
  else if (s.mode === 'suggest') action = 'suggest';

  const text = mdToWhatsApp(out.text);
  const log = await store.addLog({
    number, name: ctx.name, customerMessage: ctx.text, generated: text,
    language, intent: intent.intent, confidence: score,
    validation: validation.problems, action, model: out.model,
    ms: Date.now() - started,
  });

  if (action === 'suggest' && text) {
    await store.pushSuggestion({ number, name: ctx.name, text, confidence: score, logId: log.id });
  }

  return {
    ok: true, action, text, confidence: score,
    validation: validation.problems, language, intent: intent.intent,
    delayMs: s.replyDelayMs, logId: log.id,
    waitText: (action === 'handover' || action === 'suggest')
      ? await waitAck(s, number, language) : null,
  };
}

export async function markSent(number, logId, finalText) {
  const n = String(number || '').replace(/\D/g, '');
  const c = await store.convo(n);
  await store.setConvo(n, { replies: (c.replies || 0) + 1, lastAiAt: Date.now() });
  if (logId) await store.updateLog(logId, { sent: true, sentText: finalText, sentAt: Date.now() });
  return true;
}

export async function markOwnerTouch(number) {
  const n = String(number || '').replace(/\D/g, '');
  if (!n) return false;
  await store.setConvo(n, { takenOver: true, lastOwnerAt: Date.now() });
  return true;
}
