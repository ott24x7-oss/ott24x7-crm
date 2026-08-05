// License client: talks to the ott24x7 license server and verifies signed replies.
const crypto = require('node:crypto');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config.js');

// Stable-ish device fingerprint (hostname + arch + first MAC).
// Adapters that come and go. A VPN connecting, a dock being plugged in, or Hyper-V
// starting all add interfaces, and Object.keys() order is not stable — so "the first MAC"
// silently became a different MAC, which produced a different device id, which the server
// correctly rejected as device_not_activated. That is the app deactivating itself, and
// every drift also burned one of the licence's device slots.
const VIRTUAL = /^(vethernet|veth|vmware|virtualbox|vbox|hyper-v|loopback|bluetooth|tap|tun|wsl|docker|zerotier|tailscale|wintun|npcap|teredo|isatap|nordlynx|proton|wg\d)/i;

function pickMac() {
  const nets = os.networkInterfaces();
  const macs = [];
  for (const name of Object.keys(nets)) {
    if (VIRTUAL.test(name)) continue;                       // ignore adapters that appear and vanish
    for (const ni of nets[name] || []) {
      if (!ni.internal && ni.mac && ni.mac !== '00:00:00:00:00:00') macs.push(ni.mac.toLowerCase());
    }
  }
  // Sorted, so the answer does not depend on the order the OS happened to enumerate in.
  macs.sort();
  return macs[0] || '';
}

// Computed once, then written down. Even a perfectly deterministic fingerprint changes if
// the hardware does — a replaced network card should not cost someone their activation —
// so the id is persisted on first run and read back forever after. Hardware is only a
// seed, never the identity.
let cachedId = null;
function idFile() {
  try {
    const { app } = require('electron');
    return require('node:path').join(app.getPath('userData'), 'device.json');
  } catch { return null; }
}

function deviceId() {
  if (cachedId) return cachedId;
  const file = idFile();
  if (file) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8')).id;
      if (saved && /^[a-f0-9]{32}$/.test(saved)) { cachedId = saved; return cachedId; }
    } catch { /* first run, or unreadable — fall through and make one */ }
  }
  const raw = `${os.hostname()}|${os.arch()}|${pickMac() || os.userInfo().username}`;
  cachedId = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  if (file) { try { fs.writeFileSync(file, JSON.stringify({ id: cachedId }), 'utf8'); } catch (e) {} }
  return cachedId;
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

// Talk to the licence server, and survive a bad minute of network.
//
// This had no timeout and no retry, so a single hiccup threw and the app reported
// "Cannot reach license server" — or, at boot, dropped a paying customer back to the
// activation screen. Node's fetch gives up on a slow connect after about ten seconds,
// and on a phone tether or a congested line that is a normal event, not a fault. The
// same request through curl succeeded every time it was tried.
//
// Failing to REACH the server is reported as netFail and never as an invalid licence.
// Those are different problems with different fixes, and telling someone their licence
// is bad when their wifi dropped sends them to support instead of to their router.
// 12s x 3 is a worst case of about 38 seconds, and only when the connection black-holes
// entirely. The common failure - a reset or a refused connect - returns immediately, so a
// blip recovers in a couple of seconds. Longer timeouts would freeze the splash screen for
// a minute before admitting the user is offline, which is worse than saying so sooner.
const TIMEOUT_MS = 12000;
const ATTEMPTS = 3;

// Chromium's network stack, not Node's.
//
// Node's fetch (undici) ignores the system proxy, keeps its own DNS and connection
// handling, and on a consumer connection fails in ways the same request through a browser
// does not — which is what "Cannot reach license server" turned out to be on a machine
// where the server was demonstrably up. Electron's net.fetch is the same API backed by the
// stack Chromium already uses for the WhatsApp webview in this app, so it inherits proxy
// settings, the OS certificate store and far better connection recovery.
//
// Falls back to global fetch outside Electron, so this file stays testable.
let netFetch = null;
function httpFetch(url, opts) {
  if (netFetch === null) {
    try { netFetch = require('electron').net.fetch; } catch { netFetch = false; }
  }
  return netFetch ? netFetch(url, opts) : fetch(url, opts);
}

async function once(endpoint, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await httpFetch(`${config.LICENSE_SERVER}/api/v1/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    // A 5xx is the server having a moment; a 4xx is an answer and must not be retried.
    if (res.status >= 500) return { retry: true, err: `server returned ${res.status}` };
    const j = await res.json();
    // A licence verdict has a `valid` field, always. A body without one is not the licence
    // server speaking - it is whatever sits in front of it: Railway's "Application not
    // found" when the service is down, a CDN error page, a captive portal. The night the
    // hosting account lapsed, that JSON reached the verdict path, failed the signature
    // check as any non-verdict would, and LOCKED OUT every running customer in under five
    // minutes - when the 7-day offline grace existed precisely for this. Infrastructure
    // noise is a network-class failure, never a revocation.
    if (!j || typeof j.valid === 'undefined') {
      return { retry: true, err: `the licence server did not answer (${String(j && (j.message || j.error) || 'unrecognised reply').slice(0, 80)})` };
    }
    return { json: j };
  } catch (e) {
    const msg = String((e && (e.cause && e.cause.code)) || (e && e.message) || e);
    return { retry: true, err: e && e.name === 'AbortError' ? 'timed out' : msg };
  } finally {
    clearTimeout(timer);
  }
}

async function call(endpoint, body) {
  let last = '';
  for (let i = 0; i < ATTEMPTS; i++) {
    const r = await once(endpoint, body);
    if (r.json) return r.json;
    last = r.err;
    if (i < ATTEMPTS - 1) await new Promise((res) => setTimeout(res, 700 * (i + 1)));
  }
  // Shaped like a normal reply so every caller keeps working. valid:false keeps the gate
  // closed — being unable to check a licence can never be treated as a valid one.
  return { valid: false, reason: 'network', netFail: true, err: last };
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
