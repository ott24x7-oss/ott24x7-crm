// UI preview only: stands in for electron/preload.js so the renderer runs in a plain browser.
// ?gate=1 shows the licence gate instead of entering the app.
(function () {
  const q = new URLSearchParams(location.search);
  const gate = q.has('gate');
  const known = {
    deviceId: async () => 'preview-device-0000',
    licenseLoad: async () => (gate ? null : 'PREVIEW-KEY'),
    licenseValidate: async () => ({ valid: true, trusted: true, expiresAt: '2027-12-31' }),
    licenseActivate: async () => ({ valid: true, trusted: true }),
    licenseTrial: async () => ({ ok: true, key: 'TRIAL-PREVIEW' }),
    licenseSave: async () => true,
    licenseClear: async () => true,
    config: async () => ({ server: 'https://wa-crm.in', product: 'wa-crm', version: '0.43.4-preview', brand: { name: 'WA-CRM', company: 'WA-CRM', slug: 'wa-crm', site: 'https://wa-crm.in', buyUrl: 'https://wa-crm.in/#pricing', logoMark: 'logo-mark.png', hasUpdates: true } }),
    getEngine: async () => '',
    persistLoad: async () => null,
    persistSave: async () => true,
    translate: async (t) => ({ text: t }),
    openExternal: async (u) => window.open(u, '_blank'),
  };
  window.ott = new Proxy(known, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'string' && k.startsWith('on')) return () => () => {};
      return async () => null;
    },
  });
})();

// Demo groups returned by Group Broadcast's "Fetch groups".
const DEMO_GROUPS = [
  ['Delhi Wholesale Traders', 248, true, false], ['Mumbai Retail Network', 512, false, false], ['Saree Resellers India', 1024, false, true],
  ['Kurti Dropshipping Hub', 389, true, true], ['Surat Textile Market', 731, false, false], ['Family', 18, true, false],
  ['Jaipur Handicraft Buyers', 156, false, false], ['Ladies Wear B2B', 640, true, false], ['Bangalore Boutique Owners', 97, false, false],
  ['Festive Offers Daily', 1012, true, true], ['Cotton Fabric Deals', 274, false, false], ['Reseller Community', 2300, false, false, true],
  ['Kolkata Garments Group', 433, false, true], ['Office Team', 12, true, false], ['Hyderabad Ethnic Wear', 188, false, false],
  ['Lucknow Chikan Buyers', 302, true, false], ['Wedding Collection Leads', 145, true, false], ['Online Sellers Club', 877, false, false],
  ['Pune Fashion Retailers', 211, false, false], ['Ahmedabad Kurta Market', 359, false, false],
].map(([name, size, admin, announce, community], i) => ({ id: '1203630' + (41000 + i) + '@g.us', name, size, admin, announce, community: !!community }));

// A fake linked account so feature panels open. ?noacc=1 shows the empty state instead.
(function () {
  const q = new URLSearchParams(location.search);
  if (q.has('noacc')) { localStorage.removeItem('ott_accounts'); return; }
  if (!localStorage.getItem('ott_accounts')) localStorage.setItem('ott_accounts', JSON.stringify([{ id: 'apreview', name: 'Demo Business' }]));
  // <webview> only exists in Electron; stand in with an element that answers every call with null.
  const fake = {
    executeJavaScript(expr) {
      expr = String(expr || '');
      if (expr.includes('isAuthenticated')) return Promise.resolve(true);
      if (expr.includes('__ott_gb_fetch')) return Promise.resolve(DEMO_GROUPS);
      if (expr.includes('sendTextMessage') || expr.includes('sendFileMessage')) return new Promise((r) => setTimeout(() => r({ ok: Math.random() > 0.08 }), 300));
      return Promise.resolve(null);
    },
    send() {}, reload() {}, openDevTools() {}, isLoading() { return false; }, getWebContentsId() { return 0; },
    getURL() { return 'https://web.whatsapp.com/'; }, setAudioMuted() {},
  };
  // Custom elements need a hyphen, so <webview> cannot be defined; decorate it on creation.
  const create = document.createElement.bind(document);
  document.createElement = (tag, o) => {
    const n = create(tag, o);
    if (String(tag).toLowerCase() === 'webview') {
      Object.assign(n, fake);
      n.innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:#6b7280;font:14px system-ui">WhatsApp Web loads here in the real app</div>';
    }
    return n;
  };
})();
