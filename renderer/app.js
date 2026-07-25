// ================= helpers =================
const $ = (s, r = document) => r.querySelector(s);
const el = (t, p = {}, ...kids) => {
  const n = Object.assign(document.createElement(t), p);
  for (const [k, v] of Object.entries(p.style || {})) n.style[k] = v;
  for (const c of kids) if (c != null) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
};
const svg = (d) => { const s = document.createElement('span'); s.style.display = 'inline-flex'; s.innerHTML = d; return s.firstChild; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
let toastTimer;
function toast(msg, kind = 'ok') { const t = $('#toast'); t.textContent = msg; t.className = 'toast ' + kind; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = 'toast hidden'), 2600); }
function downloadCsv(name, rows, cols) {
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = el('a', { href: url, download: name }); a.click(); URL.revokeObjectURL(url);
}
const digits = (s) => s.replace(/\D/g, '');

const IC = {
  broadcast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>',
  bot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 8V4M8 4h8"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v3"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z"/></svg>',
  group: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M2 20a6 6 0 0 1 12 0M14.5 20a5 5 0 0 1 7 0"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>',
  languages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8h9M9 4v4c0 4-2 7-5 8"/><path d="M9 12c1 3 3 5 6 6"/><path d="M13 20l4-9 4 9M14.5 17h5"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
};

const FEATURES = [
  { id: 'broadcast', name: 'Broadcast', icon: IC.broadcast, impl: true },
  { id: 'autoreply', name: 'Autoreply BOT', icon: IC.bot, impl: true },
  { id: 'guard', name: 'Group Guard', icon: IC.shield },
  { id: 'schedule', name: 'Schedule', icon: IC.clock },
  { id: 'reminder', name: 'Reminder', icon: IC.bell },
  { id: 'quick', name: 'Quick Replies', icon: IC.reply, impl: true },
  { id: 'extractor', name: 'Data Extractor', icon: IC.users, impl: true },
  { id: 'filter', name: 'Number Filter', icon: IC.filter, impl: true },
  { id: 'grouputils', name: 'Group Utilities', icon: IC.group },
  { id: 'link', name: 'Link Generator', icon: IC.link, impl: true },
  { id: 'direct', name: 'Send Direct Message', icon: IC.send, impl: true },
  { id: 'translate', name: 'Message Translation', icon: IC.languages, impl: true },
  { id: 'signature', name: 'Message Signature', icon: IC.pen, impl: true },
];

// ================= boot / license =================
let engineSrc = '';
window.addEventListener('DOMContentLoaded', async () => {
  $('#deviceId').textContent = (await ott.deviceId()).slice(0, 12) + '…';
  const saved = await ott.licenseLoad();
  if (saved) { $('#licenseKey').value = saved; const r = await safe(() => ott.licenseValidate(saved)); if (r && r.valid && r.trusted) return enterApp(); }
  showGate();
});
function showGate() { $('#gate').classList.remove('hidden'); $('#app').classList.add('hidden'); }
$('#activateBtn').addEventListener('click', activate);
$('#licenseKey').addEventListener('keydown', (e) => { if (e.key === 'Enter') activate(); });
async function activate() {
  const key = $('#licenseKey').value.trim(); const m = $('#gateMsg');
  if (!key) { m.className = 'msg err'; m.textContent = 'Enter a license key.'; return; }
  m.className = 'msg'; m.textContent = 'Activating…';
  const r = await safe(() => ott.licenseActivate(key));
  if (!r) { m.className = 'msg err'; m.textContent = 'Cannot reach license server.'; return; }
  if (r.valid && r.trusted) { await ott.licenseSave(key); m.className = 'msg ok'; m.textContent = 'Activated!'; setTimeout(enterApp, 350); }
  else { m.className = 'msg err'; m.textContent = 'Activation failed: ' + (r.reason || 'invalid'); }
}

// ================= accounts =================
let accounts = [];      // [{id, name}]
let activeId = null;
const partOf = (id) => `persist:wa-${id}`;

async function enterApp() {
  $('#gate').classList.add('hidden'); $('#app').classList.remove('hidden');
  engineSrc = await ott.getEngine();
  renderRail();
  $('#addAccountTop').onclick = addAccount;
  $('#addFirst').onclick = addAccount;
  $('#deactivateBtn').onclick = async () => { if (confirm('Deactivate this device? You will need the key again.')) { await ott.licenseClear(); location.reload(); } };
  $('#fpClose').onclick = closeFeature;
  $('#panelScrim').onclick = closeFeature;

  accounts = store.get('ott_accounts', []);
  accounts.forEach(createWebview);
  renderTabs();
  if (accounts.length) switchAccount(accounts[0].id);
  else $('#waEmpty').style.display = 'flex';
  setInterval(pollStatus, 2500);
}

