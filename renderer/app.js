const $ = (s) => document.querySelector(s);
const wa = () => $('#wa');
let engineInjected = false;
let sending = false;

// ---------- boot ----------
window.addEventListener('DOMContentLoaded', async () => {
  $('#deviceId').textContent = (await ott.deviceId()).slice(0, 12) + '…';

  const savedKey = await ott.licenseLoad();
  if (savedKey) {
    $('#licenseKey').value = savedKey;
    const r = await safe(() => ott.licenseValidate(savedKey));
    if (r && r.valid && r.trusted) return enterApp();
  }
  showGate();
});

function showGate() { $('#gate').classList.remove('hidden'); $('#app').classList.add('hidden'); }

$('#activateBtn').addEventListener('click', activate);
$('#licenseKey').addEventListener('keydown', (e) => { if (e.key === 'Enter') activate(); });

async function activate() {
  const key = $('#licenseKey').value.trim();
  const msg = $('#gateMsg');
  if (!key) { msg.className = 'msg err'; msg.textContent = 'Enter a license key.'; return; }
  msg.className = 'msg'; msg.textContent = 'Activating…';
  const r = await safe(() => ott.licenseActivate(key));
  if (!r) { msg.className = 'msg err'; msg.textContent = 'Cannot reach license server.'; return; }
  if (r.valid && r.trusted) {
    await ott.licenseSave(key);
    msg.className = 'msg ok'; msg.textContent = 'Activated!';
    setTimeout(enterApp, 400);
  } else if (r.valid && !r.trusted) {
    msg.className = 'msg err'; msg.textContent = 'Server response failed verification.';
  } else {
    msg.className = 'msg err'; msg.textContent = 'Activation failed: ' + (r.reason || 'invalid');
  }
}

// ---------- app ----------
function enterApp() {
  $('#gate').classList.add('hidden');
  $('#app').classList.remove('hidden');

  document.querySelectorAll('.nav').forEach((n) => n.addEventListener('click', () => {
    document.querySelectorAll('.nav').forEach((x) => x.classList.remove('active'));
    n.classList.add('active');
    const v = n.dataset.view;
    $('#view-connect').classList.toggle('hidden', v !== 'connect');
    $('#view-sender').classList.toggle('hidden', v !== 'sender');
  }));

  $('#logoutBtn').addEventListener('click', async () => {
    if (!confirm('Deactivate this device? You will need the key to use it again.')) return;
    await ott.licenseClear();
    location.reload();
  });

  const el = wa();
  el.addEventListener('dom-ready', injectEngine);
  el.addEventListener('did-navigate', () => { engineInjected = false; });
  setInterval(pollStatus, 2500);

  $('#startBtn').addEventListener('click', startCampaign);
  $('#stopBtn').addEventListener('click', () => { sending = false; });
}

async function injectEngine() {
  if (engineInjected) return;
  try {
    const src = await ott.getEngine();
    await wa().executeJavaScript(src, true);
    engineInjected = true;
  } catch (e) { console.warn('inject failed', e); }
}

async function pollStatus() {
  const s = $('#waStatus');
  const txt = s.querySelector('.txt');
  const expr = `(async () => {
    if (typeof WPP === 'undefined') return {state:'injecting'};
    try {
      const authed = await WPP.conn.isAuthenticated();
      if (!authed) return {state:'qr'};
      let me = null; try { me = WPP.conn.getMyUserId()?.user; } catch(_){}
      const ready = (typeof WPP.conn.isMainReady === 'function') ? await WPP.conn.isMainReady() : !!WPP.isReady;
      return {state: ready ? 'connected' : 'syncing', me};
    } catch (e) { return {state:'loading'}; }
  })()`;
  let info;
  try { info = await wa().executeJavaScript(expr); }
  catch { info = { state: 'loading' }; }

  s.className = 'status';
  if (info.state === 'connected') { s.classList.add('connected'); txt.textContent = 'Connected' + (info.me ? ' · +' + info.me : ''); }
  else if (info.state === 'qr') { txt.textContent = 'Scan QR to link'; }
  else if (info.state === 'syncing') { txt.textContent = 'Syncing…'; }
  else if (info.state === 'injecting') { txt.textContent = 'Loading engine…'; }
  else { txt.textContent = 'Loading WhatsApp…'; }
}

// ---------- sender ----------
function spin(text) {
  return text.replace(/\{([^{}]+)\}/g, (_, g) => {
    const opts = g.split('|'); return opts[Math.floor(Math.random() * opts.length)];
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function isConnected() {
  try {
    return await wa().executeJavaScript(
      "(async()=>{ try{ return (await WPP.conn.isAuthenticated()) === true; }catch(e){ return false; } })()"
    );
  } catch { return false; }
}

async function sendOne(number, text) {
  const jid = JSON.stringify(number.replace(/\D/g, '') + '@c.us');
  const body = JSON.stringify(spin(text));
  const expr = `(async()=>{ try{ await WPP.chat.sendTextMessage(${jid}, ${body}, {createChat:true}); return {ok:true}; }catch(e){ return {ok:false, err:String(e&&e.message||e)}; } })()`;
  try { return await wa().executeJavaScript(expr); }
  catch (e) { return { ok: false, err: String(e) }; }
}

async function startCampaign() {
  if (sending) return;
  const numbers = $('#numbers').value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const message = $('#message').value.trim();
  const dMin = Math.max(1, Number($('#delayMin').value) || 4);
  const dMax = Math.max(dMin, Number($('#delayMax').value) || 9);
  const log = $('#log'); const bar = $('#bar');

  if (!numbers.length) return toast('Add at least one number', true);
  if (!message) return toast('Write a message', true);
  if (!(await isConnected())) return toast('WhatsApp not connected — link it first', true);

  sending = true;
  $('#startBtn').disabled = true; $('#stopBtn').disabled = false;
  log.textContent = ''; bar.style.width = '0%';
  let done = 0, ok = 0, fail = 0;

  for (const num of numbers) {
    if (!sending) { logLine(log, 'Stopped by user.', 'bad'); break; }
    const res = await sendOne(num, message);
    done++;
    if (res.ok) { ok++; logLine(log, `✓ ${num}`, 'ok'); }
    else { fail++; logLine(log, `✗ ${num} — ${res.err || 'failed'}`, 'bad'); }
    bar.style.width = Math.round((done / numbers.length) * 100) + '%';
    if (sending && done < numbers.length) {
      const wait = (dMin + Math.random() * (dMax - dMin)) * 1000;
      await sleep(wait);
    }
  }

  sending = false;
  $('#startBtn').disabled = false; $('#stopBtn').disabled = true;
  logLine(log, `Finished — ${ok} sent, ${fail} failed of ${numbers.length}.`, ok ? 'ok' : 'bad');
  toast(`Done: ${ok} sent, ${fail} failed`);
}

// ---------- utils ----------
function logLine(box, text, cls) {
  const span = document.createElement('span');
  if (cls) span.className = cls;
  span.textContent = text + '\n';
  box.appendChild(span); box.scrollTop = box.scrollHeight;
}
async function safe(fn) { try { return await fn(); } catch { return null; } }
let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = 'toast hidden'), 2600);
}
