// Isolated-world UI. Owns the launcher button and the side panel, and reaches WhatsApp
// only through the page bridge (page.js). Deliberately has no access to WPP itself.
(() => {
  const TAG = 'WACRM';
  let seq = 0;
  const pending = new Map();

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const m = ev.data;
    if (!m || m.tag !== TAG) return;
    if (m.dir === 'res' && pending.has(m.id)) { pending.get(m.id)(m.res); pending.delete(m.id); }
    if (m.dir === 'msg' && m.data) onIncoming(m.data).catch(() => {});
  });

  // Chatbot flows. Previously the UI claimed flows were "running" while nothing was
  // subscribed to incoming messages at all, so no flow could ever fire.
  const repliedAt = new Map();   // jid -> timestamp, so we never spam one chat
  async function onIncoming(msg) {
    if (!msg.body) return;
    if (msg.isGroup) return;
    const last = repliedAt.get(msg.jid) || 0;
    if (Date.now() - last < 60000) return;

    const jid = msg.jid || msg.from;
    const number = String(jid || '').replace(/@.*$/, '').replace(/\D/g, '');
    const catalog = await store.get('wa_catalog', []);
    const products = (catalog || []).map((p) => ({
      title: p.title, name: p.title, price: p.price || p.sell || 0,
      text: p.text || '', description: p.text || '', category: p.cat || '',
      cat: p.cat || '', url: p.url || '', stock: p.stock !== false,
    }));

    try {
      const aiRes = await bg('aiGenerate', {
        number, name: msg.notifyName || msg.name || '', text: msg.body,
        msgId: msg.id || msg.msgId || '', isGroup: false, products,
      });
      const d = (aiRes && aiRes.data) || aiRes || {};
      if (d && d.ok) {
        if (d.action === 'send' && d.text) {
          repliedAt.set(msg.jid, Date.now());
          if (d.delayMs) await sleep(Math.min(8000, Number(d.delayMs) || 0));
          const r = await wa('sendText', { to: jid, text: d.text });
          if (r && r.ok) {
            await bg('aiMarkSent', { number, logId: d.logId, text: d.text });
            toast('AI replied');
          }
          return;
        }
        if (d.waitText) {
          repliedAt.set(msg.jid, Date.now());
          await wa('sendText', { to: jid, text: d.waitText });
          if (d.action === 'suggest' && d.text) toast('AI draft saved — open AI panel');
          return;
        }
        if (d.action === 'suggest' && d.text) {
          toast('AI draft ready — open AI panel to review');
          return;
        }
        if (d.action === 'handover') return;
      }
    } catch (e) { /* fall through to keyword flows */ }

    const flows = (await store.get('wa_flows', [])).filter((f) => f.active);
    if (!flows.length) return;
    const text = msg.body.toLowerCase();
    const hit = flows.find((f) => (f.keywords || []).some((k) => k && text.includes(k)));
    if (!hit) return;
    repliedAt.set(msg.jid, Date.now());
    const r = await wa('sendText', { to: jid, text: hit.reply });
    if (r.ok) toast(`Chatbot replied: ${hit.name}`);
  }

  // Ask the page to do something. Never sends code — only a named operation.
  const wa = (op, args) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    window.postMessage({ tag: TAG, dir: 'req', id, op, args }, '*');
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ ok: false, err: 'timeout' }); } }, 30000);
  });
  const bg = (op, args) => new Promise((r) => chrome.runtime.sendMessage({ op, args }, r));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- tiny DOM helper ----------
  const el = (t, p = {}, ...kids) => {
    const n = document.createElement(t);
    for (const [k, v] of Object.entries(p)) {
      if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (k === 'class') n.className = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (v != null) n.setAttribute(k, v);
    }
    kids.flat().forEach((c) => c != null && n.append(c.nodeType ? c : document.createTextNode(c)));
    return n;
  };
  const $ = (s, r = document) => r.querySelector(s);

  let toastT;
  function toast(msg, bad) {
    let t = $('#wacrm-toast');
    if (!t) { t = el('div', { id: 'wacrm-toast' }); document.body.append(t); }
    t.textContent = msg;
    t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, 3200);
  }

  const store = {
    async get(k, d) { const r = await bg('get', { keys: [k] }); return (r && r.data && r.data[k]) ?? d; },
    async set(k, v) { return bg('set', { items: { [k]: v } }); },
  };

  // ---------- shell ----------
  // Short tab label + the full title/subtitle each view prints in its own header, so the
  // tab strip stays scannable while the screen itself explains what it does.
  const FEATURES = [
    ['guide', 'Guide', 'How to use WA-CRM',
      'What every icon on the left does, and the steps to use it.',
      'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01'],
    ['catalog', 'Catalog', 'Product Catalog',
      'Your saved offers — send an image and caption to the open chat in one click.',
      'M20 7H4V5h16zM4 9h16l-1.2 10.2A2 2 0 0 1 16.8 21H7.2a2 2 0 0 1-2-1.8z'],
    ['quick', 'Quick', 'Quick Replies',
      'One-tap phrases that appear just above the message box.',
      'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
    ['leads', 'Leads', 'Leads',
      'Save the chat you are in as a lead, then track its type and status.',
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6'],
    ['broadcast', 'Send', 'Bulk Send',
      'Send one message to a list of numbers, with randomised delays between each.',
      'M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6'],
    ['numbers', 'Check', 'Number Check',
      'Find out which numbers actually have a WhatsApp account before you write to them.',
      'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.1 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z'],
    ['export', 'Export', 'Export Numbers',
      'Pull your contacts and groups out as a CSV you can open anywhere.',
      'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3'],
    ['invoice', 'Invoice', 'Invoice',
      'Build a bill from your business details and send it to the open chat.',
      'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5'],
    ['schedule', 'Schedule', 'Schedule',
      'Queue a message to go out at a date and time you choose.',
      'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'],
    ['reminder', 'Reminder', 'Reminder',
      'A task alarm for you, with your own note — not a message to the customer.',
      'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0'],
    ['groups', 'Groups', 'Group Tools',
      'Select several groups and post the same message to all of them.',
      'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8'],
    ['autopost', 'Offers', 'Auto Offer Post',
      'Rotate your products into chosen groups automatically, on a timer.',
      'M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6M18 3v4M20 5h-4'],
    ['funnels', 'Funnels', 'Follow-Up Funnels',
      'Automate sequences based on lead status, time and replies.',
      'M4 5h16M7 12h10M10 19h4'],
    ['ai', 'AI', 'AI Assistant',
      'Catalog-first auto-replies for WhatsApp — prices and links from your product list only.',
      'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zM8 12h8M12 8v8'],
    ['flows', 'Chatbot', 'Chatbot Flow Builder',
      'Design chatbot journeys that answer common questions for you.',
      'M12 8V4H8M4 8h16v12H4zM9 14h.01M15 14h.01M2 14h2M20 14h2'],
    ['webhook', 'API', 'Webhook & API',
      'Connect Google Sheets, other CRMs and automation tools.',
      'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'],
    ['start', 'Start', 'Start a conversation',
      'Message a number without saving it to your contacts first.',
      'M21 11.5a8.4 8.4 0 0 1-9 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 4 12a8.5 8.5 0 0 1 8.5-8.5 8.5 8.5 0 0 1 8.5 8z'],
    ['links', 'Links', 'Click-to-chat Links',
      'Make wa.me links with a message already typed, for ads and your bio.',
      'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'],
    ['refer', 'Refer', 'Refer & Earn',
      'Share WA-CRM with your own link and earn on every licence sold.',
      'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z'],
    ['deals', 'Deals', 'Deals & Renewals',
      'What each customer bought — with an automatic feedback check-in and a renewal reminder.',
      'M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01'],
    ['books', 'Books', 'Sales & Expenses',
      'Record what you sold, bought and spent — and see your daily profit.',
      'M3 3v18h18M7 15l4-4 3 3 5-6'],
    ['backup', 'Backup', 'Backup & Restore',
      'Save everything to a file, and bring it to a new browser or laptop.',
      'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v13'],
    ['menu', 'Menu', 'Menu Manager',
      'Enable or disable any feature so the rail only shows what you use.',
      'M4 6h16M4 12h16M4 18h16'],
  ];

  let panel, bodyEl, statusEl, current = 'guide';

  function icon(d) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.9');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d); s.append(p);
    return s;
  }

  function closePanel() {
    if (!panel) return;
    panel.classList.remove('open');
    drawRail();
  }

  function buildPanel() {
    statusEl = el('div', { class: 'wacrm-status' }, el('i'), el('span', {}, 'Connecting'));
    bodyEl = el('div', { class: 'wacrm-body', role: 'tabpanel' });

    panel = el('div', {
      id: 'wacrm-panel', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'WA-CRM',
      onkeydown: (e) => { if (e.key === 'Escape') closePanel(); },
    },
      el('div', { class: 'wacrm-head' },
        el('div', { class: 'wacrm-brand' }, 'WA', el('b', {}, '-CRM')),
        statusEl,
        el('button', { class: 'wacrm-x', type: 'button', 'aria-label': 'Close panel', onclick: closePanel },
          icon('M18 6 6 18M6 6l12 12'))),
      bodyEl);

    document.body.append(panel);
    pollStatus();
  }

  // Live WhatsApp connection state in the header, so the user knows whether a send can
  // possibly work before they try it.
  async function pollStatus() {
    if (!statusEl) return;
    const r = await wa('status');
    const s = (r.ok && r.data && r.data.state) || 'loading';
    const map = {
      connected: ['on', 'Connected'],
      syncing: ['wait', 'Syncing'],
      qr: ['', 'Not signed in'],
      loading: ['', 'Loading'],
    };
    const [cls, label] = map[s] || map.loading;
    statusEl.className = 'wacrm-status ' + cls;
    statusEl.lastChild.textContent = label;
    if (panel) setTimeout(pollStatus, s === 'connected' ? 15000 : 4000);
  }

  async function render() {
    bodyEl.replaceChildren(el('div', { class: 'wacrm-loading' }, 'Loading…'));

    const lic = (await bg('license')).data || {};
    bodyEl.replaceChildren();
    if (!lic.licensed) return gate(lic);

    if (lic.trial && lic.expiresAt) {
      const days = Math.max(0, Math.ceil((new Date(lic.expiresAt) - Date.now()) / 86400000));
      bodyEl.append(el('div', { class: 'wacrm-trial' },
        el('span', {}, `Free trial — ${days} day${days === 1 ? '' : 's'} left`),
        el('a', { href: 'https://wa-crm.in/#pricing', target: '_blank', rel: 'noopener' }, 'Buy')));
    }
    if (lic.justStarted) toast(`Free trial active — ${lic.trialDays || 14} days`);

    // Every tab opens onto its own titled screen, so there is never any doubt about
    // which feature you are looking at.
    const f = FEATURES.find((x) => x[0] === current);
    if (f) bodyEl.append(el('div', { class: 'wacrm-view-head' }, el('h3', {}, f[2]), el('p', {}, f[3])));

    const VIEWS = {
      catalog: viewCatalog, leads: viewLeads, broadcast: viewBroadcast,
      numbers: viewNumbers, export: viewExport,
      funnels: viewFunnels, flows: viewFlows, webhook: viewWebhook,
      guide: viewGuide, invoice: viewInvoice, schedule: viewSchedule,
      reminder: viewReminder, groups: viewGroups,
      start: viewStart, links: viewLinks, refer: viewRefer, backup: viewBackup,
      quick: viewQuick, autopost: viewAutopost, books: viewBooks, deals: viewDeals,
      ai: viewAi,
    };
    (VIEWS[current] || viewCatalog)();
  }


  // ---------- date + time field ----------
  // Chrome will only open a native datetime picker from its own tiny calendar glyph, and
  // showPicker() is refused unless the call is inside a real user gesture — so on a dark
  // injected panel there was effectively no widget at all. This builds the picker out of
  // plain selects instead: always visible, always works, no native dependency.
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function whenField(labelText) {
    const sel = (cls, opts, val) => {
      const n = el('select', { class: 'wacrm-in wacrm-when-sel ' + cls },
        opts.map(([v, t]) => el('option', { value: String(v) }, t)));
      n.value = String(val);
      return n;
    };
    const now = new Date();
    const years = [];
    for (let y = now.getFullYear(); y <= now.getFullYear() + 2; y++) years.push([y, String(y)]);
    const days = []; for (let d = 1; d <= 31; d++) days.push([d, String(d)]);
    const hours = []; for (let h = 0; h < 24; h++) hours.push([h, String(h).padStart(2, '0')]);
    const mins = []; for (let m = 0; m < 60; m += 5) mins.push([m, String(m).padStart(2, '0')]);

    // Default to a real hour from now. Deriving the hour with (getHours()+1)%24 rolled to
    // midnight *today* after 11pm — a time already in the past, so Save silently refused.
    const soon = new Date(Date.now() + 3600000);
    soon.setMinutes(Math.floor(soon.getMinutes() / 5) * 5, 0, 0);
    if (soon.getFullYear() > years[years.length - 1][0]) years.push([soon.getFullYear(), String(soon.getFullYear())]);
    const dd = sel('d', days, soon.getDate());
    const mm = sel('m', MONTHS.map((t, i) => [i, t]), soon.getMonth());
    const yy = sel('y', years, soon.getFullYear());
    const hh = sel('t', hours, soon.getHours());
    const mi = sel('t', mins, soon.getMinutes());

    const summary = el('div', { class: 'wacrm-when-sum' });
    const read = () => new Date(+yy.value, +mm.value, +dd.value, +hh.value, +mi.value, 0, 0);
    const paint = () => {
      const d = read();
      const mins2 = Math.round((d - Date.now()) / 60000);
      summary.textContent = d.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        + (mins2 > 0 ? `  ·  in ${mins2 < 60 ? mins2 + ' min' : Math.round(mins2 / 60) + ' h'}` : '  ·  in the past');
      summary.className = 'wacrm-when-sum' + (mins2 > 0 ? '' : ' bad');
    };
    [dd, mm, yy, hh, mi].forEach((n) => n.addEventListener('change', paint));

    const write = (d) => {
      yy.value = String(d.getFullYear()); mm.value = String(d.getMonth()); dd.value = String(d.getDate());
      hh.value = String(d.getHours()); mi.value = String(Math.floor(d.getMinutes() / 5) * 5);
      paint();
    };
    const inMin = (m) => () => write(new Date(Date.now() + m * 60000));
    const at = (addDays, h) => () => {
      const d = new Date(); d.setDate(d.getDate() + addDays); d.setHours(h, 0, 0, 0); write(d);
    };

    const chips = el('div', { class: 'wacrm-when-chips' },
      el('button', { class: 'wacrm-btn small', type: 'button', onclick: inMin(60) }, 'In 1 hour'),
      el('button', { class: 'wacrm-btn small', type: 'button', onclick: inMin(180) }, 'In 3 hours'),
      el('button', { class: 'wacrm-btn small', type: 'button', onclick: at(0, 18) }, 'Today 6 PM'),
      el('button', { class: 'wacrm-btn small', type: 'button', onclick: at(1, 9) }, 'Tomorrow 9 AM'),
      el('button', { class: 'wacrm-btn small', type: 'button', onclick: at(1, 18) }, 'Tomorrow 6 PM'));

    paint();
    const node = el('div', { class: 'wacrm-when' },
      labelText ? el('label', {}, labelText) : null,
      el('div', { class: 'wacrm-when-grid' }, dd, mm, yy, el('span', { class: 'wacrm-when-at' }, 'at'), hh, el('span', { class: 'wacrm-when-colon' }, ':'), mi),
      summary, chips);

    return {
      node,
      get value() { return read().getTime(); },
      clear() { write(new Date(Date.now() + 3600000)); },
    };
  }

  // Multi-select row: the whole row is the hit target, the tick is unmistakable, and the
  // selected state changes the row itself rather than one small widget.
  function pickRow(label, sub, checked, onchange) {
    const box = el('span', { class: 'wacrm-tick' }, icon('M20 6 9 17l-5-5'));
    const row = el('button', {
      class: 'wacrm-pick' + (checked ? ' on' : ''), type: 'button',
      role: 'checkbox', 'aria-checked': String(!!checked),
      onclick: () => {
        const on = !row.classList.contains('on');
        row.classList.toggle('on', on);
        row.setAttribute('aria-checked', String(on));
        onchange(on);
      },
    }, box, el('span', { class: 'wacrm-grow' },
      el('b', {}, label), sub ? el('span', { class: 'wacrm-dim' }, sub) : null));
    return row;
  }

  // ---------- skeuomorphic control builders ----------
  function toggle(label, hint, checked, onchange) {
    const input = el('input', { type: 'checkbox', onchange: (e) => onchange(e.target.checked) });
    if (checked) input.checked = true;
    return el('label', { class: 'wacrm-toggle' },
      input, el('span', { class: 'wacrm-track' }),
      el('span', { class: 'wacrm-toggle-txt' }, label, hint ? el('small', {}, hint) : null));
  }

  function slider(label, min, max, value, fmt, oninput) {
    const out = el('span', { class: 'wacrm-slider-val' }, fmt(value));
    const range = el('input', {
      class: 'wacrm-range', type: 'range', min: String(min), max: String(max), value: String(value),
      'aria-label': label,
      oninput: (e) => { const v = +e.target.value; out.textContent = fmt(v); oninput(v); },
    });
    return el('div', { class: 'wacrm-slider' },
      el('div', { class: 'wacrm-slider-head' }, el('label', {}, label), out), range);
  }

  // ---------- licence gate ----------
  function gate(lic) {
    const key = el('input', { placeholder: 'WA-XXXX-XXXX-XXXX-XXXX', class: 'wacrm-in' });
    const msg = el('div', { class: 'wacrm-msg' });
    const act = el('button', { class: 'wacrm-btn primary', onclick: async () => {
      if (!key.value.trim()) { msg.textContent = 'Enter your license key.'; msg.className = 'wacrm-msg bad'; return; }
      msg.className = 'wacrm-msg'; msg.textContent = 'Activating…';
      const r = (await bg('activate', { key: key.value })).data || {};
      if (r.valid) { toast('Activated'); render(); }
      else { msg.className = 'wacrm-msg bad'; msg.textContent = 'Activation failed: ' + (r.reason || 'invalid key'); }
    } }, 'Activate');
    // The trial is claimed automatically on install. This button only matters when that
    // attempt could not run (first open was offline) — once the trial is used up it is
    // gone, so we say so plainly instead of offering a button that cannot work.
    const used = lic.reason === 'trial_expired';
    const trial = el('button', { class: 'wacrm-btn', onclick: async () => {
      msg.className = 'wacrm-msg'; msg.textContent = 'Starting trial…';
      const r = (await bg('trial')).data || {};
      if (r.valid) { toast(`Free trial started — ${r.trialDays || 14} days`); render(); }
      else { msg.className = 'wacrm-msg bad'; msg.textContent = r.reason === 'trial_expired' ? 'This browser already used its free trial.' : 'Could not start trial.'; }
    } }, 'Start free trial');

    const why = lic.reason === 'expired' ? 'Your license has expired.'
      : lic.reason === 'suspended' ? 'This license is suspended.'
      : used ? 'This browser has already used its free trial. Enter a license key to continue.'
      : 'Enter the license key you received by email.';

    bodyEl.append(el('div', { class: 'wacrm-pad' },
      el('h3', {}, 'Activate WA-CRM'),
      el('p', { class: 'wacrm-sub' }, why),
      key, act,
      ...(used ? [] : [el('div', { class: 'wacrm-or' }, 'or'), trial]),
      msg,
      el('a', { class: 'wacrm-link', href: 'https://wa-crm.in/#pricing', target: '_blank', rel: 'noopener' }, 'Buy a license →')));
  }

  // ---------- AI Assistant ----------

  async function viewAi() {
    bodyEl.innerHTML = '';
    const head = el('div', { class: 'wacrm-head' },
      el('h2', {}, 'AI Assistant'),
      el('p', {}, 'Catalog-first auto-replies. Uses your product catalog + shop facts — never invents prices.'));

    const st = ((await bg('aiGetSettings')).data || {}).settings || {};
    const mode = el('select', { class: 'wacrm-in' },
      ...[['off', 'Off'], ['suggest', 'Suggestions only'], ['always', 'Auto-reply']].map(([v, l]) => {
        const o = el('option', { value: v }, l);
        if (st.mode === v) o.selected = true;
        return o;
      }));
    const apiKey = el('input', { class: 'wacrm-in', type: 'password', placeholder: 'API key', value: st.apiKey || '' });
    const baseUrl = el('input', { class: 'wacrm-in', placeholder: 'https://heyroute.ai', value: st.baseUrl || 'https://heyroute.ai' });
    const chatModel = el('input', { class: 'wacrm-in', placeholder: 'Model', value: st.chatModel || 'gpt-4o-mini' });
    const businessName = el('input', { class: 'wacrm-in', placeholder: 'Business name', value: st.businessName || '' });
    const shopSiteUrl = el('input', { class: 'wacrm-in', placeholder: 'https://your-shop.com', value: st.shopSiteUrl || '' });
    const consent = el('input', { type: 'checkbox' });
    consent.checked = !!st.consentAccepted;
    const status = el('div', { class: 'wacrm-empty' }, '…');

    const saveBtn = el('button', { class: 'wacrm-btn primary', onclick: async () => {
      const patch = {
        mode: mode.value, apiKey: apiKey.value.trim(), baseUrl: baseUrl.value.trim(),
        chatModel: chatModel.value.trim(), businessName: businessName.value.trim(),
        shopSiteUrl: shopSiteUrl.value.trim(), consentAccepted: !!consent.checked,
      };
      await bg('aiSaveSettings', patch);
      toast('AI settings saved');
      refreshStatus();
    }}, 'Save settings');

    const testBtn = el('button', { class: 'wacrm-btn', onclick: async () => {
      status.textContent = 'Checking…';
      const r = await bg('aiHealth');
      const d = (r && r.data) || {};
      status.textContent = d.ok ? ('Ready — ' + (d.version || 'ok')) : ('Not ready: ' + (d.err || r.err || 'error'));
    }}, 'Test connection');

    async function refreshStatus() {
      const s2 = ((await bg('aiGetSettings')).data || {}).settings || {};
      const cat = await store.get('wa_catalog', []);
      status.textContent = (s2.consentAccepted ? 'Consent on' : 'Consent required')
        + ' · ' + (s2.mode || 'off')
        + ' · ' + (cat.length || 0) + ' products in catalog';
    }
    refreshStatus();

    const importUrl = el('input', { class: 'wacrm-in', placeholder: 'Shop URL to import products', value: st.shopSiteUrl || '' });
    const importBtn = el('button', { class: 'wacrm-btn primary', onclick: async () => {
      const url = importUrl.value.trim();
      if (!url) return toast('Paste your shop URL', true);
      toast('Importing…');
      const r = await bg('aiImportWebsite', { url, merge: true });
      const d = (r && r.data) || {};
      if (d.needPermission) {
        toast('Open Options → grant website access, then retry', true);
        await bg('openOptions');
        return;
      }
      if (!d.ok) return toast(d.err || r.err || 'Import failed', true);
      toast('Imported ' + d.count + ' products (' + (d.via || 'ok') + ')');
      refreshStatus();
    }}, 'Import from website');

    const faqTitle = el('input', { class: 'wacrm-in', placeholder: 'FAQ / policy title' });
    const faqBody = el('textarea', { class: 'wacrm-in', rows: '3', placeholder: 'Answer / policy text' });
    const faqBtn = el('button', { class: 'wacrm-btn', onclick: async () => {
      if (!faqTitle.value.trim() || !faqBody.value.trim()) return toast('Title and body required', true);
      await bg('aiSaveKnowledgeRow', { kind: 'faq', title: faqTitle.value.trim(), body: faqBody.value.trim() });
      faqTitle.value = ''; faqBody.value = '';
      toast('Knowledge saved');
      drawKnow();
    }}, 'Add knowledge');

    const knowList = el('div', { class: 'wacrm-list' });
    async function drawKnow() {
      const rows = (((await bg('aiGetKnowledge')).data || {}).rows) || [];
      knowList.innerHTML = '';
      if (!rows.length) { knowList.append(el('div', { class: 'wacrm-empty' }, 'No FAQs yet.')); return; }
      rows.slice(0, 30).forEach((row) => {
        knowList.append(el('div', { class: 'wacrm-card' },
          el('div', { class: 'wacrm-grow' }, el('b', {}, row.title || ''), el('span', {}, String(row.body || '').slice(0, 120))),
          el('button', { class: 'wacrm-btn', onclick: async () => {
            await bg('aiDeleteKnowledge', { id: row.id }); drawKnow();
          }}, 'Del')));
      });
    }
    drawKnow();

    const sugList = el('div', { class: 'wacrm-list' });
    async function drawSug() {
      const rows = (((await bg('aiSuggestions')).data || {}).suggestions) || [];
      sugList.innerHTML = '';
      if (!rows.length) { sugList.append(el('div', { class: 'wacrm-empty' }, 'No pending drafts.')); return; }
      rows.slice(0, 15).forEach((row) => {
        sugList.append(el('div', { class: 'wacrm-card' },
          el('div', { class: 'wacrm-grow' },
            el('b', {}, (row.name || row.number || '') + ' · ' + Math.round((row.confidence || 0) * 100) + '%'),
            el('span', {}, String(row.text || '').slice(0, 200))),
          el('button', { class: 'wacrm-btn primary', onclick: async () => {
            const to = row.number ? (row.number + '@c.us') : null;
            if (!to || !row.text) return toast('Missing chat', true);
            const r = await wa('sendText', { to, text: row.text });
            if (r && r.ok) {
              await bg('aiMarkSent', { number: row.number, logId: row.logId, text: row.text });
              toast('Sent');
              drawSug();
            } else toast('Open that chat first, then send', true);
          }}, 'Send')));
      });
    }
    drawSug();

    const field = (label, node) => el('div', { class: 'wacrm-field' }, el('label', {}, label), node);

    bodyEl.append(
      head,
      el('div', { class: 'wacrm-card' },
        field('Mode', mode),
        field('API key', apiKey),
        field('Provider URL', baseUrl),
        field('Model', chatModel),
        field('Business name', businessName),
        field('Shop website', shopSiteUrl),
        el('label', { class: 'wacrm-check' }, consent, ' I accept that AI replies use my catalog and API key'),
        el('div', { class: 'wacrm-row' }, saveBtn, testBtn),
        status),
      el('div', { class: 'wacrm-card' },
        el('b', {}, 'Import catalog'),
        el('p', {}, 'Pull products (with buy links) from your shop into Catalog. Grant website access in Options once.'),
        importUrl, importBtn),
      el('div', { class: 'wacrm-card' },
        el('b', {}, 'Shop facts / FAQs'),
        faqTitle, faqBody, faqBtn, knowList),
      el('div', { class: 'wacrm-card' },
        el('b', {}, 'Suggestion drafts'),
        sugList),
    );
  }


  // ---------- Product catalog ----------
  async function viewCatalog() {
    const items = await store.get('wa_catalog', []);
    const search = el('input', { class: 'wacrm-in', placeholder: 'Search products…' });
    const list = el('div', { class: 'wacrm-list' });

    const draw = () => {
      const q = search.value.toLowerCase();
      const rows = items.filter((i) => !q || (i.title + ' ' + (i.text || '') + ' ' + (i.cat || '')).toLowerCase().includes(q));
      list.innerHTML = '';
      if (!rows.length) { list.append(el('div', { class: 'wacrm-empty' }, items.length ? 'No matches.' : 'No products yet — add one below.')); return; }
      rows.forEach((it) => {
        const i = items.indexOf(it);
        list.append(el('div', { class: 'wacrm-card' },
          it.img ? el('img', { src: it.img, class: 'wacrm-thumb' }) : el('div', { class: 'wacrm-thumb ph' }, '\u{1F4AC}'),
          el('div', { class: 'wacrm-grow' },
            el('b', {}, it.title || '(untitled)'),
            it.cat ? el('span', { class: 'wacrm-tag' }, it.cat) : null,
            Number(it.price) > 0 ? el('span', { class: 'wacrm-rate', title: 'Selling rate' }, '₹' + Number(it.price).toLocaleString('en-IN')) : null,
            Number(it.cost) > 0 ? el('span', { class: 'wacrm-rate cost', title: 'Purchase rate' }, 'cost ₹' + Number(it.cost).toLocaleString('en-IN')) : null,
            Number(it.price) > 0 && Number(it.cost) > 0 ? marginChip(it.price, it.cost, 'Profit per sale') : null,
            el('div', { class: 'wacrm-dim' }, (it.text || '').slice(0, 90))),
          el('div', { class: 'wacrm-col' },
            el('button', { class: 'wacrm-btn small primary', onclick: () => sendItem(it) }, 'Send'),
            el('button', { class: 'wacrm-btn small', onclick: async () => {
              items.splice(i, 1); await store.set('wa_catalog', items); draw();
            } }, 'Delete'))));
      });
    };

    async function sendItem(it) {
      const chat = (await wa('activeChat')).data;
      if (!chat) return toast('Open a chat first', true);
      const r = it.img
        ? await wa('sendFile', { to: chat.id, data: it.img, caption: it.text, filename: 'offer.jpg' })
        : await wa('sendText', { to: chat.id, text: it.text });
      toast(r.ok ? 'Sent to ' + chat.name : 'Failed: ' + (r.err || ''), !r.ok);
    }

    const title = el('input', { class: 'wacrm-in', placeholder: 'Product name' });
    const cat = el('input', { class: 'wacrm-in', placeholder: 'Category (optional)' });
    // Rates live on the product so invoices and "Deal done" can pull them in instead of
    // being retyped, and so the margin reaches Sales & Expenses without any arithmetic.
    const price = el('input', { class: 'wacrm-in', type: 'number', min: '0', placeholder: 'Selling rate ₹ (what you charge)' });
    const cost = el('input', { class: 'wacrm-in', type: 'number', min: '0', placeholder: 'Purchase rate ₹ (what it costs you)' });
    const text = el('textarea', { class: 'wacrm-in', placeholder: 'Caption / message' });
    const file = el('input', { type: 'file', accept: 'image/*,video/*', class: 'wacrm-file' });

    search.addEventListener('input', draw);
    bodyEl.append(el('div', { class: 'wacrm-pad' },
      el('div', { class: 'wacrm-note' }, 'Save your offers once, then send any of them to the open chat in one click.'),
      search, list,
      el('details', { class: 'wacrm-acc' },
        el('summary', {}, 'Add a product'),
        title, cat, price, cost, text, file,
        el('button', { class: 'wacrm-btn primary', onclick: async () => {
          const f = file.files && file.files[0];
          const save = async (img) => {
            if (!title.value.trim() && !text.value.trim() && !img) return toast('Add a name, caption or image', true);
            // price was collected but never stored, so invoices built from the catalog
            // always came out at zero. It is saved now, alongside the purchase rate.
            items.unshift({ title: title.value.trim() || (text.value.trim().split('\n')[0] || '').slice(0, 40), cat: cat.value.trim(), text: text.value.trim(), img, price: Number(price.value) || 0, cost: Number(cost.value) || 0 });
            await store.set('wa_catalog', items);
            title.value = cat.value = text.value = price.value = cost.value = ''; file.value = '';
            draw(); toast('Saved');
          };
          if (f) { const rd = new FileReader(); rd.onload = () => save(rd.result); rd.readAsDataURL(f); }
          else save(null);
        } }, 'Save product'))));
    draw();
  }

  // ---------- Leads ----------
  const LEAD_TYPES = ['New', 'Hot', 'Warm', 'Cold'];
  // Must stay identical to LEAD_STAGES, or the stage-bar counts silently read zero.
  const LEAD_STATUS = ['New', 'Contacted', 'Follow-up', 'Proposal sent', 'Won', 'Lost'];

  async function viewLeads() {
    const leads = await store.get('wa_leads', []);
    const list = el('div', { class: 'wacrm-list' });

    const draw = () => {
      list.replaceChildren();
      const shown = leads.filter((L) => !stageFilter || (L.status || 'New') === stageFilter);
      if (!shown.length) {
        list.append(el('div', { class: 'wacrm-empty' },
          el('b', {}, stageFilter ? `Nothing in ${stageFilter}` : 'No leads yet'),
          stageFilter ? 'Pick another stage above.' : 'Open a chat and press "Save current chat".'));
        return;
      }
      shown.forEach((L) => {
        const i = leads.indexOf(L);
        const ty = el('select', { class: 'wacrm-in small' }, LEAD_TYPES.map((t) => el('option', { value: t, ...(t === L.type ? { selected: '' } : {}) }, t)));
        const st = el('select', { class: 'wacrm-in small' }, LEAD_STATUS.map((s) => el('option', { value: s, ...(s === L.status ? { selected: '' } : {}) }, s)));
        ty.addEventListener('change', async () => {
          L.type = ty.value; await store.set('wa_leads', leads); fireWebhook('lead.updated', L);
        });
        st.addEventListener('change', async () => {
          L.status = st.value;
          L.statusAt = Date.now();   // funnels wait from this moment
          L.sent = {};               // a new stage re-arms the follow-ups
          await store.set('wa_leads', leads);
          drawStages();
          fireWebhook('lead.updated', L);
          draw();
        });
        list.append(el('div', { class: 'wacrm-card' },
          el('div', { class: 'wacrm-grow' },
            el('b', {}, L.name || L.number),
            el('div', { class: 'wacrm-dim' }, L.number),
            el('div', { class: 'wacrm-row' }, ty, st)),
          el('button', { class: 'wacrm-btn small', onclick: async () => { leads.splice(i, 1); await store.set('wa_leads', leads); draw(); } }, 'Remove')));
      });
    };

    bodyEl.append(el('div', { class: 'wacrm-pad' },
      el('div', { class: 'wacrm-note' }, 'Track who you are talking to, and export the list any time.'),
      el('div', { class: 'wacrm-row' },
        el('button', { class: 'wacrm-btn primary', onclick: async () => {
          const c = (await wa('activeChat')).data;
          if (!c) return toast('Open a chat first', true);
          if (leads.some((x) => x.number === c.number)) return toast('Already saved');
          const lead = { number: c.number, name: c.name, type: 'New', status: 'New', ts: Date.now(), statusAt: Date.now(), sent: {} };
          leads.unshift(lead);
          await store.set('wa_leads', leads); draw(); drawStages();
          fireWebhook('lead.created', lead);
          toast('Lead saved: ' + c.name);
        } }, '+ Save current chat'),
        el('button', { class: 'wacrm-btn', onclick: () => csv('wa-crm-leads.csv',
          leads.map((L) => ({ name: L.name, number: L.number, type: L.type, status: L.status, saved: new Date(L.ts || Date.now()).toLocaleString() })),
          ['name', 'number', 'type', 'status', 'saved']) }, 'Export CSV')),
      list));
    draw();
  }

  // ---------- Bulk send ----------
  async function viewBroadcast() {
    const nums = el('textarea', { class: 'wacrm-in mono', placeholder: '919876543210\n14155552671' });
    // Numbers handed over by a chat filter. Without this, "N numbers loaded into Bulk
    // Send" was a false confirmation and the box arrived empty.
    if (pendingNumbers && pendingNumbers.length) {
      nums.value = pendingNumbers.join('\n');
      pendingNumbers = null;
    }
    const text = el('textarea', { class: 'wacrm-in', placeholder: 'Hi [NAME], {today only|this week} 20% off' });
    const log = el('div', { class: 'wacrm-log' });
    const bar = el('div', { class: 'wacrm-bar' }, el('i'));
    let stop = false;
    let lo = 8, hi = 20, randomise = true;

    const loS = slider('Minimum delay', 3, 120, lo, (v) => v + 's', (v) => {
      lo = v; if (hi < lo) { hi = lo; hiS.querySelector('input').value = String(hi); hiS.querySelector('.wacrm-slider-val').textContent = hi + 's'; }
    });
    const hiS = slider('Maximum delay', 3, 180, hi, (v) => v + 's', (v) => {
      hi = v; if (hi < lo) { lo = hi; loS.querySelector('input').value = String(lo); loS.querySelector('.wacrm-slider-val').textContent = lo + 's'; }
    });
    const randT = toggle('Randomise the gap', 'Varies each wait between the two values instead of using a fixed one.',
      true, (v) => { randomise = v; hiS.style.display = v ? '' : 'none'; });

    const go = el('button', { class: 'wacrm-btn primary', onclick: async () => {
      const list = nums.value.split(/\r?\n/).map((s) => s.replace(/\D/g, '')).filter((s) => s.length >= 7);
      if (!list.length) return toast('Add some numbers', true);
      if (!text.value.trim()) return toast('Write a message', true);
      if (!confirm(`Send to ${list.length} number(s)?\n\nSend responsibly — blasting strangers is what gets numbers banned.`)) return;
      stop = false; go.disabled = true; log.replaceChildren();
      let ok = 0;
      for (let i = 0; i < list.length; i++) {
        if (stop) { line(log, 'Stopped by user'); break; }
        const r = await wa('sendText', { to: list[i], text: text.value.replace(/\[NAME\]/g, '') });
        if (r.ok) ok++;
        line(log, (r.ok ? '✓ ' : '✗ ') + list[i] + (r.ok ? '' : ' — ' + (r.err || '')));
        bar.firstChild.style.width = Math.round(((i + 1) / list.length) * 100) + '%';
        if (i < list.length - 1) await sleep((randomise ? lo + Math.random() * (hi - lo) : lo) * 1000);
      }
      toast(`Sent ${ok}/${list.length}`);
      go.disabled = false;
    } }, 'Start sending');

    bodyEl.append(el('div', { class: 'wacrm-pad' },
      el('div', { class: 'wacrm-note warn' }, 'Use this responsibly. Random delays are applied, but messaging people who never contacted you is the fastest way to get a number banned — on any tool.'),
      el('label', {}, 'Numbers'), nums,
      el('label', {}, 'Message'), text,
      randT, loS, hiS,
      el('div', { class: 'wacrm-row' }, go, el('button', { class: 'wacrm-btn danger', onclick: () => { stop = true; } }, 'Stop')),
      bar, log));
  }

  // ---------- Number check ----------
  async function viewNumbers() {
    const nums = el('textarea', { class: 'wacrm-in mono', placeholder: 'One number per line' });
    const log = el('div', { class: 'wacrm-log' });
    let results = [];
    bodyEl.append(el('div', { class: 'wacrm-pad' },
      el('div', { class: 'wacrm-note' }, 'Checks which numbers actually have WhatsApp.'),
      nums,
      el('div', { class: 'wacrm-row' },
        el('button', { class: 'wacrm-btn primary', onclick: async () => {
          const list = nums.value.split(/\r?\n/).map((s) => s.replace(/\D/g, '')).filter((s) => s.length >= 7);
          if (!list.length) return toast('Add some numbers', true);
          log.innerHTML = ''; results = [];
          for (const n of list) {
            const r = await wa('checkNumber', { number: n });
            const exists = r.ok && r.data && r.data.exists;
            results.push({ number: n, onWhatsApp: exists ? 'yes' : 'no' });
            line(log, (exists ? '✓ ' : '✗ ') + n);
            await sleep(700);
          }
          toast('Done');
        } }, 'Check'),
        el('button', { class: 'wacrm-btn', onclick: () => results.length ? csv('wa-crm-number-check.csv', results, ['number', 'onWhatsApp']) : toast('Run a check first', true) }, 'Export CSV')),
      log));
  }

  // ---------- Export contacts ----------
  // ---------- Export Numbers (Data Extractor) ----------
  // Cloned from the desktop app: pick a source, filter by saved/unsaved, extract, then
  // export as a plain CSV or in Google Contacts format.
  const EXPORT_SOURCES = [
    ['contacts', 'From Contacts'],
    ['chatlist', 'From Chat List'],
    ['groups', 'From Groups'],
    ['groupmembers', 'From Group Members'],
    ['business', 'From Business accounts'],
  ];
  const EXPORT_FILTERS = [
    ['all', 'All numbers'],
    ['saved', 'Saved only'],
    ['unsaved', 'Unsaved only'],
  ];

  async function viewExport() {
    let rows = [];
    const source = el('select', { class: 'wacrm-in' },
      EXPORT_SOURCES.map(([v, t]) => el('option', { value: v }, t)));
    const filter = el('select', { class: 'wacrm-in' },
      EXPORT_FILTERS.map(([v, t]) => el('option', { value: v }, t)));
    const out = el('div', { class: 'wacrm-log' });
    const count = el('div', { class: 'wacrm-msg' });

    const applyFilter = (list) => {
      const f = filter.value;
      if (f === 'saved') return list.filter((r) => r.saved);
      if (f === 'unsaved') return list.filter((r) => !r.saved);
      return list;
    };

    const extract = async () => {
      out.replaceChildren(); count.className = 'wacrm-msg'; count.textContent = 'Reading…';
      const src = source.value;
      let raw = [];

      if (src === 'contacts') {
        const r = await wa('contacts');
        if (!r.ok) { count.className = 'wacrm-msg bad'; count.textContent = 'Failed: ' + (r.err || ''); return; }
        raw = r.data.map((c) => ({ number: c.number, name: c.name, saved: !!c.saved }));
      } else if (src === 'groupmembers') {
        const r = await wa('groupMembers', {});
        if (!r.ok) { count.className = 'wacrm-msg bad'; count.textContent = 'Failed: ' + (r.err || ''); return; }
        raw = r.data;
      } else if (src === 'groups') {
        const r = await wa('groups');
        if (!r.ok) { count.className = 'wacrm-msg bad'; count.textContent = 'Failed: ' + (r.err || ''); return; }
        // Groups have no phone number; list them so the user can see what is there.
        raw = r.data.map((g) => ({ number: '', name: g.name, saved: false, group: g.name }));
      } else {
        const bucket = src === 'business' ? 'business' : 'all';
        const r = await wa('chatNumbers', { bucket });
        if (!r.ok) { count.className = 'wacrm-msg bad'; count.textContent = 'Failed: ' + (r.err || ''); return; }
        raw = r.data.map((c) => ({ number: c.number, name: c.name, saved: undefined }));
        // The chat list does not report saved/unsaved, so ask the contact list once.
        const cr = await wa('contacts');
        if (cr.ok) {
          const saved = new Set(cr.data.filter((c) => c.saved).map((c) => c.number));
          raw = raw.map((c) => ({ ...c, saved: saved.has(c.number) }));
        }
      }

      rows = applyFilter(raw.filter((r) => r.number || src === 'groups'));
      const withNums = rows.filter((r) => r.number);
      count.className = 'wacrm-msg';
      count.textContent = `${rows.length} found · ${withNums.length} with a phone number`;
      rows.slice(0, 200).forEach((r) => line(out, (r.number ? '+' + r.number + '  ' : '') + (r.name || '') + (r.group ? '  · ' + r.group : '')));
      if (rows.length > 200) line(out, `… and ${rows.length - 200} more`);
      if (!rows.length) line(out, 'Nothing matched. Try a different source or filter.');
    };

    filter.addEventListener('change', () => { if (rows.length) extract(); });

    bodyEl.append(el('div', { class: 'wacrm-pad' },
      el('div', { class: 'wacrm-note' },
        'Pull real phone numbers out of this WhatsApp account. "Saved" means the number is '
        + 'in your phone contacts. Numbers WhatsApp hides behind privacy IDs are skipped. '
        + 'Use Google CSV for a file you can import at contacts.google.com.'),
      el('label', {}, 'Source'), source,
      el('label', {}, 'Filter'), filter,
      el('div', { class: 'wacrm-row' },
        el('button', { class: 'wacrm-btn primary', onclick: extract }, 'Extract'),
        el('button', { class: 'wacrm-btn', onclick: () => rows.length
          ? csv('wa-crm-numbers.csv', rows.map((r) => ({ number: r.number, name: r.name, saved: r.saved ? 'yes' : 'no', group: r.group || '' })), ['number', 'name', 'saved', 'group'])
          : toast('Extract first', true) }, 'Export CSV'),
        el('button', { class: 'wacrm-btn', onclick: () => rows.length
          ? googleCsv(rows)
          : toast('Extract first', true) }, 'Google Contacts')),
      count, out));
  }

  // ---------- helpers ----------
  function line(box, text) { const s = el('div', {}, text); box.append(s); box.scrollTop = box.scrollHeight; }
  function csv(name, rows, cols) {
    const body = [cols.join(','), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
    const a = el('a', { href: url, download: name }); a.click(); URL.revokeObjectURL(url);
    toast(`Exported ${rows.length} row(s)`);
  }


  // ================================================================
  // Docked shell: a left icon rail and a lead-stage bar, both wired into WhatsApp's own
  // chrome. Replaces the old floating launcher.
  // ================================================================
  const LEAD_STAGES = ['New', 'Contacted', 'Follow-up', 'Proposal sent', 'Won', 'Lost'];
  let railEl, topbarEl, stageFilter = '', pendingNumbers = null;
  let enabled = {};   // feature id -> bool, owned by Menu Manager

  const ALWAYS_ON = new Set(['menu']);

  async function loadEnabled() {
    const saved = await store.get('wa_enabled', null);
    enabled = {};
    for (const f of FEATURES) enabled[f[0]] = saved ? saved[f[0]] !== false : true;
    for (const id of ALWAYS_ON) enabled[id] = true;
    return enabled;
  }
  const saveEnabled = () => store.set('wa_enabled', enabled);

  function mountShell() {
    if (!$('#wacrm-rail')) {
      railEl = el('div', { id: 'wacrm-rail', role: 'toolbar', 'aria-label': 'WA-CRM' });
      document.body.append(railEl);
      drawRail();
    }
    if (!$('#wacrm-topbar')) {
      topbarEl = el('div', { id: 'wacrm-topbar', role: 'toolbar', 'aria-label': 'Lead stages' });
      document.body.append(topbarEl);
      drawStages();
    }
    mountQuickBar();
    document.documentElement.classList.add('wacrm-docked');
  }

  // Seventeen unlabelled icons is not navigation. Every feature now shows its name, under
  // a heading that says which job it belongs to.
  const RAIL_GROUPS = [
    ['Start here', ['guide']],
    ['This customer', ['quick', 'catalog', 'leads', 'invoice', 'reminder']],
    ['Reach people', ['broadcast', 'groups', 'start', 'numbers', 'export']],
    ['Run on autopilot', ['schedule', 'autopost', 'funnels', 'flows']],
    ['Grow & connect', ['links', 'refer', 'webhook']],
    ['Money', ['deals', 'books']],
    ['Your data', ['backup']],
    ['', ['menu']],
  ];

  function drawRail() {
    if (!railEl) return;
    railEl.replaceChildren(
      el('div', { class: 'wacrm-rail-head' },
        el('span', { class: 'wacrm-rail-mark' }, 'WA'),
        el('span', { class: 'wacrm-rail-name' }, 'WA', el('b', {}, '-CRM'))));

    for (const [heading, ids] of RAIL_GROUPS) {
      const items = ids.filter((id) => enabled[id]);
      if (!items.length) continue;
      if (heading) railEl.append(el('div', { class: 'wacrm-rail-grp' }, heading));
      else railEl.append(el('div', { class: 'wacrm-rail-sep' }));
      for (const id of items) {
        const f = FEATURES.find((x) => x[0] === id);
        if (!f) continue;
        railEl.append(el('button', {
          class: 'wacrm-rail-btn' + (id === current && panelOpen() ? ' on' : ''),
          type: 'button', 'data-f': id, 'aria-label': f[2],
          onclick: () => openFeature(id),
        }, icon(f[4]), el('span', {}, f[2])));
      }
    }
  }

  const panelOpen = () => !!(panel && panel.classList.contains('open'));

  function openFeature(id, opts) {
    if (id === 'menu') return menuManager();
    if (!panel) buildPanel();
    if (!panel.isConnected) document.body.append(panel);
    // Clicking the tab you are already on closes the panel, like a real dock.
    // Clicking the active rail item closes the dock, but a stage chip must only filter.
    if (panelOpen() && current === id && !(opts && opts.keepOpen)) { closePanel(); drawRail(); return; }
    current = id;
    panel.classList.add('open');
    render();
    drawRail();
  }

  // Chat buckets read live from WhatsApp; lead stages read from our own store.
  const CHAT_FILTERS = [
    ['all', 'All Chats'], ['unread', 'Unread'], ['contacts', 'Saved'], ['unsaved', 'Unsaved'],
    ['groups', 'Groups'], ['community', 'Community'], ['business', 'Business'],
  ];

  async function drawStages() {
    if (!topbarEl) return;
    const leads = await store.get('wa_leads', []);
    const n = (s) => leads.filter((L) => (L.status || 'New') === s).length;

    const stages = el('div', { class: 'wacrm-bar-row' },
      el('span', { class: 'wacrm-bar-lbl' }, 'Leads'),
      ...[['', 'All Contacts', leads.length], ...LEAD_STAGES.map((s) => [s, s, n(s)])].map(([val, label, c]) =>
        el('button', {
          class: 'wacrm-stage' + (stageFilter === val ? ' on' : ''), type: 'button',
          'aria-pressed': String(stageFilter === val),
          onclick: () => { stageFilter = val; drawStages(); openFeature('leads', { keepOpen: true }); },
        }, el('span', {}, label), el('b', {}, String(c)))));

    const chats = el('div', { class: 'wacrm-bar-row' },
      el('span', { class: 'wacrm-bar-lbl' }, 'Chats'),
      ...CHAT_FILTERS.map(([id, label]) => el('button', {
        class: 'wacrm-stage', type: 'button', 'data-cf': id,
        onclick: () => openChatFilter(id, label),
      }, el('span', {}, label), el('b', {}, '·'))));

    topbarEl.replaceChildren(chats, stages);

    // Counts come from WhatsApp, so they fill in a moment later rather than blocking.
    const r = await wa('chatStats');
    if (!r.ok || !topbarEl) return;
    for (const [id] of CHAT_FILTERS) {
      const b = topbarEl.querySelector(`.wacrm-stage[data-cf="${id}"]`);
      if (b) b.lastChild.textContent = String(r.data[id] ?? 0);
    }
  }

  // Clicking a chat filter.
  //
  // WhatsApp has its own All / Unread / Favourites / Groups buttons above the chat list,
  // and it virtualises that list — hiding rows ourselves would leave gaps and break
  // scrolling. So where WhatsApp already has the filter, we press its button and let it do
  // the work. Where it does not (Saved / Unsaved / Business / Community) we show our own
  // list, and clicking a row opens that chat in WhatsApp.
  const NATIVE_FILTER = { all: 'All', unread: 'Unread', groups: 'Groups' };

  function clickNativeFilter(label) {
    const root = document.querySelector('#pane-side') || document.body;
    const btns = [...root.querySelectorAll('button,[role="button"],[role="tab"]')];
    const hit = btns.find((b) => {
      const t = (b.textContent || '').trim();
      return t === label || t.startsWith(label + ' ') || /^\d+$/.test(t.slice(label.length).trim()) && t.startsWith(label);
    });
    if (hit) { hit.click(); return true; }
    return false;
  }

  async function openChatFilter(bucket, label) {
    // Mark the active chip so the bar reflects what the list is showing.
    topbarEl?.querySelectorAll('.wacrm-stage[data-cf]').forEach((b) =>
      b.classList.toggle('on', b.dataset.cf === bucket));

    if (NATIVE_FILTER[bucket] && clickNativeFilter(NATIVE_FILTER[bucket])) {
      toast(`Chat list filtered: ${label}`);
      return;
    }

    if (!panel) buildPanel();
    if (!panel.isConnected) document.body.append(panel);
    panel.classList.add('open');
    bodyEl.replaceChildren(
      el('div', { class: 'wacrm-view-head' }, el('h3', {}, label), el('p', {}, 'Tap any chat to open it in WhatsApp.')),
      el('div', { class: 'wacrm-loading' }, 'Reading your chats…'));

    const r = await wa('chatNumbers', { bucket: bucket === 'community' ? 'groups' : bucket });
    const head = el('div', { class: 'wacrm-view-head' }, el('h3', {}, label), el('p', {}, 'Tap any chat to open it in WhatsApp.'));
    if (!r.ok) {
      bodyEl.replaceChildren(head, el('div', { class: 'wacrm-empty' }, 'Could not read chats: ' + (r.err || '')));
      return;
    }
    const rows = r.data;
    if (!rows.length) {
      bodyEl.replaceChildren(head, el('div', { class: 'wacrm-empty' },
        el('b', {}, 'Nothing here'), 'No chats matched this filter.'));
      return;
    }

    const list = el('div', { class: 'wacrm-list' },
      rows.slice(0, 300).map((x) => el('button', {
        class: 'wacrm-chatrow', type: 'button',
        onclick: async () => {
          const o = await wa('openChat', { jid: x.jid });
          if (!o.ok) toast('Could not open that chat', true);
        },
      },
        el('span', { class: 'wacrm-chatav' }, (x.name || x.number || '?').trim().charAt(0).toUpperCase()),
        el('span', { class: 'wacrm-grow' },
          el('b', {}, x.name || x.number || x.jid),
          el('span', { class: 'wacrm-dim' }, x.number ? '+' + x.number : (x.isGroup ? 'Group' : 'No phone number'))),
        x.unread ? el('i', { class: 'wacrm-unread' }, String(x.unread)) : null)));

    const withNumbers = rows.filter((x) => x.number);
    bodyEl.replaceChildren(head, el('div', { class: 'wacrm-pad' },
      el('div', { class: 'wacrm-note' },
        `${rows.length} chat${rows.length === 1 ? '' : 's'}${rows.length > 300 ? ' — showing the first 300' : ''}. `
        + `${withNumbers.length} have a usable phone number.`),
      el('div', { class: 'wacrm-row' },
        el('button', { class: 'wacrm-btn primary', onclick: () => {
          if (!withNumbers.length) return toast('None of these have a phone number', true);
          pendingNumbers = withNumbers.map((x) => x.number);
          openFeature('broadcast');
          toast(`${pendingNumbers.length} number(s) loaded into Bulk Send`);
        } }, 'Use in Bulk Send'),
        el('button', { class: 'wacrm-btn', onclick: () => {
          csv(`wa-crm-${bucket}.csv`, withNumbers.map((x) => ({ number: x.number, name: x.name, unread: x.unread })), ['number', 'name', 'unread']);
        } }, 'Export CSV'),
        el('button', { class: 'wacrm-btn', onclick: () => googleCsv(withNumbers, label) }, 'Google CSV')),
      list));
  }

  // ---------- modal ----------
  function modal(title, subtitle, body, actions) {
    closeModal();
    const sheet = el('div', { class: 'wacrm-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('div', { class: 'wacrm-sheet-head' },
        el('div', { class: 'g' }, el('h3', {}, title), subtitle ? el('p', {}, subtitle) : null),
        el('button', { class: 'wacrm-x', type: 'button', 'aria-label': 'Close', onclick: closeModal },
          icon('M18 6 6 18M6 6l12 12'))),
      el('div', { class: 'wacrm-sheet-body' }, body),
      actions ? el('div', { class: 'wacrm-sheet-foot' }, actions) : null);
    const wrap = el('div', {
      id: 'wacrm-modal',
      onclick: (e) => { if (e.target.id === 'wacrm-modal') closeModal(); },
      onkeydown: (e) => { if (e.key === 'Escape') closeModal(); },
    }, sheet);
    document.body.append(wrap);
    sheet.querySelector('input,textarea,select,button')?.focus();
    return wrap;
  }
  const closeModal = () => $('#wacrm-modal')?.remove();

  // ---------- Menu Manager ----------
  async function menuManager() {
    await loadEnabled();
    const rows = FEATURES.map(([id, , title, desc, d]) => {
      const locked = ALWAYS_ON.has(id);
      return el('div', { class: 'wacrm-menu-row' + (locked ? ' locked' : '') },
        icon(d),
        el('div', { class: 't' }, el('b', {}, title), el('span', {}, locked ? 'Always available' : desc)),
        locked ? null : toggle('', '', enabled[id], (v) => { enabled[id] = v; }));
    });
    modal('Menu Features', 'Enable or disable the features below as needed. Disabled ones disappear from the rail.',
      el('div', {}, rows),
      [el('button', { class: 'wacrm-btn', onclick: closeModal }, 'Cancel'),
       el('button', { class: 'wacrm-btn primary', onclick: async () => {
         await saveEnabled(); drawRail(); closeModal(); toast('Menu updated');
       } }, 'Save')]);
  }

  // ---------- Follow-Up Funnels ----------
  async function viewFunnels() {
    const funnels = await store.get('wa_funnels', []);
    const list = el('div', { class: 'wacrm-list' });

    const draw = () => {
      list.replaceChildren();
      if (!funnels.length) {
        list.append(el('div', { class: 'wacrm-empty' },
          el('b', {}, 'No funnels yet'), 'Create one to follow up automatically.'));
      }
      funnels.forEach((f, i) => list.append(el('div', { class: 'wacrm-card' },
        el('div', { class: 'wacrm-grow' },
          el('b', {}, f.name),
          el('div', { class: 'wacrm-dim' },
            `When status becomes ${f.trigger} · wait ${f.delayH}h · then send a message`),
          el('div', { class: 'wacrm-dim' }, f.active ? 'Active' : 'Paused')),
        el('div', { class: 'wacrm-col' },
          el('button', { class: 'wacrm-btn small', onclick: async () => {
            funnels[i].active = !funnels[i].active; await store.set('wa_funnels', funnels); draw();
          } }, f.active ? 'Pause' : 'Resume'),
          el('button', { class: 'wacrm-btn small danger', onclick: async () => {
            funnels.splice(i, 1); await store.set('wa_funnels', funnels); draw();
          } }, 'Delete')))));
    };

    const create = () => {
      const name = el('input', { class: 'wacrm-in', placeholder: 'Enter the follow-up name' });
      const trig = el('select', { class: 'wacrm-in' },
        LEAD_STAGES.map((s) => el('option', { value: s }, s)));
      const msg = el('textarea', { class: 'wacrm-in', placeholder: 'Hi [NAME], just following up on this.' });
      let delayH = 24;
      const delay = slider('Wait before sending', 1, 168, 24, (v) => (v < 24 ? v + 'h' : Math.round(v / 24) + 'd'), (v) => { delayH = v; });

      modal('Create Follow Up', 'Runs while this WhatsApp tab is open. Closing the tab pauses it.',
        el('div', {},
          el('label', {}, 'Follow-up name'), name,
          el('div', { class: 'wacrm-step' },
            el('div', { class: 'wacrm-step-head' }, el('span', { class: 'n' }, '1'), 'Trigger', el('span', { class: 'k' }, 'lead status changes to')),
            el('div', { class: 'wacrm-step-body' }, trig)),
          el('div', { class: 'wacrm-arrow' }, '↓'),
          el('div', { class: 'wacrm-step' },
            el('div', { class: 'wacrm-step-head' }, el('span', { class: 'n' }, '2'), 'Wait'),
            el('div', { class: 'wacrm-step-body' }, delay)),
          el('div', { class: 'wacrm-arrow' }, '↓'),
          el('div', { class: 'wacrm-step' },
            el('div', { class: 'wacrm-step-head' }, el('span', { class: 'n' }, '3'), 'Action', el('span', { class: 'k' }, 'send a message')),
            el('div', { class: 'wacrm-step-body' }, msg))),
        [el('button', { class: 'wacrm-btn', onclick: closeModal }, 'Cancel'),
         el('button', { class: 'wacrm-btn primary', onclick: async () => {
           if (!name.value.trim()) return toast('Name the funnel', true);
           if (!msg.value.trim()) return toast('Write the message', true);
           funnels.push({ id: Date.now(), name: name.value.trim(), trigger: trig.value || LEAD_STAGES[0], delayH, text: msg.value, active: true });
           await store.set('wa_funnels', funnels); closeModal(); draw(); toast('Funnel created');
         } }, 'Create')]);
    };

    bodyEl.append(el('div', { class: 'wacrm-pad' },
      el('div', { class: 'wacrm-note warn' }, 'Follow-ups are sent by this browser tab. They only fire while WhatsApp Web is open here — nothing is queued on a server.'),
      el('button', { class: 'wacrm-btn primary', onclick: create }, '+ New follow-up'),
      list));
    draw();
  }

  // Runs pending follow-ups. Only ever fires while the tab is open, which is stated in
  // the UI rather than implied away.
  async function runFunnels() {
    const funnels = (await store.get('wa_funnels', [])).filter((f) => f.active);
    if (!funnels.length) return;
    const leads = await store.get('wa_leads', []);
    let changed = false;
    for (const L of leads) {
      for (const f of funnels) {
        if ((L.status || 'New') !== f.trigger) continue;
        const key = 'f' + f.id;
        L.sent = L.sent || {};
        if (L.sent[key]) continue;
        const due = (L.statusAt || L.ts || 0) + f.delayH * 3600000;
        if (Date.now() < due) continue;
        const r = await wa('sendText', { to: L.number, text: f.text.replace(/\[NAME\]/g, L.name || '') });
        if (r.ok) { L.sent[key] = Date.now(); changed = true; toast(`Follow-up sent to ${L.name || L.number}`); }
      }
    }
    if (changed) await store.set('wa_leads', leads);
  }

  // ---------- Chatbot Flow Builder ----------
  async function viewFlows() {
    const flows = await store.get('wa_flows', []);
    const list = el('div', { class: 'wacrm-list' });

    const draw = () => {
      list.replaceChildren();
      if (!flows.length) {
        list.append(el('div', { class: 'wacrm-empty' },
          el('b', {}, 'No flows yet'), 'Build one to reply automatically when a keyword arrives.'));
      }
      flows.forEach((f, i) => list.append(el('div', { class: 'wacrm-card' },
        el('div', { class: 'wacrm-grow' },
          el('b', {}, f.name),
          el('div', { class: 'wacrm-dim' }, `When a message contains: ${f.keywords.join(', ')}`),
          el('div', { class: 'wacrm-dim' }, `Reply: ${f.reply.slice(0, 60)}${f.reply.length > 60 ? '…' : ''}`)),
        el('div', { class: 'wacrm-col' },
          el('button', { class: 'wacrm-btn small', onclick: async () => {
            flows[i].active = !flows[i].active; await store.set('wa_flows', flows); draw();
          } }, f.active ? 'Pause' : 'Resume'),
          el('button', { class: 'wacrm-btn small danger', onclick: async () => {
            flows.splice(i, 1); await store.set('wa_flows', flows); draw();
          } }, 'Delete')))));
    };

    const create = () => {
      const name = el('input', { class: 'wacrm-in', placeholder: 'Pricing enquiry' });
      const kw = el('input', { class: 'wacrm-in', placeholder: 'price, cost, how much' });
      const reply = el('textarea', { class: 'wacrm-in', placeholder: 'Thanks for asking! Our plans start at Rs. 399.' });
      modal('Chatbot Flow', 'A flow watches incoming messages and answers on your behalf.',
        el('div', {},
          el('label', {}, 'Flow name'), name,
          el('div', { class: 'wacrm-step' },
            el('div', { class: 'wacrm-step-head' }, el('span', { class: 'n' }, '1'), 'Trigger', el('span', { class: 'k' }, 'message contains any of')),
            el('div', { class: 'wacrm-step-body' }, kw)),
          el('div', { class: 'wacrm-arrow' }, '↓'),
          el('div', { class: 'wacrm-step' },
            el('div', { class: 'wacrm-step-head' }, el('span', { class: 'n' }, '2'), 'Reply'),
            el('div', { class: 'wacrm-step-body' }, reply))),
        [el('button', { class: 'wacrm-btn', onclick: closeModal }, 'Cancel'),
         el('button', { class: 'wacrm-btn primary', onclick: async () => {
           const words = kw.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
           if (!name.value.trim() || !words.length || !reply.value.trim()) return toast('Fill every step', true);
           flows.push({ id: Date.now(), name: name.value.trim(), keywords: words, reply: reply.value, active: true });
           await store.set('wa_flows', flows); closeModal(); draw(); toast('Flow saved');
         } }, 'Save flow')]);
    };

    bodyEl.append(el('div', { class: 'wacrm-pad' },
      el('div', { class: 'wacrm-note warn' }, 'Flows reply only while this tab is open. Keep replies helpful — automated answers to people who never wrote to you is what gets numbers banned.'),
      el('button', { class: 'wacrm-btn primary', onclick: create }, '+ New flow'),
      list));
    draw();
  }

  // Fire-and-forget: a webhook failure must never block the CRM action that triggered it.
  async function fireWebhook(event, lead) {
    const cfg = await store.get('wa_webhook', null);
    if (!cfg || !cfg.on || !cfg.url) return;
    bg('webhook', {
      url: cfg.url,
      body: {
        event,
        name: lead.name || '',
        number: lead.number,
        type: lead.type || '',
        status: lead.status || '',
        at: new Date().toISOString(),
        source: 'WA-CRM',
      },
    });
  }

  // ---------- Webhook & API ----------
  async function viewWebhook() {
    const cfg = await store.get('wa_webhook', { url: '', on: false });
    const state = el('div', { class: 'wacrm-note' },
      cfg.on && cfg.url ? `Active — posting lead changes to ${cfg.url}` : 'Not connected yet.');

    bodyEl.append(el('div', { class: 'wacrm-pad' },
      state,
      el('div', { class: 'wacrm-note' }, 'Whenever you save a lead or change its status, WA-CRM can POST it as JSON to a URL you choose — Google Sheets through Zapier or Make, another CRM, or your own endpoint.'),
      el('button', { class: 'wacrm-btn primary', onclick: () => bg('openWebhookSetup') },
        cfg.on ? 'Change webhook settings' : 'Set up webhook'),
      el('div', { class: 'wacrm-note warn', style: { marginTop: '14px' } },
        'Setup opens in a separate tab because Chrome only lets you approve a new domain from an extension page, not from inside WhatsApp.'),
      el('details', { class: 'wacrm-acc' },
        el('summary', {}, 'What gets sent'),
        el('div', { class: 'wacrm-log' },
          JSON.stringify({ event: 'lead.updated', name: 'Ravi Sharma', number: '919876543210', type: 'Hot', status: 'Proposal sent', at: '2026-07-27T10:00:00.000Z', source: 'WA-CRM' }, null, 2)))));
  }


  // ---------- Guide ----------
  // Opens by itself the first time, because an icon rail with no labels is unusable if
  // you do not already know what the icons do.
  const HOWTO = [
    ['deals', 'Deals & Renewals', [
      'When a customer buys, open their chat and tap the green WA button above the message box.',
      'Choose "Deal done", type what they bought and how many days it is valid for, then Save. Their number is captured for you.',
      'Seven days later they are asked automatically whether it is working — put your feedback form link in Follow-up settings and it goes out with the message.',
      'Before the validity runs out they get a renewal reminder, so you do not lose the repeat sale.',
      'The dashboard shows what is active, what expires this week and what has lapsed. Export CSV opens in Excel.',
    ], 'Follow-ups are sent by this tab, so they only go out while WhatsApp Web is open.'],
    ['catalog', 'Product Catalog', [
      'Open the chat you want to send to.',
      'Press "+ Add a product", pick an image and write the caption you normally send.',
      'From then on, click Send on that product and it goes to the open chat instantly.',
    ], 'Replaces copy-pasting the same offer 50 times a day.'],
    ['leads', 'Leads', [
      'Open a customer chat, then press "+ Save current chat".',
      'Set the type (Hot / Warm / Cold) and the status.',
      'Use the coloured chips along the top to filter by stage. Export CSV any time.',
    ], 'The counts in the top bar update as you move people through the stages.'],
    ['broadcast', 'Bulk Send', [
      'Paste numbers, one per line, with country code and no + sign.',
      'Write the message. Use {hello|hi} to vary the wording per person.',
      'Set the delay sliders, then Start sending. Stop halts it immediately.',
    ], 'Only message people who contacted you first. Blasting strangers gets numbers banned.'],
    ['numbers', 'Number Check', [
      'Paste a list of numbers.',
      'Press Check — it reports which ones actually have WhatsApp.',
      'Export the result as CSV.',
    ], ''],
    ['export', 'Export Numbers', [
      'Press Load contacts or List groups.',
      'Export as a Google-Contacts-ready CSV.',
    ], ''],
    ['invoice', 'Invoice', [
      'Fill your business details once — they are remembered.',
      'Add the customer, the items and the amounts.',
      'Press Send to WhatsApp and it goes to the open chat as a formatted bill.',
    ], ''],
    ['schedule', 'Schedule', [
      'Pick a chat, write the message and choose the date and time.',
      'It sends automatically when the moment arrives.',
    ], 'Only fires while this WhatsApp tab is open — a browser cannot send when it is closed.'],
    ['reminder', 'Reminder', [
      'Write the note and pick when you want to be nudged.',
      'An alarm pops up over WhatsApp at that time with your note.',
    ], 'This is a reminder for you, not a message to the customer.'],
    ['groups', 'Group Tools', [
      'Press Load groups.',
      'Tick every group you want to post to.',
      'Write the message and press Post — it goes to all of them with delays in between.',
    ], ''],
    ['funnels', 'Follow-Up Funnels', [
      'Create a funnel: choose the lead status that triggers it.',
      'Set how long to wait, and the message to send.',
      'Move a lead into that status and the follow-up fires when the timer is up.',
    ], 'Runs only while this tab is open.'],
    ['flows', 'Chatbot', [
      'Create a flow with the keywords to watch for.',
      'Write the reply that should be sent automatically.',
    ], 'Runs only while this tab is open.'],
    ['webhook', 'Webhook & API', [
      'Press Set up webhook — it opens a separate tab.',
      'Paste your Zapier / Make / Sheets URL and approve the domain.',
      'Every lead change is then posted there as JSON.',
    ], ''],
  ];

  async function viewGuide() {
    const box = el('div', { class: 'wacrm-pad' },
      el('div', { class: 'wacrm-note' },
        'The icons down the left edge are the features. Hover any of them to see its name. '
        + 'Everything below explains what each one does and how to use it.'));

    for (const [id, title, steps, note] of HOWTO) {
      const f = FEATURES.find((x) => x[0] === id);
      box.append(el('details', { class: 'wacrm-acc' },
        el('summary', {}, title),
        el('div', {},
          el('ol', { class: 'wacrm-steps' }, steps.map((t) => el('li', {}, t))),
          note ? el('div', { class: 'wacrm-note warn' }, note) : null,
          f ? el('button', { class: 'wacrm-btn small', onclick: () => openFeature(id) }, 'Open ' + title) : null)));
    }

    box.append(el('div', { class: 'wacrm-note', style: { marginTop: '14px' } },
      'Not every desktop feature is here. The desktop app also does Group Guard, chat filters '
      + 'and multi-account inboxes, which a browser tab cannot do properly.'));
    bodyEl.append(box);
    await store.set('wa_seen_guide', true);
  }

  // ---------- Invoice ----------
  async function viewInvoice() {
    const biz = await store.get('wa_business', { name: '', addr: '', gstin: '', phone: '' });
    const items = [];

    const f = (ph, val) => el('input', { class: 'wacrm-in', placeholder: ph, value: val || '' });
    const bName = f('Your business name', biz.name);
    const bAddr = f('Address', biz.addr);
    const bGst = f('GSTIN (optional)', biz.gstin);
    const cName = f('Customer name', '');
    const rows = el('div', {});
    const total = el('div', { class: 'wacrm-slider-val', style: { fontSize: '15px' } }, '0');

    const recalc = () => { total.textContent = String(items.reduce((s, i) => s + i.qty * i.rate, 0)); };
    const addRow = () => {
      const it = { desc: '', qty: 1, rate: 0 };
      items.push(it);
      const d = el('input', { class: 'wacrm-in wacrm-grow', placeholder: 'Item' });
      const q = el('input', { class: 'wacrm-in small', type: 'number', value: '1' });
      const r = el('input', { class: 'wacrm-in small', type: 'number', value: '0' });
      d.addEventListener('input', () => { it.desc = d.value; });
      q.addEventListener('input', () => { it.qty = +q.value || 0; recalc(); });
      r.addEventListener('input', () => { it.rate = +r.value || 0; recalc(); });
      rows.append(el('div', { class: 'wacrm-row' }, d, q, r));
    };
    // Turn chosen catalog products into invoice lines, prefilled.
    const addFromCatalog = (picked) => {
      for (const p of picked) {
        addRow();
        const row = rows.lastElementChild;
        const [d, q, r] = row.querySelectorAll('input');
        const it = items[items.length - 1];
        d.value = p.title || ''; it.desc = d.value;
        q.value = '1'; it.qty = 1;
        r.value = String(p.price || 0); it.rate = p.price || 0;
      }
      recalc();
      toast(`${picked.length} product(s) added`);
    };
    addRow();

    bodyEl.append(el('div', { class: 'wacrm-pad' },
      el('details', { class: 'wacrm-acc' }, el('summary', {}, 'Business details'),
        el('div', {}, bName, bAddr, bGst,
          el('button', { class: 'wacrm-btn small', onclick: async () => {
            await store.set('wa_business', { name: bName.value, addr: bAddr.value, gstin: bGst.value });
            toast('Business details saved');
          } }, 'Save details'))),
      el('label', {}, 'Customer'), cName,
      el('label', {}, 'Items — description, qty, rate'), rows,
      el('div', { class: 'wacrm-row' },
        el('button', { class: 'wacrm-btn small', onclick: addRow }, '+ Add line'),
        el('button', { class: 'wacrm-btn small primary', onclick: () => pickFromCatalog(addFromCatalog) }, 'Add from Catalog'),
        el('div', { class: 'wacrm-grow' }), el('span', { class: 'wacrm-dim' }, 'Total'), total),
      el('button', { class: 'wacrm-btn primary', onclick: async () => {
        if (!items.some((i) => i.desc)) return toast('Add at least one item', true);
        const c = (await wa('activeChat')).data;
        if (!c) return toast('Open the customer chat first', true);
        const no = 'INV-' + String(Date.now()).slice(-6);
        const lines = items.filter((i) => i.desc)
          .map((i) => `${i.desc} — ${i.qty} x ${i.rate} = ${i.qty * i.rate}`);
        const text = [
          `*${bName.value || 'Invoice'}*`, bAddr.value, bGst.value ? 'GSTIN: ' + bGst.value : '', '',
          `Invoice ${no}`, `Bill to: ${cName.value || c.name}`, '', ...lines, '',
          `*Total: ${items.reduce((s, i) => s + i.qty * i.rate, 0)}*`,
        ].filter(Boolean).join('\n');
        const r = await wa('sendText', { to: c.number, text });
        toast(r.ok ? 'Invoice sent to ' + (c.name || c.number) : 'Send failed', !r.ok);
      } }, 'Send invoice to open chat')));
  }

  // ---------- Schedule ----------
  async function viewSchedule() {
    const jobs = await store.get('wa_scheduled', []);
    const list = el('div', { class: 'wacrm-list' });
    const num = el('input', { class: 'wacrm-in', placeholder: '919876543210' });
    const txt = el('textarea', { class: 'wacrm-in', placeholder: 'Message to send' });
    const when = whenField('');

    const draw = () => {
      list.replaceChildren();
      if (!jobs.length) list.append(el('div', { class: 'wacrm-empty' }, el('b', {}, 'Nothing scheduled')));
      jobs.forEach((j, i) => list.append(el('div', { class: 'wacrm-card' },
        el('div', { class: 'wacrm-grow' },
          el('b', {}, j.to),
          el('div', { class: 'wacrm-dim' }, new Date(j.at).toLocaleString()),
          el('div', { class: 'wacrm-dim' }, j.text.slice(0, 70))),
        el('button', { class: 'wacrm-btn small danger', onclick: async () => {
          jobs.splice(i, 1); await store.set('wa_scheduled', jobs); draw();
        } }, 'Cancel'))));
    };

    bodyEl.append(el('div', { class: 'wacrm-pad' },
      el('div', { class: 'wacrm-note warn' }, 'Scheduled messages are sent by this browser tab. If WhatsApp Web is closed at that moment, the message waits until you open it again.'),
      el('label', {}, 'Send to'), num,
      el('label', {}, 'Message'), txt,
      when.node,
      el('div', { class: 'wacrm-row' },
        el('button', { class: 'wacrm-btn primary', onclick: async () => {
          const n = num.value.replace(/\D/g, '');
          if (n.length < 7) return toast('Enter a valid number', true);
          if (!txt.value.trim()) return toast('Write the message', true);
          if (!when.value || when.value < Date.now()) return toast('Pick a time in the future', true);
          jobs.push({ id: Date.now(), to: n, text: txt.value, at: when.value });
          await store.set('wa_scheduled', jobs); draw(); toast('Scheduled');
          num.value = ''; txt.value = '';
        } }, 'Schedule'),
        el('button', { class: 'wacrm-btn', onclick: () => { num.value = ''; txt.value = ''; when.clear(); toast('Cleared'); } }, 'Clear')),
      list));
    draw();
  }

  async function runScheduled() {
    const jobs = await store.get('wa_scheduled', []);
    const due = jobs.filter((j) => j.at <= Date.now());
    if (!due.length) return;
    for (const j of due) {
      const r = await wa('sendText', { to: j.to, text: j.text });
      if (r.ok) toast('Scheduled message sent to ' + j.to);
    }
    await store.set('wa_scheduled', jobs.filter((j) => j.at > Date.now()));
  }

  // ---------- Reminder ----------
  // Cloned from the desktop app: title + note, optional WhatsApp send, daily repeat,
  // sound on/off, a browser notification, and an alarm popup you must acknowledge.
  async function viewReminder() {
    const rems = await store.get('wa_reminders', []);
    const list = el('div', { class: 'wacrm-list' });
    const title = el('input', { class: 'wacrm-in', placeholder: 'Renewal call' });
    const note = el('textarea', { class: 'wacrm-in', placeholder: 'Ravi wants the 1-year plan. Quote Rs. 1,199.' });
    const num = el('input', { class: 'wacrm-in', placeholder: 'Leave empty to only alert yourself' });
    const when = whenField('');
    let daily = false, sound = true;

    const draw = () => {
      list.replaceChildren();
      if (!rems.length) {
        list.append(el('div', { class: 'wacrm-empty' },
          el('b', {}, 'No reminders'), 'Set one and an alarm will ring here at that time.'));
      }
      rems.slice().sort((a, x) => a.at - x.at).forEach((r) => list.append(el('div', { class: 'wacrm-card' },
        el('div', { class: 'wacrm-grow' },
          el('b', {}, r.title || (r.note || '').slice(0, 40) || 'Reminder'),
          r.note ? el('div', { class: 'wacrm-dim' }, r.note.slice(0, 80)) : null,
          el('div', { class: 'wacrm-dim' },
            new Date(r.at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
            + (r.repeat === 'daily' ? '  ·  every day' : '')
            + (r.number ? '  ·  also messages ' + r.number : '')
            + (r.sound === false ? '  ·  silent' : ''))),
        el('div', { class: 'wacrm-col' },
          el('button', { class: 'wacrm-btn small', onclick: () => alarm(r) }, 'Test'),
          el('button', { class: 'wacrm-btn small danger', onclick: async () => {
            const i = rems.indexOf(r); if (i > -1) rems.splice(i, 1);
            await store.set('wa_reminders', rems); draw();
          } }, 'Delete')))));
    };

    bodyEl.append(el('div', { class: 'wacrm-pad' },
      el('div', { class: 'wacrm-note' }, 'A reminder alerts you with an alarm and your note. It only messages a customer if you add a number below. The alarm rings while this WhatsApp tab is open.'),
      el('label', {}, 'Title'), title,
      el('label', {}, 'Note'), note,
      when.node,
      toggle('Repeat every day', 'Rolls forward to the same time tomorrow instead of finishing.', false, (v) => { daily = v; }),
      toggle('Play the alarm sound', 'Turn off for a silent popup.', true, (v) => { sound = v; }),
      el('details', { class: 'wacrm-acc' },
        el('summary', {}, 'Also send a WhatsApp message (optional)'),
        el('div', {}, el('label', {}, 'Send the note to this number'), num)),
      el('button', { class: 'wacrm-btn primary', onclick: async () => {
        if (!title.value.trim() && !note.value.trim()) return toast('Add a title or a note', true);
        if (when.value < Date.now()) return toast('Pick a time in the future', true);
        rems.push({
          id: Date.now(), title: title.value.trim(), note: note.value.trim(),
          at: when.value, repeat: daily ? 'daily' : 'once', sound,
          number: num.value.replace(/\D/g, '') || '',
        });
        await store.set('wa_reminders', rems);
        draw(); when.clear();
        title.value = ''; note.value = '';
        toast('Reminder set');
      } }, 'Set reminder'),
      list));
    draw();
  }

  async function runReminders() {
    const rems = await store.get('wa_reminders', []);
    const due = rems.filter((r) => r.at <= Date.now());
    if (!due.length) return;

    const keep = [];
    for (const r of rems) {
      if (r.at > Date.now()) { keep.push(r); continue; }
      // Optional WhatsApp send, exactly as the desktop app does it.
      if (r.number) {
        const msg = [r.title, r.note].filter(Boolean).join('\n');
        wa('sendText', { to: r.number, text: msg }).catch(() => {});
      }
      try {
        if (window.Notification && Notification.permission === 'granted') {
          new Notification('WA-CRM · Reminder', { body: r.title || r.note || '' });
        }
      } catch (e) {}
      alarm(r);
      // Daily reminders roll forward instead of finishing.
      if (r.repeat === 'daily') keep.push({ ...r, at: r.at + 86400000 });
    }
    await store.set('wa_reminders', keep);
  }

  // ---------- Alarm ----------
  // Ported from the desktop app: a looping two-tone chime plus a card the user has to
  // acknowledge, with snooze. A single beep was too easy to miss.
  let _chime = null;
  function startChime() {
    stopChime();
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const beat = (t0, f) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.45, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
        o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + 0.5);
      };
      const loop = () => { const n = ctx.currentTime; beat(n, 880); beat(n + 0.28, 1174.7); };
      loop();
      _chime = { ctx, iv: setInterval(loop, 1600) };
    } catch (e) { _chime = null; }
  }
  function stopChime() {
    if (!_chime) return;
    try { clearInterval(_chime.iv); _chime.ctx.close(); } catch (e) {}
    _chime = null;
  }

  function alarm(rem) {
    const when = new Date(rem.at || Date.now());
    const hhmm = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (rem.sound !== false) startChime();

    const close = () => { stopChime(); scrim.remove(); };
    const snooze = async (mins) => {
      const rems = await store.get('wa_reminders', []);
      rems.push({ id: Date.now(), note: rem.note, at: Date.now() + mins * 60000 });
      await store.set('wa_reminders', rems);
      close(); toast('Snoozed ' + mins + ' min');
    };

    // Every element carries its own class so the card never depends on inherited design
    // tokens — that is how the snooze buttons ended up as bare text before.
    const snoozeBtn = (mins) => el('button', {
      class: 'wacrm-al-snooze', type: 'button', onclick: () => snooze(mins),
    }, el('b', {}, String(mins)), el('span', {}, 'min'));

    const card = el('div', { class: 'wacrm-alarm-card', role: 'alertdialog', 'aria-label': 'Reminder' },
      el('div', { class: 'wacrm-al-top' },
        el('div', { class: 'wacrm-alarm-ring' },
          icon('M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0')),
        el('div', { class: 'wacrm-al-kicker' }, 'Reminder')),

      el('div', { class: 'wacrm-alarm-time' }, hhmm),
      el('div', { class: 'wacrm-alarm-date' },
        when.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })),

      rem.title ? el('h2', { class: 'wacrm-alarm-title' }, rem.title) : null,
      rem.note ? el('div', { class: 'wacrm-alarm-note' }, rem.note) : null,
      rem.number ? el('div', { class: 'wacrm-alarm-sent' },
        icon('M20 6 9 17l-5-5'), 'Also sent on WhatsApp to ' + rem.number) : null,

      el('div', { class: 'wacrm-al-snoozerow' },
        el('span', { class: 'wacrm-al-snoozelbl' }, 'Snooze for'),
        el('div', { class: 'wacrm-al-snoozes' }, snoozeBtn(5), snoozeBtn(10), snoozeBtn(30))),

      el('button', { class: 'wacrm-al-dismiss', type: 'button', onclick: close }, 'Dismiss'));

    const scrim = el('div', { class: 'wacrm-alarm-scrim' }, card);
    document.body.append(scrim);
    // Never let a ringing alarm run forever if nobody is at the machine.
    setTimeout(stopChime, 120000);
  }

  // ---------- Group Tools ----------
  async function viewGroups() {
    const picked = new Set();
    const list = el('div', { class: 'wacrm-list' });
    const txt = el('textarea', { class: 'wacrm-in', placeholder: 'Message to post to every selected group' });
    const log = el('div', { class: 'wacrm-log' });
    const count = el('span', { class: 'wacrm-dim' }, '0 selected');

    const load = async () => {
      list.replaceChildren(el('div', { class: 'wacrm-loading' }, 'Loading groups…'));
      const r = await wa('groups');
      list.replaceChildren();
      if (!r.ok) return list.append(el('div', { class: 'wacrm-empty' }, 'Could not read groups: ' + (r.err || '')));
      if (!r.data.length) return list.append(el('div', { class: 'wacrm-empty' }, 'No groups found.'));
      for (const g of r.data) {
        list.append(pickRow(g.name || g.jid, '', false, (v) => {
          v ? picked.add(g.jid) : picked.delete(g.jid);
          count.textContent = `${picked.size} selected`;
        }));
      }
      count.textContent = `${picked.size} selected`;
    };

    bodyEl.append(el('div', { class: 'wacrm-pad' },
      el('div', { class: 'wacrm-note warn' }, 'Posting the same message to many groups at once is the quickest way to get reported. Post only where you are a welcome member.'),
      el('div', { class: 'wacrm-row' },
        el('button', { class: 'wacrm-btn', onclick: load }, 'Load groups'),
        el('button', { class: 'wacrm-btn small', onclick: () => {
          const rows = list.querySelectorAll('.wacrm-pick');
          const turnOn = [...rows].some((r) => !r.classList.contains('on'));
          rows.forEach((r) => { if (r.classList.contains('on') !== turnOn) r.click(); });
        } }, 'Select all'),
        count),
      list,
      el('label', {}, 'Message'), txt,
      el('button', { class: 'wacrm-btn primary', onclick: async () => {
        if (!picked.size) return toast('Select at least one group', true);
        if (!txt.value.trim()) return toast('Write the message', true);
        if (!confirm(`Post to ${picked.size} group(s)?`)) return;
        log.replaceChildren();
        let ok = 0;
        for (const jid of picked) {
          const r = await wa('sendText', { to: jid, text: txt.value });
          if (r.ok) ok++;
          line(log, (r.ok ? '✓ ' : '✗ ') + jid + (r.ok ? '' : ' — ' + (r.err || '')));
          await sleep(4000 + Math.random() * 6000);
        }
        toast(`Posted to ${ok}/${picked.size}`);
      } }, 'Post to selected groups'),
      log));
  }


  // ---------- Deals & Renewals ----------
  // Records what a customer bought, from the chat widget, with their number captured
  // automatically. From then on it works the relationship: a feedback check-in once they
  // have had time to use the thing, and a renewal nudge before the validity runs out.
  // Both ride the same 30s tick as reminders, so they send only while WhatsApp is open.
  const DEAL_DAY = 86400000;
  const DEAL_DEFAULTS = {
    feedbackUrl: '',
    fbDays: 7,
    fbTpl: 'Hi {name}, it has been {days} days since you started {item}. Is everything working well for you?\n\nIf anything is not right, tell us here and we will fix it: {link}',
    rnLead: 3,
    rnTpl: 'Hi {name}, your {item} expires on {expiry}. Reply RENEW and we will keep it running without a break.',
    autoFeedback: true,
    autoRenew: true,
  };
  const dealCfg = async () => ({ ...DEAL_DEFAULTS, ...(await store.get('wa_deal_cfg', {})) });
  const dealDate = (ms) => new Date(ms).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

  // Derive both due-dates from the purchase date and validity, so editing a deal re-arms
  // whatever has not gone out yet.
  function dealSchedule(d, cfg) {
    const lead = Math.max(0, cfg.rnLead) * DEAL_DAY;
    // A renewal reminder must never land before the sale itself. On a plan shorter than the
    // lead time there is no "before" to aim at, so remind on the expiry day instead —
    // otherwise a 1-day trial tells the customer to renew seconds after they paid.
    d.rnAt = d.expires - lead > d.start ? d.expires - lead : d.expires;
    // Ask for feedback while the plan is still running, and never so late that it arrives
    // alongside the renewal nudge. 0 means "not scheduled" — on a short plan there is no
    // useful gap, and two messages at once reads as spam.
    const fb = d.start + Math.max(1, cfg.fbDays) * DEAL_DAY;
    d.fbAt = fb < d.rnAt ? fb : 0;
    return d;
  }

  function dealFill(tpl, d, cfg) {
    return String(tpl)
      .replace(/\{name\}/g, d.name || 'there')
      .replace(/\{item\}/g, d.item || 'your plan')
      .replace(/\{days\}/g, String(Math.max(1, Math.round((Date.now() - d.start) / DEAL_DAY))))
      .replace(/\{expiry\}/g, dealDate(d.expires))
      .replace(/\{amount\}/g, d.amount ? '₹' + d.amount : '')
      .replace(/\{link\}/g, cfg.feedbackUrl || '')
      .trim();
  }

  async function sendDealMsg(d, kind, cfg) {
    cfg = cfg || (await dealCfg());
    const body = dealFill(kind === 'feedback' ? cfg.fbTpl : cfg.rnTpl, d, cfg);
    if (!body) return false;
    const r = await wa('sendText', { to: d.number, text: body }).catch(() => null);
    return !!(r && r.ok !== false);
  }

  // Flags are written before the send, so a slow send cannot be started twice by the tick
  // that follows it. That alone is not enough: reading the store is async, so two ticks
  // can both read "not sent yet" before either writes. The busy latch closes that window —
  // without it a customer gets the same renewal message twice.
  let _dealsBusy = false;
  async function runDeals() {
    if (_dealsBusy) return;
    _dealsBusy = true;
    try {
      const cfg = await dealCfg();
      const ds = await store.get('wa_deals', []);
      const now = Date.now();
      const due = [];
      let ch = false;
      for (const d of ds) {
        if (d.status !== 'active') continue;
        if (cfg.autoFeedback && !d.fbSent && d.fbAt && d.fbAt <= now) { d.fbSent = true; ch = true; due.push([d, 'feedback']); }
        if (cfg.autoRenew && !d.rnSent && d.rnAt && d.rnAt <= now) { d.rnSent = true; ch = true; due.push([d, 'renew']); }
      }
      if (!ch) return;
      await store.set('wa_deals', ds);
      for (const [d, kind] of due) await sendDealMsg(d, kind, cfg);
      if (current === 'deals') openFeature('deals', { keepOpen: true });
    } finally {
      _dealsBusy = false;
    }
  }

  // ---- Add / edit ----
  async function dealModal(chat, existing) {
    const cfg = await dealCfg();
    const d = existing || {};
    const number = existing ? existing.number : chat.number;
    const name = existing ? existing.name : chat.name;

    const item = el('input', { class: 'wacrm-in', placeholder: 'What did they buy?' });
    item.value = d.item || '';
    const amount = el('input', { class: 'wacrm-in', type: 'number', placeholder: 'Amount ₹ (optional)' });
    amount.value = d.amount || '';
    const cost = el('input', { class: 'wacrm-in', type: 'number', min: '0', placeholder: 'What it cost you' });
    cost.value = d.cost || '';

    // Pick a saved product to fill the rates in, rather than retyping them on every sale.
    // Both stay editable afterwards — a deal is often closed at a negotiated price.
    const products = (await store.get('wa_catalog', [])).filter((p) => p.title || p.text);
    const pick = el('select', { class: 'wacrm-in' },
      el('option', { value: '' }, products.length ? 'Choose a saved product…' : 'No products saved yet'),
      ...products.map((p, i) => el('option', { value: String(i) },
        (p.title || 'Untitled') + (Number(p.price) > 0 ? ` — ₹${p.price}` : ''))));

    const marginNote = el('p', { class: 'wacrm-sub' });
    const margin = () => {
      const a = Number(amount.value) || 0, c = Number(cost.value) || 0;
      if (!a) { marginNote.textContent = ''; return; }
      marginNote.textContent = c > 0
        ? `Profit on this sale: ₹${(a - c).toLocaleString('en-IN')}${a - c < 0 ? ' — you are selling below cost' : ''}`
        : 'Add what it cost you and the profit shows up in Sales & Expenses.';
    };
    pick.onchange = () => {
      // Number('') is 0, so without this the placeholder resolves to the first product —
      // backing out of the picker would overwrite the rates you just typed.
      if (pick.value === '') return;
      const p = products[Number(pick.value)];
      if (!p) return;
      item.value = p.title || '';
      if (Number(p.price) > 0) amount.value = String(p.price);
      if (Number(p.cost) > 0) cost.value = String(p.cost);
      margin();
    };
    amount.oninput = cost.oninput = margin;
    margin();
    const days = el('input', { class: 'wacrm-in', type: 'number', min: '1' });
    days.value = String(d.days || 30);
    const start = el('input', { class: 'wacrm-in', type: 'date' });
    start.value = new Date(d.start || Date.now()).toISOString().slice(0, 10);
    const note = el('textarea', { class: 'wacrm-in', placeholder: 'Note (optional)' });
    note.value = d.note || '';

    let toBooks = !existing;
    const hint = el('p', { class: 'wacrm-sub' });
    // Derive the note from dealSchedule itself, so what it promises is exactly what will be
    // sent — a hardcoded "3 days before expiry" lies on plans shorter than the lead time.
    const restate = () => {
      const dv = Math.max(1, Number(days.value) || 1);
      const st = new Date(start.value || Date.now()).getTime();
      const p = dealSchedule({ start: st, expires: st + dv * DEAL_DAY }, cfg);
      hint.textContent = `Expires ${dealDate(p.expires)}`
        + (p.fbAt ? ` · feedback check-in ${dealDate(p.fbAt)}` : ' · too short for a feedback check-in')
        + ` · renewal reminder ${dealDate(p.rnAt)}`;
    };
    days.oninput = start.onchange = restate; restate();

    const save = async () => {
      if (!item.value.trim()) return toast('Enter what they bought', true);
      const dv = Math.max(1, Number(days.value) || 1);
      const st = new Date(start.value || Date.now()).getTime();
      const ds = await store.get('wa_deals', []);
      if (existing) {
        const D = ds.find((x) => x.id === existing.id);
        if (D) {
          Object.assign(D, {
            item: item.value.trim(), amount: Number(amount.value) || 0,
            cost: Number(cost.value) || 0,
            days: dv, start: st, expires: st + dv * DEAL_DAY, note: note.value.trim(),
          });
          dealSchedule(D, cfg);
        }
      } else {
        const nd = dealSchedule({
          id: Date.now(), number, name: name || '', item: item.value.trim(),
          amount: Number(amount.value) || 0, cost: Number(cost.value) || 0,
          days: dv, start: st, expires: st + dv * DEAL_DAY,
          note: note.value.trim(), fbSent: false, rnSent: false, status: 'active',
        }, cfg);
        ds.unshift(nd);
        if (toBooks && nd.amount > 0) {
          const bk = await store.get('wa_books', []);
          bk.unshift({ id: Date.now() + 1, date: new Date(st).toISOString().slice(0, 10), kind: 'sale',
            party: name || number, item: nd.item, category: '', qty: 1,
            amount: nd.amount, cost: nd.cost || 0, method: 'Cash', note: 'From deal' });
          await store.set('wa_books', bk);
        }
      }
      await store.set('wa_deals', ds);
      closeModal();
      if (current === 'deals') openFeature('deals', { keepOpen: true });
      toast(existing ? 'Deal updated' : 'Deal saved');
    };

    modal(existing ? 'Edit deal' : 'Deal done', `${name || number} · ${number}`,
      el('div', {},
        existing ? null : el('div', {}, el('label', {}, 'Fill from a saved product'), pick),
        el('div', {}, el('label', {}, 'Item / plan'), item),
        el('div', { class: 'wacrm-row' },
          el('div', { style: { flex: '1' } }, el('label', {}, 'Selling rate ₹'), amount),
          el('div', { style: { flex: '1' } }, el('label', {}, 'Purchase rate ₹'), cost)),
        marginNote,
        el('div', {}, el('label', {}, 'Validity (days)'), days),
        el('div', {}, el('label', {}, 'Purchased on'), start),
        hint,
        el('div', {}, el('label', {}, 'Note'), note),
        existing ? null : pickRow('Also record as a sale', 'Adds it to Sales & Expenses so it counts in your profit', true, (v) => { toBooks = v; })),
      [el('button', { class: 'wacrm-btn', onclick: closeModal }, 'Cancel'),
       el('button', { class: 'wacrm-btn primary', onclick: save }, existing ? 'Save changes' : 'Save deal')]);
  }

  // ---- Dashboard ----
  async function viewDeals() {
    const wrap = el('div', { class: 'wacrm-pad' });
    let filter = 'active';

    const draw = async () => {
      const cfg = await dealCfg();
      const ds = await store.get('wa_deals', []);
      const now = Date.now();
      const active = ds.filter((d) => d.status === 'active' && d.expires > now);
      const expired = ds.filter((d) => d.status === 'active' && d.expires <= now);
      const soon = active.filter((d) => d.expires - now <= 7 * DEAL_DAY);
      const revenue = ds.reduce((s, d) => s + (Number(d.amount) || 0), 0);
      const profit = ds.reduce((s, d) => s + ((Number(d.amount) || 0) - (Number(d.cost) || 0)), 0);

      const tile = (label, value, cls, hint) => el('div', { class: 'wacrm-kpi ' + (cls || '') },
        el('span', { class: 'k-lab' }, label), el('b', {}, value),
        hint ? el('span', { class: 'k-hint' }, hint) : null);

      const shown = filter === 'active' ? active : filter === 'soon' ? soon : filter === 'expired' ? expired : ds;

      wrap.replaceChildren(
        el('div', { class: 'wacrm-kpis four' },
          tile('Active deals', String(active.length), 'good', 'Running right now'),
          tile('Expiring in 7 days', String(soon.length), soon.length ? 'warn' : '', soon.length ? 'Reach out before they lapse' : 'Nothing due'),
          tile('Expired', String(expired.length), expired.length ? 'bad' : '', 'Awaiting renewal'),
          tile('Total value', '₹' + revenue.toLocaleString('en-IN'), '',
            profit !== revenue ? `₹${profit.toLocaleString('en-IN')} profit` : 'All deals recorded')),

        el('div', { class: 'wacrm-row' },
          ...[['active', `Active (${active.length})`], ['soon', `Expiring (${soon.length})`],
              ['expired', `Expired (${expired.length})`], ['all', `All (${ds.length})`]]
            .map(([k, lab]) => el('button', {
              class: 'wacrm-btn small' + (filter === k ? ' primary' : ''),
              onclick: () => { filter = k; draw(); },
            }, lab)),
          el('button', { class: 'wacrm-btn small', onclick: () => exportDeals(ds) }, 'Export CSV')),

        shown.length
          ? el('div', { class: 'wacrm-deals' },
              ...shown.slice().sort((a, b) => a.expires - b.expires).map((d) => dealCard(d, cfg, draw)))
          : el('p', { class: 'wacrm-empty' }, ds.length
              ? 'No deals in this view.'
              : 'No deals yet — open a chat, tap the WA widget above the message box, and choose “Deal done”.'),

        dealSettings(cfg, draw));
    };

    bodyEl.append(wrap);
    await draw();
  }

  // A margin chip. Selling below cost is a real case — swapped rate fields, or a genuine
  // loss-leader — and it must not read as a gain: "+₹-100" in green is worse than useless.
  function marginChip(sell, cost, title) {
    const p = (Number(sell) || 0) - (Number(cost) || 0);
    return el('span', { class: 'wacrm-rate ' + (p < 0 ? 'loss' : 'margin'),
      title: p < 0 ? 'Selling below cost' : title },
      (p < 0 ? '−₹' : '+₹') + Math.abs(p).toLocaleString('en-IN'));
  }

  function dealCard(d, cfg, redraw) {
    const left = Math.ceil((d.expires - Date.now()) / DEAL_DAY);
    const tone = left < 0 ? 'gone' : left <= 7 ? 'soon' : 'ok';
    const state = left < 0 ? `Expired ${Math.abs(left)}d ago` : left === 0 ? 'Expires today' : `${left} days left`;

    const mark = async (field) => {
      const ds = await store.get('wa_deals', []);
      const D = ds.find((x) => x.id === d.id);
      if (D) { D[field] = true; await store.set('wa_deals', ds); }
    };

    return el('div', { class: 'wacrm-deal' },
      el('div', { class: 'd-top' },
        el('b', {}, d.item || '(no item)'),
        d.amount ? el('span', { class: 'd-amt' }, '₹' + Number(d.amount).toLocaleString('en-IN')) : null,
        Number(d.cost) > 0 ? marginChip(d.amount, d.cost, 'Profit on this sale') : null,
        el('span', { class: 'd-when ' + tone }, state)),
      el('div', { class: 'd-sub' }, `${d.name || d.number} · ${d.number}`),
      el('div', { class: 'd-sub' }, `${dealDate(d.start)} → ${dealDate(d.expires)}`),
      el('div', { class: 'd-sub' },
        `Feedback ${d.fbSent ? 'sent' : d.fbAt ? 'due ' + dealDate(d.fbAt) : 'not scheduled — plan too short'}`
        + ` · Renewal ${d.rnSent ? 'sent' : 'due ' + dealDate(d.rnAt)}`),
      d.note ? el('div', { class: 'd-sub' }, d.note) : null,
      el('div', { class: 'wacrm-row' },
        el('button', { class: 'wacrm-btn small', onclick: async () => {
          if (!cfg.feedbackUrl) toast('Tip: add a feedback link in Follow-up settings');
          const ok = await sendDealMsg(d, 'feedback', cfg);
          if (!ok) return toast('Could not send — is WhatsApp linked?', true);
          await mark('fbSent'); redraw(); toast('Feedback message sent');
        } }, 'Send feedback now'),
        el('button', { class: 'wacrm-btn small', onclick: async () => {
          const ok = await sendDealMsg(d, 'renew', cfg);
          if (!ok) return toast('Could not send — is WhatsApp linked?', true);
          await mark('rnSent'); redraw(); toast('Renewal reminder sent');
        } }, 'Send renewal now'),
        el('button', { class: 'wacrm-btn small', onclick: async () => {
          // Roll the same plan forward from today and re-arm both messages.
          const ds = await store.get('wa_deals', []);
          const D = ds.find((x) => x.id === d.id);
          if (D) { D.start = Date.now(); D.expires = D.start + D.days * DEAL_DAY; D.fbSent = false; D.rnSent = false; dealSchedule(D, cfg); await store.set('wa_deals', ds); }
          redraw(); toast('Rolled forward — validity restarts today');
        } }, 'Renewed'),
        el('button', { class: 'wacrm-btn small', onclick: () => dealModal(null, d) }, 'Edit'),
        el('button', { class: 'wacrm-btn small danger', onclick: async () => {
          await store.set('wa_deals', (await store.get('wa_deals', [])).filter((x) => x.id !== d.id));
          redraw();
        } }, 'Delete')));
  }

  function dealSettings(cfg, redraw) {
    const link = el('input', { class: 'wacrm-in', placeholder: 'https://… your feedback form' });
    link.value = cfg.feedbackUrl;
    const fbDays = el('input', { class: 'wacrm-in', type: 'number', min: '1' });
    fbDays.value = String(cfg.fbDays);
    const rnLead = el('input', { class: 'wacrm-in', type: 'number', min: '0' });
    rnLead.value = String(cfg.rnLead);
    const fbTpl = el('textarea', { class: 'wacrm-in' }); fbTpl.value = cfg.fbTpl;
    const rnTpl = el('textarea', { class: 'wacrm-in' }); rnTpl.value = cfg.rnTpl;
    let autoF = cfg.autoFeedback, autoR = cfg.autoRenew;

    const save = async () => {
      await store.set('wa_deal_cfg', {
        feedbackUrl: link.value.trim(),
        fbDays: Math.max(1, Number(fbDays.value) || 7),
        rnLead: Math.max(0, Number(rnLead.value) || 0),
        fbTpl: fbTpl.value, rnTpl: rnTpl.value,
        autoFeedback: autoF, autoRenew: autoR,
      });
      // Re-arm every deal that has not been messaged yet against the new timings.
      const c = await dealCfg();
      const ds = await store.get('wa_deals', []);
      ds.forEach((d) => { if (!d.fbSent || !d.rnSent) dealSchedule(d, c); });
      await store.set('wa_deals', ds);
      toast('Deal settings saved');
      redraw();
    };

    return el('details', { class: 'wacrm-fold' },
      el('summary', {}, 'Follow-up settings'),
      el('div', { class: 'wacrm-fold-body' },
        el('p', { class: 'wacrm-sub' }, 'Placeholders: {name} {item} {days} {expiry} {amount} {link}'),
        el('div', {}, el('label', {}, 'Feedback link — fills {link}'), link),
        el('div', { class: 'wacrm-row' },
          el('div', { style: { flex: '1' } }, el('label', {}, 'Feedback after (days)'), fbDays),
          el('div', { style: { flex: '1' } }, el('label', {}, 'Renewal reminder (days before)'), rnLead)),
        el('div', {}, el('label', {}, 'Feedback message'), fbTpl),
        el('div', {}, el('label', {}, 'Renewal message'), rnTpl),
        pickRow('Send the feedback check-in automatically', 'On the day it falls due', cfg.autoFeedback, (v) => { autoF = v; }),
        pickRow('Send the renewal reminder automatically', 'Before the validity runs out', cfg.autoRenew, (v) => { autoR = v; }),
        el('button', { class: 'wacrm-btn primary', onclick: save }, 'Save settings')));
  }

  function exportDeals(ds) {
    if (!ds.length) return toast('No deals to export', true);
    csv('wa-crm-deals.csv', ds.map((d) => ({
      name: d.name || '', number: d.number, item: d.item || '', amount: d.amount || 0,
      cost: d.cost || 0, profit: (Number(d.amount) || 0) - (Number(d.cost) || 0),
      validity_days: d.days, purchased: new Date(d.start).toISOString().slice(0, 10),
      expires: new Date(d.expires).toISOString().slice(0, 10),
      days_left: Math.ceil((d.expires - Date.now()) / DEAL_DAY),
      feedback_sent: d.fbSent ? 'yes' : 'no', renewal_sent: d.rnSent ? 'yes' : 'no',
      status: d.expires <= Date.now() ? 'expired' : d.status, note: d.note || '',
    })), ['name', 'number', 'item', 'amount', 'cost', 'profit', 'validity_days', 'purchased', 'expires',
          'days_left', 'feedback_sent', 'renewal_sent', 'status', 'note']);
  }


  // ---------- In-chat quick actions ----------
  // A small floating column of buttons over the conversation, so the common jobs are one
  // click away without opening the side panel at all.
  const QUICK = [
    ['deal', 'Deal done', 'M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01'],
    ['note', 'Chat note', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 15h6M9 11h6'],
    ['lead', 'Save as lead', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6'],
    ['offer', 'Send an offer', 'M20 7H4V5h16zM4 9h16l-1.2 10.2A2 2 0 0 1 16.8 21H7.2a2 2 0 0 1-2-1.8z'],
    ['later', 'Schedule to this chat', 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'],
    ['remind', 'Remind me about this', 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0'],
    ['invoice', 'Send an invoice', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5'],
  ];

  function mountQuickBar() {
    if ($('#wacrm-quick')) return;
    // Six loose buttons floating over the chat is clutter. Collapse them into one widget
    // that opens on demand and folds back to a single icon.
    const actions = el('div', { class: 'wacrm-q-actions' },
      QUICK.map(([id, tip, d]) => el('button', {
        class: 'wacrm-q', type: 'button', 'data-tip': tip, 'aria-label': tip,
        onclick: () => { quickAction(id); setQuickOpen(false); },
      }, icon(d), el('span', { class: 'wacrm-q-lbl' }, tip))));

    const handle = el('button', {
      class: 'wacrm-q-handle', type: 'button',
      'aria-label': 'WA-CRM chat actions', 'aria-expanded': 'false',
      onclick: () => setQuickOpen(!bar.classList.contains('open')),
    }, el('span', { class: 'wacrm-q-mark' }, 'WA'),
       icon('M18 6 6 18M6 6l12 12'));

    const bar = el('div', { id: 'wacrm-quick', 'aria-label': 'Chat actions' }, actions, handle);
    document.body.append(bar);
    bindTips(bar);
    placeQuickBar();
    window.addEventListener('resize', placeQuickBar);
    setInterval(placeQuickBar, 1200);
    onWaMenu(placeQuickBar);
  }

  function setQuickOpen(open) {
    const bar = $('#wacrm-quick');
    if (!bar) return;
    bar.classList.toggle('open', !!open);
    bar.querySelector('.wacrm-q-handle')?.setAttribute('aria-expanded', String(!!open));
    placeQuickBar();
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setQuickOpen(false); });
  document.addEventListener('click', (e) => {
    const bar = $('#wacrm-quick');
    if (bar && bar.classList.contains('open') && !bar.contains(e.target)) setQuickOpen(false);
  }, true);

  // Anchor the column just above the message box, inside the conversation.
  //
  // The previous version looked for "#main", which does not exist on WhatsApp Business
  // Web — so positioning never ran and the column fell back to the top-left corner. The
  // message box is the one thing guaranteed to be present whenever a chat is open, so
  // find that and work outwards from it.
  function findComposer() {
    // The typing box: a contenteditable inside the conversation footer.
    const boxes = [...document.querySelectorAll('div[contenteditable="true"]')];
    // The rightmost one is the message box (the leftmost is the chat-search field).
    let best = null;
    for (const b of boxes) {
      const r = b.getBoundingClientRect();
      if (r.width < 120 || r.height === 0) continue;
      if (!best || r.left > best.rect.left) best = { node: b, rect: r };
    }
    return best;
  }

  function conversationBox() {
    const composer = findComposer();
    if (!composer) return null;
    // Walk up to the footer / conversation column so we get its true left edge.
    let n = composer.node;
    for (let i = 0; i < 8 && n && n.parentElement; i++) {
      n = n.parentElement;
      const r = n.getBoundingClientRect();
      if (r.width > composer.rect.width + 60) break;
    }
    const outer = n ? n.getBoundingClientRect() : composer.rect;
    return { left: outer.left, right: outer.right, top: composer.rect.top, width: outer.width };
  }

  // WhatsApp's own menus — attach, emoji, context — open over the bottom of the
  // conversation, which is exactly where our widget and quick-reply strip live. Ours are
  // on a higher layer, so they swallow the clicks and the menu items look dead. Report
  // whether one of those surfaces actually covers the given box, so we can stand down.
  function waMenuOver(box) {
    const sel = '[role="menu"],[role="dialog"],[role="listbox"],'
      + '[data-animate-dropdown-in="true"],[data-animate-modal-body="true"]';
    for (const n of document.querySelectorAll(sel)) {
      if (n.id && n.id.startsWith('wacrm-')) continue;
      if (n.closest('#wacrm-quick,#wacrm-qr,#wacrm-panel,#wacrm-modal')) continue;
      const r = n.getBoundingClientRect();
      if (r.width < 60 || r.height < 60) continue;
      // Something spanning the viewport is the app shell, not a popup.
      if (r.width > innerWidth * 0.9 && r.height > innerHeight * 0.9) continue;
      if (r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top) return true;
    }
    return false;
  }

  // Our strip and widget are position:fixed over the bottom of the conversation, so they
  // cover the newest messages — the one place the user is actually reading. Padding the
  // message scroller reserves that space instead, so WhatsApp scrolls its own content
  // clear of us. Each caller registers its own height and the total is applied once.
  const _pads = {};
  let _scroller = null;
  // Cached: this runs on every DOM mutation, and #main holds thousands of divs once a
  // conversation is loaded. Re-scanning each time made WhatsApp itself sluggish.
  function waScroller() {
    try {
      if (_scroller && _scroller.isConnected && _scroller.clientHeight > 200) return _scroller;
      const main = document.querySelector('#main');
      if (!main) return (_scroller = null);
      for (const n of main.querySelectorAll('div')) {
        if (n.clientHeight < 200) continue;
        const oy = getComputedStyle(n).overflowY;
        if (oy === 'auto' || oy === 'scroll') return (_scroller = n);
      }
    } catch (e) { /* fall through — reserving space is an enhancement, never a hard need */ }
    return (_scroller = null);
  }
  function waReserve(key, px) {
    _pads[key] = px > 0 ? px : 0;
    const total = Object.values(_pads).reduce((a, b) => a + b, 0);
    const s = waScroller();
    if (!s) return;
    try {
      // Re-apply after a re-render: the fresh node has no marker even though total is same.
      if (s.dataset.wacrmPad === String(total)) return;
      s.style.paddingBottom = total + 'px';
      s.dataset.wacrmPad = String(total);
      // Deliberately NOT scrolling the list to follow the padding. Writing scrollTop fires a
      // scroll event on WhatsApp's message pane, and WhatsApp dismisses an open popup on
      // scroll — so pressing the attach button opened the menu and closed it again a frame
      // later. Losing a few pixels of scroll position is worth a working attach button.
    } catch (e) {}
  }

  // A 1.2s poll leaves a menu blocked for up to a second, which reads as "the button does
  // nothing". React to the DOM change instead.
  const _menuCbs = [];
  let _menuT = 0;
  function onWaMenu(fn) {
    _menuCbs.push(fn);
    if (_menuCbs.length > 1) return;
    const fire = () => {
      clearTimeout(_menuT);
      _menuT = setTimeout(() => _menuCbs.forEach((f) => { try { f(); } catch (e) {} }), 40);
    };
    new MutationObserver(fire).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', fire, true);
    document.addEventListener('keydown', fire, true);
  }

  function placeQuickBar() {
    const bar = $('#wacrm-quick');
    if (!bar) return;
    const box = conversationBox();
    // Hide only. Releasing the reserved space here would resize WhatsApp's message pane the
    // instant a menu opened, and that churn is what made the attach menu flicker shut.
    const hide = () => { bar.style.display = 'none'; };
    // No chat open -> nothing to attach to, so stay hidden rather than float in a corner.
    if (!box || box.width < 320) { hide(); return; }
    const h = bar.offsetHeight || QUICK.length * 48;
    // The quick-reply strip owns the space directly above the composer and we sit on a
    // higher layer, so without this the handle covered the first chips and ate their
    // clicks. Stack above the strip whenever it is showing.
    const qr = $('#wacrm-qr');
    const qrRect = qr && qr.style.display !== 'none' ? qr.getBoundingClientRect() : null;
    const anchor = qrRect && qrRect.height ? qrRect.top - 8 : box.top;
    const left = Math.round(box.left + 12);
    const top = Math.round(Math.max(70, anchor - h - 16));
    // Collapsed, the action column is still laid out (opacity 0, no pointer events), so
    // the widget's own box is ~300px of mostly nothing. Test the handle instead, or a tall
    // menu overlapping only the invisible part would hide the widget for no reason.
    const hit = bar.querySelector('.wacrm-q-handle');
    const hh = (hit && hit.offsetHeight) || 42;
    const hw = (hit && hit.offsetWidth) || 42;
    const open = bar.classList.contains('open');
    const hitbox = open
      ? { left, top, right: left + (bar.offsetWidth || 220), bottom: top + h }
      : { left, top: top + h - hh, right: left + hw, bottom: top + h };
    if (waMenuOver(hitbox)) { hide(); return; }
    bar.style.display = 'flex';
    bar.style.left = left + 'px';
    bar.style.top = top + 'px';
    // Only the handle is ever visible when closed, so that is all we reserve.
    waReserve('w', hh + 10);
  }

  async function quickAction(id) {
    const c = (await wa('activeChat')).data;
    if (!c) return toast('Open a chat first', true);

    if (id === 'lead') {
      const leads = await store.get('wa_leads', []);
      if (leads.some((x) => x.number === c.number)) return toast('Already saved as a lead');
      const lead = { number: c.number, name: c.name, type: 'New', status: 'New', ts: Date.now(), statusAt: Date.now(), sent: {} };
      leads.unshift(lead);
      await store.set('wa_leads', leads);
      drawStages(); fireWebhook('lead.created', lead);
      return toast('Saved as lead: ' + (c.name || c.number));
    }
    if (id === 'offer') { openFeature('catalog'); return; }
    if (id === 'deal') return dealModal(c);
    if (id === 'invoice') return invoiceModal(c);

    if (id === 'note') {
      const notes = await store.get('wa_notes', {});
      const ta = el('textarea', { class: 'wacrm-in', style: { minHeight: '150px' } });
      ta.value = notes[c.number] || '';
      return modal(`Note — ${c.name || c.number}`, 'Private to you. Never sent to the customer.',
        ta,
        [el('button', { class: 'wacrm-btn', onclick: closeModal }, 'Cancel'),
         el('button', { class: 'wacrm-btn primary', onclick: async () => {
           notes[c.number] = ta.value;
           await store.set('wa_notes', notes); closeModal(); toast('Note saved');
         } }, 'Save note')]);
    }

    if (id === 'later') {
      const txt = el('textarea', { class: 'wacrm-in', placeholder: 'Message to send later' });
      const when = whenField('');
      return modal(`Schedule to ${c.name || c.number}`, 'Sends while this WhatsApp tab is open.',
        el('div', {}, el('label', {}, 'Message'), txt, when.node),
        [el('button', { class: 'wacrm-btn', onclick: closeModal }, 'Cancel'),
         el('button', { class: 'wacrm-btn primary', onclick: async () => {
           if (!txt.value.trim()) return toast('Write the message', true);
           if (when.value < Date.now()) return toast('Pick a time in the future', true);
           const jobs = await store.get('wa_scheduled', []);
           jobs.push({ id: Date.now(), to: c.number, text: txt.value, at: when.value });
           await store.set('wa_scheduled', jobs); closeModal(); toast('Scheduled');
         } }, 'Schedule')]);
    }

    if (id === 'remind') {
      const note = el('textarea', { class: 'wacrm-in', placeholder: `Follow up with ${c.name || c.number}` });
      const when = whenField('');
      return modal('Remind me', 'An alarm for you — the customer is not messaged.',
        el('div', {}, el('label', {}, 'Note'), note, when.node),
        [el('button', { class: 'wacrm-btn', onclick: closeModal }, 'Cancel'),
         el('button', { class: 'wacrm-btn primary', onclick: async () => {
           if (!note.value.trim()) return toast('Write the note', true);
           if (when.value < Date.now()) return toast('Pick a time in the future', true);
           const rems = await store.get('wa_reminders', []);
           rems.push({ id: Date.now(), note: note.value, at: when.value });
           await store.set('wa_reminders', rems); closeModal(); toast('Reminder set');
         } }, 'Set reminder')]);
    }
  }

  // ---------- Start a conversation (unsaved number) ----------
  async function viewStart() {
    const num = el('input', { class: 'wacrm-in', placeholder: '919876543210' });
    const txt = el('textarea', { class: 'wacrm-in', placeholder: 'Optional first message' });
    const out = el('div', { class: 'wacrm-msg' });

    bodyEl.append(el('div', { class: 'wacrm-pad' },
      el('div', { class: 'wacrm-note' }, 'Message a number without saving it to your phone first. Include the country code, no + sign.'),
      el('label', {}, 'Number'), num,
      el('label', {}, 'First message'), txt,
      el('div', { class: 'wacrm-row' },
        el('button', { class: 'wacrm-btn primary', onclick: async () => {
          const n = num.value.replace(/\D/g, '');
          if (n.length < 7) return toast('Enter a valid number', true);
          if (!txt.value.trim()) return toast('Write the message', true);
          const r = await wa('sendText', { to: n, text: txt.value });
          out.className = 'wacrm-msg' + (r.ok ? '' : ' bad');
          out.textContent = r.ok ? 'Sent — the chat is now open in WhatsApp.' : 'Failed: ' + (r.err || '');
        } }, 'Send now'),
        el('button', { class: 'wacrm-btn', onclick: () => {
          const n = num.value.replace(/\D/g, '');
          if (n.length < 7) return toast('Enter a valid number', true);
          const link = `https://wa.me/${n}${txt.value.trim() ? '?text=' + encodeURIComponent(txt.value) : ''}`;
          navigator.clipboard.writeText(link).then(() => toast('Link copied'), () => toast('Copy failed', true));
        } }, 'Copy wa.me link')),
      out));
  }

  // ---------- Links ----------
  async function viewLinks() {
    const links = await store.get('wa_links', []);
    const list = el('div', { class: 'wacrm-list' });
    const label = el('input', { class: 'wacrm-in', placeholder: 'Enquiry link' });
    const num = el('input', { class: 'wacrm-in', placeholder: 'Your number, e.g. 919876543210' });
    const pre = el('textarea', { class: 'wacrm-in', placeholder: 'Hi, I saw your offer and want details' });

    const draw = () => {
      list.replaceChildren();
      if (!links.length) list.append(el('div', { class: 'wacrm-empty' },
        el('b', {}, 'No links yet'), 'Make one and put it in your bio, ads or website.'));
      links.forEach((L, i) => list.append(el('div', { class: 'wacrm-card' },
        el('div', { class: 'wacrm-grow' },
          el('b', {}, L.label),
          el('div', { class: 'wacrm-dim', style: { wordBreak: 'break-all' } }, L.url)),
        el('div', { class: 'wacrm-col' },
          el('button', { class: 'wacrm-btn small', onclick: () => {
            navigator.clipboard.writeText(L.url).then(() => toast('Copied'), () => toast('Copy failed', true));
          } }, 'Copy'),
          el('button', { class: 'wacrm-btn small danger', onclick: async () => {
            links.splice(i, 1); await store.set('wa_links', links); draw();
          } }, 'Delete')))));
    };

    bodyEl.append(el('div', { class: 'wacrm-pad' },
      el('div', { class: 'wacrm-note' }, 'A click-to-chat link opens WhatsApp with your number and a message already typed. Share it anywhere — no one has to save your number.'),
      el('label', {}, 'Label'), label,
      el('label', {}, 'Your WhatsApp number'), num,
      el('label', {}, 'Pre-filled message'), pre,
      el('button', { class: 'wacrm-btn primary', onclick: async () => {
        const n = num.value.replace(/\D/g, '');
        if (!label.value.trim()) return toast('Give it a label', true);
        if (n.length < 7) return toast('Enter your number with country code', true);
        const url = `https://wa.me/${n}${pre.value.trim() ? '?text=' + encodeURIComponent(pre.value) : ''}`;
        links.unshift({ id: Date.now(), label: label.value.trim(), url });
        await store.set('wa_links', links); draw(); toast('Link created');
        label.value = ''; pre.value = '';
      } }, 'Create link'),
      list));
    draw();
  }

  // ---------- Refer & Earn ----------
  async function viewRefer() {
    const info = (await bg('serverInfo')).data || {};
    const code = (await store.get('wa_key', '') || info.device || '').slice(-8).toUpperCase();
    const link = `https://wa-crm.in/?ref=${encodeURIComponent(code)}`;
    bodyEl.append(el('div', { class: 'wacrm-pad' },
      el('div', { class: 'wacrm-note' }, 'Share WA-CRM and earn on every licence bought through your link. Payouts and reseller pricing are managed on the website.'),
      el('label', {}, 'Your referral link'),
      el('div', { class: 'wacrm-log', style: { maxHeight: 'none' } }, link),
      el('div', { class: 'wacrm-row', style: { marginTop: '12px' } },
        el('button', { class: 'wacrm-btn primary', onclick: () => {
          navigator.clipboard.writeText(link).then(() => toast('Referral link copied'), () => toast('Copy failed', true));
        } }, 'Copy link'),
        el('a', { class: 'wacrm-btn', href: 'https://wa-crm.in/#resellers', target: '_blank', rel: 'noopener' }, 'Reseller panel')),
      el('div', { class: 'wacrm-note warn', style: { marginTop: '14px' } },
        'The referral code is generated from this installation. Confirm your payout terms on the website before promoting it.')));
  }

  // ---------- Invoice as a popup ----------
  async function invoiceModal(chat) {
    const biz = await store.get('wa_business', { name: '', addr: '', gstin: '' });
    const items = [];
    const rows = el('div', {});
    const total = el('span', { class: 'wacrm-slider-val', style: { fontSize: '15px' } }, '0');
    const cName = el('input', { class: 'wacrm-in', placeholder: 'Customer name', value: chat.name || '' });

    const recalc = () => { total.textContent = String(items.reduce((s, i) => s + i.qty * i.rate, 0)); };
    const addRow = () => {
      const it = { desc: '', qty: 1, rate: 0 };
      items.push(it);
      const d = el('input', { class: 'wacrm-in wacrm-grow', placeholder: 'Item' });
      const q = el('input', { class: 'wacrm-in small', type: 'number', value: '1' });
      const r = el('input', { class: 'wacrm-in small', type: 'number', value: '0' });
      d.addEventListener('input', () => { it.desc = d.value; });
      q.addEventListener('input', () => { it.qty = +q.value || 0; recalc(); });
      r.addEventListener('input', () => { it.rate = +r.value || 0; recalc(); });
      rows.append(el('div', { class: 'wacrm-row' }, d, q, r));
    };
    // Turn chosen catalog products into invoice lines, prefilled.
    const addFromCatalog = (picked) => {
      for (const p of picked) {
        addRow();
        const row = rows.lastElementChild;
        const [d, q, r] = row.querySelectorAll('input');
        const it = items[items.length - 1];
        d.value = p.title || ''; it.desc = d.value;
        q.value = '1'; it.qty = 1;
        r.value = String(p.price || 0); it.rate = p.price || 0;
      }
      recalc();
      toast(`${picked.length} product(s) added`);
    };
    addRow(); addRow();

    modal(`Invoice — ${chat.name || chat.number}`,
      biz.name ? `Billed from ${biz.name}` : 'Set your business details in the Invoice tab first.',
      el('div', {},
        el('label', {}, 'Customer'), cName,
        el('label', {}, 'Items — description, qty, rate'), rows,
        el('div', { class: 'wacrm-row' },
          el('button', { class: 'wacrm-btn small', onclick: addRow }, '+ Add line'),
          el('button', { class: 'wacrm-btn small primary', onclick: () => pickFromCatalog(addFromCatalog) }, 'Add from Catalog'),
          el('div', { class: 'wacrm-grow' }),
          el('span', { class: 'wacrm-dim' }, 'Total'), total)),
      [el('button', { class: 'wacrm-btn', onclick: closeModal }, 'Cancel'),
       el('button', { class: 'wacrm-btn primary', onclick: async () => {
         const use = items.filter((i) => i.desc);
         if (!use.length) return toast('Add at least one item', true);
         const no = 'INV-' + String(Date.now()).slice(-6);
         const text = [
           `*${biz.name || 'Invoice'}*`, biz.addr, biz.gstin ? 'GSTIN: ' + biz.gstin : '', '',
           `Invoice ${no}`, `Bill to: ${cName.value || chat.name || chat.number}`, '',
           ...use.map((i) => `${i.desc} — ${i.qty} x ${i.rate} = ${i.qty * i.rate}`), '',
           `*Total: ${use.reduce((s, i) => s + i.qty * i.rate, 0)}*`,
         ].filter(Boolean).join('\n');
         const r = await wa('sendText', { to: chat.number, text });
         closeModal();
         toast(r.ok ? 'Invoice sent' : 'Send failed', !r.ok);
       } }, 'Send invoice')]);
  }

  // ---------- tooltips ----------
  // The rail scrolls, and an overflow container clips any child that sticks out past its
  // 56px width — which is exactly what a tooltip has to do. So the tooltip lives on
  // <body> at a fixed position instead of inside the button.
  let tipEl;
  function bindTips(root) {
    if (!tipEl) { tipEl = el('div', { id: 'wacrm-tip' }); document.body.append(tipEl); }
    const show = (e) => {
      const b = e.currentTarget;
      const text = b.getAttribute('data-tip');
      if (!text) return;
      const r = b.getBoundingClientRect();
      tipEl.textContent = text;
      tipEl.classList.add('show');
      // Put the tip wherever there is actually room, so it never lands on the chat list.
      const toRight = window.innerWidth - r.right > 220;
      tipEl.style.top = Math.round(r.top + r.height / 2) + 'px';
      tipEl.style.left = (toRight ? Math.round(r.right + 10) : Math.round(r.left - 10)) + 'px';
      tipEl.style.transform = toRight ? 'translateY(-50%)' : 'translate(-100%, -50%)';
    };
    const hide = () => tipEl && tipEl.classList.remove('show');
    root.querySelectorAll('[data-tip]').forEach((b) => {
      b.addEventListener('mouseenter', show);
      b.addEventListener('focus', show);
      b.addEventListener('mouseleave', hide);
      b.addEventListener('blur', hide);
      b.addEventListener('click', hide);
    });
  }


  // ---------- Backup & Restore ----------
  // Everything lives in this browser profile, so a new laptop or a fresh Chrome starts
  // empty. This writes one file the user can carry across, and reads it back.
  //
  // Licence and device keys are deliberately NOT exported: a licence is bound to the
  // install it was activated on, so copying it would only produce a confusing failure on
  // the new machine. The user re-enters their key there; the business data comes across.
  const BACKUP_KEYS = [
    'wa_leads', 'wa_catalog', 'wa_notes', 'wa_business', 'wa_links',
    'wa_funnels', 'wa_flows', 'wa_scheduled', 'wa_reminders', 'wa_enabled', 'wa_webhook',
    'wa_books', 'wa_quick', 'wa_deals', 'wa_deal_cfg',
  ];
  const BACKUP_LABEL = {
    wa_leads: 'Leads', wa_catalog: 'Catalog products', wa_notes: 'Chat notes',
    wa_business: 'Business details', wa_links: 'Click-to-chat links',
    wa_funnels: 'Follow-up funnels', wa_flows: 'Chatbot flows',
    wa_scheduled: 'Scheduled messages', wa_reminders: 'Reminders',
    wa_enabled: 'Menu settings', wa_webhook: 'Webhook settings',
    wa_books: 'Sales, purchases & expenses', wa_quick: 'Quick replies',
    wa_deals: 'Deals & renewals', wa_deal_cfg: 'Deal follow-up settings',
  };
  const countOf = (v) => (Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : (v ? 1 : 0)));

  async function readAll() {
    const r = await bg('get', { keys: BACKUP_KEYS });
    return (r && r.data) || {};
  }

  async function viewBackup() {
    const data = await readAll();
    const rows = el('div', { class: 'wacrm-list' },
      BACKUP_KEYS.map((k) => el('div', { class: 'wacrm-card' },
        el('div', { class: 'wacrm-grow' }, el('b', {}, BACKUP_LABEL[k]),
          el('div', { class: 'wacrm-dim' }, countOf(data[k]) + ' item' + (countOf(data[k]) === 1 ? '' : 's'))))));

    const file = el('input', { type: 'file', accept: 'application/json,.json', class: 'wacrm-file' });
    const msg = el('div', { class: 'wacrm-msg' });

    const doExport = async () => {
      const fresh = await readAll();
      const payload = {
        app: 'WA-CRM', kind: 'backup', version: 1,
        exportedAt: new Date().toISOString(),
        data: fresh,
      };
      const json = JSON.stringify(payload, null, 2);
      const stamp = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = el('a', { href: url, download: `wa-crm-backup-${stamp}.json` });
      a.click();
      URL.revokeObjectURL(url);
      const kb = Math.max(1, Math.round(json.length / 1024));
      msg.className = 'wacrm-msg';
      msg.textContent = `Saved wa-crm-backup-${stamp}.json (${kb} KB). Keep it somewhere safe.`;
    };

    const doImport = (mode) => {
      const f = file.files && file.files[0];
      if (!f) { msg.className = 'wacrm-msg bad'; msg.textContent = 'Choose a backup file first.'; return; }
      const fr = new FileReader();
      fr.onload = async () => {
        let payload;
        try { payload = JSON.parse(String(fr.result)); }
        catch (e) { msg.className = 'wacrm-msg bad'; msg.textContent = 'That file is not a WA-CRM backup.'; return; }
        if (!payload || payload.app !== 'WA-CRM' || !payload.data) {
          msg.className = 'wacrm-msg bad'; msg.textContent = 'That file is not a WA-CRM backup.'; return;
        }
        const incoming = payload.data;
        const summary = BACKUP_KEYS.map((k) => `${BACKUP_LABEL[k]}: ${countOf(incoming[k])}`).join('\n');
        const verb = mode === 'replace' ? 'REPLACE everything currently stored' : 'ADD to what is already stored';
        if (!confirm(`This backup contains:\n\n${summary}\n\nThis will ${verb}. Continue?`)) return;

        const current = await readAll();
        const items = {};
        for (const k of BACKUP_KEYS) {
          if (!(k in incoming)) continue;
          if (mode === 'replace') { items[k] = incoming[k]; continue; }
          // Merge: arrays are de-duplicated on the field that identifies the record.
          const cur = current[k];
          if (Array.isArray(cur) && Array.isArray(incoming[k])) {
            const idOf = (x) => String(x.number || x.id || x.title || x.url || JSON.stringify(x));
            const seen = new Set(cur.map(idOf));
            items[k] = cur.concat(incoming[k].filter((x) => !seen.has(idOf(x))));
          } else if (cur && typeof cur === 'object' && incoming[k] && typeof incoming[k] === 'object') {
            items[k] = { ...cur, ...incoming[k] };
          } else {
            items[k] = incoming[k];
          }
        }
        await bg('set', { items });
        msg.className = 'wacrm-msg';
        msg.textContent = 'Restored. Reload WhatsApp Web to see everything.';
        toast('Backup restored');
        await loadEnabled(); drawRail(); drawStages();
      };
      fr.readAsText(f);
    };

    bodyEl.append(el('div', { class: 'wacrm-pad' },
      el('div', { class: 'wacrm-note' }, 'Your leads, products, notes and invoices live in this browser only. Export a backup before changing laptop or browser, then import it on the new one.'),

      el('label', {}, 'What is stored right now'),
      rows,

      el('div', { class: 'wacrm-or' }, 'Back up'),
      el('button', { class: 'wacrm-btn primary', onclick: doExport }, 'Download a backup file'),

      el('div', { class: 'wacrm-or' }, 'Restore'),
      file,
      el('div', { class: 'wacrm-row' },
        el('button', { class: 'wacrm-btn', onclick: () => doImport('merge') }, 'Merge into what I have'),
        el('button', { class: 'wacrm-btn danger', onclick: () => doImport('replace') }, 'Replace everything')),
      msg,

      el('div', { class: 'wacrm-note warn', style: { marginTop: '18px' } },
        'Your licence key is not in the backup — a licence stays with the device it was '
        + 'activated on. Most plans allow only one device, so before switching computers '
        + 'press "Release this device" below. That frees your key on our server; enter it '
        + 'on the new machine and this data will be waiting.'),

      el('div', { class: 'wacrm-row' },
        el('button', { class: 'wacrm-btn danger', onclick: async () => {
          if (!confirm('Release this device?\n\nYour licence is freed so you can use it on '
            + 'another computer. WA-CRM here stops working until you enter a key again.\n\n'
            + 'Your leads, products and invoices stay on this machine — export a backup first '
            + 'if you are moving away.')) return;
          const r = (await bg('deactivate')).data || {};
          if (!r.ok) {
            msg.className = 'wacrm-msg bad';
            msg.textContent = r.err === 'offline'
              ? 'No internet — connect first, otherwise the licence would stay stuck on our server.'
              : 'Could not release: ' + (r.err || 'unknown');
            return;
          }
          msg.className = 'wacrm-msg';
          msg.textContent = r.freed
            ? 'Released. Your key is free to use on another computer.'
            : 'Signed out here. The server had no activation for this device.';
          toast('Device released');
          render();
        } }, 'Release this device'),
        el('span', { class: 'wacrm-dim' }, 'Do this before moving to a new computer'))));
  }

  // ---------- Catalog picker for invoices ----------
  // Bill straight from saved products instead of retyping names and prices.
  async function pickFromCatalog(onPick) {
    const items = await store.get('wa_catalog', []);
    if (!items.length) {
      return modal('No products yet', 'Add products in the Catalog tab, with a price, and they will show up here.',
        el('div', { class: 'wacrm-empty' }, el('b', {}, 'Catalog is empty')),
        [el('button', { class: 'wacrm-btn primary', onclick: () => { closeModal(); openFeature('catalog'); } }, 'Open Catalog')]);
    }
    const chosen = new Map();
    const list = el('div', { class: 'wacrm-list' },
      items.map((it, i) => pickRow(
        it.title || 'Untitled',
        (it.cat ? it.cat + ' · ' : '') + (it.price ? '₹' + it.price : 'no price set'),
        false,
        (on) => { on ? chosen.set(i, it) : chosen.delete(i); },
      )));
    modal('Add from Catalog', 'Tick the products to put on this bill.', list,
      [el('button', { class: 'wacrm-btn', onclick: closeModal }, 'Cancel'),
       el('button', { class: 'wacrm-btn primary', onclick: () => {
         if (!chosen.size) return toast('Pick at least one product', true);
         onPick([...chosen.values()]);
         closeModal();
       } }, 'Add to invoice')]);
  }


  // ---------- Quick Replies ----------
  // A strip of one-tap phrases sitting directly above the message box, plus a manager on
  // the rail. Tapping a chip drops the text into WhatsApp's composer so it can be edited
  // before sending — the same behaviour as the desktop app.
  let qrBar;

  async function mountQuickReplies() {
    if ($('#wacrm-qr')) { placeQuickReplies(); return; }
    qrBar = el('div', { id: 'wacrm-qr', role: 'toolbar', 'aria-label': 'Quick replies' });
    document.body.append(qrBar);
    await drawQuickReplies();
    placeQuickReplies();
    window.addEventListener('resize', placeQuickReplies);
    setInterval(placeQuickReplies, 1200);
    onWaMenu(placeQuickReplies);
  }

  async function drawQuickReplies() {
    if (!qrBar) return;
    const list = await store.get('wa_quick', []);
    qrBar.replaceChildren();
    if (!list.length) {
      qrBar.append(el('button', {
        class: 'wacrm-qr-add', type: 'button', onclick: () => openFeature('quick'),
      }, icon('M12 5v14M5 12h14'), el('span', {}, 'Add a quick reply')));
      return;
    }
    for (const q of list) {
      qrBar.append(el('button', {
        class: 'wacrm-qr-chip', type: 'button', title: q.text,
        onclick: () => insertIntoComposer(q.text),
      }, q.label || (q.text || '').slice(0, 20)));
    }
    qrBar.append(el('button', {
      class: 'wacrm-qr-add', type: 'button', title: 'Manage quick replies',
      onclick: () => openFeature('quick'),
    }, icon('M12 5v14M5 12h14')));
  }

  // Sits flush above the message box, spanning the conversation width.
  function placeQuickReplies() {
    const bar = $('#wacrm-qr');
    if (!bar) return;
    const box = conversationBox();
    // Hide only — see the note in placeQuickBar. The reserved space stays put so nothing
    // reflows underneath an open WhatsApp menu.
    const hide = () => { bar.style.display = 'none'; };
    if (!box || box.width < 320) { hide(); return; }
    const left = Math.round(box.left + 12);
    const width = Math.max(200, Math.round(box.width - 28));
    const h = bar.offsetHeight || 34;
    const top = Math.round(box.top - h - 6);
    // Same collision as the widget: the attach and emoji menus open right here.
    if (waMenuOver({ left, top, right: left + width, bottom: top + h })) { hide(); return; }
    bar.style.display = 'flex';
    bar.style.left = left + 'px';
    bar.style.width = width + 'px';
    bar.style.top = top + 'px';
    waReserve('qr', h + 6);
  }

  // WhatsApp's composer is a contenteditable, and execCommand('insertText') flattens
  // newlines. A synthetic paste preserves them; the line-by-line path is the fallback.
  function insertIntoComposer(text) {
    const box = document.querySelector('#main footer [contenteditable="true"]')
      || document.querySelector('footer [contenteditable="true"]')
      || document.querySelector('#main [contenteditable="true"]');
    if (!box) return toast('Open a chat first', true);
    box.focus();
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', String(text));
      box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      return;
    } catch (e) { /* fall through */ }
    try {
      const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) document.execCommand('insertLineBreak');
        if (lines[i]) document.execCommand('insertText', false, lines[i]);
      }
    } catch (e) { toast('Could not insert the text', true); }
  }

  async function viewQuick() {
    const list = await store.get('wa_quick', []);
    const rows = el('div', { class: 'wacrm-list' });
    const label = el('input', { class: 'wacrm-in', placeholder: 'Price list' });
    const text = el('textarea', { class: 'wacrm-in', placeholder: 'Our plans start at Rs. 399.\nWhich one do you need?' });

    const draw = () => {
      rows.replaceChildren();
      if (!list.length) {
        rows.append(el('div', { class: 'wacrm-empty' },
          el('b', {}, 'No quick replies yet'),
          'Add the phrases you type over and over. They appear above the message box.'));
      }
      list.forEach((q, i) => rows.append(el('div', { class: 'wacrm-card' },
        el('div', { class: 'wacrm-grow' },
          el('b', {}, q.label),
          el('div', { class: 'wacrm-dim' }, (q.text || '').slice(0, 90))),
        el('div', { class: 'wacrm-col' },
          el('button', { class: 'wacrm-btn small', onclick: () => insertIntoComposer(q.text) }, 'Insert'),
          el('button', { class: 'wacrm-btn small danger', onclick: async () => {
            list.splice(i, 1); await store.set('wa_quick', list); draw(); drawQuickReplies();
          } }, 'Delete')))));
    };

    bodyEl.append(el('div', { class: 'wacrm-pad' },
      el('div', { class: 'wacrm-note' },
        'Quick replies appear as buttons just above the message box in every chat. '
        + 'Tap one and the text drops into the box, ready to edit before you send.'),
      el('label', {}, 'Button label'), label,
      el('label', {}, 'Message'), text,
      el('button', { class: 'wacrm-btn primary', onclick: async () => {
        if (!text.value.trim()) return toast('Write the message', true);
        list.push({
          id: Date.now(),
          label: label.value.trim() || text.value.trim().split('\n')[0].slice(0, 20),
          text: text.value,
        });
        await store.set('wa_quick', list);
        label.value = ''; text.value = '';
        draw(); drawQuickReplies(); toast('Quick reply saved');
      } }, 'Save quick reply'),
      rows));
    draw();
  }



  // ---------- Auto Offer Post ----------
  // Matched to the desktop app's screen: offers are written here with their own caption
  // and attached media (not picked from the catalog), posted in rotation to the groups you
  // save, on an interval, inside the hours you set.
  async function viewAutopost() {
    const cfg = await store.get('wa_offers', {
      on: false, offers: [], targets: [], intervalMin: 60,
      startHour: 9, endHour: 22, nextIndex: 0, lastPostTs: 0, logs: [],
    });
    // Older versions stored catalog indexes here; drop anything that is not a real offer.
    if (cfg.offers.some((o) => typeof o !== 'object')) cfg.offers = [];
    const save = () => store.set('wa_offers', cfg);

    const status = el('div', { class: 'wacrm-note' });
    const offerList = el('div', { class: 'wacrm-list' });
    const groupBox = el('div', { class: 'wacrm-list' });
    const groupCount = el('span', { class: 'wacrm-dim' }, `${cfg.targets.length} group(s) selected`);
    const logBox = el('div', { class: 'wacrm-log' });

    const num = (val, min, max) => {
      const n = el('input', { class: 'wacrm-in small', type: 'number', value: String(val) });
      n.min = String(min); n.max = String(max);
      return n;
    };
    const startH = num(cfg.startHour, 0, 23);
    const endH = num(cfg.endHour, 1, 24);
    const everyMin = num(cfg.intervalMin, 5, 1440);

    const paintStatus = () => {
      if (!cfg.on) { status.className = 'wacrm-note'; status.textContent = 'Auto-post is off.'; return; }
      if (!cfg.offers.length || !cfg.targets.length) {
        status.className = 'wacrm-note warn';
        status.textContent = 'Auto-post is on, but you need at least one offer and one group.';
        return;
      }
      const next = cfg.lastPostTs ? new Date(cfg.lastPostTs + cfg.intervalMin * 60000) : new Date();
      status.className = 'wacrm-note';
      status.textContent = `On — ${cfg.offers.length} offer(s) rotating into ${cfg.targets.length} group(s), `
        + `every ${cfg.intervalMin} min between ${cfg.startHour}:00 and ${cfg.endHour}:00. `
        + `Next due ${next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
    };

    const drawOffers = () => {
      offerList.replaceChildren();
      if (!cfg.offers.length) {
        offerList.append(el('div', { class: 'wacrm-empty' },
          el('b', {}, 'No offers yet'), 'Write one below. They are posted one at a time, in turn.'));
        return;
      }
      cfg.offers.forEach((o, i) => offerList.append(el('div', { class: 'wacrm-card' },
        o.data
          ? el('img', { class: 'wacrm-thumb', src: o.data, alt: '' })
          : el('div', { class: 'wacrm-thumb ph' }, String(i + 1)),
        el('div', { class: 'wacrm-grow' },
          el('b', {}, o.title || `Offer ${i + 1}`),
          el('div', { class: 'wacrm-dim' }, (o.text || '').slice(0, 90) || 'No caption')),
        el('button', { class: 'wacrm-btn small danger', onclick: async () => {
          cfg.offers.splice(i, 1);
          if (cfg.nextIndex >= cfg.offers.length) cfg.nextIndex = 0;
          await save(); drawOffers(); paintStatus();
        } }, 'Remove'))));
    };

    const loadGroups = async () => {
      groupBox.replaceChildren(el('div', { class: 'wacrm-loading' }, 'Loading groups…'));
      const r = await wa('groups');
      groupBox.replaceChildren();
      if (!r.ok) return groupBox.append(el('div', { class: 'wacrm-empty' }, 'Could not read groups: ' + (r.err || '')));
      if (!r.data.length) return groupBox.append(el('div', { class: 'wacrm-empty' }, 'No groups found.'));
      for (const g of r.data) {
        groupBox.append(pickRow(g.name || g.jid, '', cfg.targets.includes(g.jid), async (on) => {
          cfg.targets = on ? [...new Set([...cfg.targets, g.jid])] : cfg.targets.filter((x) => x !== g.jid);
          groupCount.textContent = `${cfg.targets.length} group(s) selected`;
          await save(); paintStatus();
        }));
      }
    };

    const drawLog = () => {
      logBox.replaceChildren();
      if (!cfg.logs.length) { line(logBox, 'Nothing posted yet.'); return; }
      cfg.logs.slice(0, 25).forEach((l) => line(logBox,
        `${new Date(l.ts).toLocaleString()}  ${l.text}  →  ${l.ok} sent`
        + `${l.fail ? ', ' + l.fail + ' failed' : ''}${l.manual ? '  (manual)' : ''}`));
    };

    // --- new offer composer ---
    const oTitle = el('input', { class: 'wacrm-in', placeholder: 'Offer name (for your reference)' });
    const oText = el('textarea', { class: 'wacrm-in', placeholder: 'Offer text / caption' });
    const oFile = el('input', { type: 'file', accept: 'image/*,video/*', class: 'wacrm-file' });

    const addOffer = () => {
      if (!oText.value.trim() && !(oFile.files && oFile.files[0])) {
        return toast('Write a caption or attach media', true);
      }
      const store1 = async (data) => {
        cfg.offers.push({
          id: Date.now(),
          title: oTitle.value.trim() || (oText.value.trim().split('\n')[0] || 'Offer').slice(0, 40),
          text: oText.value, data: data || '',
          filename: (oFile.files && oFile.files[0] && oFile.files[0].name) || 'offer',
        });
        await save();
        oTitle.value = ''; oText.value = ''; oFile.value = '';
        drawOffers(); paintStatus(); toast('Offer added');
      };
      const f = oFile.files && oFile.files[0];
      if (!f) return store1('');
      const fr = new FileReader();
      fr.onload = () => store1(String(fr.result));
      fr.onerror = () => toast('Could not read that file', true);
      fr.readAsDataURL(f);
    };

    const commit = async () => {
      cfg.startHour = Math.max(0, Math.min(23, +startH.value || 9));
      cfg.endHour = Math.max(1, Math.min(24, +endH.value || 22));
      cfg.intervalMin = Math.max(5, Math.min(1440, +everyMin.value || 60));
      await save(); paintStatus();
    };
    [startH, endH, everyMin].forEach((n) => n.addEventListener('change', commit));

    bodyEl.append(el('div', { class: 'wacrm-pad' },
      el('div', { class: 'wacrm-note warn' },
        'Posting the same offer to many groups on a timer is exactly what gets numbers '
        + 'reported. Post only where you are a welcome member, and keep the interval '
        + 'generous. This runs only while this WhatsApp tab is open.'),

      toggle('Enable auto-post', 'Rotates through your offers, one per interval.',
        !!cfg.on, async (v) => { cfg.on = v; await save(); paintStatus(); toast(v ? 'Auto-post on' : 'Auto-post off'); }),

      el('div', { class: 'wacrm-row' },
        el('div', { class: 'wacrm-col' }, el('label', {}, 'Start hour (0-23)'), startH),
        el('div', { class: 'wacrm-col' }, el('label', {}, 'End hour (1-24)'), endH),
        el('div', { class: 'wacrm-col' }, el('label', {}, 'Every N minutes'), everyMin)),

      status,

      el('label', {}, 'Target groups'),
      el('div', { class: 'wacrm-row' },
        el('button', { class: 'wacrm-btn', onclick: loadGroups }, 'Load groups'),
        el('button', { class: 'wacrm-btn small', onclick: () => {
          const rows = groupBox.querySelectorAll('.wacrm-pick');
          const turnOn = [...rows].some((r) => !r.classList.contains('on'));
          rows.forEach((r) => { if (r.classList.contains('on') !== turnOn) r.click(); });
        } }, 'Select all'),
        groupCount),
      groupBox,

      el('label', {}, 'Offers (posted in rotation)'),
      offerList,
      oTitle, oText, oFile,
      el('div', { class: 'wacrm-row' },
        el('button', { class: 'wacrm-btn', onclick: addOffer }, '+ Add offer'),
        el('button', { class: 'wacrm-btn small', onclick: () => pickFromCatalog((picked) => {
          for (const p of picked) {
            cfg.offers.push({ id: Date.now() + Math.floor(p.price || 0), title: p.title || 'Offer', text: p.text || '', data: p.img || '', filename: 'offer' });
          }
          save(); drawOffers(); paintStatus(); toast(`${picked.length} added from catalog`);
        }) }, 'Add from Catalog')),

      el('div', { class: 'wacrm-row' },
        el('button', { class: 'wacrm-btn primary', onclick: async () => { await postOffer(true); drawLog(); paintStatus(); } }, 'Post one now'),
        el('button', { class: 'wacrm-btn', onclick: async () => { cfg.logs = []; await save(); drawLog(); } }, 'Clear log')),

      el('label', {}, 'Recent posts'), logBox));

    drawOffers(); drawLog(); paintStatus();
  }

  // Posts the next offer in the rotation. Shared by the timer and "Post one now", so a
  // manual run and an automatic one can never drift apart.
  let _autopostBusy = false;
  async function postOffer(manual) {
    if (_autopostBusy) return 0;
    const cfg = await store.get('wa_offers', null);
    if (!cfg || !(cfg.offers || []).length || !(cfg.targets || []).length) {
      if (manual) toast('Add at least one offer and one group', true);
      return 0;
    }
    _autopostBusy = true;
    try {
      const idx = (cfg.nextIndex || 0) % cfg.offers.length;
      const offer = cfg.offers[idx];
      let ok = 0; let fail = 0;
      for (const jid of cfg.targets) {
        const r = offer.data
          ? await wa('sendFile', { to: jid, data: offer.data, caption: offer.text || '', filename: offer.filename || 'offer' })
          : await wa('sendText', { to: jid, text: offer.text || offer.title || '' });
        r.ok ? ok++ : fail++;
        await sleep(4000 + Math.random() * 5000);
      }
      cfg.lastPostTs = Date.now();
      cfg.nextIndex = (idx + 1) % cfg.offers.length;
      cfg.logs = [{ ts: Date.now(), text: (offer.title || 'offer').slice(0, 40), ok, fail, manual: !!manual }]
        .concat(cfg.logs || []).slice(0, 60);
      await store.set('wa_offers', cfg);
      if (manual) toast(`Posted to ${ok}/${cfg.targets.length} group(s)`);
      return ok;
    } finally {
      _autopostBusy = false;
    }
  }

  // Same guards as the desktop app: respect the interval and the hours window, and never
  // overlap a run already in progress.
  async function autopostTick() {
    const cfg = await store.get('wa_offers', null);
    if (!cfg || !cfg.on || !(cfg.offers || []).length || !(cfg.targets || []).length) return;
    const h = new Date().getHours();
    if (h < (cfg.startHour ?? 9) || h >= (cfg.endHour ?? 22)) return;
    if (cfg.lastPostTs && Date.now() - cfg.lastPostTs < (cfg.intervalMin || 60) * 60000) return;
    await postOffer(false);
  }


  // ---------- Sales, Purchases & Expenses ----------
  // One ledger, three kinds of entry. Two profit figures are shown on purpose:
  //
  //   Cash profit = sales − purchases − expenses. What actually landed in your pocket.
  //                 It dips on restock days, which is real, not an error.
  //   Margin      = (revenue − cost) / revenue, over sales where you recorded a cost.
  //                 Tells you whether the selling itself is healthy.
  //
  // Showing only one of them misleads: cash profit alone makes a good day look terrible
  // after a big purchase, and margin alone hides that you spent the month's takings.
  const EXPENSE_CATS = ['Rent', 'Staff', 'Ads & marketing', 'Internet & phone', 'Transport',
    'Packaging', 'Electricity', 'Software', 'Bank & fees', 'Other'];
  const PAY_METHODS = ['Cash', 'UPI', 'Bank', 'Card', 'Credit (unpaid)'];
  const KINDS = [['sale', 'Sale'], ['purchase', 'Purchase'], ['expense', 'Expense']];

  const today = () => new Date().toISOString().slice(0, 10);
  const money = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

  function rangeStart(days) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (days > 1) d.setDate(d.getDate() - (days - 1));
    return d.toISOString().slice(0, 10);
  }

  function summarise(entries, from, to) {
    const inRange = entries.filter((e) => e.date >= from && e.date <= to);
    const sum = (k, f = () => true) => inRange.filter((e) => e.kind === k && f(e))
      .reduce((t, e) => t + (Number(e.amount) || 0), 0);
    const sales = sum('sale');
    const purchases = sum('purchase');
    const expenses = sum('expense');
    // Only sales that recorded a cost can contribute to margin.
    const costed = inRange.filter((e) => e.kind === 'sale' && Number(e.cost) > 0);
    const costedRev = costed.reduce((t, e) => t + (Number(e.amount) || 0), 0);
    const cogs = costed.reduce((t, e) => t + (Number(e.cost) || 0), 0);
    const unpaid = inRange.filter((e) => e.kind === 'sale' && e.method === 'Credit (unpaid)')
      .reduce((t, e) => t + (Number(e.amount) || 0), 0);
    return {
      inRange, sales, purchases, expenses,
      cash: sales - purchases - expenses,
      cogs, costedRev, grossProfit: costedRev - cogs,
      margin: costedRev > 0 ? ((costedRev - cogs) / costedRev) * 100 : null,
      unpaid, count: inRange.length,
    };
  }

  // Hand-drawn SVG: no chart library can be bundled and none may be fetched.
  function barChart(days, w = 560, h = 150) {
    const max = Math.max(1, ...days.map((d) => Math.max(d.in, d.out)));
    const gap = 6;
    const bw = Math.max(4, (w - gap * (days.length - 1)) / days.length);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h + 22}`);
    svg.setAttribute('class', 'wacrm-chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Money in and out per day');
    days.forEach((d, i) => {
      const x = i * (bw + gap);
      const hIn = Math.round((d.in / max) * h);
      const hOut = Math.round((d.out / max) * h);
      const mk = (cls, bx, bw2, bh) => {
        const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        r.setAttribute('x', bx); r.setAttribute('y', h - bh);
        r.setAttribute('width', Math.max(2, bw2)); r.setAttribute('height', Math.max(bh, d.in || d.out ? 2 : 0));
        r.setAttribute('rx', '2'); r.setAttribute('class', cls);
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        t.textContent = `${d.label} · in ${money(d.in)} · out ${money(d.out)}`;
        r.append(t);
        return r;
      };
      svg.append(mk('bin', x, bw / 2 - 1, hIn), mk('bout', x + bw / 2 + 1, bw / 2 - 1, hOut));
      if (days.length <= 14 || i % Math.ceil(days.length / 10) === 0) {
        const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tx.setAttribute('x', x + bw / 2); tx.setAttribute('y', h + 15);
        tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('class', 'clab');
        tx.textContent = d.label;
        svg.append(tx);
      }
    });
    return svg;
  }

  async function viewBooks() {
    const all = await store.get('wa_books', []);
    let days = 7;
    const wrap = el('div', { class: 'wacrm-pad' });

    const draw = () => {
      const from = rangeStart(days);
      const to = today();
      const s = summarise(all, from, to);

      // one bucket per day in range
      const buckets = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const day = all.filter((e) => e.date === key);
        buckets.push({
          label: d.toLocaleDateString([], days > 14 ? { day: 'numeric' } : { weekday: 'short' }),
          in: day.filter((e) => e.kind === 'sale').reduce((t, e) => t + (+e.amount || 0), 0),
          out: day.filter((e) => e.kind !== 'sale').reduce((t, e) => t + (+e.amount || 0), 0),
        });
      }

      const tile = (label, value, cls, hint) => el('div', { class: 'wacrm-kpi ' + (cls || '') },
        el('span', { class: 'k-lab' }, label),
        el('b', {}, value),
        hint ? el('span', { class: 'k-hint' }, hint) : null);

      const byCat = {};
      s.inRange.filter((e) => e.kind === 'expense').forEach((e) => {
        byCat[e.category || 'Other'] = (byCat[e.category || 'Other'] || 0) + (+e.amount || 0);
      });
      const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5);

      wrap.replaceChildren(
        el('div', { class: 'wacrm-row' },
          ...[[1, 'Today'], [7, '7 days'], [30, '30 days'], [90, '90 days']].map(([n, lab]) =>
            el('button', {
              class: 'wacrm-btn small' + (days === n ? ' primary' : ''),
              onclick: () => { days = n; draw(); },
            }, lab))),

        el('div', { class: 'wacrm-kpis' },
          tile('Sales', money(s.sales), 'good'),
          tile('Purchases', money(s.purchases)),
          tile('Expenses', money(s.expenses)),
          tile('Cash profit', money(s.cash), s.cash >= 0 ? 'good' : 'bad',
            'sales − purchases − expenses'),
          tile('Margin', s.margin == null ? '—' : s.margin.toFixed(1) + '%', '',
            s.margin == null ? 'add a cost to a sale' : 'on ' + money(s.costedRev) + ' of sales'),
          tile('Unpaid', money(s.unpaid), s.unpaid ? 'warn' : '', 'sales on credit')),

        el('div', { class: 'wacrm-chart-wrap' },
          el('div', { class: 'wacrm-legend' },
            el('span', {}, el('i', { class: 'sw in' }), 'Money in'),
            el('span', {}, el('i', { class: 'sw out' }), 'Money out')),
          barChart(buckets)),

        topCats.length ? el('div', {},
          el('label', {}, 'Where the money went'),
          el('div', { class: 'wacrm-bars' }, topCats.map(([c, v]) => el('div', { class: 'wacrm-catrow' },
            el('span', { class: 'c-name' }, c),
            el('span', { class: 'c-bar' }, el('i', { style: { width: Math.round((v / topCats[0][1]) * 100) + '%' } })),
            el('span', { class: 'c-val' }, money(v))))) ) : null,

        el('div', { class: 'wacrm-row', style: { marginTop: '14px' } },
          el('button', { class: 'wacrm-btn primary', onclick: () => entryModal(all, draw) }, '+ Add entry'),
          el('button', { class: 'wacrm-btn', onclick: () => {
            if (!s.inRange.length) return toast('Nothing in this range', true);
            csv(`wa-crm-books-${from}-to-${to}.csv`,
              s.inRange.map((e) => ({
                date: e.date, kind: e.kind, party: e.party || '', item: e.item || '',
                category: e.category || '', qty: e.qty || '', amount: e.amount || 0,
                cost: e.cost || '', method: e.method || '', note: e.note || '',
              })),
              ['date', 'kind', 'party', 'item', 'category', 'qty', 'amount', 'cost', 'method', 'note']);
          } }, 'Export CSV')),

        el('label', {}, `Entries · ${s.count}`),
        entryList(s.inRange, all, draw));
    };

    bodyEl.append(wrap);
    draw();
  }

  function entryList(rows, all, redraw) {
    const list = el('div', { class: 'wacrm-list' });
    if (!rows.length) {
      list.append(el('div', { class: 'wacrm-empty' },
        el('b', {}, 'Nothing recorded yet'), 'Add a sale, a purchase or an expense to see your profit.'));
      return list;
    }
    rows.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 200).forEach((e) => {
      list.append(el('div', { class: 'wacrm-card' },
        el('span', { class: 'wacrm-kind ' + e.kind }, e.kind[0].toUpperCase()),
        el('div', { class: 'wacrm-grow' },
          el('b', {}, e.item || e.category || e.party || KINDS.find((k) => k[0] === e.kind)[1]),
          el('div', { class: 'wacrm-dim' },
            [e.date, e.party, e.method, e.qty > 1 ? '×' + e.qty : ''].filter(Boolean).join(' · '))),
        el('span', { class: 'wacrm-amt ' + (e.kind === 'sale' ? 'in' : 'out') },
          (e.kind === 'sale' ? '+' : '−') + money(e.amount)),
        el('button', { class: 'wacrm-btn small danger', onclick: async () => {
          const i = all.indexOf(e);
          if (i > -1) all.splice(i, 1);
          await store.set('wa_books', all);
          redraw();
        } }, 'Delete')));
    });
    return list;
  }

  function entryModal(all, redraw) {
    let kind = 'sale';
    const date = el('input', { class: 'wacrm-in', type: 'date' });
    date.value = today();
    const party = el('input', { class: 'wacrm-in', placeholder: 'Customer or supplier (optional)' });
    const item = el('input', { class: 'wacrm-in', placeholder: 'What was it?' });
    const qty = el('input', { class: 'wacrm-in small', type: 'number', value: '1' });
    const amount = el('input', { class: 'wacrm-in', type: 'number', placeholder: 'Amount ₹' });
    const cost = el('input', { class: 'wacrm-in', type: 'number', placeholder: 'What it cost you (optional)' });
    const cat = el('select', { class: 'wacrm-in' }, EXPENSE_CATS.map((c) => el('option', { value: c }, c)));
    const method = el('select', { class: 'wacrm-in' }, PAY_METHODS.map((m) => el('option', { value: m }, m)));
    const note = el('textarea', { class: 'wacrm-in', placeholder: 'Note (optional)' });

    const costRow = el('div', {}, el('label', {}, 'Cost price — powers your margin'), cost);
    const catRow = el('div', {}, el('label', {}, 'Category'), cat);
    const partyRow = el('div', {}, el('label', {}, 'Customer / supplier'), party);

    const applyKind = () => {
      costRow.style.display = kind === 'sale' ? '' : 'none';
      catRow.style.display = kind === 'expense' ? '' : 'none';
      partyRow.style.display = kind === 'expense' ? 'none' : '';
      item.placeholder = kind === 'expense' ? 'What was it for?' : 'What was it?';
    };

    const tabs = el('div', { class: 'wacrm-row' }, KINDS.map(([k, lab]) =>
      el('button', {
        class: 'wacrm-btn small' + (kind === k ? ' primary' : ''), type: 'button',
        onclick: (e) => {
          kind = k;
          [...tabs.children].forEach((b, i) => b.className = 'wacrm-btn small' + (KINDS[i][0] === k ? ' primary' : ''));
          applyKind();
        },
      }, lab)));

    modal('Add to your books', 'Sales, purchases and expenses in one place.',
      el('div', {}, tabs,
        el('label', {}, 'Date'), date,
        partyRow,
        el('label', {}, 'Item'), item,
        el('div', { class: 'wacrm-row' },
          el('div', { class: 'wacrm-col' }, el('label', {}, 'Qty'), qty),
          el('div', { class: 'wacrm-col wacrm-grow' }, el('label', {}, 'Amount ₹'), amount)),
        costRow, catRow,
        el('label', {}, 'Paid by'), method,
        note),
      [el('button', { class: 'wacrm-btn', onclick: closeModal }, 'Cancel'),
       el('button', { class: 'wacrm-btn primary', onclick: async () => {
         const amt = Number(amount.value);
         if (!Number.isFinite(amt) || amt <= 0) return toast('Enter an amount', true);
         all.push({
           id: Date.now(), ts: Date.now(), date: date.value || today(), kind,
           party: kind === 'expense' ? '' : party.value.trim(),
           item: item.value.trim(),
           category: kind === 'expense' ? cat.value : '',
           qty: Math.max(1, Number(qty.value) || 1),
           amount: amt,
           cost: kind === 'sale' ? (Number(cost.value) || 0) : 0,
           method: method.value, note: note.value.trim(),
         });
         await store.set('wa_books', all);
         closeModal(); redraw(); toast('Saved');
       } }, 'Save entry')]);

    applyKind();
  }

  // WhatsApp Web is a SPA that rewrites document.body's children. Keep every node we own
  // alive across those re-renders — not just the launcher, or an open panel silently
  // detaches and every later click appears to do nothing.
  function remount() {
    mountShell();
    mountQuickBar();
    mountQuickReplies();
    if (panel && !panel.isConnected) document.body.append(panel);
  }

  (async () => {
    await loadEnabled();
    remount();
    new MutationObserver(remount).observe(document.body, { childList: true, subtree: false });
    // Keep the stage counts honest as leads change, and run due follow-ups.
    setInterval(drawStages, 20000);
    setInterval(() => runFunnels().catch(() => {}), 60000);
    setInterval(() => runScheduled().catch(() => {}), 30000);
    setInterval(() => autopostTick().catch(() => {}), 120000);
    setInterval(() => runReminders().catch(() => {}), 30000);
    setInterval(() => runDeals().catch(() => {}), 30000);
    // First run: show the guide rather than an icon rail nobody can read.
    if (!(await store.get('wa_seen_guide', false))) {
      setTimeout(() => openFeature('guide'), 2500);
    }
  })();
})();
