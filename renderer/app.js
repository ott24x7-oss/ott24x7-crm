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
// Keys mirrored to a durable file in userData so they survive every app update.
// Everything the user would be upset to lose must be written to the durable file store
// in userData, not just localStorage — localStorage does not survive a profile reset.
const PERSIST_KEYS = ['ott_theme', 'ott_quick', 'ott_offers', 'ott_leads', 'ott_lead_seqs',
  'ott_invoice_cfg', 'ott_invoices', 'ott_invoice_items',
  'ott_reminders', 'ott_schedule', 'ott_sig', 'ott_notes', 'ott_books', 'ott_deals', 'ott_deal_cfg'];
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { try { toast('Storage full — attachment too large for a saved item', 'err'); } catch (_) {} return false; }
    if (PERSIST_KEYS.includes(k) && window.ott && ott.persistSave) ott.persistSave(k, v);
    return true;
  },
};
// Restore durable data (file wins; else migrate existing localStorage → file).
async function restorePersisted() {
  for (const key of PERSIST_KEYS) {
    try {
      const fv = await ott.persistLoad(key);
      if (fv != null) localStorage.setItem(key, JSON.stringify(fv));
      else { const ls = store.get(key, null); if (ls != null) await ott.persistSave(key, ls); }
    } catch (_) {}
  }
}
let toastTimer;
function toast(msg, kind = 'ok') { const t = $('#toast'); t.textContent = msg; t.className = 'toast ' + kind; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = 'toast hidden'), 2600); }
function downloadCsv(name, rows, cols) {
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = el('a', { href: url, download: name }); a.click(); URL.revokeObjectURL(url);
}
const digits = (s) => s.replace(/\D/g, '');

const IC = {
  deal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v13"/></svg>',
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
  chats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M7 9h10M7 13h6"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
  lead: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',
  invoice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6M9 9h1"/></svg>',
};

const FEATURES = [
  { id: 'chatfilters', name: 'Chat Filters', icon: IC.chats, impl: true, sub: [['all', 'All'], ['unread', 'Unread'], ['groups', 'Groups'], ['chats', 'Chats'], ['contacts', 'Contacts'], ['noncontacts', 'Non-contacts']] },
  { id: 'leads', name: 'Lead Manager', icon: IC.lead, impl: true },
  { id: 'invoice', name: 'Invoice', icon: IC.invoice, impl: true },
  { id: 'broadcast', name: 'Broadcast', icon: IC.broadcast, impl: true },
  { id: 'autoreply', name: 'Autoreply BOT', icon: IC.bot, impl: true },
  { id: 'guard', name: 'Group Guard', icon: IC.shield, impl: true },
  { id: 'schedule', name: 'Schedule', icon: IC.clock, impl: true },
  { id: 'reminder', name: 'Reminder', icon: IC.bell, impl: true },
  { id: 'quick', name: 'Quick Replies', icon: IC.reply, impl: true },
  { id: 'extractor', name: 'Data Extractor', icon: IC.users, impl: true },
  { id: 'filter', name: 'Number Filter', icon: IC.filter, impl: true },
  { id: 'grouputils', name: 'Group Utilities', icon: IC.group, impl: true },
  { divider: 'Tools' },
  { id: 'autopost', name: 'Auto Offer Post', icon: IC.rocket, impl: true },
  { id: 'blur', name: 'Blur Settings', icon: IC.eye, impl: true },
  { id: 'link', name: 'Link Generator', icon: IC.link, impl: true },
  { id: 'direct', name: 'Send Direct Message', icon: IC.send, impl: true },
  { id: 'translate', name: 'Message Translation', icon: IC.languages, impl: true },
  { id: 'signature', name: 'Message Signature', icon: IC.pen, impl: true },
  { id: 'deals', name: 'Deals & Renewals', icon: IC.deal, impl: true },
  { id: 'books', name: 'Sales & Expenses', icon: IC.rocket, impl: true },
  { id: 'notes', name: 'Chat Notes', icon: IC.pen, impl: true },
  { id: 'backup', name: 'Backup & Restore', icon: IC.save, impl: true },
];

// ================= boot / license =================
let engineSrc = '';
let trialInfo = { isTrial: false, expiresAt: null };
const BUY_URL = 'https://ott24x7.com/plans/dev-crm-pro-whatsapp-software-license';
window.addEventListener('DOMContentLoaded', async () => {
  $('#deviceId').textContent = (await ott.deviceId()).slice(0, 12) + '…';
  const saved = await ott.licenseLoad();
  if (saved) {
    $('#licenseKey').value = saved;
    const r = await safe(() => ott.licenseValidate(saved));
    if (r && r.valid && r.trusted) { trialInfo = { isTrial: saved.startsWith('TRIAL-'), expiresAt: r.expiresAt || null }; return enterApp(); }
  }
  showGate();
});
function showGate() { $('#gate').classList.remove('hidden'); $('#app').classList.add('hidden'); }

// The badge used to be a hardcoded string in index.html, so it still read v0.30.0 after
// every later release and made a successful update look like it had not installed.
try {
  ott.config().then((c) => {
    const n = $('#verBadge');
    if (n && c && c.version) n.textContent = 'v' + c.version;
  }).catch(() => {});
} catch (e) {}

// ---- Auto-update wiring (registered at load so the popup event is never missed) ----
let _updChecking = false;
try {
  ott.onUpdateAvailable(d => { _updChecking = false; showUpdatePopup(d.version, d.manual); });
  ott.onUpdateProgress(d => setUpdateProgress(d.percent));
  ott.onUpdateDownloaded(() => setUpdateDownloaded());
  ott.onUpdateNone(() => { if (_updChecking) { toast('You’re on the latest version ✓'); _updChecking = false; } });
  ott.onUpdateError(() => { if (_updChecking) { toast('Update check failed — check your connection', 'err'); _updChecking = false; } });
} catch (_) {}
// Click the version pill to check for updates manually.
window.addEventListener('DOMContentLoaded', () => {
  const v = document.querySelector('.ver');
  if (v) { v.style.cursor = 'pointer'; v.title = 'Check for updates'; v.addEventListener('click', () => { _updChecking = true; toast('Checking for updates…'); try { ott.checkUpdate && ott.checkUpdate(); } catch (_) {} }); }
});

// Start (or resume) a device-bound 7-day free trial.
async function startTrial() {
  const m = $('#gateMsg'); m.className = 'msg'; m.textContent = 'Starting free trial…';
  const r = await safe(() => ott.licenseTrial());
  if (!r) { m.className = 'msg err'; m.textContent = 'Cannot reach license server.'; return; }
  if (r.valid && r.trusted) {
    await ott.licenseSave(r.key);
    trialInfo = { isTrial: true, expiresAt: r.expiresAt || null };
    m.className = 'msg ok'; m.textContent = 'Free trial started!';
    setTimeout(enterApp, 350);
  } else if (r.reason === 'trial_expired') {
    m.className = 'msg err'; m.textContent = 'Your free trial has already been used on this device. Please buy a license.';
  } else {
    m.className = 'msg err'; m.textContent = 'Could not start trial: ' + String(r.reason || 'error').replace(/_/g, ' ');
  }
}

// Trial banner (bottom pill) — shows remaining days while on trial.
function updateTrialBanner() {
  const bar = $('#trialBanner'); if (!bar) return;
  if (!trialInfo.isTrial || !trialInfo.expiresAt) { bar.classList.add('hidden'); return; }
  const days = Math.max(0, Math.ceil((new Date(trialInfo.expiresAt) - Date.now()) / 86400000));
  $('#trialDays').textContent = days === 1 ? '1 day' : days + ' days';
  bar.classList.remove('hidden');
}

// Re-validate the license periodically; lock the app if it was suspended/revoked.
async function recheckLicense() {
  const key = await ott.licenseLoad(); if (!key) return;
  const r = await safe(() => ott.licenseValidate(key));
  if (r && (r.valid === false || r.trusted === false)) lockApp(r.reason);
}
function lockApp(reason) {
  $('#app').classList.add('hidden'); $('#gate').classList.remove('hidden');
  $('#trialBanner')?.classList.add('hidden');
  const m = $('#gateMsg'); m.className = 'msg err';
  if (trialInfo.isTrial && (reason === 'expired' || reason === 'trial_expired')) {
    m.textContent = 'Your 7-day free trial has ended — buy a license to keep using ott24x7 CRM.';
  } else {
    m.textContent = 'License ' + String(reason || 'invalid').replace(/_/g, ' ') + ' — contact your provider.';
  }
}

// ---- Auto-update popup ----
let _upd = null;
function showUpdatePopup(version, manual) {
  if (_upd) return;
  const bar = el('div', { className: 'progress', style: { display: 'none', width: '100%' } }); const barI = el('div', { className: 'bar' }); bar.append(barI);
  const pct = el('div', { className: 'muted', style: { fontSize: '12px', display: 'none' } }, '0%');
  // On macOS the app is not code-signed, so it cannot replace itself — open the download
  // page instead of pretending an in-app update is running.
  const updBtn = manual
    ? el('button', { className: 'btn primary', onclick: () => { ott.downloadUpdate(); closeUpd(); } }, 'Download')
    : el('button', { className: 'btn primary', onclick: () => { updBtn.disabled = true; updBtn.textContent = 'Downloading…'; bar.style.display = 'block'; pct.style.display = 'block'; ott.downloadUpdate(); } }, 'Update now');
  const box = el('div', { className: 'modal-box', style: { width: '380px', textAlign: 'center' } },
    el('h3', {}, 'Update available'),
    el('div', { className: 'muted', style: { margin: '4px 0 8px' } },
      'Version ' + (version || '') + (manual
        ? ' is out. Download it and drag WA-CRM into Applications to replace this copy.'
        : ' is ready — get the latest features and fixes.')),
    bar, pct,
    el('div', { className: 'row', style: { justifyContent: 'center', marginTop: '8px' } }, el('button', { className: 'btn ghost', onclick: closeUpd }, 'Later'), updBtn));
  const scrim = el('div', { className: 'modal-scrim' }, box);
  document.body.append(scrim);
  _upd = { scrim, box, barI, pct };
}
function setUpdateProgress(p) { if (_upd) { _upd.barI.style.width = p + '%'; _upd.pct.textContent = p + '%'; } }
function setUpdateDownloaded() {
  if (!_upd) showUpdatePopup('');
  _upd.box.innerHTML = '';
  _upd.box.append(el('h3', {}, 'Update ready'), el('div', { className: 'muted', style: { margin: '4px 0 10px' } }, 'Restart to apply the update.'),
    el('div', { className: 'row', style: { justifyContent: 'center' } }, el('button', { className: 'btn ghost', onclick: closeUpd }, 'Later'), el('button', { className: 'btn primary', onclick: () => ott.installUpdate() }, 'Restart & update')));
}
function closeUpd() { if (_upd) { _upd.scrim.remove(); _upd = null; } }
$('#activateBtn').addEventListener('click', activate);
$('#trialBtn').addEventListener('click', startTrial);
$('#trialBuyBtn').addEventListener('click', () => ott.openExternal(BUY_URL));
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
  try { applyTheme(store.get('ott_theme', 'emerald'), false); } catch (e) {}
  updateTrialBanner();
  await restorePersisted();
  engineSrc = await ott.getEngine();
  renderRail();
  $('#addAccountTop').onclick = addAccount;
  $('#addFirst').onclick = addAccount;
  $('#themeBtn').onclick = openThemePicker;
  $('#deactivateBtn').onclick = async () => { if (confirm('Deactivate this device? You will need the key again.')) { await ott.licenseClear(); location.reload(); } };
  $('#fpClose').onclick = closeFeature;
  makeDraggable($('#featurePanel'), $('#featurePanel .fp-head'));

  accounts = store.get('ott_accounts', []);
  accounts.forEach(createWebview);
  renderTabs();
  if (accounts.length) switchAccount(accounts[0].id);
  else $('#waEmpty').style.display = 'flex';
  setInterval(pollTick, 3000); // status + lead/reply/command queues in one IPC round-trip
  setInterval(recheckLicense, 300000); // re-validate license every 5 min (suspend takes effect live)
  startScheduler();
  // Trigger an update check now that the app is loaded (listeners are attached at script load).
  try { ott.checkUpdate && ott.checkUpdate(); } catch (_) {}
}

async function addAccount() {
  const name = await promptModal('New WhatsApp account', 'Label this account', `Account ${accounts.length + 1}`);
  if (!name) return;
  const id = 'a' + Math.abs(hash(name + accounts.length + Date.now())).toString(36).slice(0, 8);
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
  // Keep background accounts fully alive so switching to them is instant.
  wv.setAttribute('webpreferences', 'backgroundThrottling=false');
  wv.addEventListener('dom-ready', async () => {
    if (wv.dataset.injected) return;
    try { await wv.executeJavaScript(engineSrc + ';void 0;', true); wv.dataset.injected = '1'; applyWaTheme(acc.id); applyAutoreply(acc.id); applyGuard(acc.id); applyBlur(acc.id); applyQuickReplies(acc.id); applyLeadButton(acc.id); applyChatWidget(acc.id); } catch (e) { console.warn('inject', e); }
  });
  wv.addEventListener('did-navigate', () => { wv.dataset.injected = ''; });
  $('#waStage').append(wv);
}

