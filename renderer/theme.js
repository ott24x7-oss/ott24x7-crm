// ================= colour themes =================
// Every theme is generated from two hues (ground + accent) so all 12 stay visually
// consistent and each token keeps its contrast relationship. Token NAMES never change
// (--green* are simply the accent slots), so no other CSS needs to know about theming.
// Light-first, after the owner's verdict on the old set: "too dark in all palettes."
// Every palette is now a softly hue-tinted light ground built for the neumorphic layer in
// styles.css; the accent hue is what tells them apart. Ids never change, so a remembered
// choice keeps working. Graphite remains the one deliberate dark theme, renamed Midnight.
const THEMES = [
  { id: 'emerald', name: 'Emerald', g: 165, a: 152 },
  { id: 'ocean', name: 'Ocean', g: 245, a: 232 },
  { id: 'violet', name: 'Violet', g: 295, a: 300 },
  { id: 'amber', name: 'Amber', g: 80, a: 75 },
  { id: 'rose', name: 'Rose', g: 355, a: 12 },
  { id: 'cyan', name: 'Cyan', g: 210, a: 195 },
  { id: 'crimson', name: 'Crimson', g: 25, a: 27 },
  { id: 'lime', name: 'Lime', g: 128, a: 128 },
  { id: 'indigo', name: 'Indigo', g: 272, a: 268 },
  { id: 'magenta', name: 'Magenta', g: 330, a: 330 },
  { id: 'graphite', name: 'Midnight (dark)', g: 250, a: 250, mono: true, dark: true },
  { id: 'daylight', name: 'Porcelain', g: 200, a: 152 },
];

function themeTokens(t) {
  const g = t.g, a = t.a;
  // Ground chroma has to be high enough to actually SEE the hue at low lightness —
  // 0.016 rendered every dark theme as the same near-black.
  const gc = t.mono ? 0.006 : 0.038;
  const ac = t.mono ? 0.03 : 0.18;
  const r3 = function (n) { return Math.round(n * 1000) / 1000; };

  if (!t.dark) {
    return {
      '--bg': 'oklch(94.5% ' + r3(gc * 0.55) + ' ' + g + ')',
      '--stage': 'oklch(91% ' + r3(gc * 0.5) + ' ' + g + ')',
      '--sunken': 'oklch(92.5% ' + r3(gc * 0.5) + ' ' + g + ')',
      '--panel': 'oklch(97.5% ' + r3(gc * 0.3) + ' ' + g + ')',
      '--panel-2': 'oklch(95.5% ' + r3(gc * 0.42) + ' ' + g + ')',
      '--rail': 'oklch(96% ' + r3(gc * 0.4) + ' ' + g + ')',
      '--elev': 'oklch(100% 0 0)',
      '--text': 'oklch(22% .03 ' + g + ')',
      '--muted': 'oklch(46% .03 ' + g + ')',
      '--muted-2': 'oklch(60% .02 ' + g + ')',
      '--line': 'oklch(0% 0 0/.10)', '--line-2': 'oklch(0% 0 0/.16)',
      '--green': 'oklch(58% ' + ac + ' ' + a + ')',
      '--green-2': 'oklch(48% ' + ac + ' ' + (a + 3) + ')',
      '--green-soft': 'oklch(40% ' + ac + ' ' + a + ')',
      '--wa': 'oklch(58% ' + ac + ' ' + a + ')',
      // neumorphism: light source top-left
      '--neu-hi': 'rgba(255,255,255,.95)',
      '--neu-lo': 'rgba(0,0,0,.13)',
      // glassmorphism
      '--glass': 'oklch(100% 0 0/.62)',
      '--glass-brd': 'oklch(0% 0 0/.09)',
      '--btn-top': 'oklch(100% 0 0)',
      '--btn-bot': 'oklch(93.5% ' + r3(gc * 0.45) + ' ' + g + ')',
      '--on-accent': '#ffffff',
      '--scroll': 'oklch(0% 0 0/.20)',
      '--shadow': '0 1px 2px rgba(0,0,0,.10)',
      '--shadow-lg': '0 24px 60px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.10)',
    };
  }
  return {
    '--bg': 'oklch(16% ' + gc + ' ' + g + ')',
    '--stage': 'oklch(12.5% ' + r3(gc * 0.9) + ' ' + g + ')',
    '--sunken': 'oklch(13% ' + r3(gc * 0.95) + ' ' + g + ')',
    '--panel': 'oklch(21% ' + r3(gc * 1.05) + ' ' + g + ')',
    '--panel-2': 'oklch(25% ' + r3(gc * 1.1) + ' ' + g + ')',
    '--rail': 'oklch(18.5% ' + gc + ' ' + g + ')',
    '--elev': 'oklch(24% ' + r3(gc * 1.08) + ' ' + g + ')',
    '--text': 'oklch(96% .02 ' + a + ')',
    '--muted': 'oklch(74% .035 ' + g + ')',
    '--muted-2': 'oklch(58% .03 ' + g + ')',
    '--line': 'oklch(100% 0 0/.09)', '--line-2': 'oklch(100% 0 0/.16)',
    '--green': 'oklch(72% ' + ac + ' ' + a + ')',
    '--green-2': 'oklch(58% ' + r3(ac * 0.83) + ' ' + (a + 3) + ')',
    '--green-soft': 'oklch(86% ' + r3(ac * 0.72) + ' ' + a + ')',
    '--wa': 'oklch(82% ' + r3(ac * 1.2) + ' ' + a + ')',
    '--neu-hi': 'oklch(100% 0 0/.055)',
    '--neu-lo': 'oklch(0% 0 0/.55)',
    '--glass': 'oklch(22% ' + r3(gc * 1.05) + ' ' + g + '/.62)',
    '--glass-brd': 'oklch(100% 0 0/.10)',
    '--btn-top': 'oklch(28% ' + r3(gc * 1.15) + ' ' + g + ')',
    '--btn-bot': 'oklch(21% ' + r3(gc * 1.05) + ' ' + g + ')',
    '--on-accent': '#04140b',
    '--scroll': 'oklch(100% 0 0/.16)',
    '--shadow': '0 1px 2px rgba(0,0,0,.4)',
    '--shadow-lg': '0 24px 60px rgba(0,0,0,.6), 0 2px 8px rgba(0,0,0,.45)',
  };
}

