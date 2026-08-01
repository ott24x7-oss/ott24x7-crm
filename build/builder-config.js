// electron-builder config, resolved from brand.js.
//
// package.json's "build" block is static, so productName, appId, icons and the publish
// target were all frozen to WA-CRM. Pointing electron-builder at this file instead lets a
// white-label build come from the same source of truth the app reads at runtime:
//
//   BRAND=neutral npx electron-builder --config build/builder-config.js
//
// The publish target is the important one. electron-builder writes app-update.yml into the
// package from it, and that file is what the auto-updater reads. Left pointing at our repo,
// a reseller's customers would be updated into WA-CRM-branded installers — so a brand with
// no updateRepo gets no publish config and no app-update.yml at all.
const brand = require('../brand.js');

const year = new Date().getFullYear();

const config = {
  appId: brand.appId,
  productName: brand.name,
  // Windows reads FileDescription, CompanyName and LegalCopyright out of package.json's
  // description/author. Setting productName alone is not enough — the first build of this
  // shipped an exe whose Properties dialog still read "WA-CRM — WhatsApp CRM/sender" and
  // "CompanyName: WA-CRM". extraMetadata rewrites those fields inside the package.
  //
  // `name` also decides the userData folder, so each brand keeps its own profile rather
  // than sharing one install's chats and licence with another.
  extraMetadata: {
    name: brand.slug,
    description: brand.name,
    // Object form, not a bare string. As a string electron-builder failed to resolve it
    // and rcedit fell through to Electron's stock CompanyName, "GitHub, Inc." — which is
    // not a WA-CRM leak but looks worse on a reseller's exe than the leak did.
    author: { name: brand.company },
  },
  copyright: `Copyright © ${year} ${brand.company}`,
  artifactName: '${productName}-${version}-${os}.${ext}',
  directories: { output: 'release' },
  afterPack: 'build/afterPack.js',
  compression: 'maximum',
  files: ['electron/**', 'renderer/**', 'assets/**', 'config.js', 'brand.js', 'brands/**'],
  win: {
    icon: `assets/${brand.icon}`,
    target: ['nsis'],
    artifactName: '${productName}-Setup-${version}.${ext}',
  },
  mac: {
    icon: `assets/${brand.macIcon}`,
    category: 'public.app-category.business',
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }, { target: 'zip', arch: ['x64', 'arm64'] }],
    identity: null,
    hardenedRuntime: false,
    gatekeeperAssess: false,
    artifactName: '${productName}-${version}-mac-${arch}.${ext}',
  },
  dmg: { artifactName: '${productName}-${version}-mac-${arch}.dmg' },
};

if (brand.updateRepo) {
  const [owner, repo] = brand.updateRepo.split('/');
  config.publish = [{ provider: 'github', owner, repo }];
} else {
  // Explicitly null, not merely absent. With no publish config electron-builder infers a
  // GitHub target from the git remote and still writes app-update.yml — the first build
  // of this shipped a "white-label" package whose feed pointed at ott24x7-oss/ott24x7-crm.
  // null suppresses the file entirely.
  config.publish = null;
}

module.exports = config;
