// Run after electron-builder exits.
//
// The setup exe is signed in afterAllArtifactBuild, which changes its bytes.
// electron-builder then writes latest.yml from the checksum it computed earlier,
// before that signature. The updater downloads to 100% and rejects the file, so
// the popup stays on "Downloading…". This rewrites the feed from the signed file.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const version = require('../package.json').version;
const dir = path.join(__dirname, '..', 'release');
const exeName = `WA-CRM-Setup-${version}.exe`;
const exePath = path.join(dir, exeName);

if (!fs.existsSync(exePath)) {
  console.error(`refresh-feed: ${exeName} is not in release/`);
  process.exit(1);
}

const size = fs.statSync(exePath).size;
const sha512 = crypto.createHash('sha512').update(fs.readFileSync(exePath)).digest('base64');
const yml = [
  `version: ${version}`,
  'files:',
  `  - url: ${exeName}`,
  `    sha512: ${sha512}`,
  `    size: ${size}`,
  `path: ${exeName}`,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  '',
].join('\n');
fs.writeFileSync(path.join(dir, 'latest.yml'), yml);

const block = exePath + '.blockmap';
if (fs.existsSync(block)) fs.rmSync(block);

const check = crypto.createHash('sha512').update(fs.readFileSync(exePath)).digest('base64');
if (check !== sha512 || !fs.readFileSync(path.join(dir, 'latest.yml'), 'utf8').includes(sha512)) {
  console.error('refresh-feed: latest.yml does not match the installer');
  process.exit(1);
}
console.log(`refresh-feed: latest.yml matches ${exeName} (${size} bytes)`);
