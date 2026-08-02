// Central config for the WA-CRM desktop app.
// Override any of these with environment variables at launch.
module.exports = {
  // Your deployed license server (Railway). No trailing slash.
  LICENSE_SERVER: process.env.LICENSE_SERVER || 'https://wa-crm.in',

  // Must match a product slug in the license server.
  PRODUCT_SLUG: process.env.PRODUCT_SLUG || 'ott24x7-crm',

  // Public half of the server's Ed25519 signing key. Safe to ship: it can verify an
  // "activation valid" reply but cannot produce one. The private half lives only in the
  // license server's LICENSE_SIGNING_KEY env var.
  //
  // This replaced a shared HMAC secret that had to be embedded here to verify anything —
  // which meant every build, including white-label copies handed to resellers, contained
  // everything needed to forge a valid activation.
  LICENSE_PUBLIC_KEY: process.env.LICENSE_PUBLIC_KEY || `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAXXKOzlneEZQKRQmQ4rb9FiP1dp0OGimONcijlnxAcaM=
-----END PUBLIC KEY-----`,

  // WhatsApp Web is loaded in a persistent session so linking is a one-time step.
  WA_PARTITION: 'persist:whatsapp',

  // A recent Chrome UA keeps WhatsApp Web happy inside Electron.
  USER_AGENT:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};
