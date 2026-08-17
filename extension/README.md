# WA-CRM Chrome Extension

Adds a WA-CRM panel directly inside WhatsApp Web — no desktop install needed, so it works
on **Windows, macOS and Linux** wherever Chrome runs.

## Install (unpacked, for now)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. Click **Load unpacked** and select this folder
4. Open <https://web.whatsapp.com> and click the green **WA** button, bottom-right

## What's included

| Feature | Notes |
|---|---|
| AI Assistant | Catalog-first auto-replies (same brain as desktop). Settings → API key + consent → Import from website |
| Product Catalog | Save offers (image + caption + category), search, send to the open chat in one click |
| Leads | Save the current chat as a lead with type (New/Hot/Warm/Cold) and status; CSV export |
| Bulk Send | Paste numbers, `{a\|b}` spin syntax, randomised delays, live log, stop button |
| Number Check | Which numbers actually have WhatsApp; CSV export |
| Export Numbers | Contacts and groups; Google-Contacts-ready CSV |

Licensing uses the same server and the same keys as the desktop app, including the 7-day
free trial. A licence binds to this browser profile.

## How it is wired

- `wa-js.js` + `page.js` run in the **MAIN** world so they can reach `window.WPP`
- `content.js` runs **isolated** and owns all UI; it talks to the page only via
  `window.postMessage` using a fixed operation table, so the page can never be sent code
- `background.js` (service worker) holds licensing and storage, so the page cannot see or
  spoof licence calls
- The engine is bundled, never fetched — Manifest V3 forbids remote code

## Honest limitations

- **Not on the Chrome Web Store yet.** Store review of WhatsApp automation extensions is
  genuinely uncertain; until then this installs unpacked.
- The desktop app supports the full feature set. This extension includes the day-to-day
  subset plus the catalog-first AI Assistant.
- Automating WhatsApp is against WhatsApp's terms. Use it for people who contacted you;
  blasting strangers is what gets numbers banned, on any tool.
