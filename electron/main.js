const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const config = require('../config.js');
const license = require('./license.js');

let win;

// Extract phone-number-like tokens (7–15 digits) from arbitrary text.
function extractNumbers(text) {
  const out = [];
  const seen = new Set();
  for (const m of String(text).matchAll(/\d[\d\s\-()]{5,}\d/g)) {
    const d = m[0].replace(/\D/g, '');
    if (d.length >= 7 && d.length <= 15 && !seen.has(d)) { seen.add(d); out.push(d); }
  }
  return out;
}

// Remote content (WhatsApp Web) must not be able to silently take the camera, microphone
// or location. WhatsApp only needs notifications and clipboard to work normally; anything
// more sensitive is denied rather than auto-granted.
const ALLOWED_PERMISSIONS = new Set(['notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'background-sync']);
function hardenSession(sess) {
  try {
    sess.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(ALLOWED_PERMISSIONS.has(permission));
    });
    sess.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));
  } catch (e) { /* older Electron */ }
}

// Every account gets its own partition, so harden each one as it appears, and stop any
// embedded page from opening arbitrary windows or navigating the app away from WhatsApp.
function guardWebContents() {
  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() === 'webview') {
      try { hardenSession(contents.session); } catch (_) {}
      // <webview> has allowpopups; without a handler any link could spawn an unrestricted
      // Electron window. Send external links to the real browser instead.
      contents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        return { action: 'deny' };
      });
      contents.on('will-navigate', (ev, url) => {
        // Keep the guest on WhatsApp; anything else opens externally.
        if (!/^https:\/\/([a-z0-9-]+\.)*whatsapp\.(com|net)\//i.test(url)) {
          ev.preventDefault();
          if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        }
      });
      contents.on('will-attach-webview', (ev) => ev.preventDefault()); // no nested webviews
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    backgroundColor: '#0a0f14',
    icon: path.join(__dirname, '..', 'assets', 'wa-crm.ico'),
    title: 'WA-CRM',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // we embed WhatsApp Web in a <webview>
    },
  });

  // A recent Chrome UA for the WhatsApp partition so WA Web loads normally.
  const waSession = session.fromPartition(config.WA_PARTITION);
  waSession.setUserAgent(config.USER_AGENT);
  hardenSession(waSession);

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.removeMenu();
}

// ---- IPC: license ----
ipcMain.handle('license:deviceId', () => license.deviceId());
ipcMain.handle('license:load', () => license.loadKey(app));
ipcMain.handle('license:save', (_e, key) => { license.saveKey(app, key); return true; });
ipcMain.handle('license:clear', () => { license.clearKey(app); return true; });
ipcMain.handle('license:activate', (_e, key) => license.activate(key));
ipcMain.handle('license:validate', (_e, key) => license.validate(key));
ipcMain.handle('license:trial', () => license.trial());
ipcMain.handle('app:openExternal', (_e, url) => {
  if (/^https?:\/\//i.test(String(url))) shell.openExternal(url);
});

// ---- IPC: hand the wa-js bundle source to the renderer for injection ----
ipcMain.handle('wa:getEngine', () => {
  return fs.readFileSync(path.join(__dirname, '..', 'assets', 'wa-js.js'), 'utf8');
});

ipcMain.handle('app:config', () => ({
  server: config.LICENSE_SERVER,
  product: config.PRODUCT_SLUG,
}));

// Import numbers from a .csv / .txt / .xlsx / .xls file.
ipcMain.handle('app:importNumbers', async (_e, filePath) => {
  try {
    const ext = path.extname(filePath || '').toLowerCase();

    // Plain text formats are safe to read directly.
    if (ext !== '.xlsx' && ext !== '.xls') {
      const text = fs.readFileSync(filePath, 'utf8');
      return { ok: true, numbers: extractNumbers(text) };
    }

    // Spreadsheets are untrusted input handed to a parser with known issues. Refuse
    // absurd files outright, then parse in a worker with a hard timeout so neither
    // prototype pollution nor a ReDoS payload can reach or stall the main process.
    const MAX = 25 * 1024 * 1024;
    const size = fs.statSync(filePath).size;
    if (size > MAX) return { ok: false, err: 'File is too large (max 25 MB).' };

    return await new Promise((resolve) => {
      let settled = false;
      const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
      let worker;
      try {
        worker = new Worker(path.join(__dirname, 'xlsx-worker.js'), {
          workerData: { filePath },
          resourceLimits: { maxOldGenerationSizeMb: 512 },
        });
      } catch (e) {
        return finish({ ok: false, err: String((e && e.message) || e) });
      }
      const timer = setTimeout(() => {
        try { worker.terminate(); } catch (_) {}
        finish({ ok: false, err: 'That file took too long to read and was stopped.' });
      }, 20000);
      worker.on('message', (msg) => { clearTimeout(timer); try { worker.terminate(); } catch (_) {} finish(msg); });
      worker.on('error', (err) => { clearTimeout(timer); finish({ ok: false, err: String((err && err.message) || err) }); });
      worker.on('exit', () => { clearTimeout(timer); finish({ ok: false, err: 'Could not read that file.' }); });
    });
  } catch (e) {
    return { ok: false, err: String((e && e.message) || e) };
  }
});

// Durable data store in userData (survives app updates — NSIS never touches userData).
function dataDir() { const d = path.join(app.getPath('userData'), 'data'); fs.mkdirSync(d, { recursive: true }); return d; }
ipcMain.handle('persist:load', (_e, key) => {
  try { const p = path.join(dataDir(), key.replace(/[^\w-]/g, '') + '.json'); if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {}
  return null;
});
ipcMain.handle('persist:save', (_e, key, value) => {
  try { fs.writeFileSync(path.join(dataDir(), key.replace(/[^\w-]/g, '') + '.json'), JSON.stringify(value)); return true; } catch (e) { return false; }
});

// Render invoice HTML → PDF (base64 data URL) using Electron's built-in Chromium.
ipcMain.handle('invoice:pdf', async (_e, html) => {
  let win2, tmp;
  try {
    tmp = path.join(app.getPath('temp'), 'ott-invoice-' + Date.now() + '.html');
    fs.writeFileSync(tmp, String(html), 'utf8');
    win2 = new BrowserWindow({ show: false, width: 800, height: 1120, webPreferences: { offscreen: true, javascript: false } });
    await win2.loadFile(tmp);
    await new Promise((r) => setTimeout(r, 350));
    const buf = await win2.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'none' } });
    return { ok: true, data: 'data:application/pdf;base64,' + buf.toString('base64') };
  } catch (e) {
    return { ok: false, err: String(e && e.message || e) };
  } finally {
    try { if (win2) win2.destroy(); } catch (_) {}
    try { if (tmp) fs.unlinkSync(tmp); } catch (_) {}
  }
});