function applyTheme(id, save) {
  const t = THEMES.find(function (x) { return x.id === id; }) || THEMES[0];
  const tok = themeTokens(t);
  const r = document.documentElement;
  Object.keys(tok).forEach(function (k) { r.style.setProperty(k, tok[k]); });
  r.setAttribute('data-theme', t.id);
  r.style.colorScheme = t.dark ? 'dark' : 'light';
  if (save !== false) { try { store.set('ott_theme', t.id); } catch (e) {} }
  // The chips / widget / lead button injected into WhatsApp carry their own colours —
  // refresh them so they pick up the new accent too.
  try {
    accounts.forEach(function (acc) {
      applyQuickReplies(acc.id);
      applyLeadButton(acc.id);
      applyChatWidget(acc.id);
    });
  } catch (e) {}
}

function themeSwatch(t) {
  const k = themeTokens(t);
  return el('div', {
    style: {
      width: '100%', height: '44px', borderRadius: '9px', background: k['--bg'],
      border: '1px solid ' + (t.dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.14)'),
      display: 'flex', alignItems: 'flex-end', gap: '4px', padding: '7px',
    },
  },
    el('div', { style: { flex: '1', height: '10px', borderRadius: '5px', background: k['--green'] } }),
    el('div', { style: { width: '20px', height: '10px', borderRadius: '5px', background: k['--panel-2'] } }));
}

function openThemePicker() {
  const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '2px' } });
  const box = el('div', { className: 'modal-box', style: { width: '460px' } },
    el('h3', {}, 'Colour theme'),
    el('div', { className: 'muted', style: { fontSize: '12.5px', marginTop: '-7px' } },
      'Applies instantly and is remembered on this device.'),
    grid);
  const scrim = el('div', { className: 'modal-scrim', onclick: function (e) { if (e.target === scrim) scrim.remove(); } }, box);

  function draw() {
    grid.innerHTML = '';
    let active = 'graphite';
    try { active = store.get('ott_theme', 'graphite'); } catch (e) {}
    THEMES.forEach(function (t) {
      const on = t.id === active;
      const cell = el('div', {
        title: t.name,
        onclick: function () { applyTheme(t.id, true); draw(); toast(t.name + ' theme applied'); },
        style: {
          cursor: 'pointer', padding: '7px', borderRadius: '11px',
          border: '1px solid ' + (on ? 'var(--green)' : 'var(--line)'),
          background: on ? 'rgba(255,255,255,.05)' : 'transparent',
          transition: 'border-color .14s, background .14s',
        },
      }, themeSwatch(t),
        el('div', {
          style: {
            fontSize: '11.5px', fontWeight: on ? '700' : '500', marginTop: '6px',
            textAlign: 'center', color: on ? 'var(--green-soft)' : 'var(--muted)',
          },
        }, t.name + (on ? '  ✓' : '')));
      grid.append(cell);
    });
  }
  draw();
  box.append(el('div', { className: 'row', style: { marginTop: '14px', justifyContent: 'flex-end' } },
    el('button', { className: 'btn', onclick: function () { scrim.remove(); } }, 'Done')));
  document.body.append(scrim);
}
