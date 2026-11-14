// Saves PNGs of the Group Broadcast screens with demo data. Needs preview/server.js running.
// Run: npx electron preview/capture-gb.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
const out = path.join(__dirname, 'screens'); fs.mkdirSync(out, { recursive: true });
const base = 'http://localhost:5178/renderer/index.html';
const demo = fs.readFileSync(path.join(__dirname, 'demo-gb.json'), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { webviewTag: false } });
  const js = (s) => win.webContents.executeJavaScript(s).catch((e) => console.log('fail', e.message));
  const shot = async (name) => fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG());
  const click = (sel, text) => js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)})); b && b.click(); return !!b })()`);
  await win.loadURL(base); await wait(800);
  await js(`localStorage.setItem('ott_gb', ${JSON.stringify(demo)})`);
  await win.loadURL(base); await wait(1500);
  await js(`gbTab = 'groups'; gbLabelFilter = 'all'; openFeature(FEATURES.find(f => f.id === 'gbroadcast'))`); await wait(1000);
  await js(`refreshPanel('gbroadcast')`); await wait(1200);
  await shot('29-Group Broadcast - all groups');
  await js(`gbLabelFilter = [...gbLoad().labels][0].id; refreshPanel('gbroadcast')`); await wait(600);
  await shot('30-Group Broadcast - label view');
  await click('.gb-tab', 'Offers'); await wait(500);
  await shot('31-Group Broadcast - offers');
  await click('.gb button', '＋ New offer'); await wait(500);
  await shot('32-Group Broadcast - new offer composer');
  await win.loadURL(base); await wait(1500);
  await js(`openFeature(FEATURES.find(f => f.id === 'gbroadcast'))`); await wait(600);
  await click('.gb-tab', 'Activity'); await wait(500);
  await shot('33-Group Broadcast - activity & settings');
  console.log('done'); app.quit();
});