// Translate via Google's public endpoint from the main process (no CORS).
ipcMain.handle('app:translate', async (_e, { text, tl }) => {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
    const r = await fetch(url);
    const j = await r.json();
    return { ok: true, text: (j[0] || []).map((x) => x[0]).join('') };
  } catch (e) {
    return { ok: false, err: String(e) };
  }
});

// macOS refuses to auto-update an app that is not code-signed, so on darwin we check the
// releases feed ourselves and send the user to the download page instead of failing.
const RELEASES_API = 'https://api.github.com/repos/ott24x7-oss/ott24x7-crm-releases/releases/latest';
const RELEASES_PAGE = 'https://github.com/ott24x7-oss/ott24x7-crm-releases/releases/latest';

function newer(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}

async function checkManualUpdate() {
  const r = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('releases feed ' + r.status);
  const latest = String((await r.json()).tag_name || '').replace(/^v/, '');
  if (latest && newer(latest, app.getVersion())) {
    win?.webContents.send('update:available', { version: latest, manual: true, url: RELEASES_PAGE });
  } else {
    win?.webContents.send('update:none');
  }
}

function initManualUpdate() {
  ipcMain.handle('update:check', () => checkManualUpdate().catch((e) => {
    win?.webContents.send('update:error', { message: String((e && e.message) || e) });
  }));
  // The download and install handlers must still exist so the preload bridge is complete.
  ipcMain.handle('update:download', () => shell.openExternal(RELEASES_PAGE));
  ipcMain.handle('update:install', () => shell.openExternal(RELEASES_PAGE));
  setTimeout(() => checkManualUpdate().catch(() => {}), 6000);
  setInterval(() => checkManualUpdate().catch(() => {}), 6 * 3600 * 1000);
}

function initAutoUpdate() {
  // Only in a packaged build; checks the public releases repo for a newer version.
  if (!app.isPackaged) return;
  if (process.platform === 'darwin') return initManualUpdate();
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;              // ask the user first (popup)
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available', (info) => win?.webContents.send('update:available', { version: info.version }));
    autoUpdater.on('update-not-available', () => win?.webContents.send('update:none'));
    autoUpdater.on('download-progress', (p) => win?.webContents.send('update:progress', { percent: Math.round(p.percent || 0) }));
    autoUpdater.on('update-downloaded', () => win?.webContents.send('update:downloaded'));
    autoUpdater.on('error', (err) => win?.webContents.send('update:error', { message: String(err && err.message || err) }));
    ipcMain.handle('update:download', () => { try { autoUpdater.downloadUpdate(); } catch (e) {} });
    ipcMain.handle('update:install', () => { try { autoUpdater.quitAndInstall(); } catch (e) {} });
    ipcMain.handle('update:check', () => { try { return autoUpdater.checkForUpdates().catch(() => {}); } catch (e) {} });
    // Delay the first check so the renderer has attached its update listeners.
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 6000);
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60000);
  } catch (e) { /* updater unavailable — ignore */ }
}

app.whenReady().then(() => {
  try { app.setAppUserModelId('com.ott24x7.crm'); } catch (_) {}
  // Smoke mode: boot the main process and quit (CI/verification, no GUI needed).
  if (process.env.OTT_SMOKE) {
    console.log('OTT_SMOKE ok: main process booted, IPC handlers registered');
    setTimeout(() => app.quit(), 300);
    return;
  }
  guardWebContents();
  createWindow();
  initAutoUpdate();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
