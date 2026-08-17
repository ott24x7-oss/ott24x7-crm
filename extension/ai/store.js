// chrome.storage.local persistence for extension AI.
const DEFAULT_SETTINGS = {
  mode: 'always',
  provider: 'heyroute',
  baseUrl: 'https://heyroute.ai',
  apiKey: '',
  chatModel: 'gpt-4o-mini',
  timeoutMs: 60000,
  minConfidence: 0.62,
  suggestConfidence: 0.35,
  replyDelayMs: 2500,
  maxRepliesPerConversation: 15,
  handoverKeywords: ['refund', 'complaint', 'legal', 'lawyer', 'police', 'fraud', 'cheat',
    'scam', 'chargeback', 'manager', 'owner', 'human', 'call me',
    'paisa wapas', 'shikayat', 'dhokha'],
  businessName: '',
  shopSiteUrl: '',
  supportWhatsApp: '',
  supportTelegram: '',
  maxResponseChars: 600,
  allowGroups: false,
  paused: false,
  waitReplyEnabled: true,
  waitReplyText: '',
  takeoverMinutes: 15,
  consentAccepted: false,
  catalogPromptLimit: 120,
};

const KEYS = {
  settings: 'wa_ai_settings',
  knowledge: 'wa_ai_knowledge',
  examples: 'wa_ai_examples',
  logs: 'wa_ai_logs',
  state: 'wa_ai_state',
  suggestions: 'wa_ai_suggestions',
};

async function get(key, fallback) {
  const r = await chrome.storage.local.get(key);
  return r[key] ?? fallback;
}

async function set(key, value) {
  await chrome.storage.local.set({ [key]: value });
  return true;
}

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await get(KEYS.settings, {})) };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await set(KEYS.settings, next);
  return next;
}

export async function getKnowledge() {
  return await get(KEYS.knowledge, []);
}

export async function saveKnowledge(rows) {
  await set(KEYS.knowledge, rows);
  return rows;
}

export async function getExamples() {
  return await get(KEYS.examples, []);
}

export async function convo(number) {
  const all = await get(KEYS.state, {});
  return all[number] || {};
}

export async function setConvo(number, patch) {
  const all = await get(KEYS.state, {});
  all[number] = { ...(all[number] || {}), ...patch };
  await set(KEYS.state, all);
  return all[number];
}

export async function addLog(entry) {
  const logs = await get(KEYS.logs, []);
  const row = { id: 'l' + Date.now() + Math.round(Math.random() * 1e3), at: Date.now(), ...entry };
  logs.unshift(row);
  await set(KEYS.logs, logs.slice(0, 200));
  return row;
}

export async function updateLog(id, patch) {
  const logs = await get(KEYS.logs, []);
  const i = logs.findIndex((l) => l.id === id);
  if (i >= 0) logs[i] = { ...logs[i], ...patch };
  await set(KEYS.logs, logs);
  return true;
}

export async function getLogs(limit = 40) {
  return (await get(KEYS.logs, [])).slice(0, limit);
}

export async function pushSuggestion(row) {
  const list = await get(KEYS.suggestions, []);
  list.unshift({ id: 's' + Date.now(), at: Date.now(), ...row });
  await set(KEYS.suggestions, list.slice(0, 50));
  return list[0];
}

export async function getSuggestions() {
  return await get(KEYS.suggestions, []);
}

export { DEFAULT_SETTINGS, KEYS };
