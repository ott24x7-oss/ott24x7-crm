// Saves a PNG of every screen. Needs preview/server.js running. Run: npx electron preview/capture.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
const out = path.join(__dirname, 'screens'); fs.mkdirSync(out, { recursive: true });
const base = 'http://localhost:5178/renderer/index.html';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { webviewTag: false } });
  const shot = async (name) => fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG());
  await win.loadURL(base + '?gate=1'); await wait(1200); await shot('00-licence-gate');
  await win.webContents.executeJavaScript("showProductCard()"); await wait(400); await shot('00b-pricing-plans');
  await win.loadURL(base + '?noacc=1'); await wait(1500); await shot('01-main-empty');
  await win.loadURL(base); await wait(1500); await shot('01b-main-with-account');
  await win.webContents.executeJavaScript("openThemePicker && openThemePicker()").catch(() => {}); await wait(400); await shot('02-theme-picker');
  await win.loadURL(base); await wait(1500);
  const feats = await win.webContents.executeJavaScript('FEATURES.filter(f => f.id && f.name).map(f => [f.id, f.name])');
  let i = 3;
  for (const [id, name] of feats) {
    await win.webContents.executeJavaScript(`closeFeature(); openFeature(FEATURES.find(f => f.id === ${JSON.stringify(id)}))`).catch((e) => console.log('fail', id, e.message));
    await wait(500);
    await shot(String(i++).padStart(2, '0') + '-' + name.replace(/[^\w &-]/g, ''));
  }
  console.log('saved', fs.readdirSync(out).length, 'screens to', out);
  app.quit();
});
