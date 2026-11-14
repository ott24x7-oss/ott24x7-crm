// Saves each feature panel at full height (no inner scroll) to preview/audit/. Needs server.js running.
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
const out = path.join(__dirname, process.argv[2] || 'audit'); fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 2400, show: false, webPreferences: { webviewTag: false, zoomFactor: 1 } });
  win.setContentSize(1440, 2400);
  await win.loadURL('http://localhost:5178/renderer/index.html'); await wait(1500);
  const demo = fs.readFileSync(path.join(__dirname, 'demo-gb.json'), 'utf8');
  await win.webContents.executeJavaScript(`localStorage.setItem('ott_gb', ${JSON.stringify(demo)})`);
  await win.loadURL('http://localhost:5178/renderer/index.html'); await wait(1500);
  const feats = await win.webContents.executeJavaScript('FEATURES.filter(f => f.id && f.name).map(f => [f.id, f.name])');
  let i = 1;
  for (const [id, name] of feats) {
    const rect = await win.webContents.executeJavaScript(`(async () => {
      closeFeature(); openFeature(FEATURES.find(f => f.id === ${JSON.stringify(id)}));
      await new Promise(r => setTimeout(r, 900));
      const p = document.querySelector('.feature-panel'); const b = document.getElementById('fpBody');
      p.style.maxHeight = 'none'; b.style.overflow = 'visible'; p.style.top = '10px';
      await new Promise(r => setTimeout(r, 200));
      const r = p.getBoundingClientRect(); return { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.width), height: Math.min(Math.ceil(r.height), 2380) };
    })()`).catch((e) => { console.log('fail', id, e.message); return null; });
    if (!rect) continue;
    const img = await win.webContents.capturePage(rect);
    fs.writeFileSync(path.join(out, String(i++).padStart(2, '0') + '-' + name.replace(/[^\w &-]/g, '') + '.png'), img.toPNG());
  }
  console.log('saved', i - 1); app.quit();
});
