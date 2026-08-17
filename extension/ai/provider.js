// OpenAI-compatible chat provider for the extension service worker.
const DEFAULT_TIMEOUT = 60000;

async function req(url, opts, timeoutMs, label) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || DEFAULT_TIMEOUT);
  const started = Date.now();
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    const ms = Date.now() - started;
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      if (r.status === 401 || r.status === 403) {
        return { ok: false, ms, status: r.status, err: `${label}: API key rejected (HTTP ${r.status}).` };
      }
      if (r.status === 402) {
        return { ok: false, ms, status: r.status, err: `${label}: provider account out of credit (HTTP 402).` };
      }
      if (r.status === 429) {
        return { ok: false, ms, status: r.status, err: `${label}: rate limited (HTTP 429).` };
      }
      return { ok: false, ms, status: r.status, err: `${label} failed (HTTP ${r.status}). ${String(body).slice(0, 200)}` };
    }
    return { ok: true, ms, json: await r.json() };
  } catch (e) {
    const ms = Date.now() - started;
    if (e && e.name === 'AbortError') {
      return { ok: false, ms, err: `${label} timed out after ${Math.round((timeoutMs || DEFAULT_TIMEOUT) / 1000)}s.` };
    }
    return { ok: false, ms, err: String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

export function createProvider(cfg) {
  const base = String(cfg.baseUrl || 'https://heyroute.ai').replace(/\/+$/, '');
  const chatModel = cfg.chatModel || 'gpt-4o-mini';
  const apiKey = String(cfg.apiKey || '').trim();
  const timeout = Number(cfg.timeoutMs) || DEFAULT_TIMEOUT;
  const v1 = /\/v1$/.test(base) ? base : `${base}/v1`;
  const headers = () => ({
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  });

  return {
    async health() {
      if (!apiKey) return { ok: false, err: 'No API key set.' };
      const r = await req(`${v1}/models`, { method: 'GET', headers: headers() }, 12000, 'Health check');
      if (!r.ok) return { ok: false, err: r.err };
      const list = (r.json && (r.json.data || r.json.models)) || [];
      return { ok: true, version: `${list.length} model(s) available`, ms: r.ms };
    },

    async chat({ system, messages, temperature, maxTokens, model }) {
      if (!apiKey) return { ok: false, err: 'No API key set. Paste the key in AI settings.' };
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
      const r = await req(`${v1}/chat/completions`, {
        method: 'POST', headers: headers(), body: JSON.stringify(body),
      }, timeout, 'Chat');
      if (!r.ok) return { ok: false, err: r.err, ms: r.ms };
      const choice = (r.json && r.json.choices && r.json.choices[0]) || {};
      const raw = String((choice.message && choice.message.content) || '').trim();
      const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim();
      return { ok: true, text, ms: r.ms, model: body.model };
    },
  };
}