function addAccount() {
  const name = (prompt('Account label (e.g. your number or a name):', `Account ${accounts.length + 1}`) || '').trim();
  if (!name) return;
  const id = 'a' + Math.abs(hash(name + accounts.length + engineSrc.length)).toString(36).slice(0, 8);
  accounts.push({ id, name }); store.set('ott_accounts', accounts);
  createWebview({ id, name }); renderTabs(); switchAccount(id);
  toast('Account added — scan the QR to link');
}
function closeAccount(id) {
  if (!confirm('Remove this account tab? (WhatsApp session data stays on disk.)')) return;
  accounts = accounts.filter(a => a.id !== id); store.set('ott_accounts', accounts);
  document.querySelector(`webview[data-acc="${id}"]`)?.remove();
  if (activeId === id) activeId = null;
  renderTabs();
  if (accounts.length) switchAccount(accounts[0].id); else { activeId = null; $('#waEmpty').style.display = 'flex'; }
}

function createWebview(acc) {
  if (document.querySelector(`webview[data-acc="${acc.id}"]`)) return;
  const wv = document.createElement('webview');
  wv.setAttribute('data-acc', acc.id);
  wv.setAttribute('src', 'https://web.whatsapp.com');
  wv.setAttribute('partition', partOf(acc.id));
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('useragent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
  wv.style.display = 'none';
  wv.addEventListener('dom-ready', async () => {
    if (wv.dataset.injected) return;
    try { await wv.executeJavaScript(engineSrc, true); wv.dataset.injected = '1'; applyAutoreply(acc.id); } catch (e) { console.warn('inject', e); }
  });
  wv.addEventListener('did-navigate', () => { wv.dataset.injected = ''; });
  $('#waStage').append(wv);
}

function switchAccount(id) {
  activeId = id;
  $('#waEmpty').style.display = 'none';
  document.querySelectorAll('#waStage webview').forEach(w => { w.style.display = w.dataset.acc === id ? 'block' : 'none'; });
  renderTabs();
}
function activeWv() { return activeId ? document.querySelector(`webview[data-acc="${activeId}"]`) : null; }
async function waExec(expr) { const w = activeWv(); if (!w) throw new Error('No active account'); return w.executeJavaScript(expr); }

function renderTabs() {
  const tabs = $('#tabs'); tabs.innerHTML = '';
  accounts.forEach(a => {
    const t = el('div', { className: 'tab' + (a.id === activeId ? ' active' : '') + (statusMap[a.id] === 'connected' ? ' on' : ''), onclick: () => switchAccount(a.id) },
      el('span', { className: 'st' }), a.name,
      el('span', { className: 'x', title: 'Close', onclick: (e) => { e.stopPropagation(); closeAccount(a.id); } }, '✕'));
    tabs.append(t);
  });
  tabs.append(el('div', { className: 'tab-add', title: 'Add account', onclick: addAccount }, '＋'));
}

// per-account status
const statusMap = {};
async function pollStatus() {
  const w = activeWv(); if (!w) return;
  const expr = `(async()=>{ if(typeof WPP==='undefined')return{s:'load'}; try{ const a=await WPP.conn.isAuthenticated(); if(!a)return{s:'qr'}; let me=null; try{me=WPP.conn.getMyUserId()?.user}catch(_){} const r=(typeof WPP.conn.isMainReady==='function')?await WPP.conn.isMainReady():!!WPP.isReady; return{s:r?'connected':'sync',me}; }catch(e){return{s:'load'}} })()`;
  let info; try { info = await w.executeJavaScript(expr); } catch { info = { s: 'load' }; }
  const prev = statusMap[activeId];
  statusMap[activeId] = info.s;
  if (prev !== info.s) renderTabs();
}

// ================= feature rail + panel =================
function renderRail() {
  const rail = $('#rail'); rail.innerHTML = '';
  FEATURES.forEach(f => {
    const item = el('div', { className: 'rail-item', onclick: () => openFeature(f) }, svg(f.icon), f.name);
    if (!f.impl) item.append(el('span', { className: 'soon' }, 'soon'));
    rail.append(item);
  });
}
let openFeatureId = null;
function openFeature(f) {
  if (!activeWv()) return toast('Add a WhatsApp account first', 'err');
  openFeatureId = f.id;
  document.querySelectorAll('.rail-item').forEach((x, i) => x.classList.toggle('active', FEATURES[i].id === f.id));
  $('#fpTitle').textContent = f.name;
  const body = $('#fpBody'); body.innerHTML = '';
  (RENDER[f.id] || renderSoon)(body, f);
  $('#featurePanel').classList.remove('hidden'); $('#panelScrim').classList.remove('hidden');
}
function closeFeature() {
  openFeatureId = null;
  $('#featurePanel').classList.add('hidden'); $('#panelScrim').classList.add('hidden');
  document.querySelectorAll('.rail-item').forEach(x => x.classList.remove('active'));
}

// ================= messaging core =================
function spin(t) { return t.replace(/\{([^{}]+)\}/g, (_, g) => { const o = g.split('|'); return o[Math.floor(Math.random() * o.length)]; }); }
function withSignature(t) { const s = store.get('ott_sig', { on: false, text: '' }); return s.on && s.text ? `${t}\n${s.text}` : t; }
async function sendText(number, text) {
  const jid = JSON.stringify(digits(number) + '@c.us');
  const body = JSON.stringify(spin(withSignature(text)));
  const expr = `(async()=>{try{await WPP.chat.sendTextMessage(${jid},${body},{createChat:true});return{ok:true}}catch(e){return{ok:false,err:String(e&&e.message||e)}}})()`;
  try { return await waExec(expr); } catch (e) { return { ok: false, err: String(e) }; }
}
async function isConnected() { try { return await waExec("(async()=>{try{return (await WPP.conn.isAuthenticated())===true}catch(e){return false}})()"); } catch { return false; } }

// ================= feature renderers =================
const RENDER = {};

RENDER.broadcast = (b) => {
  const numbers = el('textarea', { placeholder: '919876543210\n14155552671', style: { minHeight: '150px', fontFamily: 'JetBrains Mono, monospace' } });
  const msg = el('textarea', { placeholder: 'Hi! {Hello|Hey} — from ott24x7 CRM' });
  const dMin = el('input', { type: 'number', value: '4', min: '1' });
  const dMax = el('input', { type: 'number', value: '9', min: '1' });
  const bar = el('div', { className: 'bar' }); const log = el('div', { className: 'log' });
  let running = false;
  const start = el('button', { className: 'btn primary', onclick: run }, 'Start sending');
  const stop = el('button', { className: 'btn ghost', disabled: true, onclick: () => { running = false; } }, 'Stop');
  b.append(
    lbl('Numbers (one per line, with country code)', numbers),
    lbl('Message  ·  {a|b} = spin, signature auto-appended if enabled', msg),
    el('div', { className: 'row' }, lbl('Delay min (s)', dMin), lbl('Delay max (s)', dMax)),
    quickInsert(msg),
    el('div', { className: 'row' }, start, stop),
    el('div', { className: 'progress' }, bar), log,
  );
  async function run() {
    if (running) return;
    const nums = numbers.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!nums.length) return toast('Add numbers', 'err');
    if (!msg.value.trim()) return toast('Write a message', 'err');
    if (!(await isConnected())) return toast('WhatsApp not linked on this account', 'err');
    running = true; start.disabled = true; stop.disabled = false; log.innerHTML = ''; bar.style.width = '0%';
    const dmin = Math.max(1, +dMin.value || 4), dmax = Math.max(dmin, +dMax.value || 9);
    let ok = 0, fail = 0, done = 0;
    for (const n of nums) {
      if (!running) { line(log, 'Stopped.', 'bad'); break; }
      const r = await sendText(n, msg.value.trim()); done++;
      if (r.ok) { ok++; line(log, `✓ ${n}`, 'ok'); } else { fail++; line(log, `✗ ${n} — ${r.err || 'failed'}`, 'bad'); }
      bar.style.width = Math.round(done / nums.length * 100) + '%';
      if (running && done < nums.length) await sleep((dmin + Math.random() * (dmax - dmin)) * 1000);
    }
    running = false; start.disabled = false; stop.disabled = true;
    line(log, `Done — ${ok} sent, ${fail} failed of ${nums.length}.`, ok ? 'ok' : 'bad'); toast(`Sent ${ok}/${nums.length}`);
  }
};

