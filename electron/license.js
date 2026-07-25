// License client: talks to the ott24x7 license server and verifies signed replies.
const crypto = require('node:crypto');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config.js');

// Stable-ish device fingerprint (hostname + arch + first MAC).
function deviceId() {
  const nets = os.networkInterfaces();
  let mac = '';
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (!ni.internal && ni.mac && ni.mac !== '00:00:00:00:00:00') { mac = ni.mac; break; }
    }
    if (mac) break;
  }
  const raw = `${os.hostname()}|${os.arch()}|${mac || os.userInfo().username}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function verifySignature(resp) {
  if (!resp || typeof resp !== 'object') return false;
  const { signature, ...core } = resp;
  const expected = crypto.createHmac('sha256', config.LICENSE_SIGNING_SECRET)
    .update(JSON.stringify(core)).digest('hex');
  return signature === expected;
}

async function call(endpoint, body) {
  const res = await fetch(`${config.LICENSE_SERVER}/api/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function activate(key, deviceName = os.hostname()) {
  const resp = await call('activate', { key: key.trim(), deviceId: deviceId(), deviceName });
  return { ...resp, trusted: verifySignature(resp) };
}

async function validate(key) {
  const resp = await call('validate', { key: key.trim(), deviceId: deviceId() });
  return { ...resp, trusted: verifySignature(resp) };
}

// Persist the key in userData so the user only enters it once.
function keyFile(app) { return path.join(app.getPath('userData'), 'license.json'); }
function loadKey(app) {
  try { return JSON.parse(fs.readFileSync(keyFile(app), 'utf8')).key || null; } catch { return null; }
}
function saveKey(app, key) {
  fs.writeFileSync(keyFile(app), JSON.stringify({ key }), 'utf8');
}
function clearKey(app) {
  try { fs.unlinkSync(keyFile(app)); } catch {}
}

module.exports = { deviceId, activate, validate, loadKey, saveKey, clearKey };
