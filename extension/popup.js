// Toolbar popup: licence status plus a key-entry form, so a customer who already bought
// can activate without opening WhatsApp Web first. Everything else lives in the panel.
const $ = (id) => document.getElementById(id);
const bg = (op, args) => new Promise((r) => chrome.runtime.sendMessage({ op, args }, r));

const daysLeft = (iso) => (iso ? Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 86400000)) : null);

function row(text, cls) {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.style.marginTop = '5px';
  d.textContent = text;
  return d;
}

function paint(d) {
  const box = $('st');
  box.textContent = '';

  if (d.licensed) {
    const trial = !!d.trial;
    const days = daysLeft(d.expiresAt);
    const head = document.createElement('div');
    head.className = 'ok';
    head.style.fontWeight = '700';
    head.textContent = trial
      ? (d.justStarted ? 'Free trial started' : 'Free trial active')
      : 'Licensed';
    box.append(head);

    if (days != null) {
      box.append(row(`${days} day${days === 1 ? '' : 's'} remaining`));
      if (trial) {
        // Show the runway against the full trial length the server actually granted.
        const total = Math.max(days, d.trialDays || 14);
        const bar = document.createElement('div');
        bar.className = 'bar';
        const i = document.createElement('i');
        i.style.width = Math.round((days / total) * 100) + '%';
        bar.append(i);
        box.append(bar);
      }
    }
    if (d.offline) box.append(row('Offline — showing last known status.', 'warn'));
    if (d.key) {
      const k = document.createElement('div');
      k.className = 'k';
      k.textContent = d.key;
      box.append(k);
    }
    // Already licensed outright: the key form and buy button are just noise.
    if (!trial) {
      $('toggleKey').classList.add('hide');
      $('buy').classList.add('hide');
    }
    $('release').classList.remove('hide');
    return;
  }

  const head = document.createElement('div');
  head.className = d.reason === 'trial_expired' ? 'no' : 'warn';
  head.style.fontWeight = '700';
  head.textContent = d.reason === 'trial_expired' ? 'Free trial ended'
    : d.reason === 'expired' ? 'License expired'
    : d.reason === 'suspended' ? 'License suspended'
    : 'Setting up your free trial…';
  box.append(head);
  box.append(row(
    d.reason === 'trial_expired' ? 'This browser has already used its free trial. Enter a license key to keep going.'
      : d.reason === 'expired' || d.reason === 'suspended' ? 'Enter a valid license key to continue.'
      : 'If this does not clear in a moment, check your internet connection.',
  ));
  // Nothing to lose here — lead with the key form.
  if (d.reason) $('keyBox').classList.remove('hide');
}

$('toggleKey').addEventListener('click', () => {
  $('keyBox').classList.toggle('hide');
  if (!$('keyBox').classList.contains('hide')) $('key').focus();
});

$('act').addEventListener('click', async () => {
  const msg = $('msg');
  const key = $('key').value.trim();
  if (!key) { msg.className = 'bad'; msg.textContent = 'Enter your license key.'; return; }
  msg.className = ''; msg.textContent = 'Activating…';
  $('act').disabled = true;
  const r = (await bg('activate', { key })).data || {};
  $('act').disabled = false;
  if (r.valid) {
    msg.className = ''; msg.textContent = 'Activated.';
    $('keyBox').classList.add('hide');
    paint({ licensed: true, plan: r.plan, expiresAt: r.expiresAt, key: r.key });
  } else {
    msg.className = 'bad';
    msg.textContent = 'Activation failed: ' + String(r.reason || 'invalid key').replace(/_/g, ' ');
  }
});

$('key').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('act').click(); });

$('release').addEventListener('click', async () => {
  if (!confirm('Release this device?\n\nYour licence is freed for another computer, and '
    + 'WA-CRM stops working here until you enter a key again. Your saved data stays on this machine.')) return;
  $('release').disabled = true;
  const r = (await bg('deactivate')).data || {};
  $('release').disabled = false;
  if (!r.ok) {
    say(r.err === 'offline'
      ? 'No internet — connect first, or the licence would stay stuck on our server.'
      : 'Could not release: ' + (r.err || 'unknown'), true);
    return;
  }
  say(r.freed ? 'Released. Use your key on another computer now.' : 'Signed out here.');
  bg('license').then((x) => paint((x && x.data) || {}));
});

bg('license').then((r) => paint((r && r.data) || {}));
