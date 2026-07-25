// Central config for the ott24x7 CRM desktop app.
// Override any of these with environment variables at launch.
module.exports = {
  // Your deployed license server (Railway). No trailing slash.
  LICENSE_SERVER: process.env.LICENSE_SERVER || 'https://crm.ott24x7.com',

  // Must match a product slug in the license server.
  PRODUCT_SLUG: process.env.PRODUCT_SLUG || 'ott24x7-crm',

  // Must match LICENSE_SIGNING_SECRET on the server so the client can verify
  // that an "activation valid" response genuinely came from your server.
  // NOTE: client-side verification embeds this in the app by design; it only
  // blocks trivial spoofing. Rotate it (here + server) together when needed.
  LICENSE_SIGNING_SECRET: process.env.LICENSE_SIGNING_SECRET || '0f11e20cc49601d9a5471fb6a45590c44e8d5732c1145bcc355debfa41844cd86811730f4dcc4d94ab07b408fae9c90c',

  // WhatsApp Web is loaded in a persistent session so linking is a one-time step.
  WA_PARTITION: 'persist:whatsapp',

  // A recent Chrome UA keeps WhatsApp Web happy inside Electron.
  USER_AGENT:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};
