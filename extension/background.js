// Service worker: licensing, storage, and catalog-first AI.
import { generate, markSent, markOwnerTouch } from './ai/generate.js';
import * as store from './ai/store.js';
import { importCatalog } from './ai/catalog.js';
import { createProvider } from './ai/provider.js';

const SERVER = 'https://wa-crm.in';
const PRODUCT = 'ott24x7-crm';

async function deviceId() {
  const { wa_device } = await chrome.storage.local.get('wa_device');
  if (wa_device) return wa_device;
  const buf = crypto.getRandomValues(new Uint8Array(16));
  const id = 'ext-' + [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
  await chrome.storage.local.set({ wa_device: id });
  return id;
}

async function api(path, body) {
  const r = await fetch(`${SERVER}/api/v1/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function activate(key) {
  const res = await api('activate', { key: String(key || '').trim(), deviceId: await deviceId(), deviceName: 'Chrome extension' });
  if (res && res.valid) await chrome.storage.local.set({ wa_key: String(key).trim(), wa_lic: res });
  return res;
}

async function startTrial() {
  const res = await api('trial', { deviceId: await deviceId(), deviceName: 'Chrome extension', platform: 'extension' });
  if (res && res.valid && res.key) {
    await chrome.storage.local.set({
      wa_key: res.key, wa_lic: res, wa_checked: Date.now(), wa_trial_days: res.trialDays || null,
    });
  }
  if (res && (res.valid || res.reason === 'trial_expired')) {
    await chrome.storage.local.set({ wa_trial_tried: true });
  }
  return res;
}

async function ensureTrial() {
  const { wa_key, wa_trial_tried } = await chrome.storage.local.get(['wa_key', 'wa_trial_tried']);
  if (wa_key || wa_trial_tried) return null;
  try { return await startTrial(); } catch (e) { return null; }
}

async function validate() {
  const { wa_key } = await chrome.storage.local.get('wa_key');
  if (!wa_key) return { valid: false, reason: 'no_key' };
  const res = await api('validate', { key: wa_key, deviceId: await deviceId() });
  await chrome.storage.local.set({ wa_lic: res, wa_checked: Date.now() });
  return res;
}

const isTrial = (plan, key) =>
  String(plan || '').toLowerCase().startsWith('trial')
  || /free trial/i.test(String(plan || ''))
  || /^TRIAL-/i.test(String(key || ''));

async function licenseState() {
  let { wa_key, wa_lic, wa_checked, wa_trial_days } =
    await chrome.storage.local.get(['wa_key', 'wa_lic', 'wa_checked', 'wa_trial_days']);

  if (!wa_key) {
    const t = await ensureTrial();
    if (t && t.valid && t.key) {
      return { licensed: true, plan: 'trial', trial: true, trialDays: t.trialDays, expiresAt: t.expiresAt, key: t.key, justStarted: true };
    }
    if (t && t.reason === 'trial_expired') return { licensed: false, reason: 'trial_expired' };
    ({ wa_key, wa_lic, wa_checked, wa_trial_days } =
      await chrome.storage.local.get(['wa_key', 'wa_lic', 'wa_checked', 'wa_trial_days']));
  }
  if (!wa_key) return { licensed: false, reason: 'no_key' };

  const shape = (res, extra) => ({
    licensed: !!(res && res.valid),
    reason: res && res.reason,
    expiresAt: res && res.expiresAt,
    plan: res && res.plan,
    trial: isTrial(res && res.plan, wa_key),
    trialDays: wa_trial_days,
    key: wa_key,
    ...extra,
  });

  const stale = !wa_checked || Date.now() - wa_checked > 6 * 3600 * 1000;
  if (stale) {
    try { return shape(await validate()); }
    catch (e) {
      return shape(wa_lic, { offline: true });
    }
  }
  return shape(wa_lic);
}

/** Map imported products into the extension catalog shape (wa_catalog). */
function toCatalogRows(products) {
  return (products || []).filter((p) => p && p.title).map((p) => ({
    title: String(p.title).slice(0, 120),
    text: String(p.description || p.details || '').replace(/\s+/g, ' ').trim().slice(0, 800),
    cat: String(p.category || '').slice(0, 60),
    price: Number(p.price) || 0,
    img: String(p.image || ''),
    url: String(p.url || ''),
    stock: p.stock !== false,
  }));
}

const HANDLERS = {
  license: () => licenseState(),
  activate: ({ key }) => activate(key),
  trial: () => startTrial(),
  validate: () => validate(),
  deactivate: async () => {
    const { wa_key } = await chrome.storage.local.get('wa_key');
    let freed = false; let err = null;
    if (wa_key) {
      try {
        const res = await api('deactivate', { key: wa_key, deviceId: await deviceId() });
        freed = !!(res && res.ok);
        if (!freed) err = (res && res.reason) || 'not_registered';
      } catch (e) {
        return { ok: false, err: 'offline' };
      }
    }
    await chrome.storage.local.remove(['wa_key', 'wa_lic', 'wa_checked', 'wa_trial_days']);
    return { ok: true, freed, err };
  },
  openWebhookSetup: async () => { await chrome.runtime.openOptionsPage(); return { ok: true }; },
  openOptions: async () => { await chrome.runtime.openOptionsPage(); return { ok: true }; },
  webhook: async ({ url, body }) => {
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      return { ok: r.ok, status: r.status };
    } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
  },
  get: async ({ keys }) => chrome.storage.local.get(keys),
  set: async ({ items }) => { await chrome.storage.local.set(items); return { ok: true }; },
  serverInfo: async () => ({ server: SERVER, product: PRODUCT, buy: SERVER + '/#pricing', device: await deviceId() }),

  // ---- AI ----
  aiGetSettings: async () => ({ settings: await store.getSettings() }),
  aiSaveSettings: async (patch) => ({ settings: await store.saveSettings(patch || {}) }),
  aiGetKnowledge: async () => ({ rows: await store.getKnowledge() }),
  aiSaveKnowledgeRow: async (row) => {
    const rows = await store.getKnowledge();
    const key = (r) => `${r.kind || 'note'}::${String(r.title || '').trim().toLowerCase()}`;
    let i = row.id ? rows.findIndex((r) => r.id === row.id) : -1;
    if (i < 0 && row.title) i = rows.findIndex((r) => key(r) === key(row));
    const next = { active: true, approved: true, updatedAt: Date.now(), kind: 'faq', ...row };
    if (i > -1) rows[i] = { ...rows[i], ...next };
    else { next.id = 'k' + Date.now() + Math.round(Math.random() * 1e4); rows.unshift(next); }
    await store.saveKnowledge(rows);
    return { ok: true, id: next.id };
  },
  aiDeleteKnowledge: async ({ id }) => {
    await store.saveKnowledge((await store.getKnowledge()).filter((r) => r.id !== id));
    return { ok: true };
  },
  aiHealth: async () => {
    const s = await store.getSettings();
    return createProvider(s).health();
  },
  aiGenerate: async (ctx) => generate(ctx || {}),
  aiMarkSent: async ({ number, logId, text }) => {
    await markSent(number, logId, text);
    return { ok: true };
  },
  aiOwnerTouch: async ({ number }) => {
    await markOwnerTouch(number);
    return { ok: true };
  },
  aiLogs: async () => ({ logs: await store.getLogs(40) }),
  aiSuggestions: async () => ({ suggestions: await store.getSuggestions() }),
  aiImportWebsite: async ({ url, merge }) => {
    const has = await chrome.permissions.contains({ origins: ['*://*/*'] });
    if (!has) {
      return { ok: false, needPermission: true, err: 'Grant website access in Options (AI / Import section), then try again.' };
    }
    const result = await importCatalog({ url, limit: 200 });
    if (!result.ok) return result;
    const rows = toCatalogRows(result.products);
    const { wa_catalog: existing = [] } = await chrome.storage.local.get('wa_catalog');
    let next;
    if (merge) {
      const seen = new Set(existing.map((x) => String(x.title || '').toLowerCase()));
      next = [...existing];
      for (const r of rows) {
        const k = r.title.toLowerCase();
        if (seen.has(k)) {
          const i = next.findIndex((x) => String(x.title || '').toLowerCase() === k);
          if (i >= 0) next[i] = { ...next[i], ...r };
        } else { next.push(r); seen.add(k); }
      }
    } else {
      next = rows;
    }
    await chrome.storage.local.set({ wa_catalog: next });
    const s = await store.getSettings();
    if (url && !s.shopSiteUrl) {
      try {
        const origin = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url).origin;
        await store.saveSettings({ shopSiteUrl: origin });
      } catch (e) { /* ignore */ }
    }
    return { ok: true, via: result.via, count: rows.length, total: next.length };
  },
};

chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === 'install') ensureTrial().catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const fn = HANDLERS[msg && msg.op];
  if (!fn) { reply({ ok: false, err: 'unknown_op' }); return false; }
  Promise.resolve(fn(msg.args || {}))
    .then((data) => reply({ ok: true, data }))
    .catch((e) => reply({ ok: false, err: String((e && e.message) || e) }));
  return true;
});
