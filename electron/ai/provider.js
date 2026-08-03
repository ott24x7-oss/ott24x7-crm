// AI provider layer.
//
// The CRM never talks to a model directly — it calls the small interface below, so the
// engine can be swapped (Ollama today; OpenAI, Gemini, Groq or Anthropic later) without a
// single line of sales logic changing. A provider must implement:
//
//   health()                     -> { ok, version?, err? }
//   models()                     -> { ok, models: [{ name, size }], err? }
//   chat({ system, messages, ... }) -> { ok, text, ms, err? }
//   embed(textOrTexts)           -> { ok, vectors: number[][], dims, err? }
//
// Nothing here knows what a lead, a price or a customer is.

const DEFAULT_TIMEOUT = 150000;

// fetch with a hard deadline. Ollama on a cold model can sit for a long time, and a
// blocked reply is worse than a fast failure the owner can see and act on.
async function req(url, opts, timeoutMs, label, model, hosted) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || DEFAULT_TIMEOUT);
  const started = Date.now();
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    const ms = Date.now() - started;
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { ok: false, ms, err: friendly(r.status, body, label, model, hosted) };
    }
    return { ok: true, ms, json: await r.json() };
  } catch (e) {
    const ms = Date.now() - started;
    if (e && e.name === 'AbortError') {
      return { ok: false, ms, err: `${label} timed out after ${Math.round((timeoutMs || DEFAULT_TIMEOUT) / 1000)}s. A large model on a slow machine can exceed this — raise the timeout or use a smaller model.` };
    }
    if (/ECONNREFUSED|fetch failed/i.test(String(e && e.message))) {
      return { ok: false, ms, err: hosted
        ? 'Cannot reach the AI service. Check the address and your internet connection.'
        : 'Cannot reach the AI server. Is Ollama running? Start it with "ollama serve".' };
    }
    return { ok: false, ms, err: String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

// Turn an HTTP status into something an owner can act on, not a stack trace.
function friendly(status, body, label, model, hosted) {
  // Every message below used to assume a local engine, and req() is shared by both
  // providers - so a hosted gateway returning 404 for an endpoint it does not serve told
  // the owner to run "ollama pull gpt-5.6-luna". That sends someone to install software
  // they do not need, to fix a problem they do not have.
  if (hosted) {
    if (status === 401 || status === 403) return `${label}: the API key was rejected (HTTP ${status}). Check the key and that it has credit.`;
    if (status === 404) return `${label}: your provider does not serve this endpoint or model. Check the model name against their published list; if they only serve chat, leave the embedding model empty.`;
    if (status === 429) return `${label}: rate limited by your provider (HTTP 429). Wait a moment, or check your plan's limits.`;
    if (status >= 500) return `${label}: your AI provider returned ${status}. That is their side - try again shortly.`;
    return `${label} failed (HTTP ${status}). ${String(body).slice(0, 200)}`;
  }
  if (status === 404 && /model/i.test(body)) {
    // /api/chat names the model in its error; /api/embed does not. Fall back to the model
    // we asked for, so the message is always a command the owner can paste and run.
    const m = /model '([^']+)'/.exec(body);
    const name = (m && m[1]) || model;
    return `The model ${name ? `"${name}" ` : ''}is not installed. Pull it first: ollama pull ${name || '<model>'}`;
  }
  if (status === 404) return `${label}: endpoint not found. Check the Ollama base URL.`;
  if (status === 500 && /memory|oom/i.test(body)) return 'The model ran out of memory. Try a smaller model (for example qwen3:4b instead of qwen3:8b).';
  return `${label} failed (HTTP ${status}). ${String(body).slice(0, 200)}`;
}

// Retry only what is worth retrying. A missing model or a bad URL will fail identically
// every time; a cold start or a transient socket error will not.
const RETRYABLE = /timed out|socket|ECONNRESET|EPIPE|HTTP 5\d\d/i;