RENDER.direct = (b) => {
  const num = el('input', { placeholder: '919876543210' });
  const msg = el('textarea', { placeholder: 'Your message' });
  b.append(lbl('Number (with country code)', num), lbl('Message', msg), quickInsert(msg),
    el('button', { className: 'btn primary', onclick: async () => {
      if (!digits(num.value)) return toast('Enter a number', 'err');
      if (!msg.value.trim()) return toast('Write a message', 'err');
      if (!(await isConnected())) return toast('WhatsApp not linked', 'err');
      const r = await sendText(num.value, msg.value.trim());
      toast(r.ok ? 'Message sent' : 'Failed: ' + (r.err || ''), r.ok ? 'ok' : 'err');
    } }, 'Send message'));
};

RENDER.link = (b) => {
  const num = el('input', { placeholder: '919876543210' });
  const txt = el('textarea', { placeholder: 'Prefilled message (optional)' });
  const out = el('input', { readOnly: true, placeholder: 'wa.me link appears here' });
  const build = () => { const d = digits(num.value); out.value = d ? `https://wa.me/${d}${txt.value ? '?text=' + encodeURIComponent(txt.value) : ''}` : ''; };
  num.oninput = build; txt.oninput = build;
  b.append(lbl('Number (with country code)', num), lbl('Prefilled text', txt), lbl('Shareable link', out),
    el('div', { className: 'row' },
      el('button', { className: 'btn primary', onclick: () => { build(); if (out.value) { navigator.clipboard.writeText(out.value); toast('Link copied'); } } }, 'Copy link'),
      el('button', { className: 'btn ghost', onclick: () => { build(); if (out.value) { navigator.clipboard.writeText(out.value); toast('Copied — open in any browser'); } } }, 'Copy for browser')));
};

