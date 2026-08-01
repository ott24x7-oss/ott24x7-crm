# ott24x7 CRM (desktop)

Your own WhatsApp CRM / bulk sender, built on the open-source **WPPConnect `wa-js`** engine and
gated by the **ott24x7 license server**. Electron app — Windows/macOS/Linux.

> Clean-room product you own. It bundles the MIT-licensed `@wppconnect/wa-js` engine
> (`assets/wa-js.js`, v4.4.2) and does not contain any third-party commercial software.

## What works in this skeleton

- **License gate** — on first launch the user enters a key; the app calls your license server
  (`/api/v1/activate`), binds the device, verifies the HMAC signature, and remembers the key.
  Every later launch re-validates silently.
- **WhatsApp connection** — embeds WhatsApp Web in a persistent session, injects the WPPConnect
  engine, and shows live status (Loading → Scan QR → Connected · +<number>).
- **Bulk sender** — paste numbers, write a message (with `{a|b}` spin variations), set a random
  delay window, Start/Stop, live progress + per-number log. Sends via `WPP.chat.sendTextMessage`.

## Configure

Edit `config.js` (or set env vars):

- `LICENSE_SERVER` — your Railway URL, e.g. `https://ott24x7-license.up.railway.app`
- `PRODUCT_SLUG` — must match a product in the license server (`ott24x7-crm`)
- `LICENSE_SIGNING_SECRET` — **must match** the server's `LICENSE_SIGNING_SECRET`

## Run

```bash
npm install          # allow the electron postinstall to download its binary
npm start
```

Smoke test (boots the main process and exits, no window):

```bash
npm run smoke
```

## Package a Windows installer

```bash
npm run dist         # electron-builder -> release/  (uses assets/ott24x7.ico)
```

## Layout

```
electron/
  main.js       windows, WhatsApp session UA, IPC handlers, smoke mode
  preload.js    secure contextBridge -> window.ott
  license.js    device id, activate/validate, signature verify, key storage
renderer/
  index.html    gate + app shell (sidebar, WhatsApp <webview>, sender)
  styles.css    ott24x7 dark theme
  app.js        gate flow, engine injection, status polling, send loop
assets/
  wa-js.js      WPPConnect engine (v4.4.2)
  ott24x7.ico, logo-mark.png, logo-lockup.png
config.js
```

## Update the WhatsApp engine

When WhatsApp Web changes and sending breaks, drop a newer build over `assets/wa-js.js`:

```bash
curl -L -o assets/wa-js.js https://cdn.jsdelivr.net/npm/@wppconnect/wa-js@latest/dist/wppconnect-wa.js
```

## White-label builds (for resellers)

All product identity lives in `brand.js`. Presets go in `brands/<name>.json`; pick one at
build time and everything user-visible follows — window title, gate screen, dialogs,
notifications, exported filenames, icons, installer name and the Windows Properties dialog.

```bash
BRAND=neutral npm run dist                          # unbranded build
BRAND=acme BRAND_NAME="Acme Chat" npm run dist      # override any single field
```

A new reseller is one JSON file and no code:

```json
{
  "name": "Acme Chat",
  "appId": "com.acme.chat",
  "company": "Acme Pvt Ltd",
  "slug": "acme-chat",
  "icon": "acme.ico",
  "macIcon": "acme-icon.png",
  "logoMark": "acme-mark.png",
  "updateRepo": ""
}
```

Drop the three image files in `assets/`. `appId` **must** be unique per brand or Windows
treats two installs as the same app and their updater feeds cross over.

`updateRepo` empty means no auto-updates: no `app-update.yml` is written and the in-app
updater is disabled. Leave it empty unless the reseller has their own releases repo —
pointing a white-label build at ours would update their customers into WA-CRM installers.

What does **not** change per brand, on purpose:

- `config.js` — `LICENSE_SERVER`, `PRODUCT_SLUG` and the signing secret. Branding changes;
  the licensing authority does not.
- The backup format key (`app: "WA-CRM"` inside the JSON). It identifies the file format,
  not the product, so backups stay portable between every build and the Chrome extension.

## Notes / next steps

- Respect WhatsApp's terms and anti-spam limits; the delay window is deliberate.
- Natural next features: contact import (CSV/Excel), media/attachments, templates & campaigns
  saved to disk, scheduling, and per-number `{name}` personalization from an imported list.