async function withRetry(fn, attempts) {
  let last = null;
  for (let i = 0; i < Math.max(1, attempts || 2); i++) {
    last = await fn();
    if (last.ok || !RETRYABLE.test(String(last.err || ''))) return last;
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  return last;
}

function ollama(cfg) {
  const base = String(cfg.baseUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const chatModel = cfg.chatModel || 'qwen3:4b';
  const embedModel = cfg.embedModel || 'nomic-embed-text';
  const timeout = Number(cfg.timeoutMs) || DEFAULT_TIMEOUT;

  return {
    name: 'ollama',
    describe: () => ({ provider: 'ollama', base, chatModel, embedModel }),

    async health() {
      const r = await req(`${base}/api/version`, { method: 'GET' }, 8000, 'Health check');
      return r.ok ? { ok: true, version: (r.json && r.json.version) || 'unknown', ms: r.ms } : { ok: false, err: r.err };
    },

    async models() {
      const r = await req(`${base}/api/tags`, { method: 'GET' }, 15000, 'Model list');
      if (!r.ok) return { ok: false, err: r.err, models: [] };
      const models = ((r.json && r.json.models) || []).map((m) => ({
        name: m.name,
        size: m.size || 0,
        // Ollama does not flag which models can embed, so infer from the usual naming.
        embedding: /embed|bge|minilm|e5|gte/i.test(m.name || ''),
      }));
      return { ok: true, models };
    },

    // messages: [{ role: 'user'|'assistant', content }]
    async chat({ system, messages, temperature, maxTokens, model }) {
      const body = {
        model: model || chatModel,
        stream: false,
        // Reasoning models (qwen3, qwen3.5, deepseek-r1) burn the whole token budget inside
        // a <think> block and never reach an answer, which arrives here as an empty reply
        // after stripping. Measured on qwen3.5: 58s and nothing; with thinking off, a
        // correct reply. Ollama ignores this field on models that do not reason.
        think: false,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...(messages || []),
        ],
        options: {
          temperature: typeof temperature === 'number' ? temperature : 0.3,
          // Sales replies are short. Capping output keeps latency down and stops the model
          // rambling its way into claims the validator then has to reject.
          num_predict: Math.max(64, Math.min(1024, maxTokens || 320)),
        },
      };
      const r = await withRetry(
        () => req(`${base}/api/chat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }, timeout, 'Chat', body.model),
        2
      );
      if (!r.ok) return { ok: false, err: r.err, ms: r.ms };
      const raw = String((r.json && r.json.message && r.json.message.content) || '').trim();
      // A <think> block is internal monologue and must never reach a customer.
      const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim();
      // Raw content that strips to nothing means the model reasoned until it ran out of
      // budget. Say so plainly — "empty reply" would send the owner hunting in the wrong place.
      if (!text && raw) {
        return { ok: false, ms: r.ms, model: body.model,
          err: `${body.model} spent its whole budget thinking and never answered. Raise "Max reply length" in AI settings, or use a model that does not reason (for example qwen2.5:3b).` };
      }
      return { ok: true, text, ms: r.ms, model: body.model };
    },

    async embed(input) {
      const texts = Array.isArray(input) ? input : [input];
      if (!texts.length) return { ok: true, vectors: [], dims: 0 };
      const r = await withRetry(
        () => req(`${base}/api/embed`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: embedModel, input: texts }),
        }, timeout, 'Embedding', embedModel),
        2
      );
      if (!r.ok) return { ok: false, err: r.err, vectors: [] };
      const vectors = (r.json && r.json.embeddings) || [];
      return { ok: true, vectors, dims: vectors[0] ? vectors[0].length : 0, ms: r.ms };
    },
  };
}

// OpenAI-compatible hosted provider.
//
// Covers HeyRoute (an OpenAI-compatible router in front of OpenAI, Claude, Gemini,
// DeepSeek and others) and, unchanged, OpenAI itself, Groq, OpenRouter, Together — any
// endpoint speaking /v1/chat/completions with a Bearer key. Base URL, key and model are
// all settings, so switching gateway is configuration rather than code.
//
// Chosen over the local-model path for a reason that matters here: the previous assistant
// was withdrawn partly because it reported a model as ready when it was not installed.
// A hosted key either authenticates or it does not, and health() says which — that whole
// class of "looks fine, is not" disappears.
function openaiCompatible(cfg) {
  const base = String(cfg.baseUrl || 'https://heyroute.ai').replace(/\/+$/, '');
  const chatModel = cfg.chatModel || 'gpt-4o-mini';
  // NOT defaulted. Falling back to a model name when the field is empty meant a gateway
  // that serves no embeddings was sent a model it does not have, and answered HTTP 400 on
  // every single customer message. Empty means "this provider has none" and must stay empty.
  const embedModel = String(cfg.embedModel || '').trim();
  const apiKey = String(cfg.apiKey || '').trim();
  const timeout = Number(cfg.timeoutMs) || DEFAULT_TIMEOUT;

  // Accepts a base with or without /v1 — people paste both, and a double /v1/v1 404s in a
  // way that reads like the service is down rather than a typo.
  const v1 = /\/v1$/.test(base) ? base : `${base}/v1`;
  const headers = () => ({
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  });

  return {
    name: 'openai',
    // Never returns the key itself — describe() is surfaced in the UI and written to logs.
    describe: () => ({ provider: 'openai', base: v1, chatModel, embedModel, keySet: !!apiKey }),

    async health() {
      if (!apiKey) return { ok: false, err: 'No API key set. Paste the key from your provider into AI settings.' };
      const r = await req(`${v1}/models`, { method: 'GET', headers: headers() }, 12000, 'Health check', null, true);
      if (!r.ok) return { ok: false, err: r.err };
      const list = (r.json && (r.json.data || r.json.models)) || [];
      // Reachable and authenticated is the honest claim. Whether the *chosen* model exists
      // is answered by models() below, and never assumed here.
      return { ok: true, version: `${list.length} model(s) available`, ms: r.ms };
    },

    async models() {
      if (!apiKey) return { ok: false, err: 'No API key set.', models: [] };
      const r = await req(`${v1}/models`, { method: 'GET', headers: headers() }, 15000, 'Model list', null, true);
      if (!r.ok) return { ok: false, err: r.err, models: [] };
      const raw = (r.json && (r.json.data || r.json.models)) || [];
      const models = raw.map((m) => {
        const name = m.id || m.name || String(m);
        return { name, size: 0, embedding: /embed/i.test(name) };
      });
      return { ok: true, models };
    },

    async chat({ system, messages, temperature, maxTokens, model }) {
      if (!apiKey) return { ok: false, err: 'No API key set. Paste the key from your provider into AI settings.' };
      const body = {
        model: model || chatModel,
        stream: false,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...(messages || []),
        ],
        temperature: typeof temperature === 'number' ? temperature : 0.3,
        max_tokens: Math.max(64, Math.min(1024, maxTokens || 320)),
      };
      const r = await withRetry(
        () => req(`${v1}/chat/completions`, { method: 'POST', headers: headers(), body: JSON.stringify(body) },
          timeout, 'Chat', body.model, true),
        2
      );
      if (!r.ok) return { ok: false, err: r.err, ms: r.ms };
      const choice = (r.json && r.json.choices && r.json.choices[0]) || {};
      const raw = String((choice.message && choice.message.content) || '').trim();
      // Reasoning models routed through a gateway still emit <think>; it is internal
      // monologue and must never reach a customer.
      const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim();
      if (!text && choice.finish_reason === 'length') {
        return { ok: false, ms: r.ms, model: body.model,
          err: `${body.model} hit the length limit before answering. Raise "Max reply length" in AI settings, or pick a model that does not reason at length.` };
      }
      return { ok: true, text, ms: r.ms, model: body.model };
    },

    async embed(input) {
      const texts = Array.isArray(input) ? input : [input];
      if (!texts.length) return { ok: true, vectors: [], dims: 0 };
      // Not configured is not a failure. Say so quietly instead of calling an endpoint that
      // cannot work and surfacing its error to the owner on every message.
      if (!embedModel) return { ok: false, vectors: [], notConfigured: true, err: 'No embedding model set — search uses keyword matching.' };
      if (!apiKey) return { ok: false, err: 'No API key set.', vectors: [] };
      const r = await withRetry(
        () => req(`${v1}/embeddings`, { method: 'POST', headers: headers(),
          body: JSON.stringify({ model: embedModel, input: texts }) },
          timeout, 'Embedding', embedModel, true),
        2
      );
      if (!r.ok) {
        // A chat-only gateway is a normal configuration, not a fault. Say so precisely so
        // the owner knows retrieval falls back to keyword matching rather than assuming
        // training is broken.
        return { ok: false, vectors: [],
          err: `${r.err} — if this gateway only serves chat models, leave embeddings off; training still works on keyword matching.` };
      }
      const vectors = ((r.json && r.json.data) || []).map((d) => d.embedding).filter(Array.isArray);
      return { ok: true, vectors, dims: vectors[0] ? vectors[0].length : 0, ms: r.ms };
    },
  };
}

// Registry. Adding a hosted provider later means adding one entry here and nothing else.
const PROVIDERS = { ollama, openai: openaiCompatible, heyroute: openaiCompatible };

function createProvider(cfg) {
  const make = PROVIDERS[(cfg && cfg.provider) || 'ollama'];
  if (!make) throw new Error(`Unknown AI provider: ${cfg && cfg.provider}`);
  return make(cfg || {});
}

module.exports = { createProvider, PROVIDERS };
