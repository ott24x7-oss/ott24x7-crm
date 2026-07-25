const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config.js');
const license = require('./license.js');

let win;

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

app.whenReady().then(() => {
  // Smoke mode: boot the main process and quit (CI/verification, no GUI needed).
  if (process.env.OTT_SMOKE) {
    console.log('OTT_SMOKE ok: main process booted, IPC handlers registered');
    setTimeout(() => app.quit(), 300);
    return;
  }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
