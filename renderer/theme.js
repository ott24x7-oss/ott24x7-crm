// ================= colour themes =================
// Every theme is generated from two hues (ground + accent) so all 12 stay visually
// consistent and each token keeps its contrast relationship. Token NAMES never change
// (--green* are simply the accent slots), so no other CSS needs to know about theming.
const THEMES = [
  { id: 'emerald', name: 'Emerald', g: 200, a: 152 },
  { id: 'ocean', name: 'Ocean', g: 250, a: 232 },
  { id: 'violet', name: 'Violet', g: 295, a: 300 },
  { id: 'amber', name: 'Amber', g: 70, a: 75 },
  { id: 'rose', name: 'Rose', g: 350, a: 12 },
  { id: 'cyan', name: 'Cyan', g: 215, a: 195 },
  { id: 'crimson', name: 'Crimson', g: 20, a: 27 },
  { id: 'lime', name: 'Lime', g: 130, a: 128 },
  { id: 'indigo', name: 'Indigo', g: 275, a: 268 },
  { id: 'magenta', name: 'Magenta', g: 325, a: 330 },
  { id: 'graphite', name: 'Graphite', g: 250, a: 250, mono: true },
  { id: 'daylight', name: 'Daylight', g: 200, a: 152, light: true },
];

function themeTokens(t) {
  const g = t.g, a = t.a;
  const gc = t.mono ? 0.004 : 0.016;   // ground chroma (graphite is near-neutral)
  const ac = t.mono ? 0.03 : 0.18;     // accent chroma

  if (t.light) {
    return {
      '--bg': 'oklch(97% .008 ' + g + ')',
      '--stage': 'oklch(93% .01 ' + g + ')',
      '--sunken': 'oklch(95% .008 ' + g + ')',
      '--panel': 'oklch(100% 0 0)',
      '--panel-2': 'oklch(96.5% .008 ' + g + ')',
      '--rail': 'oklch(98.5% .006 ' + g + ')',
      '--elev': 'oklch(100% 0 0)',
      '--text': 'oklch(24% .02 ' + g + ')',
      '--muted': 'oklch(48% .02 ' + g + ')',
      '--muted-2': 'oklch(60% .015 ' + g + ')',
      '--line': 'oklch(0% 0 0/.10)',
      '--line-2': 'oklch(0% 0 0/.17)',
      '--green': 'oklch(58% ' + ac + ' ' + a + ')',
      '--green-2': 'oklch(48% ' + ac + ' ' + (a + 3) + ')',
      '--green-soft': 'oklch(42% ' + ac + ' ' + a + ')',
      '--wa': 'oklch(58% ' + ac + ' ' + a + ')',
      '--shadow': '0 1px 2px rgba(0,0,0,.10)',
      '--shadow-lg': '0 20px 50px rgba(0,0,0,.16), 0 2px 8px rgba(0,0,0,.10)',
    };
  }
  return {
    '--bg': 'oklch(15% ' + gc + ' ' + g + ')',
    '--stage': 'oklch(12% ' + gc + ' ' + g + ')',
    '--sunken': 'oklch(12% ' + gc + ' ' + g + ')',
    '--panel': 'oklch(20% ' + (gc + 0.002) + ' ' + g + ')',
    '--panel-2': 'oklch(23% ' + (gc + 0.004) + ' ' + g + ')',
    '--rail': 'oklch(17.5% ' + gc + ' ' + g + ')',
    '--elev': 'oklch(22% ' + (gc + 0.003) + ' ' + g + ')',
    '--text': 'oklch(97% .005 ' + a + ')',
    '--muted': 'oklch(72% .02 ' + (g - 20) + ')',
    '--muted-2': 'oklch(56% .02 ' + (g - 20) + ')',
    '--line': 'oklch(100% 0 0/.08)',
    '--line-2': 'oklch(100% 0 0/.14)',
    '--green': 'oklch(72% ' + ac + ' ' + a + ')',
    '--green-2': 'oklch(58% ' + (ac * 0.83).toFixed(3) + ' ' + (a + 3) + ')',
    '--green-soft': 'oklch(86% ' + (ac * 0.72).toFixed(3) + ' ' + a + ')',
    '--wa': 'oklch(82% ' + (ac * 1.2).toFixed(3) + ' ' + a + ')',
    '--shadow': '0 1px 2px rgba(0,0,0,.4)',
    '--shadow-lg': '0 24px 60px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.4)',
  };
}

function applyTheme(id, save) {
  const t = THEMES.find(function (x) { return x.id === id; }) || THEMES[0];
  const tok = themeTokens(t);
  const r = document.documentElement;
  Object.keys(tok).forEach(function (k) { r.style.setProperty(k, tok[k]); });
  r.setAttribute('data-theme', t.id);
  r.style.colorScheme = t.light ? 'light' : 'dark';
  if (save !== false) { try { store.set('ott_theme', t.id); } catch (e) {} }
  // The chips injected into WhatsApp carry their own colours — refresh them so they
  // pick up the new accent too.
  try { accounts.forEach(function (acc) { applyQuickReplies(acc.id); }); } catch (e) {}
}

function themeSwatch(t) {
  const k = themeTokens(t);
  return el('div', {
    style: {
      width: '100%', height: '44px', borderRadius: '9px', background: k['--bg'],
      border: '1px solid ' + (t.light ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.14)'),
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
    let active = 'emerald';
    try { active = store.get('ott_theme', 'emerald'); } catch (e) {}
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
