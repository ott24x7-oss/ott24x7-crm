// Import a product catalog from a website, with or without an API.
//
// Most storefronts already publish their catalog in a machine-readable form without
// calling it an API: schema.org JSON-LD, which Google requires for rich results. Verified
// against the owner's own shop (ott24x7.com): the listing page carries an ItemList of 50
// products and each product page carries a full Product block with price, availability,
// category and description. Shopify, WooCommerce and most modern carts emit the same.
//
// Two paths, tried in order:
//   1. A JSON endpoint, if the site has one (fast, exact, includes stock).
//   2. JSON-LD crawl — listing page or sitemap, then each product page.
// A site with neither falls back to OpenGraph meta tags.
//
// Everything here runs in the main process: no CORS, no page context, and the fetched HTML
// never touches the WhatsApp tab.

const MAX_PRODUCTS = 300;
const CONCURRENCY = 6;
const UA = 'WA-CRM catalog import';

async function get(url, timeoutMs = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow' });
    if (!r.ok) return { ok: false, status: r.status, err: `HTTP ${r.status}` };
    const ct = r.headers.get('content-type') || '';
    const body = await r.text();
    return { ok: true, body, json: /json/i.test(ct) };
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, err: `Timed out fetching ${url}` };
    // A DNS miss is usually a typo or a lookalike character, not a dead site. Say so.
    if (/ENOTFOUND|getaddrinfo|EAI_AGAIN|fetch failed/i.test(String((e && e.message) || e))) {
      return { ok: false, err: `Could not reach ${url}. Check the address for a typo — characters like x and × look identical but are not the same.` };
    }
    return { ok: false, err: String((e && e.message) || e) };
  } finally { clearTimeout(t); }
}

// ---------- JSON-LD ----------
function ldBlocks(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim());
      // A single block may be an array, or use @graph to hold several entities.
      if (Array.isArray(j)) out.push(...j);
      else if (Array.isArray(j['@graph'])) out.push(...j['@graph']);
      else out.push(j);
    } catch (e) { /* a malformed block must not abort the rest */ }
  }
  return out;
}

const typeOf = (o) => {
  const t = o && o['@type'];
  return Array.isArray(t) ? t.map(String) : t ? [String(t)] : [];
};

// schema.org availability is a URL; only InStock and its siblings mean "buyable".
function availToStock(a) {
  const s = String(a || '').toLowerCase();
  if (!s) return true;
  if (/outofstock|soldout|discontinued/.test(s)) return false;
  return true;
}