RENDER.signature = (b) => {
  const sig = store.get('ott_sig', { on: false, text: '' });
  const on = el('input', { type: 'checkbox', checked: sig.on, style: { width: 'auto' } });
  const txt = el('textarea', { value: sig.text, placeholder: '— Sent via ott24x7 CRM' });
  b.append(
    el('div', { className: 'fp-note' }, 'When enabled, this signature is appended to every Broadcast and Direct message.'),
    el('label', { style: { flexDirection: 'row', alignItems: 'center', gap: '10px' } }, on, 'Enable signature'),
    lbl('Signature text', txt),
    el('button', { className: 'btn primary', onclick: () => { store.set('ott_sig', { on: on.checked, text: txt.value }); toast('Signature saved'); } }, 'Save signature'));
};

RENDER.quick = (b) => {
  const list = el('div', { className: 'rules' });
  const draw = () => {
    list.innerHTML = ''; const qs = store.get('ott_quick', []);
    if (!qs.length) list.append(el('div', { className: 'muted' }, 'No quick replies yet.'));
    qs.forEach((q, i) => list.append(el('div', { className: 'qr-item' },
      el('div', { className: 'txt' }, el('b', {}, q.title || '(untitled)'), el('div', { className: 'muted', style: { fontSize: '12px' } }, q.text.slice(0, 60))),
      el('button', { className: 'btn small ghost', onclick: () => { const qs2 = store.get('ott_quick', []); qs2.splice(i, 1); store.set('ott_quick', qs2); draw(); } }, 'Delete'))));
  };
  const title = el('input', { placeholder: 'Title' }); const text = el('textarea', { placeholder: 'Reply text (supports {a|b} spin)' });
  b.append(el('div', { className: 'fp-note' }, 'Saved replies show an “Insert” menu inside Broadcast and Direct Message.'),
    lbl('Title', title), lbl('Text', text),
    el('button', { className: 'btn primary', onclick: () => { if (!text.value.trim()) return toast('Add text', 'err'); const qs = store.get('ott_quick', []); qs.push({ title: title.value.trim(), text: text.value.trim() }); store.set('ott_quick', qs); title.value = text.value = ''; draw(); toast('Saved'); } }, 'Add quick reply'),
    el('div', { style: { borderTop: '1px solid var(--line)', margin: '4px 0' } }), list);
  draw();
};

