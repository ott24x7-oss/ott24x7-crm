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

const DEFAULT_TIMEOUT = 60000;

// fetch with a hard deadline. Ollama on a cold model can sit for a long time, and a
// blocked reply is worse than a fast failure the owner can see and act on.
async function req(url, opts, timeoutMs, label) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || DEFAULT_TIMEOUT);
  const started = Date.now();
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    const ms = Date.now() - started;
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { ok: false, ms, err: friendly(r.status, body, label) };
    }
    return { ok: true, ms, json: await r.json() };
  } catch (e) {
    const ms = Date.now() - started;
    if (e && e.name === 'AbortError') {
      return { ok: false, ms, err: `${label} timed out after ${Math.round((timeoutMs || DEFAULT_TIMEOUT) / 1000)}s. A large model on a slow machine can exceed this — raise the timeout or use a smaller model.` };
    }
    if (/ECONNREFUSED|fetch failed/i.test(String(e && e.message))) {
      return { ok: false, ms, err: 'Cannot reach the AI server. Is Ollama running? Start it with "ollama serve".' };
    }
    return { ok: false, ms, err: String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

// Turn an HTTP status into something an owner can act on, not a stack trace.
function friendly(status, body, label) {
  if (status === 404 && /model/i.test(body)) {
    const m = /model '([^']+)'/.exec(body);
    return `The model ${m ? `"${m[1]}" ` : ''}is not installed. Pull it first: ollama pull ${m ? m[1] : '<model>'}`;
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
        }, timeout, 'Chat'),
        2
      );
      if (!r.ok) return { ok: false, err: r.err, ms: r.ms };
      let text = String((r.json && r.json.message && r.json.message.content) || '').trim();
      // Reasoning models (Qwen3 among them) emit a <think> block before the answer. It is
      // internal monologue and must never reach a customer.
      text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim();
      return { ok: true, text, ms: r.ms, model: body.model };
    },

    async embed(input) {
      const texts = Array.isArray(input) ? input : [input];
      if (!texts.length) return { ok: true, vectors: [], dims: 0 };
      const r = await withRetry(
        () => req(`${base}/api/embed`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: embedModel, input: texts }),
        }, timeout, 'Embedding'),
        2
      );
      if (!r.ok) return { ok: false, err: r.err, vectors: [] };
      const vectors = (r.json && r.json.embeddings) || [];
      return { ok: true, vectors, dims: vectors[0] ? vectors[0].length : 0, ms: r.ms };
    },
  };
}

// Registry. Adding a hosted provider later means adding one entry here and nothing else.
const PROVIDERS = { ollama };

function createProvider(cfg) {
  const make = PROVIDERS[(cfg && cfg.provider) || 'ollama'];
  if (!make) throw new Error(`Unknown AI provider: ${cfg && cfg.provider}`);
  return make(cfg || {});
}

module.exports = { createProvider, PROVIDERS };