function switchAccount(id) {
  if (activeId === id) return;            // already active — do nothing
  activeId = id;
  $('#waEmpty').style.display = 'none';
  // Toggle a class only. Never touch display: hiding a <webview> destroys its GPU
  // surface, so showing it again forces a full WhatsApp repaint (the switching lag).
  document.querySelectorAll('#waStage webview').forEach(w => {
    w.classList.toggle('is-active', w.dataset.acc === id);
  });
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
// ONE round-trip per tick: connection status + all three in-page queues.
// (Was two separate executeJavaScript IPC calls every 2.5s.)
const POLL_EXPR = `(async()=>{var o={s:'load',me:null,leads:[],incoming:[],cmds:[],acts:[]};
try{var a=window.__ott_leadq||[],b=window.__ott_inq||[],c=window.__ott_cmdq||[],d=window.__ott_actq||[];
window.__ott_leadq=[];window.__ott_inq=[];window.__ott_cmdq=[];window.__ott_actq=[];o.leads=a;o.incoming=b;o.cmds=c;o.acts=d;}catch(e){}
try{if(typeof WPP==='undefined')return o;
var au=await WPP.conn.isAuthenticated();if(!au){o.s='qr';return o;}
try{o.me=WPP.conn.getMyUserId()&&WPP.conn.getMyUserId().user}catch(_){}
var r=(typeof WPP.conn.isMainReady==='function')?await WPP.conn.isMainReady():!!WPP.isReady;
o.s=r?'connected':'sync';}catch(e){}
return o;})()`;

let _pollBusy = false;
async function pollTick() {
  if (_pollBusy) return;                              // never stack round-trips
  if (document.hidden) return;                        // window minimised/hidden — skip
  const w = activeWv(); if (!w || !w.dataset.injected) return;
  _pollBusy = true;
  let info;
  try { info = await w.executeJavaScript(POLL_EXPR); } catch { info = null; }
  _pollBusy = false;
  if (!info) return;

  const prev = statusMap[activeId];
  statusMap[activeId] = info.s;
  if (prev !== info.s) renderTabs();                  // only redraw tabs on real change

  if (info.leads && info.leads.length) info.leads.forEach(saveLead);
  if (info.incoming && info.incoming.length) markRepliedLeads(info.incoming);
  if (info.cmds && info.cmds.length) info.cmds.forEach(processInvoiceCommand);
  if (info.acts && info.acts.length) info.acts.forEach((a) => handleChatAction(a).catch(() => {}));
}

// ================= feature rail + panel =================
let pendingChatFilter = null;
function renderRail() {
  const rail = $('#rail'); rail.innerHTML = '';
  FEATURES.forEach(f => {
    if (f.divider) { rail.append(el('div', { className: 'rail-divider' }, f.divider)); return; }
    if (f.sub) {
      const sub = el('div', { className: 'rail-sub hidden' });
      f.sub.forEach(([v, n]) => sub.append(el('div', { className: 'rail-subitem', onclick: () => { if (v === 'label') openFeature(f); else chatFilter(v); } }, n)));
      const item = el('div', { className: 'rail-item', onclick: () => sub.classList.toggle('hidden') }, svg(f.icon), f.name, el('span', { className: 'caret' }, '▾'));
      item.dataset.fid = f.id;
      rail.append(item, sub);
      return;
    }
    const item = el('div', { className: 'rail-item', onclick: () => openFeature(f) }, svg(f.icon), f.name);
    item.dataset.fid = f.id;
    if (!f.impl) item.append(el('span', { className: 'soon' }, 'soon'));
    rail.append(item);
  });
}
let openFeatureId = null;
// Features that do not touch WhatsApp at all. Backup in particular must work on a fresh
// machine, before any account has been connected — that is exactly when you restore.
const NO_ACCOUNT_NEEDED = new Set(['backup']);

function openFeature(f) {
  if (!NO_ACCOUNT_NEEDED.has(f.id) && !activeWv()) return toast('Add a WhatsApp account first', 'err');
  const panel = $('#featurePanel');
  const wasHidden = panel.classList.contains('hidden');
  openFeatureId = f.id;
  document.querySelectorAll('.rail-item').forEach(x => x.classList.toggle('active', x.dataset.fid === f.id));
  const acc = accounts.find(a => a.id === activeId);
  $('#fpTitle').textContent = f.name + (acc ? ' · ' + acc.name : '');
  const body = $('#fpBody'); body.innerHTML = '';
  (RENDER[f.id] || renderSoon)(body, f);
  panel.classList.remove('hidden');
  if (wasHidden) positionWindow(panel);   // keep position when switching features
}
function closeFeature() {
  openFeatureId = null;
  $('#featurePanel').classList.add('hidden');
  document.querySelectorAll('.rail-item').forEach(x => x.classList.remove('active'));
}
function positionWindow(panel) {
  const stage = $('#waStage').getBoundingClientRect();
  const w = Math.min(500, window.innerWidth - 260);
  panel.style.width = w + 'px';
  panel.style.left = Math.max(12, stage.left + (stage.width - w) / 2) + 'px';
  panel.style.top = Math.max(60, stage.top + 22) + 'px';
}
function makeDraggable(win, handle) {
  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
  handle.addEventListener('mousedown', (e) => {
    if (e.target.closest('.icon-btn')) return;
    dragging = true; sx = e.clientX; sy = e.clientY;
    const r = win.getBoundingClientRect(); ox = r.left; oy = r.top;
    document.body.style.userSelect = 'none';
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    win.style.left = Math.max(0, Math.min(window.innerWidth - 90, ox + e.clientX - sx)) + 'px';
    win.style.top = Math.max(0, Math.min(window.innerHeight - 44, oy + e.clientY - sy)) + 'px';
  });
  window.addEventListener('mouseup', () => { dragging = false; document.body.style.userSelect = ''; });
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
async function sendMedia(number, dataUrl, caption, filename) {
  const jid = JSON.stringify(digits(number) + '@c.us');
  const content = JSON.stringify(dataUrl);
  const cap = JSON.stringify(spin(withSignature(caption || '')));
  const fn = JSON.stringify(filename || 'file');
  const expr = `(async()=>{try{await WPP.chat.sendFileMessage(${jid},${content},{type:'auto',caption:${cap},filename:${fn},createChat:true});return{ok:true}}catch(e){return{ok:false,err:String(e&&e.message||e)}}})()`;
  try { return await waExec(expr); } catch (e) { return { ok: false, err: String(e) }; }
}

// ================= feature renderers =================
const RENDER = {};

RENDER.broadcast = (b) => {
  let curList = null; // checkList for contacts/groups/members
  const mode = el('select');
  [['numbers', 'Numbers (paste / import)'], ['contacts', 'My contacts'], ['groupmembers', 'Group members'], ['groups', 'Send to groups']]
    .forEach(([v, n]) => mode.append(el('option', { value: v }, n)));
  const numbers = el('textarea', { placeholder: '919876543210\n14155552671', style: { minHeight: '120px', fontFamily: 'JetBrains Mono, monospace' } });
  const gsel = el('select');
  const targetBox = el('div', {});
  const listHolder = () => targetBox.querySelector('#tgtlist');
  const setList = (items, label) => { curList = checkList(items); const h = listHolder(); if (h) { h.innerHTML = ''; h.append(curList.node); } toast(label); };
  async function ensureConn() { if (!(await isConnected())) { toast('WhatsApp not linked', 'err'); return false; } return true; }

  function renderTarget() {
    targetBox.innerHTML = ''; curList = null;
    if (mode.value === 'numbers') { targetBox.append(numbers, el('div', { className: 'row' }, importBtn(numbers))); }
    else if (mode.value === 'contacts') { targetBox.append(el('button', { className: 'btn small', onclick: async () => { if (!(await ensureConn())) return; const cs = await waExec("(async()=>{try{${PH_RESOLVER};const c=await WPP.contact.list();var o=[];for(var i=0;i<c.length;i++){var x=c[i];if(!x.isMyContact)continue;var ph=await _ph(x.id);if(!ph)continue;o.push({jid:ph+'@c.us',name:x.name||x.pushname||x.formattedName||''});}return o}catch(e){return[]}})()").catch(() => []); setList(cs, `${cs.length} contacts loaded`); } }, 'Load my contacts'), el('div', { id: 'tgtlist' })); }
    else if (mode.value === 'groups') { targetBox.append(el('button', { className: 'btn small', onclick: async () => { if (!(await ensureConn())) return; const gs = await waExec("(async()=>{try{const g=await WPP.chat.list({onlyGroups:true});return g.map(x=>({jid:x.id&&x.id._serialized,name:(x.groupMetadata&&x.groupMetadata.subject)||x.name||x.formattedTitle||''}))}catch(e){return[]}})()").catch(() => []); setList(gs, `${gs.length} groups loaded`); } }, 'Load groups'), el('div', { id: 'tgtlist' })); }
    else if (mode.value === 'groupmembers') { targetBox.append(el('div', { className: 'row' }, el('button', { className: 'btn small', onclick: async () => { const n = await loadGroupsInto(gsel); if (n) toast(`${n} groups`); } }, 'Load groups')), gsel, el('div', { className: 'row', style: { marginTop: '8px' } }, el('button', { className: 'btn small', onclick: async () => { const gid = gsel.value; if (!gid) return toast('Pick a group', 'err'); const ps = await waExec(`(async()=>{try{${PH_RESOLVER};const p=await WPP.group.getParticipants(${JSON.stringify(gid)});var o=[];for(var i=0;i<p.length;i++){var ph=await _ph(p[i].id);if(ph)o.push({jid:ph+'@c.us',name:''});}return o}catch(e){return[]}})()`).catch(() => []); setList(ps, `${ps.length} members`); } }, 'Load members')), el('div', { id: 'tgtlist' })); }
  }
  mode.onchange = renderTarget;

  // message + formatting toolbar
  const msg = el('textarea', { placeholder: 'Type your message… [NAME] personalizes, {a|b} spins, signature auto-appends' });
  const bar = el('div', { className: 'fmt-bar' });
  [['B', '*', '*'], ['I', '_', '_'], ['S', '~', '~'], ['</>', '```', '```']].forEach(([t, bef, aft]) => bar.append(el('button', { className: 'btn small ghost', onclick: () => wrapSel(msg, bef, aft) }, t)));
  bar.append(el('button', { className: 'btn small ghost', onclick: () => wrapSel(msg, '[NAME]', '') }, '[NAME]'));

  const att = attachControl();
  const dMin = el('input', { type: 'number', value: '4', min: '1' }), dMax = el('input', { type: 'number', value: '9', min: '1' });
  const when = el('input', { type: 'datetime-local' });
  const barI = el('div', { className: 'bar' }); const log = el('div', { className: 'log' });
  let running = false;
  const startBtn = el('button', { className: 'btn primary', onclick: () => run(false) }, 'Send now');
  const schedBtn = el('button', { className: 'btn', onclick: () => run(true) }, 'Schedule');
  const stopBtn = el('button', { className: 'btn ghost', disabled: true, onclick: () => { running = false; } }, 'Stop');

  b.append(
    lbl('Target', mode), targetBox,
    lbl('Message', el('div', {}, bar, msg)), quickInsert(msg), att.node,
    el('div', { className: 'row' }, lbl('Delay min (s)', dMin), lbl('Delay max (s)', dMax)),
    lbl('Schedule for (optional)', when),
    el('div', { className: 'row' }, startBtn, schedBtn, stopBtn),
    el('div', { className: 'progress' }, barI), log,
  );
  renderTarget();

  function recipients() {
    if (mode.value === 'numbers') return numbers.value.split(/\r?\n/).map(s => digits(s)).filter(Boolean).map(n => ({ jid: n + '@c.us', name: '' }));
    return curList ? curList.selected() : [];
  }
  async function run(schedule) {
    if (running) return;
    const recips = recipients();
    if (!recips.length) return toast('Add or select recipients', 'err');
    if (!msg.value.trim() && !att.get()) return toast('Write a message or attach a file', 'err');
    if (schedule || when.value) {
      if (mode.value === 'groups' || mode.value === 'groupmembers') return toast('Scheduling supports Numbers/Contacts only', 'err');
      if (!when.value) return toast('Pick a schedule time', 'err');
      const t = new Date(when.value).getTime(); if (isNaN(t) || t <= Date.now()) return toast('Pick a future time', 'err');
      const jobs = store.get('ott_schedule', []); const acc = accounts.find(a => a.id === activeId);
      jobs.push({ id: 's' + Date.now(), accId: activeId, accName: acc ? acc.name : '', numbers: recips.map(r => jidNumber(r.jid)), message: msg.value.trim(), when: new Date(t).toISOString(), delayMin: +dMin.value || 4, delayMax: +dMax.value || 9, status: 'pending', ok: null });
      store.set('ott_schedule', jobs); return toast('Broadcast scheduled');
    }
    if (!(await isConnected())) return toast('WhatsApp not linked', 'err');
    running = true; startBtn.disabled = true; stopBtn.disabled = false; log.innerHTML = ''; barI.style.width = '0%';
    const dmin = Math.max(1, +dMin.value || 4), dmax = Math.max(dmin, +dMax.value || 9); const file = att.get();
    let ok = 0, fail = 0, done = 0;
    for (const r of recips) {
      if (!running) { line(log, 'Stopped.', 'bad'); break; }
      const text = personalize(msg.value.trim(), r);
      const res = file ? await sendMediaToJid(r.jid, file.data, text, file.name) : await sendToJid(r.jid, text);
      done++; res.ok ? ok++ : fail++;
      line(log, `${res.ok ? '✓' : '✗'} ${r.name || jidNumber(r.jid)}${res.ok ? '' : ' — ' + (res.err || '')}`, res.ok ? 'ok' : 'bad');
      barI.style.width = Math.round(done / recips.length * 100) + '%';
      if (running && done < recips.length) await sleep((dmin + Math.random() * (dmax - dmin)) * 1000);
    }
    running = false; startBtn.disabled = false; stopBtn.disabled = true;
    line(log, `Done — ${ok} sent, ${fail} failed of ${recips.length}.`, ok ? 'ok' : 'bad'); toast(`Sent ${ok}/${recips.length}`);
  }
};

RENDER.direct = (b) => {
  const num = el('input', { placeholder: '919876543210' });
  const msg = el('textarea', { placeholder: 'Your message / caption' });
  const att = attachControl();
  b.append(lbl('Number (with country code)', num), lbl('Message / caption', msg), att.node, quickInsert(msg),
    el('button', { className: 'btn primary', onclick: async () => {
      if (!digits(num.value)) return toast('Enter a number', 'err');
      if (!msg.value.trim() && !att.get()) return toast('Write a message or attach a file', 'err');
      if (!(await isConnected())) return toast('WhatsApp not linked', 'err');
      const file = att.get();
      const r = file ? await sendMedia(num.value, file.data, msg.value.trim(), file.name) : await sendText(num.value, msg.value.trim());
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

// Backfill a category field on older quick replies.
function migrateQuick() {
  const qs = store.get('ott_quick', []); let ch = false;
  for (const q of qs) {
    if (q.category === undefined) { q.category = ''; ch = true; }
    if (!q.title && q.text) { q.title = deriveTitle(q.text); ch = true; } // name older untitled offers
  }
  if (ch) store.set('ott_quick', qs);
}
// Derive a short product name from the first meaningful line of a caption (strips WhatsApp markdown).
function deriveTitle(t) {
  if (!t) return '';
  const first = String(t).split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
  return first.replace(/[*_~`>#]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}
// Flatten a caption for the catalog preview: drop markdown, turn line breaks into separators.
function cleanPreview(t) {
  return String(t || '').replace(/[*_~`]+/g, '').replace(/\s*\r?\n\s*/g, ' · ').replace(/\s{2,}/g, ' ').trim();
}
// Send a saved product/offer straight to the currently open WhatsApp chat.
async function sendQuickToActiveChat(it) {
  const wv = document.querySelector(`webview[data-acc="${activeId}"]`);
  if (!wv || !wv.dataset.injected) { toast('Open a WhatsApp chat first', 'err'); return; }
  const payload = JSON.stringify({ text: spin(it.text || ''), data: it.data || null, filename: it.filename || 'file' });
  const js = `(function(){try{var q=${payload};var c=window.WPP&&WPP.chat.getActiveChat&&WPP.chat.getActiveChat();if(!c)return 'nochat';if(q.data){WPP.chat.sendFileMessage(c.id,q.data,{type:'auto',caption:q.text||'',filename:q.filename,createChat:true});}else{WPP.chat.sendTextMessage(c.id,q.text,{createChat:true});}return 'ok';}catch(e){return 'err:'+(e&&e.message);}})()`;
  const r = await wv.executeJavaScript(js).catch(() => 'err');
  if (r === 'ok') toast('Sent to open chat');
  else if (r === 'nochat') toast('Open a chat in WhatsApp first', 'err');
  else toast('Send failed', 'err');
}

RENDER.quick = (b) => {
  migrateQuick();
  const refreshChips = () => { accounts.forEach(a => applyQuickReplies(a.id)); };

  const title = el('input', { placeholder: 'Product / offer name (max 40)', maxLength: 40 });
  const category = el('input', { placeholder: 'Category (e.g. Ebooks, Courses)', maxLength: 30 });
  const mtype = el('select'); [['text', 'Text only'], ['image', 'Image / Video'], ['audio', 'Audio'], ['doc', 'Document']].forEach(([v, n]) => mtype.append(el('option', { value: v }, n)));
  const text = el('textarea', { placeholder: 'Caption / message (supports {a|b} spin)' });
  // Rates live on the product so a deal can pull them in instead of being retyped, and so
  // the margin reaches Sales & Expenses without the seller doing the arithmetic.
  const sell = el('input', { type: 'number', min: '0', placeholder: 'What you sell it for' });
  const cost = el('input', { type: 'number', min: '0', placeholder: 'What it costs you' });
  const att = attachControl('*'); att.node.style.display = 'none';
  const chipChk = chk(false);
  mtype.onchange = () => { att.node.style.display = mtype.value === 'text' ? 'none' : 'flex'; };

  const list = el('div', { className: 'rules' });
  const search = el('input', { placeholder: 'Search products…' });
  const catF = el('select');
  const drawFilters = () => {
    const cur = catF.value;
    const cats = [...new Set(store.get('ott_quick', []).map(q => (q.category || '').trim()).filter(Boolean))].sort();
    catF.innerHTML = ''; catF.append(el('option', { value: 'all' }, 'All categories'));
    cats.forEach(c => catF.append(el('option', { value: c }, c)));
    if ([...catF.options].some(o => o.value === cur)) catF.value = cur;
  };
  const draw = () => {
    list.innerHTML = '';
    const qs = store.get('ott_quick', []);
    const q = (search.value || '').toLowerCase(), cf = catF.value;
    const items = qs.map((it, i) => ({ it, i })).filter(({ it }) =>
      (cf === 'all' || (it.category || '') === cf) &&
      (!q || (it.title || '').toLowerCase().includes(q) || (it.text || '').toLowerCase().includes(q) || (it.category || '').toLowerCase().includes(q)));
    if (!items.length) { list.append(el('div', { className: 'muted' }, qs.length ? 'No products match your search.' : 'No products saved yet — add one above.')); return; }
    list.append(el('div', { className: 'muted', style: { fontSize: '12px', margin: '0 0 8px' } }, items.length + ' item(s)'));
    items.forEach(({ it, i }) => list.append(catalogItem(it, i)));
  };
  function catalogItem(it, i) {
    const isImg = it.data && /^data:image\//.test(it.data);
    const thumb = isImg
      ? el('img', { src: it.data, style: { width: '46px', height: '46px', objectFit: 'cover', borderRadius: '8px', flex: 'none' } })
      : el('div', { style: { width: '46px', height: '46px', borderRadius: '8px', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(18,184,102,.12)', fontSize: '20px' } }, it.data ? '📎' : '💬');
    return el('div', { className: 'card', style: { padding: '10px 12px', marginBottom: '8px', display: 'flex', gap: '10px', alignItems: 'flex-start' } },
      thumb,
      el('div', { style: { flex: '1', minWidth: '0' } },
        el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } },
          el('b', {}, it.title || deriveTitle(it.text) || '(untitled)'),
          it.category ? el('span', { className: 'muted', style: { fontSize: '11px', border: '1px solid var(--line)', borderRadius: '10px', padding: '1px 8px' } }, it.category) : null,
          it.pinned !== false ? el('span', { title: 'Shows as chip on chat bar', style: { fontSize: '11px' } }, '📌') : null,
          Number(it.sell) > 0 ? el('span', { className: 'rate-tag', title: 'Selling rate' }, '₹' + Number(it.sell).toLocaleString('en-IN')) : null,
          Number(it.cost) > 0 ? el('span', { className: 'rate-tag cost', title: 'Purchase rate' }, 'cost ₹' + Number(it.cost).toLocaleString('en-IN')) : null,
          Number(it.sell) > 0 && Number(it.cost) > 0 ? marginChip(it.sell, it.cost, 'Profit per sale') : null),
        el('div', { className: 'muted', style: { fontSize: '12px', marginTop: '3px', lineHeight: '1.45', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, cleanPreview(it.text) || it.filename || ''),
        el('div', { className: 'row', style: { marginTop: '8px' } },
          el('button', { className: 'btn small', onclick: () => sendQuickToActiveChat(it) }, '➤ Send to chat'),
          el('button', { className: 'btn small ghost', onclick: () => { const qs = store.get('ott_quick', []); qs[i].pinned = qs[i].pinned === false; store.set('ott_quick', qs); draw(); refreshChips(); } }, it.pinned !== false ? 'Unpin' : 'Pin chip'),
          el('button', { className: 'btn small ghost', style: { color: 'var(--danger)' }, onclick: () => { const qs = store.get('ott_quick', []); qs.splice(i, 1); store.set('ott_quick', qs); drawFilters(); draw(); refreshChips(); } }, 'Delete'))));
  }
  search.oninput = draw; catF.onchange = draw;

  b.append(
    el('div', { className: 'fp-note' }, 'Save your product offers (image + caption) once, then search and send them to the open chat in one click. Pin your most-used ones as chips above the message box.'),
    lbl('Product / offer name', title),
    el('div', { className: 'row' }, lbl('Category', category), lbl('Type', mtype)),
    el('div', { className: 'row' }, lbl('Selling rate ₹', sell), lbl('Purchase rate ₹', cost)),
    el('div', { className: 'fp-note', style: { margin: '-2px 0 0' } },
      'Optional. Fill these in and “Deal done” will pick them up for you — the difference becomes your profit in Sales & Expenses.'),
    lbl('Caption / message', text), att.node,
    chkRow(chipChk, 'Also show as a quick chip on the chat bar'),
    el('button', { className: 'btn primary', onclick: () => {
      const f = att.get();
      if (!title.value.trim() && !text.value.trim() && !f) return toast('Add a name, caption, or file', 'err');
      const qs = store.get('ott_quick', []);
      qs.push({ title: title.value.trim() || deriveTitle(text.value), category: category.value.trim(), text: text.value.trim(), data: f ? f.data : undefined, filename: f ? f.name : undefined, pinned: chipChk.checked, sell: Number(sell.value) || 0, cost: Number(cost.value) || 0 });
      if (store.set('ott_quick', qs)) { title.value = text.value = category.value = sell.value = cost.value = ''; mtype.value = 'text'; att.node.style.display = 'none'; chipChk.checked = false; drawFilters(); draw(); refreshChips(); toast('Product saved'); }
    } }, '＋ Save product / offer'),
    el('div', { style: { borderTop: '1px solid var(--line)', margin: '8px 0' } }),
    el('div', { className: 'row' }, lbl('Search', search), lbl('Category', catF)),
    list);
  drawFilters(); draw();
};

RENDER.filter = (b) => {
  const nums = el('textarea', { placeholder: 'One number per line', style: { minHeight: '150px', fontFamily: 'JetBrains Mono, monospace' } });
  const out = el('div', { className: 'log' }); let results = [];
  b.append(el('div', { className: 'fp-note' }, 'Checks which numbers have an active WhatsApp account (uses the linked account).'),
    lbl('Numbers', nums),
    el('div', { className: 'row' }, importBtn(nums)),
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
  const source = el('select');
  [['contacts', 'From Contacts'], ['chatlist', 'From Chat List'], ['groups', 'From Groups'], ['label', 'From Label (Business)']].forEach(([v, n]) => source.append(el('option', { value: v }, n)));
  const filter = el('select'); [['all', 'All numbers'], ['saved', 'Saved only'], ['unsaved', 'Unsaved only']].forEach(([v, n]) => filter.append(el('option', { value: v }, n)));
  const scope = el('select'); [['all', 'All groups'], ['specific', 'Specific group']].forEach(([v, n]) => scope.append(el('option', { value: v }, n)));
  const gsel = el('select'), lsel = el('select');
  const opts = el('div', {}), out = el('div', { className: 'log' }); let rows = [];
  const ensureConn = async () => { if (!(await isConnected())) { toast('WhatsApp not linked', 'err'); return false; } return true; };

  function renderOpts() {
    opts.innerHTML = '';
    const s = source.value;
    if (s === 'chatlist') opts.append(lbl('Filter', filter));
    else if (s === 'groups') {
      opts.append(lbl('Scope', scope));
      if (scope.value === 'specific') opts.append(el('div', { className: 'row' }, el('button', { className: 'btn small', onclick: async () => { const n = await loadGroupsInto(gsel); if (n) toast(`${n} groups`); } }, 'Load groups')), gsel);
      opts.append(lbl('Filter', filter));
    } else if (s === 'label') {
      opts.append(el('div', { className: 'fp-note' }, 'Labels require a WhatsApp Business account.'),
        el('div', { className: 'row' }, el('button', { className: 'btn small', onclick: loadLabels }, 'Load labels')), lsel, lbl('Filter', filter));
    }
  }
  source.onchange = renderOpts; scope.onchange = renderOpts;
  async function loadLabels() {
    if (!(await ensureConn())) return;
    const ls = await waExec("(async()=>{try{return (await WPP.labels.getAllLabels()).map(l=>({id:(l.id||'')+'',name:l.name||''}))}catch(e){return[]}})()").catch(() => []);
    lsel.innerHTML = ''; if (!ls.length) { lsel.append(el('option', {}, 'No labels (Business only)')); return toast('No labels found', 'err'); }
    ls.forEach(l => lsel.append(el('option', { value: l.id }, l.name))); toast(`${ls.length} labels`);
  }
  const RES = PH_RESOLVER;
  const applyFilter = (list, f) => f === 'saved' ? list.filter(x => x.saved) : f === 'unsaved' ? list.filter(x => !x.saved) : list;
  let skippedLid = 0;
  function finish(msg) {
    out.innerHTML = '';
    if (msg) { line(out, msg, 'bad'); toast(msg, 'err'); return; }
    if (!rows.length) { line(out, 'No usable numbers (WhatsApp is hiding them as privacy LIDs).', 'bad'); toast('No numbers found', 'err'); return; }
    rows.slice(0, 300).forEach(r => line(out, `${r.number}${r.name ? ' · ' + r.name : ''}${r.saved != null ? (r.saved ? '  (saved)' : '  (unsaved)') : ''}`, 'ok'));
    if (skippedLid) line(out, `(${skippedLid} skipped — number hidden by WhatsApp privacy/LID)`, 'bad');
    toast(`Extracted ${rows.length}${skippedLid ? ' · ' + skippedLid + ' hidden' : ''}`);
  }
  async function run() {
    if (!(await ensureConn())) return;
    rows = []; skippedLid = 0; out.innerHTML = ''; line(out, 'Extracting…');
    const s = source.value, f = filter.value; let raw = [];
    if (s === 'contacts') {
      raw = await waExec(`(async()=>{try{${RES};const c=await WPP.contact.list();var o=[];for(var i=0;i<c.length;i++){var x=c[i];if(!x.isMyContact)continue;var ph=await _ph(x.id);o.push({number:ph,name:x.name||x.pushname||'',saved:true});}return o;}catch(e){return[]}})()`).catch(() => []);
    } else if (s === 'chatlist') {
      raw = await waExec(`(async()=>{try{${RES};const l=await WPP.chat.list();var o=[];for(var i=0;i<l.length;i++){var c=l[i];if(c.isGroup||(c.id&&c.id.server==='g.us'))continue;var ph=await _ph(c.id);o.push({number:ph,name:(c.contact&&c.contact.name)||'',saved:!!(c.contact&&c.contact.isMyContact)});}return o;}catch(e){return[]}})()`).catch(() => []);
    } else if (s === 'groups') {
      const saved = await savedSet(); let gids = [];
      if (scope.value === 'specific') { if (!gsel.value) return finish('Load & pick a group'); gids = [gsel.value]; }
      else gids = await waExec("(async()=>{try{const g=await WPP.chat.list({onlyGroups:true});return g.map(x=>x.id&&x.id._serialized).filter(Boolean)}catch(e){return[]}})()").catch(() => []);
      const seen = new Set();
      for (const gid of gids) {
        const ms = await waExec(`(async()=>{try{${RES};const p=await WPP.group.getParticipants(${JSON.stringify(gid)});var o=[];for(var i=0;i<p.length;i++){var ph=await _ph(p[i].id);o.push({number:ph});}return o;}catch(e){return[]}})()`).catch(() => []);
        for (const m of ms) { if (!m.number) { skippedLid++; continue; } if (seen.has(m.number)) continue; seen.add(m.number); raw.push({ number: m.number, name: '', saved: saved.has(m.number) }); }
      }
      rows = applyFilter(raw, f); return finish();
    } else if (s === 'label') {
      if (!lsel.value) return finish('Load & pick a label');
      raw = await waExec(`(async()=>{try{${RES};const l=await WPP.chat.list({withLabels:[${JSON.stringify(lsel.value)}]});var o=[];for(var i=0;i<l.length;i++){var c=l[i];var ph=await _ph(c.id);o.push({number:ph,name:(c.contact&&c.contact.name)||'',saved:!!(c.contact&&c.contact.isMyContact)});}return o;}catch(e){return[]}})()`).catch(() => []);
    }
    skippedLid += raw.filter(r => !r.number).length;
    rows = applyFilter(raw.filter(r => r.number), f);
    finish();
  }
  function exportGoogle() {
    const withNums = (rows || []).filter(r => r.number);
    if (!withNums.length) return toast('Extract numbers first', 'err');
    const cols = ['First Name', 'Middle Name', 'Last Name', 'Phonetic First Name', 'Phonetic Middle Name', 'Phonetic Last Name', 'Name Prefix', 'Name Suffix', 'Nickname', 'File As', 'Organization Name', 'Organization Title', 'Organization Department', 'Birthday', 'Notes', 'Photo', 'Labels', 'Phone 1 - Label', 'Phone 1 - Value'];
    const g = withNums.map(r => {
      const o = {}; cols.forEach(c => (o[c] = ''));
      o['First Name'] = r.name || r.number;
      o['Labels'] = '* myContacts';
      o['Phone 1 - Label'] = 'Mobile';
      o['Phone 1 - Value'] = '+' + String(r.number).replace(/\D/g, '');
      return o;
    });
    downloadCsv('google-contacts.csv', g, cols);
    toast(`Exported ${g.length} for Google Contacts`);
  }
  b.append(
    el('div', { className: 'fp-note' }, 'Extract real WhatsApp numbers from THIS account. “Saved” = in your phone contacts. Numbers WhatsApp hides as privacy LIDs are skipped. Use “Google Contacts” for a CSV you can import at contacts.google.com.'),
    lbl('Source', source), opts,
    el('div', { className: 'row' },
      el('button', { className: 'btn primary', onclick: run }, 'Extract'),
      el('button', { className: 'btn ghost', onclick: () => { if (rows.length) downloadCsv('ott24x7-numbers.csv', rows, ['number', 'name', 'saved']); else toast('Extract first', 'err'); } }, 'Export CSV'),
      el('button', { className: 'btn ghost', onclick: exportGoogle }, 'Google Contacts')),
    out);
  renderOpts();
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

const COND = { contains: 'Contains', exact: 'Exact', startsWith: 'Starts with', endsWith: 'Ends with' };
RENDER.autoreply = (b) => {
  const key = `ott_ar_${activeId}`;
  const cfg = store.get(key, { on: false, rules: [], fallback: '' });
  cfg.rules = (cfg.rules || []).map(r => ({ type: r.type || 'contains', keyword: r.keyword || '', reply: r.reply || '' }));
  cfg.fallback = cfg.fallback || '';
  const persist = () => { store.set(key, cfg); applyAutoreply(activeId); };

  const chip = el('span', { className: 'chip ' + (cfg.on ? 'on' : 'off') }, cfg.on ? 'Running' : 'Stopped');
  const toggle = chk(cfg.on);
  toggle.onchange = () => { cfg.on = toggle.checked; chip.className = 'chip ' + (cfg.on ? 'on' : 'off'); chip.textContent = cfg.on ? 'Running' : 'Stopped'; persist(); };

  // Add-rule builder
  const kw = el('input', { placeholder: 'User sends… (keyword / phrase)' });
  const cond = el('select'); Object.entries(COND).forEach(([v, n]) => cond.append(el('option', { value: v }, n)));
  const rep = el('textarea', { placeholder: 'Then reply with…' });
  const addBtn = el('button', { className: 'btn', onclick: () => {
    if (!kw.value.trim() || !rep.value.trim()) return toast('Fill keyword and reply', 'err');
    cfg.rules.push({ type: cond.value, keyword: kw.value.trim(), reply: rep.value.trim() });
    kw.value = rep.value = ''; drawRules(); persist(); toast('Rule added');
  } }, '＋ Add rule');

  const rulesBox = el('div', { className: 'rules' });
  const drawRules = () => {
    rulesBox.innerHTML = '';
    if (!cfg.rules.length) { rulesBox.append(el('div', { className: 'muted' }, 'No rules yet.')); return; }
    cfg.rules.forEach((r, i) => rulesBox.append(el('div', { className: 'qr-item' },
      el('div', { className: 'txt' }, el('b', {}, `${COND[r.type] || r.type}: “${r.keyword}”`),
        el('div', { className: 'muted', style: { fontSize: '12px' } }, '→ ' + r.reply.slice(0, 54))),
      el('button', { className: 'btn small ghost', onclick: () => { cfg.rules.splice(i, 1); drawRules(); persist(); } }, '✕'))));
  };

  const fallback = el('textarea', { value: cfg.fallback, placeholder: 'Fallback reply when nothing matches (optional)' });
  fallback.oninput = () => { cfg.fallback = fallback.value; };

  b.append(
    el('div', { className: 'fp-note' }, 'Auto-replies to incoming messages on THIS account. Runs while the app is open and the account is linked.'),
    el('label', { style: { flexDirection: 'row', alignItems: 'center', gap: '10px' } }, toggle, 'Enable / Start bot', chip),
    el('div', { className: 'fp-note' }, 'Add a rule — if the incoming message matches, the bot replies:'),
    el('div', { className: 'row' }, lbl('User sends', kw), lbl('Condition', cond)),
    lbl('Reply with', rep), addBtn,
    el('div', { style: { borderTop: '1px solid var(--line)', margin: '4px 0' } }),
    lbl('Rules', rulesBox),
    lbl('Fallback reply (optional)', fallback),
    el('button', { className: 'btn primary', onclick: () => { persist(); toast('Autoreply saved & applied'); } }, 'Save & apply'));
  drawRules();
};

// Filter the LIVE WhatsApp chat list by clicking its native filter chip (like WA CRM).
function chatFilter(name) {
  const wv = activeWv(); if (!wv) return toast('Add an account first', 'err');
  const map = { all: 'All', unread: 'Unread', groups: 'Groups', chats: 'Chats', favourites: 'Favourites', business: 'Business', official: 'Official', awaiting: 'Awaiting Reply', needs: 'Needs Reply' };
  const target = map[name] || name;
  const js = `(function(){
    function norm(s){return (s||'').replace(/[0-9]+/g,'').replace(/\\s+/g,' ').trim().toLowerCase();}
    var t=${JSON.stringify(target.toLowerCase())};
    var els=document.querySelectorAll('#pane-side button,#pane-side div[role="button"],[role="tablist"] button,button[aria-label]');
    for(var i=0;i<els.length;i++){var a=norm(els[i].getAttribute('aria-label'));var x=norm(els[i].innerText||els[i].textContent);if(a===t||x===t){els[i].click();return 'ok';}}
    return 'notfound';
  })()`;
  wv.executeJavaScript(js).then(r => toast(r === 'ok' ? 'Chat list filtered: ' + target : `“${target}” filter not available on this account`, r === 'ok' ? 'ok' : 'err')).catch(() => {});
}

// Inject clickable quick-reply chips just above the open chat's compose box (like WA CRM).
// Match WhatsApp's own dark theme to the app's dark chrome — but ONLY if the user
// has never set a theme preference themselves. Never overrides an explicit choice.
function applyWaTheme(accId) {
  const wv = document.querySelector(`webview[data-acc="${accId}"]`); if (!wv || !wv.dataset.injected) return;
  wv.executeJavaScript(`(function(){try{if(localStorage.getItem('theme')==null){localStorage.setItem('theme','"dark"');}}catch(e){}})();void 0;`).catch(() => {});
}

function applyQuickReplies(accId) {
  const wv = document.querySelector(`webview[data-acc="${accId}"]`); if (!wv || !wv.dataset.injected) return;
  const replies = store.get('ott_quick', []).filter(q => q.pinned !== false); // only pinned show as chips
  const js = `window.__ott_quick=${JSON.stringify(replies)};(function(){
    ${MENU_GUARD}
    function insert(text){var box=document.querySelector('#main footer [contenteditable="true"]')||document.querySelector('footer [contenteditable="true"]')||document.querySelector('#main [contenteditable="true"]');if(!box)return;box.focus();try{var dt=new DataTransfer();dt.setData('text/plain',String(text));box.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));return;}catch(e){}try{var lines=String(text).replace(/\\r\\n?/g,'\\n').split('\\n');for(var i=0;i<lines.length;i++){if(i>0)document.execCommand('insertLineBreak');if(lines[i])document.execCommand('insertText',false,lines[i]);}}catch(e){}}
    function act(q){if(q&&q.data){try{var c=window.WPP&&WPP.chat.getActiveChat&&WPP.chat.getActiveChat();if(c){WPP.chat.sendFileMessage(c.id,q.data,{type:'auto',caption:q.text||'',filename:q.filename||'file',createChat:true});}}catch(e){}}else{insert((q&&q.text)||'');}}
    /* One stylesheet instead of a cssText string per chip — hover and focus states are
       impossible with inline styles, and this is what makes the bar match the extension. */
    function css(){
      if(document.getElementById('ott-qr-css'))return;
      var s=document.createElement('style');s.id='ott-qr-css';
      /* z-index 100, deliberately modest. At 99999 this sat above WhatsApp's own attach and
         emoji menus, so a click meant for Document or Photos landed on us instead and
         WhatsApp closed the menu as a click-outside. Sitting in WhatsApp's own band lets its
         popups render on top and take their own clicks, with no guessing about their markup.
         pointer-events on the container means the gaps between chips never intercept. */
      s.textContent='#ott-qr-bar{position:fixed;z-index:100;pointer-events:none;display:flex;align-items:center;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px 0}'
        +'.ott-qr-chip{pointer-events:auto}'
        +'#ott-qr-bar::-webkit-scrollbar{display:none}'
        +'.ott-qr-chip{flex:none;cursor:pointer;height:30px;padding:0 13px;border-radius:15px;display:inline-flex;align-items:center;gap:6px;color:#12a054;font:600 12px Inter,system-ui,-apple-system,sans-serif;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;background:rgba(255,255,255,.96);border:1px solid rgba(9,30,22,.14);box-shadow:0 1px 2px rgba(11,20,26,.14),0 4px 12px -6px rgba(11,20,26,.3);transition:background .16s cubic-bezier(.2,0,0,1),color .16s cubic-bezier(.2,0,0,1),transform .16s cubic-bezier(.2,0,0,1)}'
        +'.ott-qr-chip:hover{color:#fff;background:linear-gradient(180deg,#2ee178 0%,#12a054 100%);transform:translateY(-1px)}'
        +'.ott-qr-chip:active{transform:translateY(1px)}'
        +'.ott-qr-chip:focus-visible{outline:2px solid #12a054;outline-offset:2px}'
        +'.ott-qr-add{padding:0 11px}'
        +'@media (prefers-reduced-motion:reduce){.ott-qr-chip{transition:none}}';
      document.head.appendChild(s);
    }
    function chip(label,tip,cls,fn){
      var b=document.createElement('button');b.type='button';b.className='ott-qr-chip'+(cls?' '+cls:'');
      b.textContent=label;if(tip)b.title=tip;
      b.onmousedown=function(e){e.preventDefault();};
      b.onclick=function(e){e.preventDefault();e.stopPropagation();fn();};
      return b;
    }
    function sig(qs,r){var t='';for(var i=0;i<qs.length;i++){t+=(qs[i].data?'1':'0')+(qs[i].title||'')+'\\u0001';}
      return t+'@'+Math.round(r.left)+','+Math.round(r.top)+','+Math.round(r.width);}
    function render(){
      var footer=document.querySelector('#main footer'); var bar=document.getElementById('ott-qr-bar'); var qs=window.__ott_quick||[];
      /* Render the bar even with nothing saved: an empty strip hides the feature, so the
         "add" chip is the only way a new user discovers quick replies exist. */
      var hide=function(){if(bar)bar.style.display='none';window.__ottReserve('qr',0);};
      if(!footer){hide();return;}
      var r=footer.getBoundingClientRect();
      if(r.width<320){hide();return;}
      /* Same collision as the widget: the attach and emoji menus open right here. */
      var bh=(bar&&bar.offsetHeight)||34;
      if(window.__ottMenuOpen({left:r.left+14,right:r.right-14,top:r.top-bh-6,bottom:r.top-6})){hide();return;}
      var s=sig(qs,r);
      /* Nothing moved and no chip changed -> zero DOM writes this tick. Still re-assert the
         reserved space: WhatsApp drops our padding whenever it re-renders the panel. */
      if(bar&&bar.getAttribute('data-sig')===s){
        if(bar.style.display==='none')bar.style.display='flex';
        window.__ottReserve('qr',bh+6);
        return;
      }
      css();
      if(!bar){bar=document.createElement('div');bar.id='ott-qr-bar';bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Quick replies');document.body.appendChild(bar);}
      bar.setAttribute('data-sig',s);
      /* All layout now comes from the stylesheet, so wipe any inline leftovers — an
         older build positioned this with bottom/max-width, which would fight top/width. */
      bar.removeAttribute('style');
      bar.style.left=(r.left+14)+'px';
      bar.style.width=Math.max(200,r.width-28)+'px';
      bar.innerHTML='';
      if(!qs.length){bar.appendChild(chip('+  Add a quick reply','Set up one-tap replies','ott-qr-add',manage));}
      else{
        qs.forEach(function(q){bar.appendChild(chip((q.data?'📎 ':'')+(q.title||(q.text||'').slice(0,20)),q.text||'','',function(){act(q);}));});
        bar.appendChild(chip('+','Manage quick replies','ott-qr-add',manage));
      }
      /* Sit flush above the composer, measured after layout so the height is real. */
      var hgt=bar.offsetHeight;
      bar.style.top=Math.round(r.top-hgt-6)+'px';
      window.__ottReserve('qr',hgt+6);
    }
    function manage(){(window.__ott_actq=window.__ott_actq||[]).push({op:'quick'});}
    render();if(!window.__ott_qr_init){window.__ott_qr_init=true;setInterval(render,3000);window.addEventListener('resize',render);window.__ottOnMenu(render);}
  })();`;
  wv.executeJavaScript(js).catch(() => {});
}

// ================= Chat Filters =================
// Chat Filters → Label: list WhatsApp labels (Business) and filter the live list by one.
RENDER.chatfilters = (b) => {
  const listBox = el('div', { className: 'rules' });
  b.append(el('div', { className: 'fp-note' }, 'Filter the chat list by a WhatsApp label (Business accounts only). Load labels, then click one to apply it to the live chat list.'),
    el('button', { className: 'btn small', onclick: load }, 'Load labels'), listBox);
  async function load() {
    if (!(await isConnected())) return toast('WhatsApp not linked', 'err');
    const ls = await waExec("(async()=>{try{return (await WPP.labels.getAllLabels()).map(l=>({id:(l.id||'')+'',name:l.name||''}))}catch(e){return[]}})()").catch(() => []);
    listBox.innerHTML = '';
    if (!ls.length) { listBox.append(el('div', { className: 'muted' }, 'No labels found (Business accounts only).')); return toast('No labels', 'err'); }
    ls.forEach(l => listBox.append(el('div', { className: 'qr-item' }, el('div', { className: 'txt' }, l.name),
      el('button', { className: 'btn small', onclick: () => chatFilter(l.name) }, 'Filter'))));
    toast(`${ls.length} labels`);
  }
  load();
};

// ================= Blur Settings =================
RENDER.blur = (b) => {
  const key = `ott_blur_${activeId}`; const c = store.get(key, { names: false, messages: false, photos: false, groupmembers: false });
  const names = chk(c.names), messages = chk(c.messages), photos = chk(c.photos), members = chk(c.groupmembers);
  const save = () => { store.set(key, { names: names.checked, messages: messages.checked, photos: photos.checked, groupmembers: members.checked }); applyBlur(activeId); };
  [names, messages, photos, members].forEach(x => x.onchange = save);
  b.append(el('div', { className: 'fp-note' }, 'Blurs sensitive info in the WhatsApp view on THIS account — ideal for screen-sharing or demos. Toggles apply live.'),
    chkRow(names, 'Blur contact / chat names'),
    chkRow(messages, 'Blur message text'),
    chkRow(photos, 'Blur profile photos'),
    chkRow(members, 'Blur group members'),
    el('div', { className: 'fp-note', style: { marginTop: '4px' } }, 'Note: WhatsApp Web changes its layout occasionally — if a blur stops matching, tell me and I will refresh the selectors.'));
};
function applyBlur(accId) {
  const wv = document.querySelector(`webview[data-acc="${accId}"]`); if (!wv || !wv.dataset.injected) return;
  const c = store.get(`ott_blur_${accId}`, {});
  const r = [];
  if (c.names) r.push('#pane-side span[title],#main header span[title]{filter:blur(5px)!important}');
  if (c.messages) r.push('#main span.selectable-text,#main .copyable-text{filter:blur(5px)!important}');
  if (c.photos) r.push('#pane-side img,#main header img,img[src^="blob:"]{filter:blur(9px)!important}');
  if (c.groupmembers) r.push('#main span[aria-label]{filter:blur(5px)!important}');
  const css = r.join('\n');
  const js = `(()=>{let s=document.getElementById('ott-blur');if(!s){s=document.createElement('style');s.id='ott-blur';(document.head||document.documentElement).appendChild(s);}s.textContent=${JSON.stringify(css)};})()`;
  wv.executeJavaScript(js).catch(() => {});
}

// ================= Auto Offer Post =================
RENDER.autopost = (b) => {
  const cfg = store.get('ott_offers', { on: false, accId: activeId, timezone: 'Asia/Kolkata', startHour: 9, endHour: 22, intervalMin: 60, targets: [], offers: [], nextIndex: 0, lastPostTs: 0, logs: [] });
  cfg.offers = cfg.offers || []; cfg.targets = cfg.targets || []; cfg.logs = cfg.logs || [];
  const save = () => store.set('ott_offers', cfg);

  const chip = el('span', { className: 'chip ' + (cfg.on ? 'on' : 'off') }, cfg.on ? 'Running' : 'Off');
  const on = chk(cfg.on);
  on.onchange = () => { cfg.on = on.checked; chip.className = 'chip ' + (cfg.on ? 'on' : 'off'); chip.textContent = cfg.on ? 'Running' : 'Off'; save(); updateTimer(); };

  const accSel = el('select'); accounts.forEach(a => accSel.append(el('option', { value: a.id }, a.name))); accSel.value = cfg.accId || activeId; accSel.onchange = () => { cfg.accId = accSel.value; save(); };
  const tz = el('select'); ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Jakarta', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'].forEach(z => tz.append(el('option', { value: z }, z))); tz.value = cfg.timezone || 'Asia/Kolkata'; tz.onchange = () => { cfg.timezone = tz.value; save(); updateTimer(); };
  const sh = el('input', { type: 'number', min: '0', max: '23', value: String(cfg.startHour ?? 9), style: { maxWidth: '80px' } });
  const eh = el('input', { type: 'number', min: '1', max: '24', value: String(cfg.endHour ?? 22), style: { maxWidth: '80px' } });
  const iv = el('input', { type: 'number', min: '1', value: String(cfg.intervalMin || 60), style: { maxWidth: '90px' } });
  [sh, eh, iv].forEach(x => x.onchange = () => { cfg.startHour = +sh.value || 0; cfg.endHour = +eh.value || 24; cfg.intervalMin = Math.max(1, +iv.value || 60); save(); updateTimer(); });

  // targets
  const gbox = el('div', {}); let tlist = null;
  const tsum = el('div', { className: 'muted', style: { fontSize: '12px' } }, cfg.targets.length ? cfg.targets.length + ' groups selected' : 'No target groups selected');
  async function loadTargets() {
    if (!(await isConnected())) return toast('WhatsApp not linked', 'err');
    const gs = await waExec("(async()=>{try{const g=await WPP.chat.list({onlyGroups:true});return g.map(x=>({jid:x.id&&x.id._serialized,name:(x.groupMetadata&&x.groupMetadata.subject)||x.name||x.formattedTitle||''}))}catch(e){return[]}})()").catch(() => []);
    if (!gs.length) return toast('No groups found', 'err');
    tlist = checkList(gs, new Set(cfg.targets)); gbox.innerHTML = ''; gbox.append(tlist.node); toast(`${gs.length} groups`);
  }
  const saveTargets = () => { if (!tlist) return toast('Load groups first', 'err'); cfg.targets = tlist.selected().map(x => x.jid); tsum.textContent = cfg.targets.length + ' groups selected'; save(); toast('Targets saved'); };

  // offers
  const offText = el('textarea', { placeholder: 'Offer text / caption' });
  const offAtt = attachControl('*');
  const offList = el('div', { className: 'rules' });
  const drawOffers = () => {
    offList.innerHTML = ''; if (!cfg.offers.length) offList.append(el('div', { className: 'muted' }, 'No offers yet.'));
    cfg.offers.forEach((o, i) => offList.append(el('div', { className: 'qr-item' },
      el('div', { className: 'txt' }, el('b', {}, (o.data ? '📎 ' : '') + (o.text || o.filename || 'offer').slice(0, 30)), el('div', { className: 'muted', style: { fontSize: '12px' } }, (o.text || '').slice(0, 50))),
      el('button', { className: 'btn small ghost', onclick: () => { cfg.offers.splice(i, 1); drawOffers(); save(); } }, '✕'))));
  };
  const addOffer = () => { const f = offAtt.get(); if (!offText.value.trim() && !f) return toast('Add offer text or a file', 'err'); cfg.offers.push({ text: offText.value.trim(), data: f ? f.data : undefined, filename: f ? f.name : undefined }); if (save()) { offText.value = ''; drawOffers(); toast('Offer saved'); } };

  // timer + logs
  const timerEl = el('div', { className: 'fp-note' }, '—');
  const logs = el('div', { className: 'log' });
  const drawLogs = () => { logs.innerHTML = ''; if (!cfg.logs.length) { line(logs, 'No posts yet.'); return; } cfg.logs.slice(0, 30).forEach(l => line(logs, `${new Date(l.ts).toLocaleString()} — ${l.text} (${l.ok} ok${l.fail ? ', ' + l.fail + ' fail' : ''})${l.manual ? ' [manual]' : ''}`, l.ok ? 'ok' : 'bad')); };
  function updateTimer() {
    const c = store.get('ott_offers', cfg);
    if (!c.on) return void (timerEl.textContent = 'Auto-post is off.');
    if (!(c.offers || []).length || !(c.targets || []).length) return void (timerEl.textContent = 'Add offers and target groups.');
    const h = hourInTz(c.timezone);
    if (h < (c.startHour ?? 9) || h >= (c.endHour ?? 22)) return void (timerEl.textContent = `Outside window — resumes at ${c.startHour}:00 ${c.timezone}.`);
    const ms = ((c.lastPostTs || 0) + (c.intervalMin || 60) * 60000) - Date.now();
    timerEl.textContent = ms <= 0 ? 'Next post: due now…' : `Next post in ${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
  const timerIv = setInterval(() => { if (!document.body.contains(timerEl)) return clearInterval(timerIv); updateTimer(); }, 1000);

  b.append(
    el('div', { className: 'fp-note' }, 'Automatically posts your offers to selected groups on a schedule. Runs while the app is open.'),
    el('label', { style: { flexDirection: 'row', alignItems: 'center', gap: '10px' } }, on, 'Enable auto-post', chip),
    el('div', { className: 'row' }, lbl('Post from account', accSel), lbl('Timezone', tz)),
    el('div', { className: 'row' }, lbl('Start hour (0-23)', sh), lbl('End hour (1-24)', eh), lbl('Every N minutes', iv)),
    timerEl,
    el('div', { style: { borderTop: '1px solid var(--line)', margin: '2px 0' } }),
    el('div', { className: 'fp-note' }, 'Target groups:'),
    el('div', { className: 'row' }, el('button', { className: 'btn small', onclick: loadTargets }, 'Load groups'), el('button', { className: 'btn small', onclick: saveTargets }, 'Save targets')), tsum, gbox,
    el('div', { style: { borderTop: '1px solid var(--line)', margin: '2px 0' } }),
    el('div', { className: 'fp-note' }, 'Offers (posted in rotation):'),
    lbl('Offer text / caption', offText), offAtt.node, el('button', { className: 'btn', onclick: addOffer }, '＋ Add offer'), offList,
    el('div', { style: { borderTop: '1px solid var(--line)', margin: '2px 0' } }),
    el('div', { className: 'row' }, el('button', { className: 'btn primary', onclick: () => postOffer(true) }, 'Post now'), el('button', { className: 'btn ghost', onclick: () => { cfg.logs = []; save(); drawLogs(); } }, 'Clear logs')),
    lbl('Logs', logs));
  drawOffers(); drawLogs(); updateTimer();
};

// ================= Lead Manager =================
// Inject a "+ Lead" button into each chat header + capture incoming replies (for stop-on-reply).
function applyLeadButton(accId) {
  const wv = document.querySelector(`webview[data-acc="${accId}"]`); if (!wv || !wv.dataset.injected) return;
  const js = `(function(){
    ${PH_RESOLVER}
    if(!window.__ott_lead_init){window.__ott_lead_init=true;window.__ott_leadq=[];window.__ott_inq=[];window.__ott_cmdq=[];
      try{WPP.on('chat.new_message',function(m){try{if(!m)return;var body=(m.body||'');if(m.fromMe){if(/^\\/invoice/i.test(body.trim()))window.__ott_cmdq.push({chatId:(m.to&&(m.to._serialized||m.to))||'',body:body});return;}var u=m.from&&m.from.user;if(u)window.__ott_inq.push(u);}catch(e){}});}catch(e){}
      setInterval(place,4000);
    }
    async function grab(){try{var c=WPP.chat.getActiveChat&&WPP.chat.getActiveChat();if(!c)return;var u=await _ph(c.id);if(!u&&c.contact&&c.contact.id)u=await _ph(c.contact.id);var nm=(c.contact&&c.contact.name)||c.name||c.formattedTitle||u;var b=document.getElementById('ott-lead-btn');if(!u){if(b){b.textContent='no number';setTimeout(function(){b.textContent='\uFF0B Lead';},1600);}return;}window.__ott_leadq.push({number:u,name:nm});if(b){b.textContent='\u2713 Lead saved';setTimeout(function(){b.textContent='\uFF0B Lead';},1500);}}catch(e){}}
    function place(){var header=document.querySelector('#main header');if(!header||document.getElementById('ott-lead-btn'))return;var b=document.createElement('button');b.id='ott-lead-btn';b.textContent='\\uFF0B Lead';b.style.cssText='margin:0 6px;background:#12b866;color:#fff;border:none;border-radius:16px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;align-self:center;';b.onclick=function(e){e.preventDefault();e.stopPropagation();grab();};var actions=header.lastElementChild||header;try{actions.insertBefore(b,actions.firstChild);}catch(e){header.appendChild(b);}}
    place();
  })();`;
  wv.executeJavaScript(js).catch(() => {});
}

// ---- In-chat action widget (injected into the WhatsApp webview) ----
// Same shape as the Chrome extension: one handle above the message box that fans out into
// labelled actions. The guest page cannot reach the CRM, so a click pushes onto
// window.__ott_actq and pollTick drains it — the queue pattern already used for leads.
let pendingChatAction = null;   // read by the Schedule / Reminder / Invoice panels

function applyChatWidget(accId) {
  const wv = document.querySelector(`webview[data-acc="${accId}"]`); if (!wv || !wv.dataset.injected) return;
  const js = `(function(){
    if(window.__ott_widget_init)return; window.__ott_widget_init=true;
    ${MENU_GUARD}
    ${PH_RESOLVER}
    window.__ott_actq=window.__ott_actq||[];
    var A=[['deal','Deal done','M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01'],
           ['note','Chat note','M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 15h6M9 11h6'],
           ['lead','Save as lead','M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6'],
           ['later','Schedule to this chat','M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'],
           ['remind','Remind me about this','M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0'],
           ['invoice','Send an invoice','M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5']];
    function ico(d){return '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="'+d+'"/></svg>';}
    function css(){
      if(document.getElementById('ott-w-css'))return;
      var s=document.createElement('style'); s.id='ott-w-css';
      /* See the note on #ott-qr-bar: a modest z-index keeps WhatsApp's own menus clickable. */
      s.textContent='#ott-w{position:fixed;z-index:101;pointer-events:none;display:flex;flex-direction:column;align-items:flex-start;gap:7px}'
      +'#ott-w .a,#ott-w .h{pointer-events:auto}'
      +'#ott-w .acts{display:flex;flex-direction:column;gap:6px;opacity:0;pointer-events:none;transform:translateY(8px) scale(.97);transform-origin:bottom left;transition:opacity .18s cubic-bezier(.2,0,0,1),transform .18s cubic-bezier(.2,0,0,1)}'
      +'#ott-w.open .acts{opacity:1;pointer-events:auto;transform:none}'
      +'#ott-w .a{display:flex;align-items:center;gap:9px;height:36px;padding:0 14px 0 11px;border-radius:18px;cursor:pointer;white-space:nowrap;'
      +'font:600 12.5px Inter,-apple-system,"Segoe UI",sans-serif;color:#12a054;background:linear-gradient(180deg,#fff 0%,#f2f6f4 100%);'
      +'border:1px solid rgba(9,30,22,.12);box-shadow:inset 0 1px 0 #fff,0 1px 2px rgba(11,20,26,.18),0 6px 16px -6px rgba(11,20,26,.35);transition:all .16s cubic-bezier(.2,0,0,1)}'
      +'#ott-w .a:hover{color:#fff;transform:translateX(3px);background:linear-gradient(180deg,#2ee178 0%,#12a054 100%)}'
      +'#ott-w .a:active{transform:translateY(1px)}'
      +'#ott-w .h{position:relative;width:42px;height:42px;border-radius:50%;cursor:pointer;display:grid;place-items:center;color:#04240f;'
      +'font:800 12px Inter,sans-serif;background:linear-gradient(180deg,#3bef8c 0%,#1cbc64 46%,#109a4f 100%);border:1px solid rgba(255,255,255,.3);'
      +'box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 2px 4px rgba(11,20,26,.28),0 10px 24px -8px rgba(18,160,84,.7);transition:transform .2s}'
      +'#ott-w .h:hover{transform:translateY(-2px)}'
      +'@media (prefers-reduced-motion:reduce){#ott-w .acts,#ott-w .a,#ott-w .h{transition:none}}';
      document.documentElement.appendChild(s);
    }
    function build(){
      var ex=document.getElementById('ott-w'); if(ex)return ex;
      css();
      var w=document.createElement('div'); w.id='ott-w';
      var acts=document.createElement('div'); acts.className='acts';
      A.forEach(function(a){
        var b=document.createElement('button'); b.className='a'; b.type='button';
        b.innerHTML=ico(a[2])+'<span>'+a[1]+'</span>';
        b.onclick=function(e){e.preventDefault();e.stopPropagation();push(a[0]);w.classList.remove('open');};
        acts.appendChild(b);
      });
      var h=document.createElement('button'); h.className='h'; h.type='button'; h.title='WA-CRM actions'; h.textContent='WA';
      h.onclick=function(e){e.preventDefault();e.stopPropagation();w.classList.toggle('open');};
      w.appendChild(acts); w.appendChild(h);
      document.body.appendChild(w);
      document.addEventListener('click',function(e){if(!w.contains(e.target))w.classList.remove('open');},true);
      document.addEventListener('keydown',function(e){if(e.key==='Escape')w.classList.remove('open');});
      return w;
    }
    async function push(op){
      try{
        var c=WPP.chat.getActiveChat&&WPP.chat.getActiveChat();
        if(!c)return;
        // c.id.user is an internal LID on many chats now, not a phone number. Resolve it,
        // and refuse rather than hand the CRM an id that can never be messaged.
        var u=await _ph(c.id);
        if(!u&&c.contact&&c.contact.id)u=await _ph(c.contact.id);
        var nm=(c.contact&&c.contact.name)||c.name||c.formattedTitle||u;
        if(!u){alert('WhatsApp does not expose a phone number for this chat, so it cannot be saved.');return;}
        window.__ott_actq.push({op:op,number:u,name:nm});
      }catch(e){}
    }
    // Anchor to the composer so the widget sits inside the conversation at any width and
    // never lands on WhatsApp's own left rail.
    function place(){
      var w=build();
      var main=document.querySelector('#main');
      if(!main){w.style.display='none';return;}
      var r=main.getBoundingClientRect();
      if(r.width<320){w.style.display='none';return;}
      /* WhatsApp's own menus (attach, emoji, context) open over the composer — exactly
         where this sits. Ours is on a higher layer, so it would swallow their clicks.
         Stand down while any of them is open. */
      var f=main.querySelector('footer'); var fr=f?f.getBoundingClientRect():null;
      var bottom=(fr&&fr.height>20)?fr.top:r.bottom;
      /* The quick-reply strip occupies the same left edge just above the composer, and we
         sit on a higher layer — so without this the handle covered the first chips and ate
         their clicks. Stack above the strip whenever it is showing. */
      var qb=document.getElementById('ott-qr-bar');
      if(qb&&qb.style.display!=='none'){
        var qr=qb.getBoundingClientRect();
        if(qr.height>0)bottom=Math.min(bottom,qr.top-8);
      }
      var h=w.offsetHeight||250;
      var left=Math.round(r.left+14), top=Math.round(Math.max(r.top+8,bottom-h-14));
      /* Collapsed, the action column is still laid out (opacity 0, no pointer events), so
         w's own box is ~250px of mostly nothing. Test the handle instead, or a tall menu
         overlapping only the invisible part would hide the widget for no reason. */
      var hit=w.querySelector('.h'), hh=(hit&&hit.offsetHeight)||42, hw=(hit&&hit.offsetWidth)||42;
      var open=w.className.indexOf('open')>-1;
      var box=open?{left:left,top:top,right:left+(w.offsetWidth||220),bottom:top+h}
                  :{left:left,top:top+h-hh,right:left+hw,bottom:top+h};
      if(window.__ottMenuOpen(box)){w.style.display='none';window.__ottReserve('w',0);return;}
      w.style.display='flex';
      w.style.left=left+'px';
      w.style.top=top+'px';
      /* Only the handle is ever visible when closed, so that is all we reserve. */
      window.__ottReserve('w',hh+10);
    }
    place(); setInterval(place,1200); window.addEventListener('resize',place);
    /* A 1.2s poll would leave the menu blocked for up to a second, which reads as
       "the button does nothing". React to the DOM change instead. */
    window.__ottOnMenu(place);
  })();`;
  wv.executeJavaScript(js).catch(() => {});
}

// One widget click, handled in the host where the CRM data lives. Rather than rebuild
// forms here, this prefills the feature panel that already knows how to do the job.
async function handleChatAction(a) {
  if (!a) return;

  // Opening a manager panel needs no chat context, so it runs before the number check.
  if (a.op === 'quick') { const f = FEATURES.find((x) => x.id === 'quick'); if (f) openFeature(f); return; }

  if (!a.number) return;
  const num = digits(String(a.number));
  if (!num) return;
  const name = a.name || num;

  if (a.op === 'lead') { saveLead({ number: num, name }); return; }

  if (a.op === 'note') { noteModal(num, name); return; }

  if (a.op === 'deal') { dealModal(num, name); return; }

  const target = { later: 'schedule', remind: 'reminder', invoice: 'invoice' }[a.op];
  if (!target) return;
  pendingChatAction = { op: a.op, number: num, name };
  const f = FEATURES.find((x) => x.id === target);
  if (f) openFeature(f);
}

// (queue draining is now folded into pollTick — one IPC round-trip instead of two)
function parseInvoiceCommand(body) {
  const lines = String(body).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  if (lines.length > 1 && /^\/invoice$/i.test(lines[0])) {
    const customer = { name: '', phone: '', email: '', address: '', gstin: '', state: '' }; const items = []; let discount = 0, notes = '', template = '';
    for (const l of lines.slice(1)) {
      const idx = l.indexOf(':'); if (idx < 0) continue;
      const k = l.slice(0, idx).trim().toLowerCase(), val = l.slice(idx + 1).trim();
      if (k === 'to') customer.name = val; else if (k === 'phone') customer.phone = val; else if (k === 'email') customer.email = val;
      else if (k === 'address') customer.address = val; else if (k === 'gstin') customer.gstin = val; else if (k === 'state') customer.state = val;
      else if (k === 'discount') discount = +val || 0; else if (k === 'notes') notes = val; else if (k === 'template') template = val;
      else if (k === 'item') { const p = val.split('|').map(x => x.trim()); items.push({ desc: p[0] || '', qty: +p[1] || 1, price: +p[2] || 0, hsn: p[3] || '', gst: +p[4] || 0 }); }
    }
    return { customer, items, discount, notes, template };
  }
  const rest = lines.join(' ').replace(/^\/invoice/i, '').trim();
  const parts = rest.split('|').map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const customer = { name: parts[0] || '', phone: parts[1] || '', email: '', address: '', gstin: '', state: '' };
  const items = []; let discount = 0;
  for (const p of parts.slice(2)) { if (/^discount\s*=/.test(p)) { discount = +p.split('=')[1] || 0; continue; } const s = p.split(':'); items.push({ desc: s[0] || '', qty: +s[1] || 1, price: +s[2] || 0, hsn: '', gst: 0 }); }
  return { customer, items, discount, notes: '', template: '' };
}
async function processInvoiceCommand(cmd) {
  const parsed = parseInvoiceCommand(cmd.body); if (!parsed || !parsed.items.length) return;
  const cfg = store.get('ott_invoice_cfg', null); if (!cfg || !cfg.name) { toast('/invoice: set up Business in the Invoice tab first', 'err'); return; }
  const v = invoiceCompute(parsed.items.filter(i => i.desc), parsed.discount, cfg, parsed.customer);
  if (!v.rows.length) return;
  const number = (cfg.prefix || 'INV-') + String(cfg.counter || 1).padStart(4, '0');
  const inv = { ...v, number, date: new Date().toLocaleDateString('en-IN'), cfg, customer: parsed.customer, template: parsed.template || cfg.template || 'classic', notes: parsed.notes };
  const res = await ott.renderInvoicePdf(invoiceHtml(inv)); if (!res.ok) { toast('/invoice PDF failed', 'err'); return; }
  const jid = digits(parsed.customer.phone) ? digits(parsed.customer.phone) + '@c.us' : cmd.chatId;
  if (!jid) return;
  await sendMediaToJidOn(activeId, jid, res.data, 'Invoice ' + number, number + '.pdf');
  cfg.counter = (cfg.counter || 1) + 1; store.set('ott_invoice_cfg', cfg);
  logInvoice({ inv, number, customer: parsed.customer });
  toast('Invoice ' + number + ' generated via /invoice');
}
function saveLead(it) {
  const num = digits(it.number || ''); if (!num) return;
  const leads = store.get('ott_leads', []);
  if (leads.some(L => L.number === num)) { toast((it.name || num) + ' is already a lead'); return; }
  leads.unshift({ id: 'L' + Date.now() + Math.random().toString(36).slice(2, 6), number: num, name: it.name || num, type: 'new', status: 'contacted', notes: '', source: 'chat', createdTs: Date.now(), accId: activeId, seqId: null, seqStep: 0, seqActive: false, seqNextTs: 0, logs: [] });
  store.set('ott_leads', leads); toast('Lead saved: ' + (it.name || num));
  if (openFeatureId === 'leads') refreshPanel('leads');
}
function markRepliedLeads(nums) {
  const set = new Set(nums.map(n => digits(String(n)))); const leads = store.get('ott_leads', []); const seqs = store.get('ott_lead_seqs', []); let ch = false;
  for (const L of leads) if (L.seqActive && set.has(L.number)) { const seq = seqs.find(s => s.id === L.seqId); if (!seq || seq.stopOnReply !== false) { L.seqActive = false; L.logs = [{ ts: Date.now(), text: 'Follow-up stopped (lead replied)', ok: true }, ...(L.logs || [])].slice(0, 30); ch = true; } }
  if (ch) { store.set('ott_leads', leads); if (openFeatureId === 'leads') refreshPanel('leads'); }
}
function updateLead(id, patch) { const leads = store.get('ott_leads', []); const L = leads.find(x => x.id === id); if (L) { Object.assign(L, patch); store.set('ott_leads', leads); } }
function deleteLead(id) { store.set('ott_leads', store.get('ott_leads', []).filter(x => x.id !== id)); }
const stepDelayMs = (s) => (s.delayValue || 0) * ({ minutes: 60000, hours: 3600000, days: 86400000 }[s.delayUnit] || 86400000);
function startSequence(leadId, seqId) {
  const seq = store.get('ott_lead_seqs', []).find(s => s.id === seqId); if (!seq || !seq.steps.length) return;
  const leads = store.get('ott_leads', []); const L = leads.find(x => x.id === leadId); if (!L) return;
  L.seqId = seqId; L.seqStep = 0; L.seqActive = true; L.seqNextTs = Date.now() + stepDelayMs(seq.steps[0]); L.status = 'followup';
  L.logs = [{ ts: Date.now(), text: 'Follow-up "' + seq.name + '" started', ok: true }, ...(L.logs || [])].slice(0, 30);
  store.set('ott_leads', leads); toast('Follow-up started');
}
function leadFollowupTick() {
  const leads = store.get('ott_leads', []); const seqs = store.get('ott_lead_seqs', []); const now = Date.now(); let ch = false;
  for (const L of leads) {
    if (!L.seqActive || !L.seqId) continue;
    const seq = seqs.find(s => s.id === L.seqId); if (!seq || !seq.steps.length) { L.seqActive = false; ch = true; continue; }
    if (L.seqNextTs && L.seqNextTs <= now) {
      const step = seq.steps[L.seqStep]; if (step) sendFollowup(L, step);
      L.seqStep++;
      if (L.seqStep >= seq.steps.length) { L.seqActive = false; L.logs = [{ ts: now, text: 'Sequence completed', ok: true }, ...(L.logs || [])].slice(0, 30); }
      else L.seqNextTs = now + stepDelayMs(seq.steps[L.seqStep]);
      ch = true;
    }
  }
  if (ch) { store.set('ott_leads', leads); if (openFeatureId === 'leads') refreshPanel('leads'); }
}
async function sendFollowup(L, step) {
  const accId = L.accId && document.querySelector(`webview[data-acc="${L.accId}"]`) ? L.accId : activeId;
  const jid = digits(L.number) + '@c.us';
  const r = step.data ? await sendMediaToJidOn(accId, jid, step.data, step.text, step.filename) : await sendToJidOn(accId, jid, step.text);
  const leads = store.get('ott_leads', []); const LL = leads.find(x => x.id === L.id);
  if (LL) { LL.logs = [{ ts: Date.now(), text: (step.text || step.filename || 'follow-up').slice(0, 40), ok: r.ok }, ...(LL.logs || [])].slice(0, 30); store.set('ott_leads', leads); }
}

const LEAD_TYPES = [['new', 'New'], ['hot', 'Hot'], ['warm', 'Warm'], ['cold', 'Cold']];
const LEAD_STATUSES = [['contacted', 'Contacted'], ['followup', 'Follow-up'], ['proposal', 'Proposal sent'], ['won', 'Won'], ['lost', 'Lost']];
const isoDay = (ts) => new Date(ts).toISOString().slice(0, 10);
// One-time migration: give older leads a type, and move legacy 'new' status into the type field.
function migrateLeads() {
  const leads = store.get('ott_leads', []); let ch = false;
  for (const L of leads) {
    if (!L.type) { L.type = (L.status === 'new') ? 'new' : 'warm'; ch = true; }
    if (L.status === 'new') { L.status = 'contacted'; ch = true; }
  }
  if (ch) store.set('ott_leads', leads);
}
function exportLeadsCsv(rows, from, to) {
  const acctName = (id) => (accounts.find(a => a.id === id) || {}).name || '';
  const out = rows.map(L => ({
    name: L.name || '', number: L.number || '', type: L.type || 'new', status: L.status || '',
    source: L.source || '', created: new Date(L.createdTs || Date.now()).toLocaleString(),
    notes: (L.notes || '').replace(/[\r\n]+/g, ' '), followup: L.seqActive ? 'active' : '', account: acctName(L.accId),
  }));
  downloadCsv(`ott24x7-leads-${from || 'all'}_to_${to || 'all'}.csv`, out, ['name', 'number', 'type', 'status', 'source', 'created', 'notes', 'followup', 'account']);
  toast(`Exported ${rows.length} lead(s)`);
}

RENDER.leads = (b) => {
  migrateLeads();
  const mode = el('select'); [['leads', 'Leads'], ['report', 'Reports'], ['seqs', 'Follow-up Sequences']].forEach(([v, n]) => mode.append(el('option', { value: v }, n)));
  const boxc = el('div', {});
  mode.onchange = render;
  b.append(el('div', { className: 'fp-note' }, 'Save any chat as a lead with the “＋ Lead” button in its header. Set a type & status, track the pipeline, and export reports.'), lbl('View', mode), boxc);
  render();
  function render() { boxc.innerHTML = ''; mode.value === 'leads' ? leadsView() : mode.value === 'report' ? reportView() : seqsView(); }

  function leadsView() {
    const typeF = el('select'); [['all', 'All types'], ...LEAD_TYPES].forEach(([v, n]) => typeF.append(el('option', { value: v }, n)));
    const filter = el('select'); [['all', 'All statuses'], ...LEAD_STATUSES].forEach(([v, n]) => filter.append(el('option', { value: v }, n)));
    const search = el('input', { placeholder: 'Search name / number' });
    const list = el('div', {});
    const draw = () => {
      list.innerHTML = '';
      const q = (search.value || '').toLowerCase(), f = filter.value, tf = typeF.value;
      const leads = store.get('ott_leads', []).filter(L =>
        (f === 'all' || L.status === f) && (tf === 'all' || (L.type || 'new') === tf) &&
        (!q || (L.name || '').toLowerCase().includes(q) || L.number.includes(q)));
      if (!leads.length) { list.append(el('div', { className: 'muted' }, 'No leads match. Open a chat and click “＋ Lead”.')); return; }
      list.append(el('div', { className: 'muted', style: { fontSize: '12px', margin: '0 0 8px' } }, leads.length + ' lead(s)'));
      leads.forEach(L => list.append(leadCard(L, draw)));
    };
    typeF.onchange = draw; filter.onchange = draw; search.oninput = draw;
    boxc.append(el('div', { className: 'row' }, lbl('Type', typeF), lbl('Status', filter), lbl('Search', search)), list);
    draw();
  }

  function reportView() {
    const all = store.get('ott_leads', []);
    const fromEl = el('input', { type: 'date', value: isoDay(Date.now() - 29 * 86400000) });
    const toEl = el('input', { type: 'date', value: isoDay(Date.now()) });
    const body = el('div', {});
    const compute = () => {
      const f = fromEl.value ? new Date(fromEl.value + 'T00:00:00').getTime() : 0;
      const t = toEl.value ? new Date(toEl.value + 'T23:59:59').getTime() : Date.now();
      return all.filter(L => (L.createdTs || 0) >= f && (L.createdTs || 0) <= t);
    };
    const chip = (label, val, color) => el('div', { className: 'card', style: { padding: '12px 14px', flex: '1', minWidth: '96px' } },
      el('div', { className: 'muted', style: { fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.4px' } }, label),
      el('div', { style: { fontSize: '24px', fontWeight: '800', color: color || 'var(--text)' } }, String(val)));
    const draw = () => {
      body.innerHTML = '';
      const rows = compute();
      const byStatus = {}, byType = {};
      rows.forEach(L => { byStatus[L.status] = (byStatus[L.status] || 0) + 1; byType[L.type || 'new'] = (byType[L.type || 'new'] || 0) + 1; });
      const won = byStatus.won || 0, lost = byStatus.lost || 0;
      const rate = (won + lost) ? Math.round(won / (won + lost) * 100) : 0;
      body.append(
        el('div', { className: 'row', style: { flexWrap: 'wrap', gap: '10px' } },
          chip('Total', rows.length), chip('Won', won, '#12b866'), chip('Lost', lost, '#e5484d'), chip('Win rate', rate + '%', '#3b82f6')),
        el('div', { className: 'fp-note', style: { marginTop: '14px' } }, 'By status'),
        el('div', { className: 'row', style: { flexWrap: 'wrap', gap: '8px' } }, ...LEAD_STATUSES.map(([v]) => el('div', { className: 'card', style: { padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px' } }, statusTag(v), el('b', {}, String(byStatus[v] || 0))))),
        el('div', { className: 'fp-note', style: { marginTop: '14px' } }, 'By type'),
        el('div', { className: 'row', style: { flexWrap: 'wrap', gap: '8px' } }, ...LEAD_TYPES.map(([v]) => el('div', { className: 'card', style: { padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px' } }, typeTag(v), el('b', {}, String(byType[v] || 0))))),
        el('div', { className: 'row', style: { marginTop: '16px' } },
          el('button', { className: 'btn primary', onclick: () => exportLeadsCsv(compute(), fromEl.value, toEl.value) }, '⬇ Export CSV (' + rows.length + ')')));
    };
    const quick = el('select'); [['0', 'Custom'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last year']].forEach(([v, n]) => quick.append(el('option', { value: v }, n))); quick.value = '30';
    quick.onchange = () => { const d = +quick.value; if (d > 0) { fromEl.value = isoDay(Date.now() - (d - 1) * 86400000); toEl.value = isoDay(Date.now()); draw(); } };
    fromEl.onchange = () => { quick.value = '0'; draw(); };
    toEl.onchange = () => { quick.value = '0'; draw(); };
    boxc.append(el('div', { className: 'row' }, lbl('Range', quick), lbl('From', fromEl), lbl('To', toEl)), body);
    draw();
  }

  function leadCard(L, refresh) {
    const seqs = store.get('ott_lead_seqs', []);
    const typeSel = el('select'); LEAD_TYPES.forEach(([v, n]) => typeSel.append(el('option', { value: v }, n))); typeSel.value = L.type || 'new';
    typeSel.onchange = () => { updateLead(L.id, { type: typeSel.value }); refresh(); };
    const statusSel = el('select'); LEAD_STATUSES.forEach(([v, n]) => statusSel.append(el('option', { value: v }, n))); statusSel.value = L.status;
    statusSel.onchange = () => { updateLead(L.id, { status: statusSel.value }); refresh(); };
    const seqSel = el('select'); seqSel.append(el('option', { value: '' }, '— sequence —')); seqs.forEach(s => seqSel.append(el('option', { value: s.id }, s.name)));
    const next = L.seqActive && L.seqNextTs ? '  · next ' + new Date(L.seqNextTs).toLocaleString() : '';
    return el('div', { className: 'card', style: { padding: '12px 14px', marginBottom: '8px' } },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' } },
        el('div', {}, el('b', {}, L.name || L.number), el('div', { className: 'muted', style: { fontSize: '12px' } }, L.number + (L.seqActive ? '  · follow-up active' + next : ''))),
        el('div', { style: { display: 'flex', gap: '6px' } }, typeTag(L.type || 'new'), statusTag(L.status))),
      L.notes ? el('div', { className: 'muted', style: { fontSize: '12px', marginTop: '6px' } }, '📝 ' + L.notes) : null,
      el('div', { className: 'row', style: { marginTop: '8px' } }, lbl('Type', typeSel), lbl('Status', statusSel)),
      el('div', { className: 'row', style: { marginTop: '6px' } },
        el('button', { className: 'btn small', onclick: async () => { const m = await promptModal('Message ' + (L.name || L.number), 'Type a message'); if (m) { const r = await sendToJidOn(L.accId || activeId, digits(L.number) + '@c.us', m); toast(r.ok ? 'Sent' : 'Failed', r.ok ? 'ok' : 'err'); } } }, 'Message'),
        seqSel,
        el('button', { className: 'btn small', onclick: () => { if (!seqSel.value) return toast('Pick a sequence', 'err'); startSequence(L.id, seqSel.value); refresh(); } }, 'Start follow-up'),
        L.seqActive ? el('button', { className: 'btn small ghost', onclick: () => { updateLead(L.id, { seqActive: false }); refresh(); } }, 'Stop') : null),
      el('div', { className: 'row', style: { marginTop: '6px' } },
        el('button', { className: 'btn small ghost', onclick: async () => { const n = await promptModal('Note for ' + (L.name || L.number), 'Add a note', L.notes || ''); if (n != null) { updateLead(L.id, { notes: n }); refresh(); } } }, 'Note'),
        el('button', { className: 'btn small ghost', style: { color: 'var(--danger)' }, onclick: () => { if (confirm('Delete this lead?')) { deleteLead(L.id); refresh(); } } }, 'Delete')));
  }

  function seqsView() {
    const name = el('input', { placeholder: 'Sequence name' });
    const stopReply = chk(true);
    let steps = []; const stepsBox = el('div', { className: 'rules' });
    const stepText = el('textarea', { placeholder: 'Step message / caption' });
    const stepAtt = attachControl('*'); stepAtt.node.style.display = 'flex';
    const dval = el('input', { type: 'number', value: '1', min: '0', style: { maxWidth: '80px' } });
    const dunit = el('select'); ['minutes', 'hours', 'days'].forEach(u => dunit.append(el('option', { value: u }, u))); dunit.value = 'days';
    const drawSteps = () => { stepsBox.innerHTML = ''; if (!steps.length) stepsBox.append(el('div', { className: 'muted' }, 'No steps yet.')); steps.forEach((s, i) => stepsBox.append(el('div', { className: 'qr-item' }, el('div', { className: 'txt' }, el('b', {}, 'After ' + s.delayValue + ' ' + s.delayUnit), el('div', { className: 'muted', style: { fontSize: '12px' } }, (s.data ? '📎 ' : '') + (s.text || s.filename || '').slice(0, 50))), el('button', { className: 'btn small ghost', onclick: () => { steps.splice(i, 1); drawSteps(); } }, '✕')))); };
    const listSeqs = el('div', {});
    const drawList = () => { listSeqs.innerHTML = ''; const seqs = store.get('ott_lead_seqs', []); if (!seqs.length) { listSeqs.append(el('div', { className: 'muted' }, 'No sequences.')); return; } seqs.forEach(s => listSeqs.append(el('div', { className: 'qr-item' }, el('div', { className: 'txt' }, el('b', {}, s.name), el('div', { className: 'muted', style: { fontSize: '12px' } }, s.steps.length + ' steps' + (s.stopOnReply ? ' · stops on reply' : ''))), el('button', { className: 'btn small ghost', onclick: () => { store.set('ott_lead_seqs', store.get('ott_lead_seqs', []).filter(x => x.id !== s.id)); drawList(); } }, 'Delete')))); };
    boxc.append(
      el('div', { className: 'fp-note' }, 'A sequence auto-sends its steps to a lead at the set delays, once you start it on that lead.'),
      lbl('Name', name), chkRow(stopReply, 'Stop follow-ups when the lead replies'),
      el('div', { className: 'fp-note' }, 'Add a step:'),
      lbl('Message', stepText), stepAtt.node,
      el('div', { className: 'row' }, lbl('Send after', dval), lbl('Unit', dunit), el('button', { className: 'btn small', onclick: () => { const f = stepAtt.get(); if (!stepText.value.trim() && !f) return toast('Add step message or file', 'err'); steps.push({ text: stepText.value.trim(), data: f ? f.data : undefined, filename: f ? f.name : undefined, delayValue: Math.max(0, +dval.value || 0), delayUnit: dunit.value }); stepText.value = ''; drawSteps(); } }, '＋ Add step')),
      stepsBox,
      el('button', { className: 'btn primary', onclick: () => { if (!name.value.trim()) return toast('Name the sequence', 'err'); if (!steps.length) return toast('Add at least one step', 'err'); const seqs = store.get('ott_lead_seqs', []); seqs.push({ id: 'S' + Date.now(), name: name.value.trim(), stopOnReply: stopReply.checked, steps: steps.slice() }); if (store.set('ott_lead_seqs', seqs)) { name.value = ''; steps = []; drawSteps(); drawList(); toast('Sequence saved'); } } }, 'Save sequence'),
      el('div', { style: { borderTop: '1px solid var(--line)', margin: '6px 0' } }),
      lbl('Saved sequences', listSeqs));
    drawSteps(); drawList();
  }
};

// ================= Invoice =================
const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function toWordsINR(num) {
  num = Math.round(num); if (num === 0) return 'Zero Rupees Only';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = n => n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
  const three = n => (n >= 100 ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? two(n % 100) : '');
  let out = ''; const cr = Math.floor(num / 1e7); num %= 1e7; const l = Math.floor(num / 1e5); num %= 1e5; const t = Math.floor(num / 1e3); num %= 1e3;
  if (cr) out += three(cr) + ' Crore '; if (l) out += two(l) + ' Lakh '; if (t) out += two(t) + ' Thousand '; if (num) out += three(num);
  return out.trim() + ' Rupees Only';
}
function invoiceCompute(items, discount, cfg, customer) {
  const gstOn = !!cfg.gstEnabled;
  const intra = gstOn && cfg.state && customer.state && String(cfg.state).trim() === String(customer.state).trim();
  let subtotal = 0, gstTotal = 0, cgst = 0, sgst = 0, igst = 0;
  const rows = items.map(it => {
    const qty = +it.qty || 0, price = +it.price || 0, pct = gstOn ? (+it.gst || 0) : 0;
    const amount = qty * price, g = amount * pct / 100; subtotal += amount; gstTotal += g;
    if (intra) { cgst += g / 2; sgst += g / 2; } else igst += g;
    return { desc: it.desc, qty, price, hsn: it.hsn || '', pct, amount, gst: g };
  });
  const grandRaw = subtotal - (discount || 0) + gstTotal; const grand = Math.round(grandRaw);
  return { rows, subtotal, discount: discount || 0, gstTotal, cgst, sgst, igst, intra, gstOn, roundOff: grand - grandRaw, grandTotal: grand, amountWords: toWordsINR(grand) };
}
function invoiceHtml(v) {
  const c = v.cfg, cust = v.customer, gst = v.gstOn;
  const accent = { classic: '#2563eb', minimal: '#334155', taxpro: '#059669', corporate: '#475569', luxury: '#b45309', teal: '#0d9488', royal: '#7c3aed', crimson: '#be123c' }[v.template] || '#2563eb';
  const money = n => '₹' + (Math.round(n * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const br = s => escHtml(s).replace(/\n/g, '<br>');
  const head = `<tr><th>#</th><th>Item</th>${gst ? '<th>HSN</th>' : ''}<th class=r>Qty</th><th class=r>Rate</th>${gst ? '<th class=r>GST</th>' : ''}<th class=r>Amount</th></tr>`;
  const body = v.rows.map((r, i) => `<tr><td>${i + 1}</td><td>${escHtml(r.desc)}</td>${gst ? `<td>${escHtml(r.hsn)}</td>` : ''}<td class=r>${r.qty}</td><td class=r>${money(r.price)}</td>${gst ? `<td class=r>${r.pct}%</td>` : ''}<td class=r>${money(r.amount)}</td></tr>`).join('');
  const taxRows = gst ? (v.intra ? `<tr><td>CGST</td><td class=r>${money(v.cgst)}</td></tr><tr><td>SGST</td><td class=r>${money(v.sgst)}</td></tr>` : `<tr><td>IGST</td><td class=r>${money(v.igst)}</td></tr>`) : '';
  const logo = c.logo ? `<img src="${c.logo}" style="max-height:64px;max-width:200px;object-fit:contain">` : `<div style="font-size:22px;font-weight:800;color:${accent}">${escHtml(c.name || 'Your Business')}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:12px;padding:28px}.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${accent};padding-bottom:14px}.biz{font-size:11px;color:#4b5563;line-height:1.5;margin-top:6px}.title{text-align:right}.title h1{font-size:26px;color:${accent};letter-spacing:1px}.title .meta{font-size:11px;color:#4b5563;margin-top:6px;line-height:1.6}.parties{display:flex;justify-content:space-between;margin:18px 0}.box{width:48%}.box .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;margin-bottom:4px}.box .nm{font-weight:700;font-size:13px}.box .sub{font-size:11px;color:#4b5563;line-height:1.5}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:${accent};color:#fff;font-size:11px;text-align:left;padding:8px 10px}td{padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:11px}.r{text-align:right}.totals{display:flex;justify-content:flex-end;margin-top:14px}.totals table{width:280px}.totals td{border:none;padding:5px 10px}.totals .grand td{border-top:2px solid ${accent};font-weight:800;font-size:14px;color:${accent}}.words{margin-top:14px;font-size:11px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px}.foot{margin-top:22px;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:10px;display:flex;justify-content:space-between}</style></head><body>
  <div class="top"><div>${logo}<div class="biz">${br(c.address || '')}${c.phone ? '<br>' + escHtml(c.phone) : ''}${c.email ? ' · ' + escHtml(c.email) : ''}${gst && c.gstin ? '<br>GSTIN: ' + escHtml(c.gstin) : ''}</div></div><div class="title"><h1>${gst ? 'TAX INVOICE' : 'INVOICE'}</h1><div class="meta"><b>${escHtml(v.number)}</b><br>Date: ${escHtml(v.date)}</div></div></div>
  <div class="parties"><div class="box"><div class="lbl">Bill To</div><div class="nm">${escHtml(cust.name)}</div><div class="sub">${br(cust.address || '')}${cust.phone ? '<br>' + escHtml(cust.phone) : ''}${gst && cust.gstin ? '<br>GSTIN: ' + escHtml(cust.gstin) : ''}</div></div></div>
  <table><thead>${head}</thead><tbody>${body}</tbody></table>
  <div class="totals"><table><tr><td>Subtotal</td><td class=r>${money(v.subtotal)}</td></tr>${v.discount ? `<tr><td>Discount</td><td class=r>- ${money(v.discount)}</td></tr>` : ''}${taxRows}${v.roundOff ? `<tr><td>Round off</td><td class=r>${money(v.roundOff)}</td></tr>` : ''}<tr class="grand"><td>Grand Total</td><td class=r>${money(v.grandTotal)}</td></tr></table></div>
  <div class="words"><b>Amount in words:</b> ${escHtml(v.amountWords)}</div>${v.notes ? `<div class="words"><b>Notes:</b> ${escHtml(v.notes)}</div>` : ''}${c.bank ? `<div class="words"><b>Payment details:</b><br>${br(c.bank)}</div>` : ''}
  <div class="foot"><span>Thank you for your business.</span><span>${escHtml(c.name || '')}</span></div></body></html>`;
}
function logInvoice(r) { const inv = store.get('ott_invoices', []); inv.unshift({ number: r.number, name: r.customer.name, phone: r.customer.phone, total: r.inv.grandTotal, ts: Date.now() }); store.set('ott_invoices', inv.slice(0, 200)); }
// Pick a customer from the WhatsApp chat list (single-select modal).
async function pickCustomer(onPick) {
  if (!(await isConnected())) return toast('WhatsApp not linked', 'err');
  const chats = await waExec(`(async()=>{try{${PH_RESOLVER};const l=await WPP.chat.list();var o=[];for(var i=0;i<l.length;i++){var c=l[i];if(c.isGroup||(c.id&&c.id.server==='g.us'))continue;var ph=await _ph(c.id);if(!ph)continue;o.push({number:ph,name:(c.contact&&c.contact.name)||c.name||''});}return o;}catch(e){return[]}})()`).catch(() => []);
  if (!chats.length) return toast('No customers with a real number found (WhatsApp hides some as privacy LIDs)', 'err');
  const search = el('input', { placeholder: 'Search name / number' });
  const list = el('div', { className: 'checklist-body', style: { maxHeight: '320px' } });
  const close = () => scrim.remove();
  const draw = () => { list.innerHTML = ''; const q = (search.value || '').toLowerCase(); chats.filter(c => !q || (c.name || '').toLowerCase().includes(q) || c.number.includes(q)).slice(0, 250).forEach(c => list.append(el('div', { className: 'checkrow', style: { cursor: 'pointer' }, onclick: () => { onPick(c); close(); } }, (c.name || c.number) + '  ', el('span', { className: 'muted', style: { fontSize: '11px' } }, c.number)))); };
  search.oninput = draw; draw();
  const box = el('div', { className: 'modal-box', style: { width: '420px' } }, el('h3', {}, 'Choose customer'), search, list, el('div', { className: 'row', style: { justifyContent: 'flex-end' } }, el('button', { className: 'btn ghost', onclick: close }, 'Cancel')));
  const scrim = el('div', { className: 'modal-scrim', onclick: (e) => { if (e.target === scrim) close(); } }, box);
  document.body.append(scrim);
}
// Live HTML preview of an invoice in a modal iframe.
function previewInvoice(html) {
  const iframe = el('iframe', { style: { width: '100%', height: '70vh', border: 'none', background: '#fff', borderRadius: '8px' } });
  const box = el('div', { className: 'modal-box', style: { width: '720px', maxWidth: '94vw' } }, el('h3', {}, 'Invoice preview'), iframe, el('div', { className: 'row', style: { justifyContent: 'flex-end' } }, el('button', { className: 'btn ghost', onclick: () => scrim.remove() }, 'Close')));
  const scrim = el('div', { className: 'modal-scrim', onclick: (e) => { if (e.target === scrim) scrim.remove(); } }, box);
  document.body.append(scrim); iframe.srcdoc = html;
}

RENDER.invoice = (b) => {
  const cfg = store.get('ott_invoice_cfg', { name: '', address: '', gstin: '', state: '', gstEnabled: true, logo: '', phone: '', email: '', bank: '', prefix: 'INV-', counter: 1, template: 'classic' });
  const saveCfg = () => store.set('ott_invoice_cfg', cfg);
  const inp = (v, ph) => el('input', { value: v || '', placeholder: ph || '' });
  const ta = (v, ph) => { const t = el('textarea', { placeholder: ph || '' }); t.value = v || ''; return t; };
  const mode = el('select'); [['create', 'Create Invoice'], ['items', 'Saved Items'], ['templates', 'Templates'], ['business', 'Business Settings']].forEach(([v, n]) => mode.append(el('option', { value: v }, n)));
  const boxc = el('div', {}); mode.onchange = render;
  b.append(el('div', { className: 'fp-note' }, 'Generate GST invoices and send them as a PDF on WhatsApp. Set up your business first.'), lbl('View', mode), boxc);
  if (!cfg.name) mode.value = 'business';
  render();
  function render() { boxc.innerHTML = ''; const v = mode.value; if (v === 'create') createView(); else if (v === 'items') itemsView(); else if (v === 'templates') templatesView(); else businessView(); }
  const TEMPLATE_NAMES = { classic: 'Classic Blue', minimal: 'Minimal', taxpro: 'GST Tax Pro', corporate: 'Corporate Grey', luxury: 'Luxury Gold', teal: 'Teal Stripe', royal: 'Royal Purple', crimson: 'Crimson' };

  function itemsView() {
    const name = inp('', 'Item / service name'), price = el('input', { type: 'number', value: '0' });
    const hsn = cfg.gstEnabled ? inp('', 'HSN') : null, gst = cfg.gstEnabled ? el('input', { type: 'number', value: '18' }) : null;
    const list = el('div', { className: 'rules' });
    const draw = () => {
      list.innerHTML = ''; const its = store.get('ott_invoice_items', []);
      if (!its.length) { list.append(el('div', { className: 'muted' }, 'No saved items yet.')); return; }
      its.forEach((it, i) => list.append(el('div', { className: 'qr-item' }, el('div', { className: 'txt' }, el('b', {}, it.name), el('div', { className: 'muted', style: { fontSize: '12px' } }, '₹' + it.price + (cfg.gstEnabled && it.gst ? ' · GST ' + it.gst + '%' : '') + (it.hsn ? ' · HSN ' + it.hsn : ''))), el('button', { className: 'btn small ghost', onclick: () => { const a = store.get('ott_invoice_items', []); a.splice(i, 1); store.set('ott_invoice_items', a); draw(); } }, '✕'))));
    };
    boxc.append(el('div', { className: 'fp-note' }, 'Save your products/services once — then add them to any invoice in one click.'),
      lbl('Item name', name), el('div', { className: 'row' }, lbl('Price ₹', price), ...(cfg.gstEnabled ? [lbl('HSN', hsn), lbl('GST%', gst)] : [])),
      el('button', { className: 'btn primary', onclick: () => { if (!name.value.trim()) return toast('Item name required', 'err'); const a = store.get('ott_invoice_items', []); a.push({ name: name.value.trim(), price: +price.value || 0, hsn: hsn ? hsn.value.trim() : '', gst: gst ? +gst.value || 0 : 0 }); if (store.set('ott_invoice_items', a)) { name.value = ''; price.value = '0'; draw(); toast('Item saved'); } } }, 'Save item'),
      el('div', { style: { borderTop: '1px solid var(--line)', margin: '6px 0' } }), lbl('Saved items', list));
    draw();
  }
  function templatesView() {
    boxc.innerHTML = '';
    const sampleCust = { name: 'Sample Customer', phone: '', address: '123 Business Road, City', gstin: '29ABCDE1234F1Z5', state: cfg.state || '29' };
    const data = invoiceCompute([{ desc: 'Sample Product', qty: 2, price: 499, hsn: '998361', gst: 18 }, { desc: 'Service Fee', qty: 1, price: 1000, hsn: '998361', gst: 18 }], 100, cfg, sampleCust);
    boxc.append(el('div', { className: 'fp-note' }, 'Preview any template and set it as your default. You can still switch template per-invoice in Create Invoice.'),
      el('div', { className: 'muted', style: { fontSize: '12px', marginBottom: '6px' } }, 'Current default: ' + (TEMPLATE_NAMES[cfg.template] || 'Classic Blue')));
    Object.entries(TEMPLATE_NAMES).forEach(([id, nm]) => boxc.append(el('div', { className: 'qr-item' },
      el('div', { className: 'txt' }, el('b', {}, nm), cfg.template === id ? el('span', { className: 'muted', style: { fontSize: '11px' } }, 'default') : null),
      el('div', { className: 'row' },
        el('button', { className: 'btn small', onclick: () => previewInvoice(invoiceHtml({ ...data, cfg, customer: sampleCust, template: id, number: (cfg.prefix || 'INV-') + '0001', date: new Date().toLocaleDateString('en-IN'), notes: 'This is a sample preview.' })) }, 'Preview'),
        el('button', { className: 'btn small primary', onclick: () => { cfg.template = id; saveCfg(); toast(nm + ' set as default'); templatesView(); } }, 'Set default'))))); }


  function businessView() {
    const name = inp(cfg.name, 'Business name'), addr = ta(cfg.address, 'Address'), gstin = inp(cfg.gstin, 'GSTIN'), state = inp(cfg.state, 'State code e.g. 29'), phone = inp(cfg.phone, 'Phone'), email = inp(cfg.email, 'Email'), bank = ta(cfg.bank, 'Bank / UPI details'), prefix = inp(cfg.prefix, 'INV-'), counter = el('input', { type: 'number', value: String(cfg.counter || 1) });
    const gstOn = chk(cfg.gstEnabled); const logoAtt = attachControl('image/*'); logoAtt.node.style.display = 'flex';
    boxc.append(lbl('Business name', name), lbl('Address', addr), chkRow(gstOn, 'GST invoices (CGST/SGST/IGST)'),
      el('div', { className: 'row' }, lbl('GSTIN', gstin), lbl('Home state code', state)),
      el('div', { className: 'row' }, lbl('Phone', phone), lbl('Email', email)), lbl('Bank / UPI details', bank),
      el('div', { className: 'row' }, lbl('Invoice prefix', prefix), lbl('Next number', counter)), lbl('Logo (optional)', logoAtt.node),
      el('button', { className: 'btn primary', onclick: () => { Object.assign(cfg, { name: name.value.trim(), address: addr.value, gstin: gstin.value.trim(), state: state.value.trim(), gstEnabled: gstOn.checked, phone: phone.value.trim(), email: email.value.trim(), bank: bank.value, prefix: prefix.value.trim() || 'INV-', counter: +counter.value || 1 }); const f = logoAtt.get(); if (f) cfg.logo = f.data; if (saveCfg()) { toast('Business saved'); } } }, 'Save business'));
  }
  function createView() {
    const cn = inp('', 'Customer name'), cp = inp('', 'Customer phone (country code)'), ce = inp('', 'Email (optional)'), ca = ta('', 'Address'), cg = inp('', 'GSTIN (optional)'), cs = inp('', 'State code');
    // Arrived from the in-chat widget: the customer is already known.
    if (pendingChatAction && pendingChatAction.op === 'invoice') {
      cn.value = pendingChatAction.name;
      cp.value = pendingChatAction.number;
      pendingChatAction = null;
    }
    let items = [{ desc: '', qty: 1, price: 0, hsn: '', gst: 18 }];
    const itemsBox = el('div', {});
    const catalog = store.get('ott_invoice_items', []);
    const quickAdd = el('select');
    quickAdd.append(el('option', { value: '' }, catalog.length ? '＋ Quick add a saved item…' : 'No saved items (add them in “Saved Items”)'));
    catalog.forEach((it, i) => quickAdd.append(el('option', { value: String(i) }, it.name + ' — ₹' + it.price)));
    quickAdd.onchange = () => { if (quickAdd.value !== '') { const it = catalog[+quickAdd.value]; items.push({ desc: it.name, qty: 1, price: it.price, hsn: it.hsn || '', gst: it.gst || 18 }); drawItems(); quickAdd.value = ''; } };
    const drawItems = () => {
      itemsBox.innerHTML = '';
      items.forEach((it, i) => {
        const d = el('input', { value: it.desc, placeholder: 'Item' }); const q = el('input', { type: 'number', value: String(it.qty), style: { maxWidth: '58px' } }); const p = el('input', { type: 'number', value: String(it.price), style: { maxWidth: '86px' } });
        const h = cfg.gstEnabled ? el('input', { value: it.hsn, placeholder: 'HSN', style: { maxWidth: '78px' } }) : null;
        const g = cfg.gstEnabled ? el('input', { type: 'number', value: String(it.gst), placeholder: 'GST%', style: { maxWidth: '66px' } }) : null;
        d.oninput = () => it.desc = d.value; q.oninput = () => it.qty = +q.value; p.oninput = () => it.price = +p.value; if (h) h.oninput = () => it.hsn = h.value; if (g) g.oninput = () => it.gst = +g.value;
        itemsBox.append(el('div', { className: 'row', style: { marginBottom: '4px' } }, d, q, p, ...(h ? [h] : []), ...(g ? [g] : []), el('button', { className: 'btn small ghost', onclick: () => { items.splice(i, 1); drawItems(); } }, '✕')));
      });
    };
    const discount = el('input', { type: 'number', value: '0' }); const notes = ta('', 'Notes (optional)');
    const tmpl = el('select'); [['classic', 'Classic Blue'], ['minimal', 'Minimal'], ['taxpro', 'GST Tax Pro'], ['corporate', 'Corporate Grey'], ['luxury', 'Luxury Gold'], ['teal', 'Teal Stripe'], ['royal', 'Royal Purple'], ['crimson', 'Crimson']].forEach(([v, n]) => tmpl.append(el('option', { value: v }, n))); tmpl.value = cfg.template || 'classic';
    function computeInvoice() {
      if (!cfg.name) { toast('Set up Business first', 'err'); return null; }
      if (!cn.value.trim()) { toast('Customer name required', 'err'); return null; }
      const customer = { name: cn.value.trim(), phone: cp.value.trim(), email: ce.value.trim(), address: ca.value.trim(), gstin: cg.value.trim(), state: cs.value.trim() };
      const v = invoiceCompute(items.filter(it => it.desc.trim()), +discount.value || 0, cfg, customer);
      if (!v.rows.length) { toast('Add at least one item', 'err'); return null; }
      const number = (cfg.prefix || 'INV-') + String(cfg.counter || 1).padStart(4, '0');
      const inv = { ...v, number, date: new Date().toLocaleDateString('en-IN'), cfg, customer, template: tmpl.value, notes: notes.value.trim() };
      cfg.template = tmpl.value;
      return { inv, html: invoiceHtml(inv), number, customer };
    }
    const afterIssue = (r) => { cfg.counter = (cfg.counter || 1) + 1; saveCfg(); logInvoice({ inv: r.inv, number: r.number, customer: r.customer }); };
    boxc.append(el('div', {},
      el('div', { className: 'fp-note' }, 'Customer'),
      el('div', { className: 'row' }, el('button', { className: 'btn small', onclick: () => pickCustomer(c => { cn.value = c.name || c.number; cp.value = c.number; }) }, 'Choose from chat list')),
      el('div', { className: 'row' }, lbl('Name', cn), lbl('Phone', cp)),
      el('div', { className: 'row' }, lbl('Email', ce), lbl('State code', cs)), lbl('Address', ca),
      cfg.gstEnabled ? lbl('Customer GSTIN', cg) : null,
      el('div', { className: 'fp-note' }, 'Items · desc / qty / rate' + (cfg.gstEnabled ? ' / HSN / GST%' : '')),
      catalog.length ? el('div', { className: 'row' }, lbl('Quick add saved item', quickAdd)) : null, itemsBox,
      el('button', { className: 'btn small', onclick: () => { items.push({ desc: '', qty: 1, price: 0, hsn: '', gst: 18 }); drawItems(); } }, '＋ Add item'),
      el('div', { className: 'row' }, lbl('Discount ₹', discount), lbl('Template', tmpl)), lbl('Notes', notes),
      el('div', { className: 'row' },
        el('button', { className: 'btn ghost', onclick: () => { const r = computeInvoice(); if (r) previewInvoice(r.html); } }, 'Preview'),
        el('button', { className: 'btn', onclick: async () => { const r = computeInvoice(); if (!r) return; const pdf = await ott.renderInvoicePdf(r.html); if (!pdf.ok) return toast('PDF failed', 'err'); el('a', { href: pdf.data, download: r.number + '.pdf' }).click(); toast('PDF downloaded'); afterIssue(r); } }, 'Download PDF'),
        el('button', { className: 'btn primary', onclick: async () => { const r = computeInvoice(); if (!r) return; if (!digits(r.customer.phone)) return toast('Customer phone needed to send', 'err'); const pdf = await ott.renderInvoicePdf(r.html); if (!pdf.ok) return toast('PDF failed', 'err'); const sr = await sendMediaToJidOn(activeId, digits(r.customer.phone) + '@c.us', pdf.data, 'Invoice ' + r.number, r.number + '.pdf'); toast(sr.ok ? 'Invoice sent to ' + r.customer.name : 'Send failed', sr.ok ? 'ok' : 'err'); afterIssue(r); } }, 'Generate & Send'))));
    drawItems();
  }
};

function renderSoon(b, f) {
  b.append(el('div', { className: 'fp-note' }, `“${f.name}” is planned for the next update. Multi-account, Broadcast, Autoreply, Quick Replies, Number Filter, Data Extractor, Link Generator, Direct Message, Translation and Signature are live now.`));
}

// autoreply injection into a webview
function applyAutoreply(accId) {
  const wv = document.querySelector(`webview[data-acc="${accId}"]`); if (!wv || !wv.dataset.injected) return;
  const cfg = store.get(`ott_ar_${accId}`, { on: false, rules: [], fallback: '' });
  const rules = cfg.on ? cfg.rules.filter(r => r.keyword && r.reply).map(r => ({ type: r.type || 'contains', keyword: r.keyword, reply: r.reply })) : [];
  const fallback = cfg.on ? (cfg.fallback || '') : '';
  const js = `window.__ott_rules=${JSON.stringify(rules)};window.__ott_fallback=${JSON.stringify(fallback)};
    if(!window.__ott_ar){window.__ott_ar=true;try{WPP.on('chat.new_message',async(m)=>{try{
      if(!m||m.fromMe)return;const body=((m.body)||'').toLowerCase().trim();let matched=false;
      for(const r of (window.__ott_rules||[])){const k=(r.keyword||'').toLowerCase().trim();if(!k)continue;let hit=false;
        if(r.type==='exact')hit=body===k;else if(r.type==='startsWith')hit=body.startsWith(k);else if(r.type==='endsWith')hit=body.endsWith(k);else hit=body.includes(k);
        if(hit){await WPP.chat.sendTextMessage(m.from,r.reply,{});matched=true;break;}}
      if(!matched&&window.__ott_fallback){await WPP.chat.sendTextMessage(m.from,window.__ott_fallback,{});}
    }catch(e){}});}catch(e){}}`;
  wv.executeJavaScript(js).catch(() => {});
}

// ================= exec/send on a specific account =================
async function waExecOn(accId, expr) { const w = document.querySelector(`webview[data-acc="${accId}"]`); if (!w) throw new Error('no account'); return w.executeJavaScript(expr); }
async function sendTextOn(accId, number, text) {
  const jid = JSON.stringify(digits(number) + '@c.us'); const body = JSON.stringify(spin(withSignature(text)));
  const expr = `(async()=>{try{await WPP.chat.sendTextMessage(${jid},${body},{createChat:true});return{ok:true}}catch(e){return{ok:false,err:String(e&&e.message||e)}}})()`;
  try { return await waExecOn(accId, expr); } catch (e) { return { ok: false, err: String(e) }; }
}
async function isConnectedOn(accId) { try { return await waExecOn(accId, "(async()=>{try{return (await WPP.conn.isAuthenticated())===true}catch(e){return false}})()"); } catch { return false; } }

// ================= scheduler (Schedule + Reminder) =================
let schedulerStarted = false;
function startScheduler() {
  if (schedulerStarted) return; schedulerStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const job of store.get('ott_schedule', [])) if (job.status === 'pending' && new Date(job.when).getTime() <= now) { setJobStatus('ott_schedule', job.id, 'sending'); runSchedule(job); }
    for (const r of store.get('ott_reminders', [])) if (r.status === 'pending' && new Date(r.when).getTime() <= now) { setJobStatus('ott_reminders', r.id, 'firing'); fireReminder(r); }
    autopostTick();
    leadFollowupTick();
    dealTick();
  }, 15000);
}

// ---- Auto Offer Post ----
function hourInTz(tz) {
  try { return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz || 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date()), 10) % 24; }
  catch (e) { return new Date().getHours(); }
}
let _autopostBusy = false;
async function autopostTick() {
  if (_autopostBusy) return;
  const cfg = store.get('ott_offers', null);
  if (!cfg || !cfg.on || !(cfg.offers || []).length || !(cfg.targets || []).length) return;
  const h = hourInTz(cfg.timezone);
  if (h < (cfg.startHour ?? 9) || h >= (cfg.endHour ?? 22)) return;
  const interval = (cfg.intervalMin || 60) * 60000;
  if (cfg.lastPostTs && (Date.now() - cfg.lastPostTs) < interval) return;
  await postOffer(false);
}
async function postOffer(manual) {
  const cfg = store.get('ott_offers', null);
  if (!cfg || !(cfg.offers || []).length || !(cfg.targets || []).length) { if (manual) toast('Add an offer and target groups first', 'err'); return; }
  _autopostBusy = true;
  try {
    const idx = (cfg.nextIndex || 0) % cfg.offers.length;
    const offer = cfg.offers[idx];
    const accId = cfg.accId && document.querySelector(`webview[data-acc="${cfg.accId}"]`) ? cfg.accId : activeId;
    let ok = 0, fail = 0;
    for (const jid of cfg.targets) {
      const r = offer.data ? await sendMediaToJidOn(accId, jid, offer.data, offer.text, offer.filename) : await sendToJidOn(accId, jid, offer.text);
      r.ok ? ok++ : fail++; await sleep(1500);
    }
    cfg.lastPostTs = Date.now(); cfg.nextIndex = (idx + 1) % cfg.offers.length;
    cfg.logs = [{ ts: Date.now(), text: (offer.text || offer.filename || 'offer').slice(0, 40), ok, fail, manual: !!manual }, ...(cfg.logs || [])].slice(0, 60);
    store.set('ott_offers', cfg);
    if (openFeatureId === 'autopost') refreshPanel('autopost');
    if (manual) toast(`Posted to ${ok}/${cfg.targets.length} groups`);
  } finally { _autopostBusy = false; }
}
async function sendToJidOn(accId, jid, text) {
  const body = JSON.stringify(spin(text || ''));
  return waExecOn(accId, `(async()=>{try{await WPP.chat.sendTextMessage(${JSON.stringify(jid)},${body},{createChat:true});return{ok:true}}catch(e){return{ok:false,err:String(e&&e.message||e)}}})()`).catch(e => ({ ok: false, err: String(e) }));
}
async function sendMediaToJidOn(accId, jid, dataUrl, caption, filename) {
  const c = JSON.stringify(dataUrl), cap = JSON.stringify(spin(caption || '')), fn = JSON.stringify(filename || 'file');
  return waExecOn(accId, `(async()=>{try{await WPP.chat.sendFileMessage(${JSON.stringify(jid)},${c},{type:'auto',caption:${cap},filename:${fn},createChat:true});return{ok:true}}catch(e){return{ok:false,err:String(e&&e.message||e)}}})()`).catch(e => ({ ok: false, err: String(e) }));
}
function setJobStatus(key, id, status, extra) { const arr = store.get(key, []); const j = arr.find(x => x.id === id); if (j) { j.status = status; if (extra) Object.assign(j, extra); store.set(key, arr); } }
async function runSchedule(job) {
  if (!(await isConnectedOn(job.accId))) { setJobStatus('ott_schedule', job.id, 'failed'); toast(`Scheduled broadcast failed: ${job.accName} not linked`, 'err'); refreshPanel('schedule'); return; }
  let ok = 0, fail = 0;
  for (const n of job.numbers) { const r = await sendTextOn(job.accId, n, job.message); r.ok ? ok++ : fail++; await sleep((job.delayMin + Math.random() * (job.delayMax - job.delayMin)) * 1000); }
  setJobStatus('ott_schedule', job.id, 'sent', { ok, fail }); toast(`Scheduled broadcast sent: ${ok}/${job.numbers.length}`); refreshPanel('schedule');
}
async function fireReminder(r) {
  // Optional WhatsApp send is still supported, but a reminder is now primarily an alarm.
  if (r.number && await isConnectedOn(r.accId)) await sendTextOn(r.accId, r.number, r.text);
  try { new Notification('WA-CRM . Reminder', { body: r.title || r.text }); } catch (_) {}
  showAlarm(r);
  if (r.repeat === 'daily') {
    // Roll forward to the same clock time tomorrow rather than marking it done.
    const next = new Date(r.when); next.setDate(next.getDate() + 1);
    const rs = store.get('ott_reminders', []); const it = rs.find((x) => x.id === r.id);
    if (it) { it.when = next.toISOString(); it.status = 'pending'; store.set('ott_reminders', rs); }
  } else {
    setJobStatus('ott_reminders', r.id, 'done');
  }
  refreshPanel('reminder');
}

// ---- Alarm: looping chime + a modal the user must acknowledge ----
let _alarmAudio = null;
function startChime() {
  stopChime();
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    // Two-tone bell, synthesised so there is no audio asset to ship.
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
    _alarmAudio = { ctx, iv: setInterval(loop, 1600) };
  } catch (_) { _alarmAudio = null; }
}
function stopChime() {
  if (!_alarmAudio) return;
  try { clearInterval(_alarmAudio.iv); _alarmAudio.ctx.close(); } catch (_) {}
  _alarmAudio = null;
}

function showAlarm(r) {
  const when = new Date(r.when);
  const hhmm = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (r.sound !== false) startChime();

  const close = () => { stopChime(); scrim.remove(); };
  const snooze = (mins) => {
    const rs = store.get('ott_reminders', []);
    const it = rs.find((x) => x.id === r.id);
    const next = new Date(Date.now() + mins * 60000).toISOString();
    if (it) { it.when = next; it.status = 'pending'; }
    else rs.push(Object.assign({}, r, { when: next, status: 'pending' }));
    store.set('ott_reminders', rs);
    close(); refreshPanel('reminder'); toast('Snoozed ' + mins + ' min');
  };

  const card = el('div', { className: 'alarm-card' },
    el('div', { className: 'alarm-ring' }, el('span', {}, '\u23F0')),
    el('div', { className: 'alarm-time' }, hhmm),
    el('div', { className: 'alarm-date' }, when.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })),
    r.title ? el('h2', { className: 'alarm-title' }, r.title) : null,
    r.text ? el('div', { className: 'alarm-note' }, r.text) : null,
    r.number ? el('div', { className: 'alarm-sent' }, 'Also sent on WhatsApp to ' + r.number) : null,
    el('div', { className: 'alarm-snooze' },
      el('span', { className: 'muted', style: { fontSize: '12px', alignSelf: 'center' } }, 'Snooze'),
      el('button', { className: 'btn small', onclick: () => snooze(5) }, '5 min'),
      el('button', { className: 'btn small', onclick: () => snooze(10) }, '10 min'),
      el('button', { className: 'btn small', onclick: () => snooze(30) }, '30 min')),
    el('button', { className: 'btn primary block', onclick: close }, 'Dismiss'));

  const scrim = el('div', { className: 'alarm-scrim' }, card);
  document.body.append(scrim);
  // Never let a ringing alarm run forever if nobody is at the machine.
  setTimeout(stopChime, 120000);
}
function refreshPanel(id) { if (openFeatureId === id) { const f = FEATURES.find(x => x.id === id); if (f) openFeature(f); } }

// ================= Group Guard injection =================
function applyGuard(accId) {
  const wv = document.querySelector(`webview[data-acc="${accId}"]`); if (!wv || !wv.dataset.injected) return;
  const cfg = store.get(`ott_guard_${accId}`, { on: false, groups: {} });
  const conf = cfg.on ? { on: true, groups: cfg.groups || {} } : { on: false, groups: {} };
  const js = `window.__ott_guard=${JSON.stringify(conf)};
    if(!window.__ott_guard_init){window.__ott_guard_init=true;window.__ott_gw={};try{WPP.on('chat.new_message',async(m)=>{try{
      const g=window.__ott_guard; if(!g||!g.on||!m||m.fromMe)return;
      const chatId=m.from&&(m.from._serialized||m.from); if(!chatId||!String(chatId).endsWith('@g.us'))return;
      const cfg=(g.groups||{})[chatId]; if(!cfg)return;
      const body=(m.body||''); const low=body.toLowerCase();
      const hasLink=/(https?:\\/\\/|www\\.|wa\\.me|t\\.me|chat\\.whatsapp\\.com|bit\\.ly)/i.test(body);
      const hasBanned=(cfg.banned||[]).some(w=>w&&low.includes(String(w).toLowerCase()));
      if((cfg.deleteLinks&&hasLink)||hasBanned){
        try{await WPP.chat.deleteMessage(chatId,[m.id&&(m.id._serialized||m.id)],true,true)}catch(e){}
        if(cfg.warn){const s=m.author&&(m.author._serialized||m.author); if(s){window.__ott_gw[chatId]=window.__ott_gw[chatId]||{};const c=(window.__ott_gw[chatId][s]||0)+1;window.__ott_gw[chatId][s]=c; if(c>=(cfg.max||3)){try{await WPP.group.removeParticipants(chatId,[s])}catch(e){}}}}
      }
    }catch(e){}});}catch(e){}}`;
  wv.executeJavaScript(js).catch(() => {});
}

// ================= Schedule feature =================
RENDER.schedule = (b) => {
  const acc = accounts.find(a => a.id === activeId);
  const numbers = el('textarea', { placeholder: 'One number per line', style: { minHeight: '120px', fontFamily: 'JetBrains Mono, monospace' } });
  const msg = el('textarea', { placeholder: 'Message · {a|b} spin, signature auto-appended' });
  const when = el('input', { type: 'datetime-local' });
  const dMin = el('input', { type: 'number', value: '4', min: '1' }); const dMax = el('input', { type: 'number', value: '9', min: '1' });
  // Arrived from the in-chat widget: prefill the customer so only the message is left to write.
  if (pendingChatAction && pendingChatAction.op === 'later') {
    numbers.value = pendingChatAction.number;
    setTimeout(() => msg.focus(), 0);
    pendingChatAction = null;
  }
  const list = el('div', { className: 'rules' });
  const draw = () => {
    list.innerHTML = ''; const jobs = store.get('ott_schedule', []).filter(j => j.accId === activeId).reverse();
    if (!jobs.length) list.append(el('div', { className: 'muted' }, 'No scheduled broadcasts.'));
    jobs.forEach(j => list.append(el('div', { className: 'qr-item' },
      el('div', { className: 'txt' }, el('b', {}, new Date(j.when).toLocaleString()),
        el('div', { className: 'muted', style: { fontSize: '12px' } }, `${j.numbers.length} recipients · ${j.status}${j.ok != null ? ` (${j.ok} sent)` : ''}`)),
      el('button', { className: 'btn small ghost', onclick: () => { store.set('ott_schedule', store.get('ott_schedule', []).filter(x => x.id !== j.id)); draw(); } }, j.status === 'pending' ? 'Cancel' : 'Remove'))));
  };
  b.append(el('div', { className: 'fp-note' }, 'Schedules a broadcast on THIS account. Fires only while the app stays open.'),
    lbl('Numbers', numbers), el('div', { className: 'row' }, importBtn(numbers)), lbl('Message', msg),
    el('div', { className: 'row' }, lbl('Send at', when), lbl('Delay min', dMin), lbl('Delay max', dMax)),
    el('button', { className: 'btn primary', onclick: () => {
      const nums = numbers.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (!nums.length) return toast('Add numbers', 'err'); if (!msg.value.trim()) return toast('Write a message', 'err');
      if (!when.value) return toast('Pick a date & time', 'err'); const t = new Date(when.value).getTime();
      if (isNaN(t) || t <= Date.now()) return toast('Pick a future time', 'err');
      const jobs = store.get('ott_schedule', []);
      jobs.push({ id: 's' + Date.now(), accId: activeId, accName: acc ? acc.name : '', numbers: nums, message: msg.value.trim(), when: new Date(t).toISOString(), delayMin: +dMin.value || 4, delayMax: +dMax.value || 9, status: 'pending', ok: null });
      store.set('ott_schedule', jobs); numbers.value = msg.value = ''; draw(); toast('Broadcast scheduled');
    } }, 'Schedule broadcast'),
    el('div', { style: { borderTop: '1px solid var(--line)', margin: '4px 0' } }), list);
  draw();
};

// ================= Reminder feature =================
RENDER.reminder = (b) => {
  const title = el('input', { placeholder: 'e.g. Call Ravi about the renewal', maxLength: 60 });
  const text = el('textarea', { placeholder: 'Notes shown on the alarm popup' });
  const when = el('input', { type: 'datetime-local' });
  const repeat = el('select');
  [['once', 'Once'], ['daily', 'Every day at this time']].forEach(([v, n]) => repeat.append(el('option', { value: v }, n)));
  const number = el('input', { placeholder: 'Optional - also WhatsApp this number' });
  // Arrived from the in-chat widget: name the customer and fill their number.
  if (pendingChatAction && pendingChatAction.op === 'remind') {
    title.value = 'Follow up · ' + pendingChatAction.name;
    number.value = pendingChatAction.number;
    setTimeout(() => text.focus(), 0);
    pendingChatAction = null;
  }
  const sound = chk(true);
  const list = el('div', { className: 'rules' });

  const draw = () => {
    list.innerHTML = '';
    const rs = store.get('ott_reminders', []).filter((r) => r.accId === activeId)
      .sort((a, c) => new Date(a.when) - new Date(c.when));
    if (!rs.length) { list.append(el('div', { className: 'muted' }, 'No reminders yet.')); return; }
    rs.forEach((r) => {
      const due = new Date(r.when);
      const late = r.status === 'pending' && due < new Date();
      list.append(el('div', { className: 'qr-item' },
        el('div', { className: 'txt' },
          el('b', {}, r.title || (r.text || '').slice(0, 40) || 'Reminder'),
          el('div', { className: 'muted', style: { fontSize: '12px' } },
            due.toLocaleString()
            + (r.repeat === 'daily' ? '  . daily' : '')
            + (r.number ? '  . WhatsApp ' + r.number : '')
            + '  . ' + (late ? 'overdue' : r.status))),
        el('button', { className: 'btn small', onclick: () => showAlarm(r) }, 'Preview'),
        el('button', { className: 'btn small ghost', onclick: () => {
          store.set('ott_reminders', store.get('ott_reminders', []).filter((x) => x.id !== r.id)); draw();
        } }, r.status === 'pending' ? 'Cancel' : 'Remove')));
    });
  };

  b.append(
    el('div', { className: 'fp-note' }, 'A task reminder rings inside WA-CRM at the set time and shows your note, like an alarm. It can optionally WhatsApp someone too. Reminders fire while the app is open.'),
    lbl('Task', title), lbl('Note', text),
    el('div', { className: 'row' }, lbl('Remind at', when), lbl('Repeat', repeat)),
    lbl('WhatsApp number (optional)', number),
    chkRow(sound, 'Play alarm sound'),
    el('button', { className: 'btn primary', onclick: () => {
      if (!title.value.trim() && !text.value.trim()) return toast('Add a task or note', 'err');
      if (!when.value) return toast('Pick a time', 'err');
      const ts = new Date(when.value).getTime();
      if (isNaN(ts) || ts <= Date.now()) return toast('Pick a future time', 'err');
      const rs = store.get('ott_reminders', []);
      rs.push({ id: 'r' + Date.now(), accId: activeId, title: title.value.trim(), text: text.value.trim(),
        number: digits(number.value), when: new Date(ts).toISOString(), repeat: repeat.value,
        sound: sound.checked, status: 'pending' });
      store.set('ott_reminders', rs);
      title.value = text.value = number.value = ''; draw(); toast('Reminder set');
      try { if (Notification.permission === 'default') Notification.requestPermission(); } catch (_) {}
    } }, 'Set reminder'),
    el('div', { style: { borderTop: '1px solid var(--line)', margin: '6px 0' } }), list);
  draw();
};

// ================= Group Utilities =================
async function loadGroupsInto(sel) {
  if (!(await isConnected())) { toast('WhatsApp not linked', 'err'); return 0; }
  const gs = await waExec("(async()=>{try{const g=await WPP.chat.list({onlyGroups:true});return g.map(x=>({id:x.id&&x.id._serialized,name:(x.groupMetadata&&x.groupMetadata.subject)||x.name||x.formattedTitle||x.id._serialized}))}catch(e){return[]}})()").catch(() => []);
  sel.innerHTML = ''; if (!gs.length) { sel.append(el('option', {}, 'No groups')); return 0; }
  gs.forEach(g => sel.append(el('option', { value: g.id }, g.name))); return gs.length;
}
RENDER.grouputils = (b) => {
  const mode = el('select');
  [['manage', 'Manage / Message'], ['joiner', 'Group Joiner'], ['destroyer', 'Group Destroyer']].forEach(([v, n]) => mode.append(el('option', { value: v }, n)));
  const box = el('div', {});
  mode.onchange = () => render();
  b.append(el('div', { className: 'fp-note' }, 'Group tools for THIS account. Admin actions require the right permissions.'), lbl('Tool', mode), box);
  render();

  function render() {
    box.innerHTML = '';
    if (mode.value === 'manage') manage();
    else if (mode.value === 'joiner') joiner();
    else destroyer();
  }

  function manage() {
    let picker = null, groups = [];
    const msg = el('textarea', { placeholder: 'Message to send to every selected group' });
    const att = attachControl('*'); att.node.style.display = 'flex';
    const gap = el('input', { type: 'number', value: '6', min: '1', style: { maxWidth: '90px' } });
    const holder = el('div', {});
    const out = el('div', { className: 'log' });
    const bar = el('div', { className: 'progress', style: { display: 'none' } });
    const barI = el('div', { className: 'bar' }); bar.append(barI);

    const load = async () => {
      if (!(await isConnected())) return toast('WhatsApp not linked', 'err');
      holder.innerHTML = '<div class="muted">Loading groups…</div>';
      groups = await waExec("(async()=>{try{const g=await WPP.chat.list({onlyGroups:true});return g.map(x=>({jid:x.id&&x.id._serialized,name:(x.groupMetadata&&x.groupMetadata.subject)||x.name||x.formattedTitle||''}))}catch(e){return[]}})()").catch(() => []);
      holder.innerHTML = '';
      if (!groups.length) { holder.append(el('div', { className: 'muted' }, 'No groups found.')); return; }
      picker = checkList(groups);
      holder.append(picker.node);
      toast(groups.length + ' groups loaded');
    };

    box.append(
      el('div', { className: 'row' },
        el('button', { className: 'btn', onclick: load }, 'Load groups'),
        el('button', { className: 'btn', onclick: async () => {
          const sel = picker ? picker.selected() : [];
          if (sel.length !== 1) return toast('Select exactly one group for an invite link', 'err');
          const code = await waExec(`(async()=>{try{return await WPP.group.getInviteCode(${JSON.stringify(sel[0].jid)})}catch(e){return ''}})()`).catch(() => '');
          if (code) { const link = 'https://chat.whatsapp.com/' + code; navigator.clipboard.writeText(link); line(out, 'Invite: ' + link, 'ok'); toast('Invite link copied'); }
          else toast('Need admin, or failed', 'err');
        } }, 'Get invite link')),
      lbl('Groups', holder),
      lbl('Message', msg), quickInsert(msg), att.node,
      el('div', { className: 'row' }, lbl('Delay between groups (seconds)', gap)),
      el('div', { className: 'row' },
        el('button', { className: 'btn primary', onclick: async () => {
          const sel = picker ? picker.selected() : [];
          const file = att.get();
          if (!sel.length) return toast('Select at least one group', 'err');
          if (!msg.value.trim() && !file) return toast('Write a message or attach a file', 'err');
          if (!confirm(`Send this post to ${sel.length} group(s)?`)) return;
          const wait = Math.max(1, +gap.value || 6) * 1000;
          bar.style.display = 'block'; barI.style.width = '0%';
          let done = 0, ok = 0;
          for (const g of sel) {
            const r = file
              ? await sendMediaToJid(g.jid, file.data, msg.value.trim(), file.name)
              : await sendToJid(g.jid, msg.value.trim());
            done++; if (r.ok) ok++;
            line(out, (r.ok ? '✓ ' : '✗ ') + (g.name || g.jid) + (r.ok ? '' : ' — ' + (r.err || 'failed')), r.ok ? 'ok' : 'bad');
            barI.style.width = Math.round((done / sel.length) * 100) + '%';
            if (done < sel.length) await sleep(wait);
          }
          toast(`Posted to ${ok}/${sel.length} group(s)`, ok ? 'ok' : 'err');
        } }, 'Post to selected groups'),
        el('button', { className: 'btn ghost', style: { color: 'var(--danger)' }, onclick: async () => {
          const sel = picker ? picker.selected() : [];
          if (!sel.length) return toast('Select at least one group', 'err');
          if (!confirm(`Leave ${sel.length} group(s)?`)) return;
          for (const g of sel) {
            const r = await waExec(`(async()=>{try{await WPP.group.leave(${JSON.stringify(g.jid)});return{ok:true}}catch(e){return{ok:false,err:String(e&&e.message||e)}}})()`).catch(e => ({ ok: false, err: String(e) }));
            line(out, (r.ok ? '✓ left ' : '✗ ') + (g.name || g.jid), r.ok ? 'ok' : 'bad');
            await sleep(700);
          }
          load();
        } }, 'Leave selected')),
      bar, out);
  }


  function joiner() {
    const links = el('textarea', { placeholder: 'One WhatsApp group invite link per line\nhttps://chat.whatsapp.com/XXXX', style: { minHeight: '130px' } });
    const delay = el('input', { type: 'number', value: '8', min: '3', style: { maxWidth: '90px' } });
    const out = el('div', { className: 'log' }); let running = false;
    box.append(el('div', { className: 'fp-note' }, 'Joins each group invite link with a delay. Keep the delay high to stay safe.'),
      lbl('Invite links', links), el('div', { className: 'row' }, importBtn(links), lbl('Delay (s)', delay)),
      el('div', { className: 'row' }, el('button', { className: 'btn primary', onclick: run }, 'Join groups'), el('button', { className: 'btn ghost', onclick: () => running = false }, 'Stop')), out);
    async function run() {
      if (running) return; const list = links.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (!list.length) return toast('Paste invite links', 'err');
      if (!(await isConnected())) return toast('WhatsApp not linked', 'err');
      running = true; out.innerHTML = ''; const d = Math.max(3, +delay.value || 8); let ok = 0;
      for (const lk of list) { if (!running) { line(out, 'Stopped.', 'bad'); break; }
        const r = await waExec(`(async()=>{try{await WPP.group.join(${JSON.stringify(lk)});return{ok:true}}catch(e){return{ok:false,err:String(e&&e.message||e)}}})()`).catch(e => ({ ok: false, err: String(e) }));
        if (r.ok) ok++; line(out, `${r.ok ? '✓ joined' : '✗ ' + (r.err || 'failed')}  ${lk.slice(0, 42)}`, r.ok ? 'ok' : 'bad'); await sleep(d * 1000); }
      running = false; toast(`Joined ${ok}/${list.length}`);
    }
  }

  function destroyer() {
    const sel = el('select'); const out = el('div', { className: 'log' });
    box.append(el('div', { className: 'fp-note' }, 'Removes ALL members from a group you admin, then leaves it. This cannot be undone.'),
      lbl('Group', sel), el('div', { className: 'row' }, el('button', { className: 'btn', onclick: async () => { const n = await loadGroupsInto(sel); if (n) toast(`${n} groups`); } }, 'Load groups'),
        el('button', { className: 'btn ghost', style: { color: 'var(--danger)' }, onclick: destroy }, 'Destroy group')), out);
    async function destroy() {
      const gid = sel.value; if (!gid) return toast('Load & pick a group', 'err');
      if (!confirm('Remove ALL members and leave this group? This cannot be undone.')) return;
      const me = await waExec("(async()=>{try{return WPP.conn.getMyUserId().user}catch(e){return ''}})()").catch(() => '');
      const ids = await waExec(`(async()=>{try{${PH_RESOLVER};const p=await WPP.group.getParticipants(${JSON.stringify(gid)});var o=[];for(var i=0;i<p.length;i++){var ph=await _ph(p[i].id);o.push(ph?ph+'@c.us':((p[i].id&&p[i].id._serialized)||''));}return o.filter(Boolean)}catch(e){return[]}})()`).catch(() => []);
      const targets = ids.filter(x => x && (!me || x.indexOf(me) === -1));
      out.innerHTML = ''; line(out, `Removing ${targets.length} members…`);
      for (let i = 0; i < targets.length; i += 5) {
        const batch = targets.slice(i, i + 5);
        await waExec(`(async()=>{try{await WPP.group.removeParticipants(${JSON.stringify(gid)},${JSON.stringify(batch)})}catch(e){}})()`).catch(() => {});
        line(out, `removed ${Math.min(i + 5, targets.length)}/${targets.length}`); await sleep(900);
      }
      await waExec(`(async()=>{try{await WPP.group.leave(${JSON.stringify(gid)})}catch(e){}})()`).catch(() => {});
      line(out, 'Group destroyed — members removed, you left.', 'ok'); toast('Group destroyed'); loadGroupsInto(sel);
    }
  }
};

// ================= Group Guard (per-group rules) =================
RENDER.guard = (b) => {
  const key = `ott_guard_${activeId}`;
  const cfg = store.get(key, { on: false, groups: {} });
  cfg.groups = cfg.groups || {};
  const persist = () => { store.set(key, cfg); applyGuard(activeId); };

  const chip = el('span', { className: 'chip ' + (cfg.on ? 'on' : 'off') }, cfg.on ? 'Guarding' : 'Off');
  const on = chk(cfg.on);
  on.onchange = () => { cfg.on = on.checked; chip.className = 'chip ' + (cfg.on ? 'on' : 'off'); chip.textContent = cfg.on ? 'Guarding' : 'Off'; persist(); };

  const gsel = el('select');
  const dl = chk(true), warn = chk(false);
  const maxW = el('input', { type: 'number', value: '3', min: '1', style: { maxWidth: '90px' } });
  const banned = el('textarea', { placeholder: 'Banned words / phrases (one per line)' });

  const listBox = el('div', { className: 'rules' });
  const drawList = () => {
    listBox.innerHTML = '';
    const entries = Object.entries(cfg.groups);
    if (!entries.length) { listBox.append(el('div', { className: 'muted' }, 'No groups guarded yet.')); return; }
    entries.forEach(([gid, g]) => listBox.append(el('div', { className: 'qr-item' },
      el('div', { className: 'txt' }, el('b', {}, g.name || gid),
        el('div', { className: 'muted', style: { fontSize: '12px' } }, `${g.deleteLinks ? 'del links' : ''}${g.banned && g.banned.length ? ' · ' + g.banned.length + ' words' : ''}${g.warn ? ' · remove after ' + (g.max || 3) : ''}`)),
      el('button', { className: 'btn small ghost', onclick: () => { delete cfg.groups[gid]; drawList(); persist(); } }, '✕'))));
  };

  b.append(
    el('div', { className: 'fp-note' }, 'Protects groups where THIS account is admin. On a matching message it deletes it and (optionally) warns/removes the sender after N strikes. Requires admin rights.'),
    el('label', { style: { flexDirection: 'row', alignItems: 'center', gap: '10px' } }, on, 'Enable Group Guard', chip),
    el('div', { className: 'fp-note' }, 'Configure a group:'),
    el('div', { className: 'row' }, el('button', { className: 'btn small', onclick: async () => { const n = await loadGroupsInto(gsel); if (n) toast(`${n} groups`); } }, 'Load groups')), gsel,
    chkRow(dl, 'Delete messages containing links'),
    lbl('Banned words / phrases', banned),
    chkRow(warn, 'Remove the sender after repeated strikes'),
    el('div', { className: 'row' }, lbl('Strikes before removal', maxW)),
    el('button', { className: 'btn', onclick: () => {
      const gid = gsel.value; if (!gid) return toast('Load & pick a group', 'err');
      const name = gsel.options[gsel.selectedIndex]?.text || gid;
      cfg.groups[gid] = { name, deleteLinks: dl.checked, banned: banned.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean), warn: warn.checked, max: +maxW.value || 3 };
      banned.value = ''; drawList(); persist(); toast('Group rule saved');
    } }, 'Save rule for this group'),
    el('div', { style: { borderTop: '1px solid var(--line)', margin: '4px 0' } }),
    lbl('Guarded groups', listBox));
  drawList();
};

// ================= import & attach builders =================
function importBtn(target) {
  const inp = el('input', { type: 'file', accept: '.csv,.txt,.xlsx,.xls', style: { display: 'none' }, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = await ott.importNumbers(f.path);
    if (r.ok) { const cur = target.value.trim(); target.value = (cur ? cur + '\n' : '') + r.numbers.join('\n'); toast(`Imported ${r.numbers.length} numbers`); }
    else toast('Import failed', 'err');
    e.target.value = '';
  } });
  const wrap = el('span', {}); wrap.append(el('button', { className: 'btn ghost small', onclick: () => inp.click() }, 'Import CSV / Excel'), inp);
  return wrap;
}
// Attach an image/video/document; returns {node, get()}.
function attachControl(accept) {
  let file = null;
  const label = el('span', { className: 'muted', style: { fontSize: '12.5px' } }, 'No file attached');
  const clear = el('button', { className: 'btn ghost small', style: { display: 'none' }, onclick: () => { file = null; label.textContent = 'No file attached'; clear.style.display = 'none'; } }, 'Remove');
  const inp = el('input', { type: 'file', accept: accept || 'image/*,video/*,.pdf', style: { display: 'none' }, onchange: (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 25 * 1024 * 1024) { toast('File too large (max 25 MB)', 'err'); return; }
    const reader = new FileReader();
    reader.onload = () => { file = { data: reader.result, name: f.name }; label.textContent = 'Attached: ' + f.name; clear.style.display = 'inline-flex'; };
    reader.readAsDataURL(f);
  } });
  const node = el('div', { className: 'row', style: { alignItems: 'center' } },
    el('button', { className: 'btn ghost small', onclick: () => inp.click() }, 'Attach media'), label, clear, inp);
  return { node, get: () => file };
}