RENDER.filter = (b) => {
  const nums = el('textarea', { placeholder: 'One number per line', style: { minHeight: '150px', fontFamily: 'JetBrains Mono, monospace' } });
  const out = el('div', { className: 'log' }); let results = [];
  b.append(el('div', { className: 'fp-note' }, 'Checks which numbers have an active WhatsApp account (uses the linked account).'),
    lbl('Numbers', nums),
    el('div', { className: 'row' },
      el('button', { className: 'btn primary', onclick: run }, 'Check numbers'),
      el('button', { className: 'btn ghost', onclick: () => { if (results.length) downloadCsv('wa-number-filter.csv', results, ['number', 'onWhatsApp']); } }, 'Export CSV')),
    out);
  async function run() {
    const list = nums.value.split(/\r?\n/).map(s => digits(s)).filter(Boolean);
    if (!list.length) return toast('Add numbers', 'err');
    if (!(await isConnected())) return toast('WhatsApp not linked', 'err');
    out.innerHTML = ''; results = [];
    for (const n of list) {
      const on = await waExec(`(async()=>{try{return !!(await WPP.contact.queryExists(${JSON.stringify(n + '@c.us')}))}catch(e){return false}})()`).catch(() => false);
      results.push({ number: n, onWhatsApp: on ? 'yes' : 'no' });
      line(out, `${on ? '✓' : '✗'} ${n} — ${on ? 'on WhatsApp' : 'not found'}`, on ? 'ok' : 'bad');
      await sleep(400);
    }
    toast(`Checked ${results.length} · ${results.filter(r => r.onWhatsApp === 'yes').length} on WhatsApp`);
  }
};

RENDER.extractor = (b) => {
  const groupSel = el('select'); const out = el('div', { className: 'log' }); let rows = [];
  b.append(el('div', { className: 'fp-note' }, 'Export your contacts, or the members of any group you are in.'),
    el('button', { className: 'btn', onclick: async () => {
      if (!(await isConnected())) return toast('WhatsApp not linked', 'err');
      const cs = await waExec("(async()=>{try{const c=await WPP.contact.list();return c.map(x=>({number:(x.id&&x.id.user)||'',name:x.name||x.pushname||x.formattedName||''})).filter(x=>x.number)}catch(e){return[]}})()").catch(() => []);
      if (!cs.length) return toast('No contacts found', 'err');
      downloadCsv('ott24x7-contacts.csv', cs, ['number', 'name']); toast(`Exported ${cs.length} contacts`);
    } }, 'Export all contacts'),
    el('div', { style: { borderTop: '1px solid var(--line)', margin: '4px 0' } }),
    lbl('Group', groupSel),
    el('div', { className: 'row' },
      el('button', { className: 'btn', onclick: loadGroups }, 'Load groups'),
      el('button', { className: 'btn primary', onclick: exportMembers }, 'Export members')),
    out);
  async function loadGroups() {
    if (!(await isConnected())) return toast('WhatsApp not linked', 'err');
    const gs = await waExec("(async()=>{try{const g=await WPP.chat.list({onlyGroups:true});return g.map(x=>({id:x.id&&x.id._serialized,name:(x.groupMetadata&&x.groupMetadata.subject)||x.name||x.formattedTitle||x.id._serialized}))}catch(e){return[]}})()").catch(() => []);
    groupSel.innerHTML = ''; if (!gs.length) { groupSel.append(el('option', {}, 'No groups')); return toast('No groups found', 'err'); }
    gs.forEach(g => groupSel.append(el('option', { value: g.id }, g.name))); toast(`${gs.length} groups loaded`);
  }
  async function exportMembers() {
    const gid = groupSel.value; if (!gid) return toast('Load & pick a group', 'err');
    const ps = await waExec(`(async()=>{try{const p=await WPP.group.getParticipants(${JSON.stringify(gid)});return p.map(m=>({number:m.id.user}))}catch(e){return[]}})()`).catch(() => []);
    if (!ps.length) return toast('No members / not allowed', 'err');
    downloadCsv('ott24x7-group-members.csv', ps, ['number']); toast(`Exported ${ps.length} members`);
  }
};

RENDER.translate = (b) => {
  const src = el('textarea', { placeholder: 'Text to translate' });
  const tl = el('select'); [['en', 'English'], ['hi', 'Hindi'], ['es', 'Spanish'], ['pt', 'Portuguese'], ['ar', 'Arabic'], ['fr', 'French'], ['id', 'Indonesian'], ['ru', 'Russian']].forEach(([v, n]) => tl.append(el('option', { value: v }, n)));
  const out = el('textarea', { readOnly: true, placeholder: 'Translation' });
  b.append(lbl('Source text', src), lbl('Translate to', tl),
    el('button', { className: 'btn primary', onclick: async () => {
      if (!src.value.trim()) return toast('Enter text', 'err');
      const r = await ott.translate(src.value, tl.value);
      if (r.ok) { out.value = r.text; toast('Translated'); } else toast('Translate failed', 'err');
    } }, 'Translate'),
    lbl('Result', out),
    el('button', { className: 'btn ghost', onclick: () => { if (out.value) { navigator.clipboard.writeText(out.value); toast('Copied'); } } }, 'Copy result'));
};

