const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
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

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    backgroundColor: '#0a0f14',
    icon: path.join(__dirname, '..', 'assets', 'ott24x7.ico'),
    title: 'ott24x7 CRM',
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
    let text = '';
    if (ext === '.xlsx' || ext === '.xls') {
      const XLSX = require('xlsx');
      const wb = XLSX.readFile(filePath);
      for (const sheet of wb.SheetNames) {
        text += XLSX.utils.sheet_to_csv(wb.Sheets[sheet]) + '\n';
      }
    } else {
      text = fs.readFileSync(filePath, 'utf8');
    }
    const numbers = extractNumbers(text);
    return { ok: true, numbers };
  } catch (e) {
    return { ok: false, err: String(e && e.message || e) };
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

function initAutoUpdate() {
  // Only in a packaged build; checks the public releases repo for a newer version.
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-downloaded', () => { win?.webContents.send('app:update-ready'); });
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
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
  createWindow();
  initAutoUpdate();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