// In-app text prompt (Electron does not support window.prompt).

// ---- Chat notes ----
// What you remember about a customer between conversations. Stored per number, kept as
// dated entries rather than one overwritten string, so you can see how a deal developed.
//
// Old builds saved a single string per number; readNotes migrates those in place.
function readNotes() {
  const raw = store.get('ott_notes', {});
  let changed = false;
  for (const k of Object.keys(raw)) {
    if (typeof raw[k] === 'string') {
      raw[k] = { name: '', entries: raw[k].trim() ? [{ ts: Date.now(), text: raw[k] }] : [] };
      changed = true;
    }
  }
  if (changed) store.set('ott_notes', raw);
  return raw;
}
const noteCount = (n) => ((n && n.entries) || []).length;

function noteModal(number, name) {
  const all = readNotes();
  const rec = all[number] || { name: name || '', entries: [] };
  rec.name = rec.name || name || '';

  const history = el('div', { className: 'log', style: { maxHeight: '210px', marginBottom: '10px' } });
  const ta = el('textarea', { placeholder: 'What happened? Anything you want to remember next time.', style: { minHeight: '110px' } });

  const drawHistory = () => {
    history.innerHTML = '';
    if (!rec.entries.length) { line(history, 'No notes yet for this contact.'); return; }
    rec.entries.slice().reverse().forEach((e, idx) => {
      const i = rec.entries.length - 1 - idx;
      const row = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--line)' } },
        el('div', { style: { flex: '1', whiteSpace: 'pre-wrap', wordBreak: 'break-word' } },
          el('div', { className: 'muted', style: { fontSize: '11px', marginBottom: '2px' } },
            new Date(e.ts).toLocaleString()),
          e.text),
        el('button', {
          className: 'btn small ghost',
          onclick: () => { rec.entries.splice(i, 1); saveRec(); drawHistory(); },
        }, 'Delete'));
      history.append(row);
    });
  };

  const saveRec = () => {
    const store2 = readNotes();
    if (rec.entries.length) store2[number] = rec; else delete store2[number];
    store.set('ott_notes', store2);
    // Mirror the latest note onto the lead so Lead Manager shows it too.
    const leads = store.get('ott_leads', []);
    const L = leads.find((x) => digits(String(x.number)) === number);
    if (L) { L.notes = rec.entries.length ? rec.entries[rec.entries.length - 1].text : ''; store.set('ott_leads', leads); }
    refreshPanel('leads'); refreshPanel('notes');
  };

  const scrim = el('div', { className: 'modal-scrim', onclick: (e) => { if (e.target === scrim) scrim.remove(); } },
    el('div', { className: 'modal-box', style: { width: '460px', textAlign: 'left' } },
      el('h3', {}, `Notes · ${rec.name || number}`),
      el('div', { className: 'muted', style: { fontSize: '12.5px', marginTop: '-6px' } },
        'Private to you. Never sent to the customer.'),
      history,
      ta,
      el('div', { className: 'row' },
        el('button', { className: 'btn ghost', onclick: () => scrim.remove() }, 'Close'),
        el('button', { className: 'btn primary', onclick: () => {
          const t = ta.value.trim();
          if (!t) return toast('Write something first', 'err');
          rec.entries.push({ ts: Date.now(), text: t });
          saveRec(); ta.value = ''; drawHistory(); toast('Note added');
        } }, 'Add note'))));

  document.body.append(scrim);
  drawHistory();
  setTimeout(() => ta.focus(), 0);
}

