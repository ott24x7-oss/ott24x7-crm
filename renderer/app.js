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
  chats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M7 9h10M7 13h6"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
};

const FEATURES = [
  { id: 'chatfilters', name: 'Chat Filters', icon: IC.chats, impl: true, sub: [['all', 'All'], ['unread', 'Unread'], ['groups', 'Groups'], ['chats', 'Chats'], ['contacts', 'Contacts'], ['noncontacts', 'Non-contacts']] },
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
  { id: 'blur', name: 'Blur Settings', icon: IC.eye, impl: true },
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
  makeDraggable($('#featurePanel'), $('#featurePanel .fp-head'));

  accounts = store.get('ott_accounts', []);
  accounts.forEach(createWebview);
  renderTabs();
  if (accounts.length) switchAccount(accounts[0].id);
  else $('#waEmpty').style.display = 'flex';
  setInterval(pollStatus, 2500);
  startScheduler();
  try { ott.onUpdateReady(() => toast('Update downloaded — restart the app to apply', 'ok')); } catch (_) {}
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
  wv.style.display = 'none';
  wv.addEventListener('dom-ready', async () => {
    if (wv.dataset.injected) return;
    try { await wv.executeJavaScript(engineSrc, true); wv.dataset.injected = '1'; applyAutoreply(acc.id); applyGuard(acc.id); applyBlur(acc.id); } catch (e) { console.warn('inject', e); }
  });
  wv.addEventListener('did-navigate', () => { wv.dataset.injected = ''; });
  $('#waStage').append(wv);
}

