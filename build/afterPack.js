// electron-builder afterPack hook — runs on the packed app before the installer is built.
//
// Chromium ships ~55 locale .pak files (~40 MB) for its OWN chrome: context menus,
// spell-check prompts, the print and save dialogs. None of it reaches our UI, which is
// plain HTML in renderer/, and WhatsApp Web localises itself from the web. So every
// locale but the fallback is dead weight in the installer.
//
// Not done via electron-builder's `electronLanguages`, which only takes effect on
// macOS/Linux — on Windows the .pak files are copied regardless.
const fs = require('node:fs');
const path = require('node:path');

const KEEP = new Set(['en-US.pak']);

exports.default = async function afterPack(context) {
  const dir = path.join(context.appOutDir, 'locales');
  if (!fs.existsSync(dir)) return;

  let freed = 0;
  const removed = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.pak') || KEEP.has(name)) continue;
    const p = path.join(dir, name);
    freed += fs.statSync(p).size;
    fs.rmSync(p);
    removed.push(name);
  }

  // Loud on purpose: if this ever silently removes nothing (an Electron layout change,
  // say), the installer quietly grows 40 MB again and nobody notices.
  console.log(removed.length
    ? `  • trimmed ${removed.length} unused Chromium locales, freed ${(freed / 1048576).toFixed(1)} MB`
    : '  • WARNING: no locales trimmed — check the Electron output layout');
};
