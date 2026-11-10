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
const { spawnSync } = require('node:child_process');
const brand = require('../brand.js');

const KEEP = new Set(['en-US.pak']);

function findRcedit() {
  const root = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'winCodeSign');
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 3 || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (name === 'rcedit-x64.exe') found.push(p);
      else {
        try { if (fs.statSync(p).isDirectory()) walk(p, depth + 1); } catch { /* ignore */ }
      }
    }
  };
  walk(root, 0);
  found.sort();
  return found[found.length - 1] || null;
}

function findSignTool() {
  const kit = path.join(process.env['ProgramFiles(x86)'] || '', 'Windows Kits', '10', 'bin');
  const hits = [];
  const walk = (dir, depth) => {
    if (depth > 3 || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (name.toLowerCase() === 'signtool.exe' && /\\x64\\/i.test(p)) hits.push(p);
      else {
        try { if (fs.statSync(p).isDirectory()) walk(p, depth + 1); } catch { /* ignore */ }
      }
    }
  };
  walk(kit, 0);
  hits.sort();
  return hits[hits.length - 1] || null;
}

function signFile(file) {
  if (!file || !fs.existsSync(file) || !/\.exe$/i.test(file)) return;
  const signtool = findSignTool();
  if (!signtool) {
    console.log(`  • skip sign (signtool not found): ${path.basename(file)}`);
    return;
  }
  const r = spawnSync(signtool, [
    'sign', '/fd', 'SHA256', '/td', 'SHA256',
    '/tr', 'http://timestamp.digicert.com',
    '/n', 'watshop Automation',
    file,
  ], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.log(`  • WARNING: signing failed for ${path.basename(file)} (is the Watshop Automation cert installed?)`);
    return;
  }
  console.log(`  • signed ${path.basename(file)} as Watshop Automation`);
}

function stampWindowsExe(context) {
  if (context.electronPlatformName !== 'win32') return;
  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exe = path.join(context.appOutDir, exeName);
  if (!fs.existsSync(exe)) {
    console.log(`  • WARNING: ${exeName} missing, skipped icon/publisher stamp`);
    return;
  }
  const rcedit = findRcedit();
  if (!rcedit) {
    console.log('  • WARNING: rcedit-x64.exe not in electron-builder cache — exe may keep Electron/GitHub metadata');
    return;
  }
  const icon = path.join(context.packager.projectDir, 'assets', brand.icon);
  const version = context.packager.appInfo.version;
  const year = new Date().getFullYear();
  const args = [
    exe,
    '--set-icon', icon,
    '--set-version-string', 'CompanyName', brand.company,
    '--set-version-string', 'FileDescription', brand.name,
    '--set-version-string', 'ProductName', brand.name,
    '--set-version-string', 'LegalCopyright', `Copyright © ${year} ${brand.company}`,
    '--set-version-string', 'OriginalFilename', exeName,
    '--set-version-string', 'InternalName', brand.name,
    '--set-file-version', version,
    '--set-product-version', version,
  ];
  const r = spawnSync(rcedit, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`rcedit failed with code ${r.status}`);
  }
  console.log(`  • stamped icon + publisher "${brand.company}" on ${exeName}`);
  signFile(exe);
}

exports.default = async function afterPack(context) {
  const dir = path.join(context.appOutDir, 'locales');
  if (fs.existsSync(dir)) {
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
  }

  stampWindowsExe(context);
};

exports.signArtifacts = async function signArtifacts(buildResult) {
  const paths = buildResult.artifactPaths || [];
  for (const file of paths) signFile(file);
  // latest.yml is rewritten by build/refresh-feed.js after electron-builder exits.
  // Doing it here is too early: the builder overwrites the file again on the way out,
  // with the checksum from before this signature.
};
