// Product identity, in one place.
//
// Everything the user can see — window title, dialogs, notifications, exported
// filenames, the buy link — reads from here, so a white-label build is a config
// change rather than a find-and-replace across the renderer.
//
// Pick a preset with BRAND=<name>, which loads brands/<name>.json. Any single field
// can then be overridden by an env var, so a reseller build is usually one JSON file
// and no code at all:
//
//   BRAND=neutral npm run dist
//   BRAND=neutral BRAND_NAME="Acme Chat" npm run dist
//
// What deliberately does NOT live here: LICENSE_SERVER, PRODUCT_SLUG and the signing
// secret in config.js. Those stay pointed at our own server on every build — the
// branding changes, the licensing authority does not.
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  // Display name. Used in the window title, dialogs and notifications.
  name: 'WA-CRM',
  // Reverse-DNS app id. MUST differ per brand or Windows treats two installs as the
  // same app: shared taskbar identity, and the updater feeds cross over.
  appId: 'com.ott24x7.crm',
  company: 'WA-CRM',
  // Lowercase, filename-safe. Used for exported CSVs and backup filenames.
  slug: 'wa-crm',
  site: 'https://wa-crm.in',
  buyUrl: 'https://ott24x7.com/plans/dev-crm-pro-whatsapp-software',
  // Icons, relative to assets/.
  icon: 'wa-crm.ico',
  // macOS wants a square PNG, and its name does not always track the .ico, so it is
  // stated rather than derived — deriving it produced a path that did not exist.
  macIcon: 'icon.png',
  logoMark: 'logo-mark.png',
  // GitHub owner/repo the updater polls. A white-label build pointed at the same repo
  // would offer WA-CRM-branded installers to a reseller's customers, so this is
  // blanked unless a brand sets it — no feed means the in-app updater stays quiet.
  updateRepo: 'ott24x7-oss/ott24x7-crm-releases',
};

function load() {
  const out = Object.assign({}, DEFAULTS);

  const preset = String(process.env.BRAND || '').trim();
  if (preset) {
    // Basename only: BRAND comes from a build command, but treating it as a path
    // would let ../ walk out of brands/.
    const file = path.join(__dirname, 'brands', path.basename(preset) + '.json');
    if (!fs.existsSync(file)) {
      throw new Error(`BRAND="${preset}" but ${path.relative(__dirname, file)} does not exist`);
    }
    Object.assign(out, JSON.parse(fs.readFileSync(file, 'utf8')));
  }

  const ENV = {
    name: 'BRAND_NAME', appId: 'BRAND_APP_ID', company: 'BRAND_COMPANY', slug: 'BRAND_SLUG',
    site: 'BRAND_SITE', buyUrl: 'BRAND_BUY_URL', icon: 'BRAND_ICON', macIcon: 'BRAND_MAC_ICON',
    logoMark: 'BRAND_LOGO_MARK', updateRepo: 'BRAND_UPDATE_REPO',
  };
  for (const key of Object.keys(ENV)) {
    const v = process.env[ENV[key]];
    if (v != null && v !== '') out[key] = v;
  }

  // A brand may switch updates off entirely with "updateRepo": "".
  out.updateRepo = String(out.updateRepo || '').trim();
  out.slug = String(out.slug || 'app').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
  return out;
}

module.exports = load();