const money = (v) => {
  const n = Number(String(v == null ? '' : v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

function fromProductLd(o, pageUrl) {
  const offers = Array.isArray(o.offers) ? o.offers[0] : o.offers;
  const price = money(offers && (offers.price ?? offers.lowPrice));
  return {
    title: String(o.name || '').trim().slice(0, 120),
    price,
    currency: String((offers && offers.priceCurrency) || 'INR').toUpperCase(),
    stock: availToStock(offers && offers.availability),
    category: String(o.category || '').trim().slice(0, 60),
    description: String(o.description || '').replace(/\s+/g, ' ').trim().slice(0, 800),
    url: String((offers && offers.url) || o.url || pageUrl || ''),
    image: typeof o.image === 'string' ? o.image : (Array.isArray(o.image) ? o.image[0] : ''),
  };
}

// ---------- the whole page, not just the meta ----------
// "It is sending description only" - the owner, correctly. A product page carries plans,
// validity, warranty and delivery steps in its body; the JSON-LD description is one
// polished sentence of it. This reads the page's own text so the assistant can answer
// about everything the page says, not everything the meta tag admits.
function pageText(html) {
  let h = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer|svg)[^>]*>[\s\S]*?<\/>/gi, ' ');
  const grab = (re) => { const m = re.exec(h); return m ? m[1] : ''; };
  const core = grab(/<main[^>]*>([\s\S]*?)<\/main>/i) || grab(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const desc = grab(/<[^>]+(?:class|id)=["'][^"']*(?:description|product-det|details|specs)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i);
  const src = ((core || '') + ' ' + (desc || '')).trim() || h;
  return src.replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 3500);
}

// A product with an offers ARRAY is several purchasable things - 1 month, 6 months, a
// year - and taking offers[0] imported exactly one of them. Each priced offer becomes its
// own catalogue row, named by the offer, so "6 month wala?" has data behind it.
function fromProductPage(o, pageUrl, html) {
  const raw = o && o.offers;
  let list = Array.isArray(raw) ? raw
    : raw && Array.isArray(raw.offers) ? raw.offers   // AggregateOffer wrapping real offers
    : raw ? [raw] : [];
  list = list.filter((x) => x && money(x.price != null ? x.price : x.lowPrice));

  let rows;
  if (list.length > 1) {
    const name = String((o && o.name) || '').trim();
    rows = list.map((of) => {
      const one = fromProductLd({ ...o, offers: of }, pageUrl);
      const label = String(of.name || of.sku || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      one.title = (name + ' — ' + (label || '₹' + one.price)).slice(0, 120);
      return one;
    });
  } else {
    rows = [fromProductLd(o || {}, pageUrl)];
  }

  const details = [
    String((o && o.description) || '').replace(/\s+/g, ' ').trim(),
    html ? pageText(html) : '',
  ].filter(Boolean).join(' — ').slice(0, 3500);
  if (rows[0] && details) rows[0].details = details;
  return rows;
}

// ---------- OpenGraph fallback ----------
function fromOg(html, pageUrl) {
  const meta = (prop) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
    const m = re.exec(html) || new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i').exec(html);
    return m ? m[1] : '';
  };
  const title = meta('og:title') || (/<title[^>]*>([^<]+)</i.exec(html) || [])[1] || '';
  const price = money(meta('product:price:amount') || meta('og:price:amount'));
  if (!title || !price) return null;   // without a price it is not a catalog entry
  return {
    title: title.trim().slice(0, 120), price,
    currency: (meta('product:price:currency') || meta('og:price:currency') || 'INR').toUpperCase(),
    stock: !/out\s*of\s*stock/i.test(html),
    category: '',
    // Same normalisation as the JSON-LD path: these descriptions go into the prompt, and
    // ragged whitespace is wasted tokens on every single reply.
    description: (meta('og:description') || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800),
    url: pageUrl, image: meta('og:image') || '',
  };
}

// ---------- URL discovery ----------
function productUrlsFromLd(blocks, base) {
  const urls = [];
  for (const b of blocks) {
    if (!typeOf(b).includes('ItemList')) continue;
    for (const el of (b.itemListElement || [])) {
      const item = el && (el.item || el);
      const u = item && (item.url || (item.offers && item.offers.url));
      if (u) urls.push(abs(u, base));
    }
  }
  return urls;
}

function abs(u, base) {
  try { return new URL(u, base).href; } catch (e) { return ''; }
}

// A sitemap is the most reliable discovery route when there is no listing page: it is the
// site's own statement of what exists.
async function urlsFromSitemap(origin, hint) {
  const r = await get(origin.replace(/\/+$/, '') + '/sitemap.xml', 25000);
  if (!r.ok) return [];
  const locs = [...String(r.body).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
  // Nested sitemap index — follow the first few children rather than everything.
  if (/<sitemapindex/i.test(r.body)) {
    const out = [];
    for (const s of locs.slice(0, 5)) {
      const c = await get(s, 25000);
      if (c.ok) out.push(...[...String(c.body).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]));
    }
    return filterProductish(out, hint);
  }
  return filterProductish(locs, hint);
}

// Keep the URLs that look like product pages. If the entry URL had a path segment
// (/plans, /product, /shop), prefer siblings of it — that is the site telling us where
// its products live.
function filterProductish(urls, hint) {
  const seg = hint && hint.replace(/^\/+|\/+$/g, '').split('/')[0];
  const pat = /\/(plans?|products?|shop|store|item|p|collections?)\//i;
  const scoped = seg ? urls.filter((u) => u.includes('/' + seg + '/')) : [];
  const generic = urls.filter((u) => pat.test(u));
  const picked = scoped.length ? scoped : generic;
  return [...new Set(picked)];
}

// ---------- a JSON endpoint, if one exists ----------
// Tried first because it is one request instead of hundreds, and usually carries stock.
async function tryJsonEndpoint(entry, token) {
  const origin = new URL(entry).origin;
  const candidates = [
    entry.replace(/\/+$/, '') + '/api/catalog',
    origin + '/api/catalog',
    origin + '/api/products',
    origin + '/products.json',            // Shopify serves this by default
  ];
  for (const url of candidates) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    let r;
    try {
      r = await fetch(url, {
        signal: ctl.signal, redirect: 'follow',
        headers: { 'User-Agent': UA, Accept: 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      });
    } catch (e) { clearTimeout(t); continue; } finally { clearTimeout(t); }
    if (!r.ok) continue;
    let j; try { j = await r.json(); } catch (e) { continue; }
    const rows = Array.isArray(j) ? j : (j.products || j.items || j.data || []);
    if (!Array.isArray(rows) || !rows.length) continue;
    const products = rows.map((p) => ({
      title: String(p.name || p.title || '').trim().slice(0, 120),
      price: money(p.price ?? (p.variants && p.variants[0] && p.variants[0].price)),
      currency: String(p.currency || 'INR').toUpperCase(),
      stock: p.active === 0 || p.available === false || p.in_stock === false ? false : true,
      category: String(p.category || p.category_name || p.product_type || '').trim().slice(0, 60),
      description: String(p.description || p.body_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800),
      activation: String(p.activation_guide || '').replace(/\s+/g, ' ').trim().slice(0, 800),
      url: p.url || url, image: p.image_file || p.image || '',
    })).filter((p) => p.title && p.price);
    // A feed row with priced variants is several purchasable things too.
    const spread = [];
    rows.forEach((p, i) => {
      const base = products.find((x) => x.title === String(p.name || p.title || '').trim().slice(0, 120));
      if (!base) return;
      base.details = String(p.description || p.body_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3500);
      const vars = Array.isArray(p.variants) ? p.variants.filter((v) => money(v.price)) : [];
      if (vars.length > 1) {
        vars.forEach((v) => spread.push({ ...base,
          title: (base.title + ' — ' + String(v.title || v.name || ('₹' + money(v.price))).slice(0, 40)).slice(0, 120),
          price: money(v.price), details: undefined }));
      } else spread.push(base);
    });
    if (spread.length && spread[0]) spread[0].details = spread[0].details || (products[0] && products[0].details);
    const outRows = spread.length ? spread : products;
    if (outRows.length) return { products: outRows, via: 'json:' + url };
  }
  return null;
}

// ---------- the importer ----------
// Addresses arrive via copy-paste, phone keyboards and autocorrect, all of which quietly
// substitute lookalikes. A real case: "ott24×7.com" with U+00D7 MULTIPLICATION SIGN where
// the letter x belongs — visually identical in the field, and it resolves to nothing.
// Fixing it silently beats a DNS error the owner cannot see the cause of.
function normaliseUrl(raw) {
  return String(raw || '')
    .replace(/[​-‍﻿]/g, '')      // zero-width characters
    .replace(/[×✕✖⨯]/g, 'x') // × ✕ ✖ ⨯ -> x
    .replace(/[‐-―]/g, '-')            // typographic dashes -> hyphen
    .replace(/[‘’“”]/g, '')  // smart quotes
    .trim();
}

async function importCatalog({ url, token, limit, onProgress }) {
  const clean = normaliseUrl(url);
  const entry = /^https?:\/\//i.test(clean) ? clean : 'https://' + clean.replace(/^\/+/, '');
  let origin, path;
  try { const u = new URL(entry); origin = u.origin; path = u.pathname; }
  catch (e) { return { ok: false, err: 'That does not look like a web address.' }; }

  const cap = Math.max(1, Math.min(MAX_PRODUCTS, limit || MAX_PRODUCTS));
  const note = (m) => { try { onProgress && onProgress(m); } catch (e) {} };

  // 1. A real endpoint beats crawling every time.
  note('Looking for a product feed…');
  const api = await tryJsonEndpoint(entry, token);
  if (api) return { ok: true, via: api.via, products: api.products.slice(0, cap) };

  // 2. The entry page itself.
  note('Reading the page…');
  const first = await get(entry, 25000);
  if (!first.ok) return { ok: false, err: first.err };

  const blocks = ldBlocks(first.body);
  const direct = blocks.filter((b) => typeOf(b).includes('Product')).flatMap((b) => fromProductPage(b, entry, first.body));
  const listed = productUrlsFromLd(blocks, entry).filter(Boolean);

  // 3. Always consult the sitemap as well, not only when the page yields nothing.
  //    A listing page is usually paginated: the owner's shop shows 50 per page while the
  //    sitemap lists all 219. Using the page alone silently imported less than a quarter of
  //    the catalog, and a product the assistant has never heard of is one it cannot sell.
  note(listed.length ? `${listed.length} on this page — checking the sitemap for the rest…` : 'Checking the sitemap…');
  const mapped = await urlsFromSitemap(origin, path);
  let urls = [...new Set([...listed, ...mapped])];

  if (!urls.length) {
    // A single product page, or a site with only OpenGraph.
    if (direct.length) return { ok: true, via: 'jsonld:page', products: direct.filter((p) => p.title).slice(0, cap) };
    const og = fromOg(first.body, entry);
    if (og) return { ok: true, via: 'opengraph', products: [og] };
    return { ok: false, err: 'No product data found on that page. Try the shop or product-listing page, not the home page.' };
  }

  // 4. Fetch each product page. Bounded concurrency: a shop is not a load test, and the
  //    owner's own Railway instance is usually a small box.
  const total = urls.length;
  urls = urls.slice(0, cap);
  note(total > urls.length
    ? `Found ${total} products — reading the first ${urls.length}. Raise "Max products" to import them all.`
    : `Found ${urls.length} product page(s). Reading them…`);
  const products = [...direct];
  let done = 0;

  const worker = async (queue) => {
    while (queue.length) {
      const u = queue.shift();
      const r = await get(u, 20000);
      done++;
      if (done % 10 === 0) note(`Read ${done} of ${urls.length}…`);
      if (!r.ok) continue;
      const lds = ldBlocks(r.body);
      const prod = lds.find((b) => typeOf(b).includes('Product'));
      if (prod) { products.push(...fromProductPage(prod, u, r.body)); continue; }
      const og = fromOg(r.body, u);
      if (og) products.push(og);
    }
  };
  const queue = [...urls];
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker(queue)));

  // Deduplicate by title — a listing and a product page can describe the same item.
  const seen = new Set();
  const unique = products.filter((p) => {
    const k = p.title.toLowerCase();
    if (!p.title || seen.has(k)) return false;
    seen.add(k); return true;
  });

  if (!unique.length) return { ok: false, err: 'Product pages were found but none carried readable product data.' };
  return { ok: true, via: 'jsonld:crawl', products: unique.slice(0, cap), scanned: urls.length, total };
}

module.exports = { importCatalog, normaliseUrl, ldBlocks, fromProductLd, fromProductPage, pageText, fromOg, filterProductish, availToStock };