RENDER.autoreply = (b, f) => {
  const key = `ott_ar_${activeId}`;
  const cfg = store.get(key, { on: false, rules: [] });
  const chip = el('span', { className: 'chip ' + (cfg.on ? 'on' : 'off') }, cfg.on ? 'Running' : 'Off');
  const list = el('div', { className: 'rules' });
  const draw = () => {
    list.innerHTML = '';
    cfg.rules.forEach((r, i) => {
      const kw = el('input', { value: r.keyword, placeholder: 'keyword' });
      const rp = el('input', { value: r.reply, placeholder: 'auto-reply' });
      kw.oninput = () => { r.keyword = kw.value; }; rp.oninput = () => { r.reply = rp.value; };
      list.append(el('div', { className: 'rule' }, kw, rp, el('button', { className: 'btn small ghost', onclick: () => { cfg.rules.splice(i, 1); persist(); draw(); } }, '✕')));
    });
    if (!cfg.rules.length) list.append(el('div', { className: 'muted' }, 'No rules yet.'));
  };
  const persist = () => { store.set(key, cfg); applyAutoreply(activeId); };
  b.append(
    el('div', { className: 'fp-note' }, 'Replies to incoming messages on THIS account when a keyword is found. Runs while the app is open and the account is linked.'),
    el('label', { style: { flexDirection: 'row', alignItems: 'center', gap: '10px' } },
      el('input', { type: 'checkbox', checked: cfg.on, style: { width: 'auto' }, onchange: (e) => { cfg.on = e.target.checked; chip.className = 'chip ' + (cfg.on ? 'on' : 'off'); chip.textContent = cfg.on ? 'Running' : 'Off'; persist(); } }),
      'Enable autoreply', chip),
    el('div', { style: { fontSize: '12px', color: 'var(--muted)' } }, 'Keyword contains → reply:'),
    list,
    el('button', { className: 'btn', onclick: () => { cfg.rules.push({ keyword: '', reply: '' }); persist(); draw(); } }, '＋ Add rule'),
    el('button', { className: 'btn primary', onclick: () => { persist(); toast('Autoreply saved'); } }, 'Save & apply'));
  draw();
};

function renderSoon(b, f) {
  b.append(el('div', { className: 'fp-note' }, `“${f.name}” is planned for the next update. Multi-account, Broadcast, Autoreply, Quick Replies, Number Filter, Data Extractor, Link Generator, Direct Message, Translation and Signature are live now.`));
}

// autoreply injection into a webview
function applyAutoreply(accId) {
  const wv = document.querySelector(`webview[data-acc="${accId}"]`); if (!wv || !wv.dataset.injected) return;
  const cfg = store.get(`ott_ar_${accId}`, { on: false, rules: [] });
  const rules = cfg.on ? cfg.rules.filter(r => r.keyword && r.reply) : [];
  const js = `window.__ott_rules=${JSON.stringify(rules)};
    if(!window.__ott_ar){window.__ott_ar=true;try{WPP.on('chat.new_message',async(m)=>{try{
      if(!m||m.fromMe)return;const body=((m.body)||'').toLowerCase();
      for(const r of (window.__ott_rules||[])){if(r.keyword&&body.includes(r.keyword.toLowerCase())){await WPP.chat.sendTextMessage(m.from,r.reply,{});break;}}
    }catch(e){}});}catch(e){}}`;
  wv.executeJavaScript(js).catch(() => {});
}

// ================= tiny utils =================
function lbl(t, c) { return el('label', {}, t, c); }
function line(box, text, cls) { const s = el('span', cls ? { className: cls } : {}); s.textContent = text + '\n'; box.append(s); box.scrollTop = box.scrollHeight; }
function quickInsert(target) {
  const qs = store.get('ott_quick', []);
  if (!qs.length) return el('div', {});
  const sel = el('select', { onchange: (e) => { if (e.target.value !== '') { target.value = qs[+e.target.value].text; e.target.value = ''; } } });
  sel.append(el('option', { value: '' }, 'Insert quick reply…'));
  qs.forEach((q, i) => sel.append(el('option', { value: String(i) }, q.title || q.text.slice(0, 30))));
  return sel;
}
async function safe(fn) { try { return await fn(); } catch { return null; } }
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return h; }