function switchAccount(id) {
  activeId = id;
  $('#waEmpty').style.display = 'none';
  document.querySelectorAll('#waStage webview').forEach(w => { w.style.display = w.dataset.acc === id ? 'flex' : 'none'; });
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
let pendingChatFilter = null;
function renderRail() {
  const rail = $('#rail'); rail.innerHTML = '';
  FEATURES.forEach(f => {
    if (f.divider) { rail.append(el('div', { className: 'rail-divider' }, f.divider)); return; }
    if (f.sub) {
      const sub = el('div', { className: 'rail-sub hidden' });
      f.sub.forEach(([v, n]) => sub.append(el('div', { className: 'rail-subitem', onclick: () => { pendingChatFilter = v; openFeature(f); } }, n)));
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
function openFeature(f) {
  if (!activeWv()) return toast('Add a WhatsApp account first', 'err');
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
    else if (mode.value === 'contacts') { targetBox.append(el('button', { className: 'btn small', onclick: async () => { if (!(await ensureConn())) return; const cs = await waExec("(async()=>{try{const c=await WPP.contact.list();return c.filter(x=>x.isMyContact).map(x=>({jid:((x.id&&x.id.user)||'')+'@c.us',name:x.name||x.pushname||x.formattedName||''})).filter(x=>x.jid!=='@c.us')}catch(e){return[]}})()").catch(() => []); setList(cs, `${cs.length} contacts loaded`); } }, 'Load my contacts'), el('div', { id: 'tgtlist' })); }
    else if (mode.value === 'groups') { targetBox.append(el('button', { className: 'btn small', onclick: async () => { if (!(await ensureConn())) return; const gs = await waExec("(async()=>{try{const g=await WPP.chat.list({onlyGroups:true});return g.map(x=>({jid:x.id&&x.id._serialized,name:(x.groupMetadata&&x.groupMetadata.subject)||x.name||x.formattedTitle||''}))}catch(e){return[]}})()").catch(() => []); setList(gs, `${gs.length} groups loaded`); } }, 'Load groups'), el('div', { id: 'tgtlist' })); }
    else if (mode.value === 'groupmembers') { targetBox.append(el('div', { className: 'row' }, el('button', { className: 'btn small', onclick: async () => { const n = await loadGroupsInto(gsel); if (n) toast(`${n} groups`); } }, 'Load groups')), gsel, el('div', { className: 'row', style: { marginTop: '8px' } }, el('button', { className: 'btn small', onclick: async () => { const gid = gsel.value; if (!gid) return toast('Pick a group', 'err'); const ps = await waExec(`(async()=>{try{const p=await WPP.group.getParticipants(${JSON.stringify(gid)});return p.map(m=>({jid:m.id.user+'@c.us',name:''}))}catch(e){return[]}})()`).catch(() => []); setList(ps, `${ps.length} members`); } }, 'Load members')), el('div', { id: 'tgtlist' })); }
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
  const applyFilter = (list, f) => f === 'saved' ? list.filter(x => x.saved) : f === 'unsaved' ? list.filter(x => !x.saved) : list;
  function finish(msg) {
    out.innerHTML = '';
    if (msg) { line(out, msg, 'bad'); toast(msg, 'err'); return; }
    if (!rows.length) { line(out, 'Nothing extracted.', 'bad'); toast('Nothing found', 'err'); return; }
    rows.slice(0, 300).forEach(r => line(out, `${r.number}${r.name ? ' · ' + r.name : ''}${r.saved != null ? (r.saved ? '  (saved)' : '  (unsaved)') : ''}`, 'ok'));
    toast(`Extracted ${rows.length}`);
  }
  async function run() {
    if (!(await ensureConn())) return;
    rows = []; out.innerHTML = ''; line(out, 'Extracting…');
    const s = source.value, f = filter.value;
    if (s === 'contacts') {
      rows = await waExec("(async()=>{try{const c=await WPP.contact.list();return c.filter(x=>x.isMyContact).map(x=>({number:(x.id&&x.id.user)||'',name:x.name||x.pushname||'',saved:true})).filter(x=>x.number)}catch(e){return[]}})()").catch(() => []);
    } else if (s === 'chatlist') {
      const cs = await waExec("(async()=>{try{const l=await WPP.chat.list();return l.filter(c=>!(c.isGroup||(c.id&&c.id.server==='g.us'))).map(c=>({number:(c.id&&c.id.user)||'',name:(c.contact&&c.contact.name)||'',saved:!!(c.contact&&c.contact.isMyContact)})).filter(c=>c.number)}catch(e){return[]}})()").catch(() => []);
      rows = applyFilter(cs, f);
    } else if (s === 'groups') {
      const saved = await savedSet();
      let gids = [];
      if (scope.value === 'specific') { if (!gsel.value) return finish('Load & pick a group'); gids = [gsel.value]; }
      else gids = await waExec("(async()=>{try{const g=await WPP.chat.list({onlyGroups:true});return g.map(x=>x.id&&x.id._serialized).filter(Boolean)}catch(e){return[]}})()").catch(() => []);
      const seen = new Set();
      for (const gid of gids) {
        const ms = await waExec(`(async()=>{try{const p=await WPP.group.getParticipants(${JSON.stringify(gid)});return p.map(m=>m.id.user)}catch(e){return[]}})()`).catch(() => []);
        for (const u of ms) { if (!u || seen.has(u)) continue; seen.add(u); rows.push({ number: u, name: '', saved: saved.has(u) }); }
      }
      rows = applyFilter(rows, f);
    } else if (s === 'label') {
      if (!lsel.value) return finish('Load & pick a label');
      const cs = await waExec(`(async()=>{try{const l=await WPP.chat.list({withLabels:[${JSON.stringify(lsel.value)}]});return l.map(c=>({number:(c.id&&c.id.user)||'',name:(c.contact&&c.contact.name)||'',saved:!!(c.contact&&c.contact.isMyContact)})).filter(c=>c.number)}catch(e){return[]}})()`).catch(() => []);
      rows = applyFilter(cs, f);
    }
    finish();
  }
  b.append(
    el('div', { className: 'fp-note' }, 'Extract numbers/contacts from THIS account. “Saved” = in your phone contacts, “Unsaved” = not.'),
    lbl('Source', source), opts,
    el('div', { className: 'row' },
      el('button', { className: 'btn primary', onclick: run }, 'Extract'),
      el('button', { className: 'btn ghost', onclick: () => { if (rows.length) downloadCsv('ott24x7-extract.csv', rows, ['number', 'name', 'saved']); else toast('Extract first', 'err'); } }, 'Export CSV')),
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

// ================= Chat Filters =================
RENDER.chatfilters = (b) => {
  const sel = el('select');
  [['all', 'All chats'], ['unread', 'Unread'], ['groups', 'Groups only'], ['chats', 'Individual chats'], ['contacts', 'My contacts'], ['noncontacts', 'Non-contacts']].forEach(([v, n]) => sel.append(el('option', { value: v }, n)));
  const out = el('div', { className: 'log' }); let rows = [];
  b.append(el('div', { className: 'fp-note' }, 'Pull a filtered view of the chats on THIS account. Export the result to reuse in Broadcast.'),
    lbl('Filter', sel),
    el('div', { className: 'row' },
      el('button', { className: 'btn primary', onclick: run }, 'Apply filter'),
      el('button', { className: 'btn ghost', onclick: () => { if (rows.length) downloadCsv('ott24x7-chats.csv', rows, ['name', 'number', 'type']); } }, 'Export CSV')),
    out);
  async function run() {
    if (!(await isConnected())) return toast('WhatsApp not linked', 'err');
    const f = sel.value;
    const opt = f === 'groups' ? '{onlyGroups:true}' : f === 'unread' ? '{onlyWithUnreadMessage:true}' : '{}';
    const expr = `(async()=>{try{const l=await WPP.chat.list(${opt});return l.map(c=>({name:(c.name||c.formattedTitle||(c.contact&&c.contact.name)||'')+'',user:(c.id&&c.id.user)||'',isGroup:!!(c.isGroup||(c.id&&c.id.server==='g.us')),isMyContact:!!(c.contact&&c.contact.isMyContact)}))}catch(e){return[]}})()`;
    let list = await waExec(expr).catch(() => []);
    rows = list.map(c => ({ name: c.name, number: c.user, type: c.isGroup ? 'group' : (c.isMyContact ? 'contact' : 'chat') }));
    if (f === 'chats') rows = rows.filter(x => x.type !== 'group');
    if (f === 'contacts') rows = rows.filter(x => x.type === 'contact');
    if (f === 'noncontacts') rows = rows.filter(x => x.type === 'chat');
    out.innerHTML = '';
    if (!rows.length) { line(out, 'No chats match this filter.', 'bad'); return; }
    rows.slice(0, 250).forEach(c => line(out, `${c.name || c.number || '—'}  ·  ${c.type}`, 'ok'));
    toast(`${rows.length} chats matched`);
  }
  if (pendingChatFilter) { const p = pendingChatFilter; pendingChatFilter = null; sel.value = p; setTimeout(run, 40); }
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
  }, 15000);
}
function setJobStatus(key, id, status, extra) { const arr = store.get(key, []); const j = arr.find(x => x.id === id); if (j) { j.status = status; if (extra) Object.assign(j, extra); store.set(key, arr); } }
async function runSchedule(job) {
  if (!(await isConnectedOn(job.accId))) { setJobStatus('ott_schedule', job.id, 'failed'); toast(`Scheduled broadcast failed: ${job.accName} not linked`, 'err'); refreshPanel('schedule'); return; }
  let ok = 0, fail = 0;
  for (const n of job.numbers) { const r = await sendTextOn(job.accId, n, job.message); r.ok ? ok++ : fail++; await sleep((job.delayMin + Math.random() * (job.delayMax - job.delayMin)) * 1000); }
  setJobStatus('ott_schedule', job.id, 'sent', { ok, fail }); toast(`Scheduled broadcast sent: ${ok}/${job.numbers.length}`); refreshPanel('schedule');
}
async function fireReminder(r) {
  if (r.number && await isConnectedOn(r.accId)) await sendTextOn(r.accId, r.number, r.text);
  try { new Notification('ott24x7 CRM · Reminder', { body: r.text }); } catch (_) {}
  toast('Reminder: ' + r.text.slice(0, 40)); setJobStatus('ott_reminders', r.id, 'done'); refreshPanel('reminder');
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
  const number = el('input', { placeholder: 'Number to message (with country code)' });
  const text = el('textarea', { placeholder: 'Reminder message' });
  const when = el('input', { type: 'datetime-local' });
  const list = el('div', { className: 'rules' });
  const draw = () => {
    list.innerHTML = ''; const rs = store.get('ott_reminders', []).filter(r => r.accId === activeId).reverse();
    if (!rs.length) list.append(el('div', { className: 'muted' }, 'No reminders.'));
    rs.forEach(r => list.append(el('div', { className: 'qr-item' },
      el('div', { className: 'txt' }, el('b', {}, new Date(r.when).toLocaleString()), el('div', { className: 'muted', style: { fontSize: '12px' } }, `${r.number || 'alert only'} · ${r.status}`)),
      el('button', { className: 'btn small ghost', onclick: () => { store.set('ott_reminders', store.get('ott_reminders', []).filter(x => x.id !== r.id)); draw(); } }, r.status === 'pending' ? 'Cancel' : 'Remove'))));
  };
  b.append(el('div', { className: 'fp-note' }, 'At the set time this sends a WhatsApp message (if a number is given) and shows a desktop alert. Fires only while the app stays open.'),
    lbl('Number (optional — leave blank for alert only)', number), lbl('Message', text), lbl('Remind at', when),
    el('button', { className: 'btn primary', onclick: () => {
      if (!text.value.trim()) return toast('Write a message', 'err'); if (!when.value) return toast('Pick a time', 'err');
      const t = new Date(when.value).getTime(); if (isNaN(t) || t <= Date.now()) return toast('Pick a future time', 'err');
      const rs = store.get('ott_reminders', []); rs.push({ id: 'r' + Date.now(), accId: activeId, number: digits(number.value), text: text.value.trim(), when: new Date(t).toISOString(), status: 'pending' });
      store.set('ott_reminders', rs); number.value = text.value = ''; draw(); toast('Reminder set');
      try { if (Notification.permission === 'default') Notification.requestPermission(); } catch (_) {}
    } }, 'Set reminder'),
    el('div', { style: { borderTop: '1px solid var(--line)', margin: '4px 0' } }), list);
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
    const sel = el('select'); const msg = el('textarea', { placeholder: 'Message to send to the selected group' }); const out = el('div', { className: 'log' });
    box.append(lbl('Group', sel),
      el('div', { className: 'row' }, el('button', { className: 'btn', onclick: async () => { const n = await loadGroupsInto(sel); if (n) toast(`${n} groups`); } }, 'Load groups'),
        el('button', { className: 'btn', onclick: async () => {
          const gid = sel.value; if (!gid) return toast('Pick a group', 'err');
          const code = await waExec(`(async()=>{try{return await WPP.group.getInviteCode(${JSON.stringify(gid)})}catch(e){return ''}})()`).catch(() => '');
          if (code) { const link = 'https://chat.whatsapp.com/' + code; navigator.clipboard.writeText(link); line(out, 'Invite: ' + link, 'ok'); toast('Invite link copied'); } else toast('Need admin or failed', 'err');
        } }, 'Get invite link')),
      lbl('Message to group', msg), quickInsert(msg),
      el('div', { className: 'row' }, el('button', { className: 'btn primary', onclick: async () => {
          const gid = sel.value; if (!gid) return toast('Pick a group', 'err'); if (!msg.value.trim()) return toast('Write a message', 'err');
          const r = await sendToJid(gid, msg.value.trim());
          line(out, r.ok ? '✓ Sent to group' : '✗ ' + (r.err || 'failed'), r.ok ? 'ok' : 'bad'); toast(r.ok ? 'Sent' : 'Failed', r.ok ? 'ok' : 'err');
        } }, 'Send to group'),
        el('button', { className: 'btn ghost', style: { color: 'var(--danger)' }, onclick: async () => {
          const gid = sel.value; if (!gid) return toast('Pick a group', 'err'); if (!confirm('Leave this group?')) return;
          const r = await waExec(`(async()=>{try{await WPP.group.leave(${JSON.stringify(gid)});return{ok:true}}catch(e){return{ok:false,err:String(e&&e.message||e)}}})()`).catch(e => ({ ok: false, err: String(e) }));
          toast(r.ok ? 'Left group' : 'Failed', r.ok ? 'ok' : 'err'); if (r.ok) loadGroupsInto(sel);
        } }, 'Leave group')),
      out);
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
      const ids = await waExec(`(async()=>{try{const p=await WPP.group.getParticipants(${JSON.stringify(gid)});return p.map(m=>(m.id&&(m.id._serialized||(m.id.user+'@c.us')))||'')}catch(e){return[]}})()`).catch(() => []);
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
function attachControl() {
  let file = null;
  const label = el('span', { className: 'muted', style: { fontSize: '12.5px' } }, 'No file attached');
  const clear = el('button', { className: 'btn ghost small', style: { display: 'none' }, onclick: () => { file = null; label.textContent = 'No file attached'; clear.style.display = 'none'; } }, 'Remove');
  const inp = el('input', { type: 'file', accept: 'image/*,video/*,.pdf', style: { display: 'none' }, onchange: (e) => {
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
function checkList(items) {
  const all = el('input', { type: 'checkbox', style: { width: 'auto' } });
  const head = el('label', { style: { flexDirection: 'row', alignItems: 'center', gap: '8px', fontWeight: '600' } }, all, `Select all (${items.length})`);
  const list = el('div', { className: 'checklist-body' });
  const rows = items.map(it => { const c = chk(false); list.append(el('label', { className: 'checkrow' }, c, `${it.name || jidNumber(it.jid)} `, el('span', { className: 'muted', style: { fontSize: '11px' } }, jidNumber(it.jid)))); return { c, it }; });
  all.onchange = () => rows.forEach(x => x.c.checked = all.checked);
  return { node: el('div', {}, head, list), selected: () => rows.filter(x => x.c.checked).map(x => x.it) };
}
// Set of user-ids that are in the phone's contacts ("saved").
async function savedSet() {
  const arr = await waExec("(async()=>{try{const c=await WPP.contact.list();return c.filter(x=>x.isMyContact).map(x=>(x.id&&x.id.user)||'').filter(Boolean)}catch(e){return[]}})()").catch(() => []);
  return new Set(arr);
}

// ================= tiny utils =================
function chk(checked) { return el('input', { type: 'checkbox', checked, style: { width: 'auto' } }); }
function chkRow(input, label) { return el('label', { style: { flexDirection: 'row', alignItems: 'center', gap: '10px' } }, input, label); }
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
