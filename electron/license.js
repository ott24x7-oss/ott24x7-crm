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

// Verify the server's reply with its Ed25519 public key.
//
// This replaces an HMAC over a shared secret. That secret had to ship inside the app to
// verify anything, so anyone holding a build — a customer, or a reseller handed a
// white-label copy — could extract it and mint their own "activation valid" reply. Only
// the public key ships now; forging a reply needs the private key, which never leaves
// the server.
//
// Fails closed: no signature, a malformed one, or no public key configured all return
// false, and the gate treats that exactly like an invalid licence.
function verifySignature(resp) {
  if (!resp || typeof resp !== 'object') return false;
  const pem = String(config.LICENSE_PUBLIC_KEY || '').trim();
  if (!pem || !resp.sig) return false;

  // Rebuild the exact bytes the server signed: everything except the two signature
  // fields, in the order they arrived. Listing what to strip — rather than picking out
  // known keys — is what keeps this working when the server adds a field like trialDays,
  // which is inside the signed payload and must stay in the copy we hash.
  const { signature, sig, ...core } = resp;
  try {
    return crypto.verify(
      null,
      Buffer.from(JSON.stringify(core), 'utf8'),
      crypto.createPublicKey(pem),
      Buffer.from(String(sig), 'base64'),
    );
  } catch {
    return false;
  }
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

// Start (or resume) a device-bound 7-day free trial.
async function trial(deviceName = os.hostname()) {
  const resp = await call('trial', { deviceId: deviceId(), deviceName });
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

module.exports = { deviceId, activate, validate, trial, loadKey, saveKey, clearKey };