// A place to actually read them back — without this the notes were write-only.
RENDER.notes = (b) => {
  const search = el('input', { placeholder: 'Search notes, names or numbers' });
  const list = el('div', { className: 'rules' });

  const draw = () => {
    const all = readNotes();
    const q = search.value.trim().toLowerCase();
    const rows = Object.entries(all)
      .filter(([num, rec]) => noteCount(rec))
      .filter(([num, rec]) => !q
        || num.includes(q)
        || String(rec.name || '').toLowerCase().includes(q)
        || rec.entries.some((e) => e.text.toLowerCase().includes(q)))
      .sort((a, x) => (x[1].entries[x[1].entries.length - 1].ts) - (a[1].entries[a[1].entries.length - 1].ts));

    list.innerHTML = '';
    if (!rows.length) {
      list.append(el('div', { className: 'muted', style: { padding: '18px', textAlign: 'center' } },
        q ? 'Nothing matched.' : 'No notes yet. Open a chat and use the WA button → Chat note.'));
      return;
    }
    rows.forEach(([num, rec]) => {
      const last = rec.entries[rec.entries.length - 1];
      list.append(el('div', {
        style: { display: 'flex', gap: '10px', alignItems: 'flex-start',
                 padding: '11px 12px', borderRadius: '10px',
                 border: '1px solid var(--line)', background: 'var(--sunken)' },
      },
        el('div', { style: { flex: '1', minWidth: '0' } },
          el('b', {}, rec.name || '+' + num),
          el('div', { className: 'muted', style: { fontSize: '12px' } },
            `${rec.entries.length} note${rec.entries.length === 1 ? '' : 's'} · last ${new Date(last.ts).toLocaleDateString()}`),
          el('div', { className: 'muted', style: { fontSize: '12.5px', marginTop: '4px' } },
            last.text.slice(0, 120) + (last.text.length > 120 ? '…' : ''))),
        el('div', { className: 'row' },
          el('button', { className: 'btn small', onclick: () => noteModal(num, rec.name) }, 'Open'),
          el('button', { className: 'btn small ghost', onclick: async () => {
            const r = await openChatOn(activeId, num);
            if (!r || !r.ok) toast('Could not open that chat', 'err');
          } }, 'Go to chat'))));
    });
  };

  search.oninput = draw;
  b.append(
    el('div', { className: 'fp-note' },
      'Everything you have written about a customer, kept per number and dated. '
      + 'Add notes from any chat with the WA button → Chat note.'),
    lbl('Search', search), list);
  draw();
};

