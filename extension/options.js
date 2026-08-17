// Webhook setup. Lives on an extension page because chrome.permissions.request() only
// works from a user gesture here — a service worker or content script cannot call it.
const $ = (id) => document.getElementById(id);
const say = (text, bad) => { const m = $('msg'); m.className = 'msg' + (bad ? ' bad' : ''); m.textContent = text; };

const SAMPLE = {
  event: 'lead.updated',
  name: 'Ravi Sharma',
  number: '919876543210',
  type: 'Hot',
  status: 'Proposal sent',
  at: '2026-07-27T10:00:00.000Z',
  source: 'WA-CRM',
};
$('sample').textContent = JSON.stringify(SAMPLE, null, 2);

const load = () => chrome.storage.local.get('wa_webhook');
const save = (cfg) => chrome.storage.local.set({ wa_webhook: cfg });

function paint(cfg) {
  const s = $('state');
  s.className = 'state' + (cfg.on ? ' on' : '');
  s.lastElementChild.textContent = cfg.on ? 'Active' : 'Off';
}

function originOf(raw) {
  const u = new URL(raw);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
  return u.origin + '/*';
}

(async () => {
  const { wa_webhook: cfg = { url: '', on: false } } = await load();
  $('url').value = cfg.url || '';
  paint(cfg);

  $('enable').addEventListener('click', async () => {
    const raw = $('url').value.trim();
    if (!raw) return say('Paste the webhook URL first.', true);
    let origin;
    try { origin = originOf(raw); } catch (e) { return say('That does not look like a valid http(s) URL.', true); }

    // Must be called directly in the click handler — awaiting anything first loses the gesture.
    chrome.permissions.request({ origins: [origin] }, async (granted) => {
      if (!granted) return say('Permission declined, so nothing will be sent.', true);
      const next = { url: raw, on: true };
      await save(next);
      paint(next);
      say('Enabled. Lead changes will be posted to this URL.');
    });
  });

  $('test').addEventListener('click', async () => {
    const raw = $('url').value.trim();
    if (!raw) return say('Paste the webhook URL first.', true);
    say('Sending…');
    chrome.runtime.sendMessage({ op: 'webhook', args: { url: raw, body: { ...SAMPLE, event: 'test' } } }, (r) => {
      const d = (r && r.data) || {};
      if (d.ok) say(`Delivered — the endpoint replied HTTP ${d.status}.`);
      else say(`Failed: ${d.err || 'no response'}. If this says "Failed to fetch", approve the host above first.`, true);
    });
  });

  $('off').addEventListener('click', async () => {
    const next = { url: $('url').value.trim(), on: false };
    await save(next);
    paint(next);
    say('Turned off.');
  });

  const aiSay = (text, bad) => {
    const m = $('aiMsg');
    m.className = 'msg' + (bad ? ' bad' : '');
    m.textContent = text;
  };
  const paintAi = (on) => {
    const s = $('aiState');
    s.className = 'state' + (on ? ' on' : '');
    s.lastElementChild.textContent = on ? 'Allowed' : 'Not granted';
  };
  chrome.permissions.contains({ origins: ['*://*/*'] }, paintAi);
  $('aiHosts').addEventListener('click', () => {
    chrome.permissions.request({ origins: ['*://*/*'] }, (granted) => {
      paintAi(!!granted);
      aiSay(granted
        ? 'Done. Open WhatsApp → AI Assistant → Import from website.'
        : 'Permission declined — catalog import will not work.', !granted);
    });
  });
})();