// Open a chat by number in the active account, so "Go to chat" actually goes there.
async function openChatOn(accId, number) {
  const jid = JSON.stringify(digits(number) + '@c.us');
  return waExecOn(accId, `(async()=>{try{await WPP.chat.openChatBottom(${jid});return{ok:true}}catch(e){return{ok:false,err:String(e&&e.message||e)}}})()`)
    .catch((e) => ({ ok: false, err: String(e) }));
}


// ---- Sales, Purchases & Expenses ----
// One ledger, three kinds of entry, and two profit figures on purpose:
//
//   Cash profit = sales − purchases − expenses. What actually landed in your pocket.
//                 It dips on restock days; that is real, not an error.
//   Margin      = (revenue − cost) / revenue, over sales where a cost was recorded.
//                 Says whether the selling itself is healthy.
//
// Either number alone misleads — cash profit makes a good day look terrible after a big
// purchase, and margin hides that you spent the month's takings.
const EXPENSE_CATS = ['Rent', 'Staff', 'Ads & marketing', 'Internet & phone', 'Transport',
  'Packaging', 'Electricity', 'Software', 'Bank & fees', 'Other'];
const PAY_METHODS = ['Cash', 'UPI', 'Bank', 'Card', 'Credit (unpaid)'];
const BOOK_KINDS = [['sale', 'Sale'], ['purchase', 'Purchase'], ['expense', 'Expense']];

const bToday = () => new Date().toISOString().slice(0, 10);
const bMoney = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
function bRangeStart(days) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (days > 1) d.setDate(d.getDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

function bSummarise(entries, from, to) {
  const inRange = entries.filter(e => e.date >= from && e.date <= to);
  const sum = k => inRange.filter(e => e.kind === k).reduce((t, e) => t + (Number(e.amount) || 0), 0);
  const sales = sum('sale'), purchases = sum('purchase'), expenses = sum('expense');
  const costed = inRange.filter(e => e.kind === 'sale' && Number(e.cost) > 0);
  const costedRev = costed.reduce((t, e) => t + (Number(e.amount) || 0), 0);
  const cogs = costed.reduce((t, e) => t + (Number(e.cost) || 0), 0);
  const unpaid = inRange.filter(e => e.kind === 'sale' && e.method === 'Credit (unpaid)')
    .reduce((t, e) => t + (Number(e.amount) || 0), 0);
  return { inRange, sales, purchases, expenses, cash: sales - purchases - expenses,
    costedRev, cogs, margin: costedRev > 0 ? ((costedRev - cogs) / costedRev) * 100 : null,
    unpaid, count: inRange.length };
}

// Hand-drawn SVG — no chart library is bundled, and none may be fetched.
function bChart(days, w = 660, h = 160) {
  const max = Math.max(1, ...days.map(d => Math.max(d.in, d.out)));
  const gap = 7, bw = Math.max(5, (w - gap * (days.length - 1)) / days.length);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h + 24}`);
  svg.setAttribute('class', 'bk-chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Money in and out per day');
  days.forEach((d, i) => {
    const x = i * (bw + gap);
    const bar = (cls, bx, bwid, val) => {
      const bh = Math.max(val ? 2 : 0, Math.round((val / max) * h));
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', bx); r.setAttribute('y', h - bh);
      r.setAttribute('width', Math.max(2, bwid)); r.setAttribute('height', bh);
      r.setAttribute('rx', '2'); r.setAttribute('class', cls);
      const t = document.createElementNS(NS, 'title');
      t.textContent = `${d.label} · in ${bMoney(d.in)} · out ${bMoney(d.out)}`;
      r.append(t); return r;
    };
    svg.append(bar('bin', x, bw / 2 - 1, d.in), bar('bout', x + bw / 2 + 1, bw / 2 - 1, d.out));
    if (days.length <= 14 || i % Math.ceil(days.length / 10) === 0) {
      const tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', x + bw / 2); tx.setAttribute('y', h + 16);
      tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('class', 'clab');
      tx.textContent = d.label; svg.append(tx);
    }
  });
  return svg;
}

RENDER.books = (b) => {
  const all = store.get('ott_books', []);
  let days = 7;
  const wrap = el('div', {});

  const draw = () => {
    const from = bRangeStart(days), to = bToday();
    const s = bSummarise(all, from, to);

    const buckets = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const day = all.filter(e => e.date === key);
      buckets.push({
        label: d.toLocaleDateString([], days > 14 ? { day: 'numeric' } : { weekday: 'short' }),
        in: day.filter(e => e.kind === 'sale').reduce((t, e) => t + (+e.amount || 0), 0),
        out: day.filter(e => e.kind !== 'sale').reduce((t, e) => t + (+e.amount || 0), 0),
      });
    }

    const tile = (lab, val, cls, hint) => el('div', { className: 'bk-kpi ' + (cls || '') },
      el('span', { className: 'k-lab' }, lab), el('b', {}, val),
      hint ? el('span', { className: 'k-hint' }, hint) : null);

    const byCat = {};
    s.inRange.filter(e => e.kind === 'expense').forEach(e => {
      byCat[e.category || 'Other'] = (byCat[e.category || 'Other'] || 0) + (+e.amount || 0);
    });
    const topCats = Object.entries(byCat).sort((a, x) => x[1] - a[1]).slice(0, 6);

    wrap.innerHTML = '';
    wrap.append(
      el('div', { className: 'row' },
        ...[[1, 'Today'], [7, '7 days'], [30, '30 days'], [90, '90 days']].map(([n, lab]) =>
          el('button', { className: 'btn small' + (days === n ? ' primary' : ''), onclick: () => { days = n; draw(); } }, lab))),

      el('div', { className: 'bk-kpis' },
        tile('Sales', bMoney(s.sales), 'good'),
        tile('Purchases', bMoney(s.purchases)),
        tile('Expenses', bMoney(s.expenses)),
        tile('Cash profit', bMoney(s.cash), s.cash >= 0 ? 'good' : 'bad', 'sales − purchases − expenses'),
        tile('Margin', s.margin == null ? '—' : s.margin.toFixed(1) + '%', '',
          s.margin == null ? 'add a cost to a sale' : 'on ' + bMoney(s.costedRev) + ' of sales'),
        tile('Unpaid', bMoney(s.unpaid), s.unpaid ? 'warn' : '', 'sales on credit')),

      el('div', { className: 'bk-chartwrap' },
        el('div', { className: 'bk-legend' },
          el('span', {}, el('i', { className: 'sw in' }), 'Money in'),
          el('span', {}, el('i', { className: 'sw out' }), 'Money out')),
        bChart(buckets)),

      topCats.length ? el('div', {}, lbl('Where the money went',
        el('div', { className: 'bk-bars' }, ...topCats.map(([c, v]) => el('div', { className: 'bk-catrow' },
          el('span', { className: 'c-name' }, c),
          el('span', { className: 'c-bar' }, el('i', { style: { width: Math.round((v / topCats[0][1]) * 100) + '%' } })),
          el('span', { className: 'c-val' }, bMoney(v)))))) ) : null,

      el('div', { className: 'row' },
        el('button', { className: 'btn primary', onclick: () => bEntryModal(all, draw) }, '＋ Add entry'),
        el('button', { className: 'btn ghost', onclick: () => {
          if (!s.inRange.length) return toast('Nothing in this range', 'err');
          downloadCsv(`wa-crm-books-${from}-to-${to}.csv`, s.inRange.map(e => ({
            date: e.date, kind: e.kind, party: e.party || '', item: e.item || '',
            category: e.category || '', qty: e.qty || '', amount: e.amount || 0,
            cost: e.cost || '', method: e.method || '', note: e.note || '',
          })), ['date', 'kind', 'party', 'item', 'category', 'qty', 'amount', 'cost', 'method', 'note']);
        } }, 'Export CSV')),

      lbl(`Entries · ${s.count}`, bList(s.inRange, all, draw)));
  };

  b.append(el('div', { className: 'fp-note' },
    'Record what you sold, bought and spent. Cash profit is what reached your pocket; '
    + 'margin is how healthy the selling itself is.'), wrap);
  draw();
};

function bList(rows, all, redraw) {
  const list = el('div', { className: 'bk-list' });
  if (!rows.length) {
    list.append(el('div', { className: 'muted', style: { padding: '18px', textAlign: 'center' } },
      'Nothing recorded yet. Add a sale, a purchase or an expense to see your profit.'));
    return list;
  }
  rows.slice().sort((a, x) => (x.ts || 0) - (a.ts || 0)).slice(0, 300).forEach(e => {
    list.append(el('div', { className: 'bk-row' },
      el('span', { className: 'bk-kind ' + e.kind }, e.kind[0].toUpperCase()),
      el('div', { style: { flex: '1', minWidth: '0' } },
        el('b', {}, e.item || e.category || e.party || (BOOK_KINDS.find(k => k[0] === e.kind) || [])[1] || ''),
        el('div', { className: 'muted', style: { fontSize: '12px' } },
          [e.date, e.party, e.method, e.qty > 1 ? '×' + e.qty : ''].filter(Boolean).join(' · '))),
      el('span', { className: 'bk-amt ' + (e.kind === 'sale' ? 'in' : 'out') },
        (e.kind === 'sale' ? '+' : '−') + bMoney(e.amount)),
      el('button', { className: 'btn small ghost', onclick: () => {
        const i = all.indexOf(e); if (i > -1) all.splice(i, 1);
        store.set('ott_books', all); redraw();
      } }, 'Delete')));
  });
  return list;
}

function bEntryModal(all, redraw) {
  let kind = 'sale';
  const date = el('input', { type: 'date', value: bToday() });
  const party = el('input', { placeholder: 'Customer or supplier (optional)' });
  const item = el('input', { placeholder: 'What was it?' });
  const qty = el('input', { type: 'number', value: '1', min: '1' });
  const amount = el('input', { type: 'number', placeholder: 'Amount ₹' });
  const cost = el('input', { type: 'number', placeholder: 'What it cost you (optional)' });
  const cat = el('select'); EXPENSE_CATS.forEach(c => cat.append(el('option', { value: c }, c)));
  const method = el('select'); PAY_METHODS.forEach(m => method.append(el('option', { value: m }, m)));
  const note = el('textarea', { placeholder: 'Note (optional)' });

  const costRow = lbl('Cost price — powers your margin', cost);
  const catRow = lbl('Category', cat);
  const partyRow = lbl('Customer / supplier', party);
  const applyKind = () => {
    costRow.style.display = kind === 'sale' ? '' : 'none';
    catRow.style.display = kind === 'expense' ? '' : 'none';
    partyRow.style.display = kind === 'expense' ? 'none' : '';
    item.placeholder = kind === 'expense' ? 'What was it for?' : 'What was it?';
  };

  const tabs = el('div', { className: 'row' });
  BOOK_KINDS.forEach(([k, lab]) => tabs.append(el('button', {
    className: 'btn small' + (kind === k ? ' primary' : ''),
    onclick: () => {
      kind = k;
      [...tabs.children].forEach((btn, i) => { btn.className = 'btn small' + (BOOK_KINDS[i][0] === k ? ' primary' : ''); });
      applyKind();
    },
  }, lab)));

  const scrim = el('div', { className: 'modal-scrim', onclick: (e) => { if (e.target === scrim) scrim.remove(); } },
    el('div', { className: 'modal-box', style: { width: '440px', textAlign: 'left' } },
      el('h3', {}, 'Add to your books'),
      tabs, lbl('Date', date), partyRow, lbl('Item', item),
      el('div', { className: 'row' }, lbl('Qty', qty), lbl('Amount ₹', amount)),
      costRow, catRow, lbl('Paid by', method), lbl('Note', note),
      el('div', { className: 'row' },
        el('button', { className: 'btn ghost', onclick: () => scrim.remove() }, 'Cancel'),
        el('button', { className: 'btn primary', onclick: () => {
          const amt = Number(amount.value);
          if (!Number.isFinite(amt) || amt <= 0) return toast('Enter an amount', 'err');
          all.push({ id: Date.now(), ts: Date.now(), date: date.value || bToday(), kind,
            party: kind === 'expense' ? '' : party.value.trim(), item: item.value.trim(),
            category: kind === 'expense' ? cat.value : '',
            qty: Math.max(1, Number(qty.value) || 1), amount: amt,
            cost: kind === 'sale' ? (Number(cost.value) || 0) : 0,
            method: method.value, note: note.value.trim() });
          store.set('ott_books', all);
          scrim.remove(); redraw(); toast('Saved');
        } }, 'Save entry'))));

  document.body.append(scrim);
  applyKind();
  setTimeout(() => amount.focus(), 0);
}

// ================= Deals =================
// Records what a customer actually bought, straight from the chat widget, and then works
// the relationship on its own: a feedback nudge a week in, and a renewal reminder before
// the validity runs out. Both messages go out through the same send path as follow-ups,
// so they only fire while the app is running — the scheduler is not a server.

const DEAL_DEFAULTS = {
  feedbackUrl: '',
  fbDays: 7,
  fbTpl: 'Hi {name}, it has been {days} days since you started {item}. Is everything working well for you?\n\nIf anything is not right, tell us here and we will fix it: {link}',
  rnLead: 3,
  rnTpl: 'Hi {name}, your {item} expires on {expiry}. Reply RENEW and we will keep it running without a break.',
  autoFeedback: true,
  autoRenew: true,
};
const dealCfg = () => ({ ...DEAL_DEFAULTS, ...store.get('ott_deal_cfg', {}) });
const DAY = 86400000;
const dealDate = (ms) => new Date(ms).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

// Recompute the two due-dates from the purchase date and validity, so editing a deal
// re-arms anything that has not gone out yet.
function dealSchedule(d, cfg) {
  const lead = Math.max(0, cfg.rnLead) * DAY;
  // A renewal reminder must never land before the sale itself. On a plan shorter than the
  // lead time there is no "before" to aim at, so remind on the expiry day instead —
  // otherwise a 1-day trial tells the customer to renew seconds after they paid.
  d.rnAt = d.expires - lead > d.start ? d.expires - lead : d.expires;
  // Ask for feedback while the plan is still running, and never so late that it arrives
  // alongside the renewal nudge. 0 means "not scheduled" — on a short plan there is no
  // useful gap, and two messages at once reads as spam.
  const fb = d.start + Math.max(1, cfg.fbDays) * DAY;
  d.fbAt = fb < d.rnAt ? fb : 0;
  return d;
}

function dealFill(tpl, d) {
  const cfg = dealCfg();
  return String(tpl)
    .replace(/\{name\}/g, d.name || 'there')
    .replace(/\{item\}/g, d.item || 'your plan')
    .replace(/\{days\}/g, String(Math.max(1, Math.round((Date.now() - d.start) / DAY))))
    .replace(/\{expiry\}/g, dealDate(d.expires))
    .replace(/\{amount\}/g, d.amount ? '₹' + d.amount : '')
    .replace(/\{link\}/g, cfg.feedbackUrl || '')
    .trim();
}

function dealLog(id, text, ok) {
  const ds = store.get('ott_deals', []); const D = ds.find((x) => x.id === id);
  if (!D) return;
  D.logs = [{ ts: Date.now(), text, ok }, ...(D.logs || [])].slice(0, 20);
  store.set('ott_deals', ds);
}

async function sendDealMsg(d, kind) {
  const cfg = dealCfg();
  const tpl = kind === 'feedback' ? cfg.fbTpl : cfg.rnTpl;
  const body = dealFill(tpl, d);
  if (!body) return { ok: false };
  const accId = d.accId && document.querySelector(`webview[data-acc="${d.accId}"]`) ? d.accId : activeId;
  const r = await sendToJidOn(accId, digits(d.number) + '@c.us', body);
  dealLog(d.id, (kind === 'feedback' ? 'Feedback check-in' : 'Renewal reminder') + (r.ok ? ' sent' : ' failed'), r.ok);
  return r;
}

// Runs on the shared 15s scheduler tick. Marks the flag before sending so a slow send
// cannot be started twice by the next tick.
function dealTick() {
  const cfg = dealCfg();
  const ds = store.get('ott_deals', []); const now = Date.now(); let ch = false;
  for (const d of ds) {
    if (d.status !== 'active') continue;
    if (cfg.autoFeedback && !d.fbSent && d.fbAt && d.fbAt <= now) { d.fbSent = true; ch = true; sendDealMsg(d, 'feedback'); }
    if (cfg.autoRenew && !d.rnSent && d.rnAt && d.rnAt <= now) { d.rnSent = true; ch = true; sendDealMsg(d, 'renew'); }
  }
  if (ch) { store.set('ott_deals', ds); if (openFeatureId === 'deals') refreshPanel('deals'); }
}

// ---- Add / edit a deal ----
// Opened from the chat widget with the number already captured, or from the dashboard.
function dealModal(number, name, existing) {
  const cfg = dealCfg();
  const d = existing || {};
  const item = el('input', { placeholder: 'What did they buy?', value: d.item || '' });
  const amount = el('input', { type: 'number', placeholder: 'Amount ₹ (optional)', value: d.amount || '' });
  const cost = el('input', { type: 'number', min: '0', placeholder: 'What it cost you', value: d.cost || '' });

  // Pick a saved product to fill the rates in, rather than retyping them on every sale.
  // Both stay editable afterwards — a deal is often closed at a negotiated price.
  const products = store.get('ott_quick', []).filter((q) => q.title || q.text);
  const pick = el('select');
  pick.append(el('option', { value: '' }, products.length ? 'Choose a saved product…' : 'No products saved yet'));
  products.forEach((q, i) => pick.append(el('option', { value: String(i) },
    (q.title || deriveTitle(q.text) || 'Untitled') + (Number(q.sell) > 0 ? ` — ₹${q.sell}` : ''))));
  pick.onchange = () => {
    // Number('') is 0, so without this the placeholder resolves to the first product —
    // backing out of the picker would overwrite the rates you just typed.
    if (pick.value === '') return;
    const q = products[Number(pick.value)];
    if (!q) return;
    item.value = q.title || deriveTitle(q.text) || '';
    if (Number(q.sell) > 0) amount.value = String(q.sell);
    if (Number(q.cost) > 0) cost.value = String(q.cost);
    margin();
  };

  const marginNote = el('div', { className: 'fp-note', style: { margin: '2px 0 0' } });
  const margin = () => {
    const a = Number(amount.value) || 0, c = Number(cost.value) || 0;
    if (!a) { marginNote.textContent = ''; return; }
    marginNote.textContent = c > 0
      ? `Profit on this sale: ₹${(a - c).toLocaleString('en-IN')}${a - c < 0 ? ' — you are selling below cost' : ''}`
      : 'Add what it cost you and the profit shows up in Sales & Expenses.';
  };
  amount.oninput = cost.oninput = margin;
  const days = el('input', { type: 'number', min: '1', value: String(d.days || 30) });
  const start = el('input', { type: 'date', value: new Date(d.start || Date.now()).toISOString().slice(0, 10) });
  const note = el('textarea', { placeholder: 'Note (optional)', value: d.note || '' });
  const toBooks = chk(!existing);

  const expiryNote = el('div', { className: 'fp-note', style: { margin: '2px 0 0' } });
  // Derive the note from dealSchedule itself, so what it promises is exactly what will be
  // sent — a hardcoded "3 days before expiry" lies on plans shorter than the lead time.
  const restate = () => {
    const dv = Math.max(1, Number(days.value) || 1);
    const st = new Date(start.value || Date.now()).getTime();
    const p = dealSchedule({ start: st, expires: st + dv * DAY }, cfg);
    expiryNote.textContent = `Expires ${dealDate(p.expires)}`
      + (p.fbAt ? ` · feedback check-in ${dealDate(p.fbAt)}` : ' · too short for a feedback check-in')
      + ` · renewal reminder ${dealDate(p.rnAt)}`;
  };
  days.oninput = start.onchange = restate; restate();

  const scrim = el('div', { className: 'modal-scrim', onclick: (e) => { if (e.target === scrim) scrim.remove(); } },
    el('div', { className: 'modal-box', style: { width: '440px', textAlign: 'left' } },
      el('h3', {}, existing ? 'Edit deal' : 'Deal done'),
      el('div', { className: 'fp-note' }, `${name || number} · ${number}`),
      existing ? null : lbl('Fill from a saved product', pick),
      lbl('Item / plan', item),
      el('div', { className: 'row' }, lbl('Selling rate ₹', amount), lbl('Purchase rate ₹', cost)),
      marginNote,
      lbl('Validity (days)', days),
      lbl('Purchased on', start),
      expiryNote,
      lbl('Note', note),
      existing ? null : chkRow(toBooks, 'Also record this as a sale in Sales & Expenses'),
      el('div', { className: 'row' },
        el('button', { className: 'btn ghost', onclick: () => scrim.remove() }, 'Cancel'),
        el('button', { className: 'btn primary', onclick: () => {
          if (!item.value.trim()) return toast('Enter what they bought', 'err');
          const dv = Math.max(1, Number(days.value) || 1);
          const st = new Date(start.value || Date.now()).getTime();
          const ds = store.get('ott_deals', []);
          if (existing) {
            const D = ds.find((x) => x.id === existing.id);
            if (D) {
              Object.assign(D, { item: item.value.trim(), amount: Number(amount.value) || 0, cost: Number(cost.value) || 0, days: dv, start: st, expires: st + dv * DAY, note: note.value.trim() });
              // Re-arm anything that has not fired yet against the new dates.
              dealSchedule(D, cfg);
              store.set('ott_deals', ds);
            }
          } else {
            const nd = dealSchedule({
              id: Date.now(), number: digits(String(number)), name: name || '', accId: activeId,
              item: item.value.trim(), amount: Number(amount.value) || 0, cost: Number(cost.value) || 0, days: dv,
              start: st, expires: st + dv * DAY, note: note.value.trim(),
              fbSent: false, rnSent: false, status: 'active', logs: [],
            }, cfg);
            ds.push(nd);
            store.set('ott_deals', ds);
            if (toBooks.checked && nd.amount > 0) {
              const bk = store.get('ott_books', []);
              // Carrying the cost across is what makes the books show profit rather than
              // just turnover — a sale with cost 0 reads as 100% margin.
              bk.push({ id: Date.now() + 1, ts: Date.now(), date: new Date(st).toISOString().slice(0, 10), kind: 'sale',
                party: name || number, item: nd.item, category: '', qty: 1, amount: nd.amount, cost: nd.cost,
                method: 'Cash', note: 'From deal' });
              store.set('ott_books', bk);
            }
          }
          scrim.remove();
          if (openFeatureId === 'deals') refreshPanel('deals');
          toast(existing ? 'Deal updated' : 'Deal saved');
        } }, existing ? 'Save changes' : 'Save deal'))));

  document.body.append(scrim);
  setTimeout(() => item.focus(), 0);
}

// ---- Dashboard ----
RENDER.deals = (b) => {
  const wrap = el('div', {});
  let filter = 'active';

  const draw = () => {
    wrap.innerHTML = '';
    const cfg = dealCfg();
    const ds = store.get('ott_deals', []);
    const now = Date.now();
    const active = ds.filter((d) => d.status === 'active' && d.expires > now);
    const expired = ds.filter((d) => d.status === 'active' && d.expires <= now);
    const soon = active.filter((d) => d.expires - now <= 7 * DAY);
    const revenue = ds.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const profit = ds.reduce((s, d) => s + ((Number(d.amount) || 0) - (Number(d.cost) || 0)), 0);

    wrap.append(el('div', { className: 'bk-kpis', style: { gridTemplateColumns: 'repeat(4, 1fr)' } },
      dKpi('Active deals', String(active.length), 'Running right now', 'good'),
      dKpi('Expiring in 7 days', String(soon.length), soon.length ? 'Reach out before they lapse' : 'Nothing due', soon.length ? 'warn' : ''),
      dKpi('Expired', String(expired.length), 'Awaiting renewal', expired.length ? 'bad' : ''),
      dKpi('Total value', '₹' + revenue.toLocaleString('en-IN'),
        profit !== revenue ? `₹${profit.toLocaleString('en-IN')} profit` : 'All deals recorded')));

    const tabs = el('div', { className: 'row', style: { marginTop: '10px' } });
    [['active', `Active (${active.length})`], ['soon', `Expiring (${soon.length})`], ['expired', `Expired (${expired.length})`], ['all', `All (${ds.length})`]]
      .forEach(([k, lab]) => tabs.append(el('button', {
        className: 'btn small' + (filter === k ? ' primary' : ''),
        onclick: () => { filter = k; draw(); },
      }, lab)));
    tabs.append(el('button', { className: 'btn small ghost', onclick: () => exportDealsCsv(ds) }, 'Export CSV'));
    wrap.append(tabs);

    const shown = filter === 'active' ? active : filter === 'soon' ? soon : filter === 'expired' ? expired : ds;
    const list = el('div', { className: 'rules', style: { marginTop: '10px' } });
    if (!shown.length) {
      list.append(el('div', { className: 'muted' }, ds.length
        ? 'No deals in this view.'
        : 'No deals yet — open a chat and use “Deal done” on the widget above the message box.'));
    }
    shown.slice().sort((x, y) => x.expires - y.expires).forEach((d) => list.append(dealCard(d, cfg, draw)));
    wrap.append(list);
    wrap.append(dealSettings(cfg, draw));
  };

  b.append(el('div', { className: 'fp-note' },
    'Log what each customer bought, and this checks in on them automatically: a feedback message once they have had time to use it, and a renewal reminder before their validity runs out. Both send only while WA-CRM is open.'), wrap);
  draw();
};

// A margin chip. Selling below cost is a real case — swapped rate fields, or a genuine
// loss-leader — and it must not read as a gain: "+₹-100" in green is worse than useless.
function marginChip(sell, cost, title) {
  const p = (Number(sell) || 0) - (Number(cost) || 0);
  return el('span', { className: 'rate-tag ' + (p < 0 ? 'loss' : 'margin'), title: p < 0 ? 'Selling below cost' : title },
    (p < 0 ? '−₹' : '+₹') + Math.abs(p).toLocaleString('en-IN'));
}

function dKpi(label, value, sub, tone) {
  return el('div', { className: 'bk-kpi' + (tone ? ' ' + tone : '') },
    el('span', { className: 'k-lab' }, label),
    el('b', {}, value),
    el('span', { className: 'k-hint' }, sub));
}

function dealCard(d, cfg, redraw) {
  const now = Date.now();
  const left = Math.ceil((d.expires - now) / DAY);
  const tone = left < 0 ? 'gone' : left <= 7 ? 'soon' : 'ok';
  const state = left < 0 ? `Expired ${Math.abs(left)}d ago` : left === 0 ? 'Expires today' : `${left} days left`;

  const act = (label, fn, ghost) => el('button', { className: 'btn small' + (ghost ? ' ghost' : ''), onclick: fn }, label);

  return el('div', { className: 'card', style: { padding: '10px 12px', marginBottom: '8px' } },
    el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
      el('b', {}, d.item || '(no item)'),
      d.amount ? el('span', { className: 'muted', style: { fontSize: '12px' } }, '₹' + Number(d.amount).toLocaleString('en-IN')) : null,
      Number(d.cost) > 0 ? marginChip(d.amount, d.cost, 'Profit on this sale') : null,
      el('span', { className: 'deal-when ' + tone }, state)),
    el('div', { className: 'muted', style: { fontSize: '12px', marginTop: '3px' } },
      `${d.name || d.number} · ${d.number} · ${dealDate(d.start)} → ${dealDate(d.expires)}`),
    el('div', { className: 'muted', style: { fontSize: '11.5px', marginTop: '3px' } },
      `Feedback ${d.fbSent ? 'sent' : d.fbAt ? 'due ' + dealDate(d.fbAt) : 'not scheduled — plan too short'}`
      + ` · Renewal ${d.rnSent ? 'sent' : 'due ' + dealDate(d.rnAt)}`),
    d.note ? el('div', { className: 'muted', style: { fontSize: '12px', marginTop: '3px' } }, d.note) : null,
    el('div', { className: 'row', style: { marginTop: '8px' } },
      act('Send feedback now', async () => {
        if (!cfg.feedbackUrl) toast('Tip: add a feedback link below', 'err');
        const r = await sendDealMsg(d, 'feedback');
        if (r.ok) { const ds = store.get('ott_deals', []); const D = ds.find((x) => x.id === d.id); if (D) { D.fbSent = true; store.set('ott_deals', ds); } redraw(); toast('Feedback message sent'); }
        else toast('Could not send — is this account linked?', 'err');
      }),
      act('Send renewal now', async () => {
        const r = await sendDealMsg(d, 'renew');
        if (r.ok) { const ds = store.get('ott_deals', []); const D = ds.find((x) => x.id === d.id); if (D) { D.rnSent = true; store.set('ott_deals', ds); } redraw(); toast('Renewal reminder sent'); }
        else toast('Could not send — is this account linked?', 'err');
      }, true),
      act('Renewed', () => {
        // Roll the same plan forward from today and re-arm both messages.
        const ds = store.get('ott_deals', []); const D = ds.find((x) => x.id === d.id);
        if (D) { D.start = Date.now(); D.expires = D.start + D.days * DAY; D.fbSent = false; D.rnSent = false; dealSchedule(D, cfg); store.set('ott_deals', ds); }
        redraw(); toast('Rolled forward — validity restarts today');
      }, true),
      act('Edit', () => dealModal(d.number, d.name, d), true),
      act('Delete', () => {
        store.set('ott_deals', store.get('ott_deals', []).filter((x) => x.id !== d.id));
        redraw();
      }, true)));
}

function dealSettings(cfg, redraw) {
  const link = el('input', { placeholder: 'https://… your feedback form', value: cfg.feedbackUrl });
  const fbDays = el('input', { type: 'number', min: '1', value: String(cfg.fbDays) });
  const rnLead = el('input', { type: 'number', min: '0', value: String(cfg.rnLead) });
  const fbTpl = el('textarea', { value: cfg.fbTpl });
  const rnTpl = el('textarea', { value: cfg.rnTpl });
  const autoF = chk(cfg.autoFeedback), autoR = chk(cfg.autoRenew);

  const save = () => {
    store.set('ott_deal_cfg', {
      feedbackUrl: link.value.trim(), fbDays: Math.max(1, Number(fbDays.value) || 7),
      rnLead: Math.max(0, Number(rnLead.value) || 0),
      fbTpl: fbTpl.value, rnTpl: rnTpl.value,
      autoFeedback: autoF.checked, autoRenew: autoR.checked,
    });
    // Re-arm every deal that has not been messaged yet against the new timings.
    const c = dealCfg(); const ds = store.get('ott_deals', []);
    ds.forEach((d) => { if (!d.fbSent || !d.rnSent) dealSchedule(d, c); });
    store.set('ott_deals', ds);
    toast('Deal settings saved'); redraw();
  };

  return el('details', { className: 'deal-set' },
    el('summary', {}, 'Follow-up settings'),
    el('div', { className: 'deal-set-body' },
      el('div', { className: 'fp-note' }, 'Placeholders: {name} {item} {days} {expiry} {amount} {link}'),
      lbl('Feedback link — fills {link}', link),
      el('div', { className: 'row' }, lbl('Feedback after (days)', fbDays), lbl('Renewal reminder (days before expiry)', rnLead)),
      lbl('Feedback message', fbTpl),
      lbl('Renewal message', rnTpl),
      chkRow(autoF, 'Send the feedback check-in automatically'),
      chkRow(autoR, 'Send the renewal reminder automatically'),
      el('button', { className: 'btn primary', style: { marginTop: '8px' }, onclick: save }, 'Save settings')));
}

function exportDealsCsv(ds) {
  if (!ds.length) return toast('No deals to export', 'err');
  const rows = ds.map((d) => ({
    name: d.name || '', number: d.number, item: d.item || '', amount: d.amount || 0,
    cost: d.cost || 0, profit: (Number(d.amount) || 0) - (Number(d.cost) || 0),
    validity_days: d.days, purchased: new Date(d.start).toISOString().slice(0, 10),
    expires: new Date(d.expires).toISOString().slice(0, 10),
    days_left: Math.ceil((d.expires - Date.now()) / DAY),
    feedback_sent: d.fbSent ? 'yes' : 'no', renewal_sent: d.rnSent ? 'yes' : 'no',
    status: d.expires <= Date.now() ? 'expired' : d.status, note: d.note || '',
  }));
  downloadCsv('wa-crm-deals.csv', rows, ['name', 'number', 'item', 'amount', 'cost', 'profit',
    'validity_days', 'purchased', 'expires', 'days_left', 'feedback_sent', 'renewal_sent', 'status', 'note']);
}


function promptModal(title, sub, def = '') {
  return new Promise((resolve) => {
    const inp = el('input', { value: def, placeholder: sub || '' });
    let settled = false;
    const done = (v) => { if (settled) return; settled = true; scrim.remove(); resolve(v); };
    const box = el('div', { className: 'modal-box' },
      el('h3', {}, title),
      sub ? el('div', { className: 'muted', style: { fontSize: '12.5px', marginTop: '-6px' } }, sub) : null,
      inp,
      el('div', { className: 'row' },
        el('button', { className: 'btn ghost', onclick: () => done(null) }, 'Cancel'),
        el('button', { className: 'btn primary', onclick: () => done(inp.value.trim() || null) }, 'Add')));
    const scrim = el('div', { className: 'modal-scrim', onclick: (e) => { if (e.target === scrim) done(null); } }, box);
    document.body.append(scrim);
    inp.focus(); inp.select();
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(inp.value.trim() || null); if (e.key === 'Escape') done(null); });
  });
}

// ================= broadcast helpers =================
const jidNumber = (jid) => String(jid || '').split('@')[0];
function personalize(text, rec) { return text.replace(/\[NAME\]/gi, (rec && rec.name) ? rec.name : jidNumber(rec && rec.jid || '')); }
function wrapSel(ta, before, after) {
  const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value; const sel = v.slice(s, e) || 'text';
  ta.value = v.slice(0, s) + before + sel + after + v.slice(e);
  ta.focus(); ta.selectionStart = s + before.length; ta.selectionEnd = s + before.length + sel.length;
}
async function sendToJid(jid, text) {
  const body = JSON.stringify(spin(withSignature(text)));
  return waExec(`(async()=>{try{await WPP.chat.sendTextMessage(${JSON.stringify(jid)},${body},{createChat:true});return{ok:true}}catch(e){return{ok:false,err:String(e&&e.message||e)}}})()`).catch(e => ({ ok: false, err: String(e) }));
}
async function sendMediaToJid(jid, dataUrl, caption, filename) {
  const c = JSON.stringify(dataUrl), cap = JSON.stringify(spin(withSignature(caption || ''))), fn = JSON.stringify(filename || 'file');
  return waExec(`(async()=>{try{await WPP.chat.sendFileMessage(${JSON.stringify(jid)},${c},{type:'auto',caption:${cap},filename:${fn},createChat:true});return{ok:true}}catch(e){return{ok:false,err:String(e&&e.message||e)}}})()`).catch(e => ({ ok: false, err: String(e) }));
}
function checkList(items, preselect) {
  const all = chk(false);
  const head = el('label', { style: { flexDirection: 'row', alignItems: 'center', gap: '8px', fontWeight: '600' } }, all, `Select all (${items.length})`);
  const list = el('div', { className: 'checklist-body' });
  const rows = items.map(it => { const c = chk(!!(preselect && preselect.has(it.jid))); list.append(el('label', { className: 'checkrow' }, c, `${it.name || jidNumber(it.jid)} `, el('span', { className: 'muted', style: { fontSize: '11px' } }, jidNumber(it.jid)))); return { c, it }; });
  all.onchange = () => rows.forEach(x => x.c.checked = all.checked);
  return { node: el('div', {}, head, list), selected: () => rows.filter(x => x.c.checked).map(x => x.it) };
}
// Set of user-ids that are in the phone's contacts ("saved").
async function savedSet() {
  const arr = await waExec("(async()=>{try{${PH_RESOLVER};const c=await WPP.contact.list();var o=[];for(var i=0;i<c.length;i++){if(!c[i].isMyContact)continue;var ph=await _ph(c[i].id);if(ph)o.push(ph);}return o}catch(e){return[]}})()").catch(() => []);
  return new Set(arr);
}
// Injected resolver: WID -> real phone number, '' for privacy LIDs that can't be resolved.
// Injected into the webview and shared by the chat widget and the quick-reply bar.
//
// Both float over the bottom of the conversation on a layer above WhatsApp's own UI, so
// when WhatsApp opens the attach menu, emoji picker or a context menu in that same space,
// our elements sit on top and eat the clicks — the menu items look dead. __ottMenuOpen()
// reports whether one of those surfaces is up so callers can stand down, and __ottOnMenu()
// fires a callback as soon as the DOM changes rather than on the next poll.
const MENU_GUARD = `window.__ottMenuOpen=window.__ottMenuOpen||function(box){
  try{
    var sel='[role="menu"],[role="dialog"],[role="listbox"],[data-animate-dropdown-in="true"],[data-animate-modal-body="true"]';
    var ns=document.querySelectorAll(sel);
    for(var i=0;i<ns.length;i++){
      var n=ns[i];
      /* Skip our own surfaces. */
      if(n.id&&n.id.indexOf('ott-')===0)continue;
      if(n.closest&&n.closest('#ott-w,#ott-qr-bar'))continue;
      var r=n.getBoundingClientRect();
      if(r.width<60||r.height<60)continue;
      /* An element spanning almost the whole viewport is the app shell, not a popup. */
      if(r.width>innerWidth*0.9&&r.height>innerHeight*0.9)continue;
      /* Only stand down for something that actually covers us — an unrelated dialog
         elsewhere on screen is no reason to disappear. */
      if(!box)return true;
      if(r.left<box.right&&r.right>box.left&&r.top<box.bottom&&r.bottom>box.top)return true;
    }
  }catch(e){}
  return false;
};
/* Our strip and widget are position:fixed over the bottom of the conversation, so they
   cover the newest messages — the one place the user is actually reading. Padding the
   message scroller reserves that space instead, so WhatsApp scrolls its own content clear
   of us. Each caller registers its own height and the total is applied once. */
/* Cached: this runs on every DOM mutation, and #main holds thousands of divs once a
   conversation is loaded. Re-scanning each time made WhatsApp itself sluggish. */
window.__ottScroller=window.__ottScroller||function(){
  try{
    var c=window.__ottSc;
    if(c&&c.isConnected&&c.clientHeight>200)return c;
    var main=document.querySelector('#main'); if(!main)return (window.__ottSc=null);
    var ns=main.querySelectorAll('div');
    for(var i=0;i<ns.length;i++){
      var n=ns[i];
      if(n.clientHeight<200)continue;
      var oy=getComputedStyle(n).overflowY;
      if(oy==='auto'||oy==='scroll')return (window.__ottSc=n);
    }
  }catch(e){/* reserving space is an enhancement, never a hard requirement */}
  return (window.__ottSc=null);
};
window.__ottReserve=window.__ottReserve||function(key,px){
  var pads=window.__ottPads=window.__ottPads||{};
  pads[key]=px>0?px:0;
  var total=0; for(var k in pads)total+=pads[k];
  var s=window.__ottScroller(); if(!s)return;
  try{
    /* Re-apply after a re-render: the fresh node has no marker even though total is same. */
    if(s.getAttribute('data-ott-pad')===String(total))return;
    var atBottom=(s.scrollHeight-s.scrollTop-s.clientHeight)<40;
    s.style.paddingBottom=total+'px';
    s.setAttribute('data-ott-pad',String(total));
    /* Growing the padding pushes the last message out of view unless we follow it down. */
    if(atBottom)s.scrollTop=s.scrollHeight;
  }catch(e){}
};
window.__ottOnMenu=window.__ottOnMenu||function(fn){
  var cbs=window.__ottMenuCbs=window.__ottMenuCbs||[];
  cbs.push(fn);
  if(window.__ottMenuObs)return;
  var t=0;
  var fire=function(){clearTimeout(t);t=setTimeout(function(){cbs.forEach(function(f){try{f();}catch(e){}});},40);};
  window.__ottMenuObs=new MutationObserver(fire);
  window.__ottMenuObs.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click',fire,true);
  document.addEventListener('keydown',fire,true);
};`;

const PH_RESOLVER = "async function _ph(id){try{if(!id)return '';if(id.server==='c.us')return id.user||'';if(id.server==='lid'){var f=(self.WPP&&WPP.whatsapp&&WPP.whatsapp.functions)||{};var names=['getPhoneNumber','getCusFromLid','getUserFromLid','getPnFromLid'];for(var j=0;j<names.length;j++){var fn=f[names[j]];if(typeof fn==='function'){try{var r=await fn(id);if(r){if(r.user&&/^[0-9]+$/.test(r.user))return r.user;if(typeof r==='string'&&r.indexOf('@')>0){var u=r.split('@')[0];if(/^[0-9]+$/.test(u))return u;}}}catch(e){}}}return '';}return (id.user&&/^[0-9]+$/.test(id.user))?id.user:'';}catch(e){return '';}}";

// ================= tiny utils =================
function chk(checked) { return el('input', { type: 'checkbox', checked }); }
function statusTag(s) {
  const colors = { new: '#3b82f6', contacted: '#f59e0b', followup: '#8b5cf6', proposal: '#0ea5e9', won: '#12b866', lost: '#e5484d' };
  const labels = { new: 'New', contacted: 'Contacted', followup: 'Follow-up', proposal: 'Proposal', won: 'Won', lost: 'Lost' };
  const c = colors[s] || '#64727b';
  return el('span', { style: { background: c + '22', color: c, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.3px', whiteSpace: 'nowrap' } }, labels[s] || s || '');
}
// Lead temperature (type) pill.
function typeTag(t) {
  const colors = { new: '#3b82f6', hot: '#e5484d', warm: '#f59e0b', cold: '#06b6d4' };
  const c = colors[t] || '#64727b';
  return el('span', { style: { background: c + '22', color: c, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.3px', whiteSpace: 'nowrap' } }, t || 'new');
}
function chkRow(input, label) { return el('label', { style: { flexDirection: 'row', alignItems: 'center', gap: '10px' } }, input, label); }

// ================= Backup & Restore =================
// One file format shared with the WA-CRM Chrome extension, so a backup taken on either
// side restores into the other. Desktop keys are ott_*, the extension's are wa_*; the
// map below is what makes them interchangeable.
const BACKUP_MAP = [
  ['ott_leads', 'wa_leads', 'Leads'],
  ['ott_quick', 'wa_quick', 'Quick replies'],
  ['ott_invoice_cfg', 'wa_business', 'Business details'],
  ['ott_invoices', null, 'Invoices'],
  ['ott_invoice_items', null, 'Saved invoice items'],
  ['ott_reminders', 'wa_reminders', 'Reminders'],
  ['ott_schedule', 'wa_scheduled', 'Scheduled messages'],
  ['ott_lead_seqs', 'wa_funnels', 'Follow-up sequences'],
  ['ott_offers', null, 'Auto offer posts'],
  ['ott_sig', null, 'Message signature'],
  ['ott_notes', 'wa_notes', 'Chat notes'],
  ['ott_books', 'wa_books', 'Sales, purchases & expenses'],
  ['ott_deals', 'wa_deals', 'Deals & renewals'],
  ['ott_deal_cfg', 'wa_deal_cfg', 'Deal follow-up settings'],
];
const bkCount = (v) => (Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : (v ? 1 : 0)));

function collectBackup() {
  const data = {}; const compat = {};
  for (const [dk, wk] of BACKUP_MAP) {
    const v = store.get(dk, null);
    if (v == null) continue;
    data[dk] = v;
    if (wk) compat[wk] = v;
  }
  return {
    app: 'WA-CRM', kind: 'backup', version: 1, platform: 'desktop',
    exportedAt: new Date().toISOString(), data, compat,
  };
}

// Accept a file written by either product.
function readBackup(payload) {
  if (!payload || payload.app !== 'WA-CRM' || (!payload.data && !payload.compat)) return null;
  const src = payload.data || {};
  const ext = payload.compat || payload.data || {};
  const out = {};
  for (const [dk, wk] of BACKUP_MAP) {
    if (dk in src) out[dk] = src[dk];
    else if (wk && wk in ext) out[dk] = ext[wk];
  }
  return Object.keys(out).length ? out : null;
}

function bkMerge(key, incoming) {
  const cur = store.get(key, Array.isArray(incoming) ? [] : null);
  if (Array.isArray(cur) && Array.isArray(incoming)) {
    const idOf = (x) => String((x && (x.number || x.id || x.title || x.name)) || JSON.stringify(x));
    const seen = new Set(cur.map(idOf));
    return cur.concat(incoming.filter((x) => !seen.has(idOf(x))));
  }
  if (cur && typeof cur === 'object' && incoming && typeof incoming === 'object') return Object.assign({}, cur, incoming);
  return incoming;
}

RENDER.backup = (b) => {
  const stats = el('div', { className: 'log', style: { maxHeight: '220px' } });
  BACKUP_MAP.forEach(([dk, , label]) => {
    line(stats, `${label}: ${bkCount(store.get(dk, null))}`);
  });

  const msg = el('div', { className: 'muted', style: { fontSize: '12.5px', minHeight: '20px', marginTop: '10px' } });

  const doExport = async () => {
    const json = JSON.stringify(collectBackup(), null, 2);
    const r = await ott.backupSave(json);
    if (!r || r.canceled) return;
    if (r.ok) {
      msg.textContent = `Saved to ${r.path} (${Math.max(1, Math.round(r.bytes / 1024))} KB).`;
      toast('Backup saved');
    } else {
      msg.textContent = 'Could not save: ' + (r.err || 'unknown error');
    }
  };

  const doImport = async (mode) => {
    const f = await ott.backupOpen();
    if (!f || f.canceled) return;
    if (!f.ok) { msg.textContent = 'Could not read that file: ' + (f.err || ''); return; }
    let payload;
    try { payload = JSON.parse(f.json); } catch (e) { msg.textContent = 'That file is not a WA-CRM backup.'; return; }
    const incoming = readBackup(payload);
    if (!incoming) { msg.textContent = 'That file is not a WA-CRM backup.'; return; }

    const summary = BACKUP_MAP.filter(([dk]) => dk in incoming)
      .map(([dk, , label]) => `${label}: ${bkCount(incoming[dk])}`).join('\n');
    const where = payload.platform === 'desktop' ? 'the desktop app' : 'the Chrome extension';
    const verb = mode === 'replace' ? 'REPLACE everything currently stored' : 'ADD to what is already stored';
    if (!confirm(`Backup from ${where}, taken ${String(payload.exportedAt || '').slice(0, 10)}.\n\n${summary}\n\nThis will ${verb}. Continue?`)) return;

    for (const [dk] of BACKUP_MAP) {
      if (!(dk in incoming)) continue;
      store.set(dk, mode === 'replace' ? incoming[dk] : bkMerge(dk, incoming[dk]));
    }
    msg.textContent = 'Restored.';
    toast('Backup restored');
    refreshPanel('backup');
  };

  b.append(
    el('div', { className: 'muted', style: { fontSize: '12.5px', marginBottom: '14px', lineHeight: '1.6' } },
      'Your leads, invoices and saved replies live on this computer. Export a backup before '
      + 'changing machine, then import it on the new one. The same file works in the WA-CRM '
      + 'Chrome extension, and a backup taken there restores here.'),
    lbl('What is stored right now', stats),
    el('div', { className: 'row' },
      el('button', { className: 'btn primary', onclick: doExport }, 'Save a backup file'),
      el('button', { className: 'btn ghost', onclick: () => doImport('merge') }, 'Merge from a file'),
      el('button', { className: 'btn ghost', onclick: () => doImport('replace') }, 'Replace from a file')),
    msg,
    el('div', { className: 'muted', style: { fontSize: '12px', marginTop: '16px', lineHeight: '1.6' } },
      'Your licence key is not included. A licence belongs to the machine it was activated on '
      + '— enter your key on the new computer and this data will be waiting.'));
};

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
