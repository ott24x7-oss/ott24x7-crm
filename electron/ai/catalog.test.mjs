// Tests for the website catalog importer.
//
// The parsing here decides what prices the assistant is allowed to quote, so a wrong price
// or a product silently dropped is a real business error. The fixtures below are the shapes
// actually seen on the owner's live shop plus the common storefront variations.
import assert from 'node:assert';
import { normaliseUrl, ldBlocks, fromProductLd, fromOg, filterProductish, availToStock } from './catalog.js';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
};

console.log('Website catalog import');

// ---- JSON-LD extraction ----
t('reads a Product block', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Product', name: 'Beautiful AI Pro 1 Year',
    description: 'AI premium plan for the listed validity.', category: 'AI & Writing Tools',
    offers: { '@type': 'Offer', price: '299', priceCurrency: 'INR', availability: 'https://schema.org/InStock' },
  })}</script>`;
  const p = fromProductLd(ldBlocks(html)[0], 'https://shop.test/p/1');
  assert.strictEqual(p.title, 'Beautiful AI Pro 1 Year');
  assert.strictEqual(p.price, 299);
  assert.strictEqual(p.stock, true);
  assert.match(p.category, /AI & Writing/);
});

t('survives a malformed block next to a good one', () => {
  const html = `<script type="application/ld+json">{ broken json </script>
    <script type="application/ld+json">{"@type":"Product","name":"Ok","offers":{"price":"99"}}</script>`;
  const blocks = ldBlocks(html);
  assert.strictEqual(blocks.length, 1, 'the good block must still be found');
  assert.strictEqual(fromProductLd(blocks[0]).price, 99);
});

t('unwraps @graph and top-level arrays', () => {
  assert.strictEqual(ldBlocks(`<script type="application/ld+json">{"@graph":[{"@type":"Product"},{"@type":"Offer"}]}</script>`).length, 2);
  assert.strictEqual(ldBlocks(`<script type="application/ld+json">[{"@type":"Product"},{"@type":"Product"}]</script>`).length, 2);
});

// ---- price parsing: the number the assistant may quote ----
t('parses prices written various ways', () => {
  const p = (v) => fromProductLd({ name: 'x', offers: { price: v } }).price;
  assert.strictEqual(p('299'), 299);
  assert.strictEqual(p(299), 299);
  assert.strictEqual(p('₹1,499.00'), 1499);
  assert.strictEqual(p('INR 5500'), 5500);
});
t('takes lowPrice from an AggregateOffer', () => {
  assert.strictEqual(fromProductLd({ name: 'x', offers: { '@type': 'AggregateOffer', lowPrice: '150' } }).price, 150);
});
t('takes the first of several offers rather than guessing', () => {
  assert.strictEqual(fromProductLd({ name: 'x', offers: [{ price: '10' }, { price: '20' }] }).price, 10);
});
t('a product with no price yields zero, never a made-up number', () => {
  assert.strictEqual(fromProductLd({ name: 'x' }).price, 0);
});

// ---- availability ----
t('reads availability correctly', () => {
  assert.strictEqual(availToStock('https://schema.org/InStock'), true);
  assert.strictEqual(availToStock('https://schema.org/OutOfStock'), false);
  assert.strictEqual(availToStock('http://schema.org/SoldOut'), false);
  assert.strictEqual(availToStock('Discontinued'), false);
  // Absent availability must not be read as "gone" — most sites omit it when in stock.
  assert.strictEqual(availToStock(''), true);
});

// ---- OpenGraph fallback ----
t('falls back to OpenGraph when there is no JSON-LD', () => {
  const html = `<meta property="og:title" content="Netflix 1 Month">
                <meta property="product:price:amount" content="250">
                <meta property="product:price:currency" content="INR">`;
  const p = fromOg(html, 'https://shop.test/x');
  assert.strictEqual(p.title, 'Netflix 1 Month');
  assert.strictEqual(p.price, 250);
});
t('OpenGraph without a price is not treated as a product', () => {
  assert.strictEqual(fromOg('<meta property="og:title" content="About us">', 'https://shop.test/about'), null);
});
t('OpenGraph detects an out-of-stock page', () => {
  const html = `<meta property="og:title" content="Prime"><meta property="og:price:amount" content="999">
                <div>This item is Out of Stock</div>`;
  assert.strictEqual(fromOg(html, 'u').stock, false);
});

// ---- URL discovery ----
t('prefers URLs under the same section as the entry page', () => {
  const urls = ['https://s.test/plans/a', 'https://s.test/plans/b', 'https://s.test/blog/post', 'https://s.test/about'];
  assert.deepStrictEqual(filterProductish(urls, '/plans'), ['https://s.test/plans/a', 'https://s.test/plans/b']);
});
t('falls back to common storefront paths when there is no hint', () => {
  const urls = ['https://s.test/product/a', 'https://s.test/collections/b', 'https://s.test/about'];
  const got = filterProductish(urls, '');
  assert.ok(got.length === 2 && !got.some((u) => u.includes('/about')), got.join(','));
});
t('deduplicates discovered URLs', () => {
  assert.strictEqual(filterProductish(['https://s.test/plans/a', 'https://s.test/plans/a'], '/plans').length, 1);
});

// ---- safety: nothing may be invented ----
t('never invents a title or a currency', () => {
  const p = fromProductLd({ offers: { price: '10' } });
  assert.strictEqual(p.title, '');
  assert.strictEqual(p.currency, 'INR');   // documented default, not guessed per product
});
t('strips HTML out of a description rather than passing markup through', () => {
  const html = `<meta property="og:title" content="X"><meta property="og:price:amount" content="5">
                <meta property="og:description" content="Line one   with  spaces">`;
  assert.strictEqual(fromOg(html, 'u').description, 'Line one   with  spaces'.replace(/\s+/g, ' ').trim());
});


// A real paste from the owner's screen: ott24×7.com with U+00D7 MULTIPLICATION SIGN where
// the letter x belongs. Visually identical in the field; resolves to nothing.
t('repairs lookalike characters in a pasted address', () => {
  assert.strictEqual(normaliseUrl('https://ott24×7.com/plans'), 'https://ott24x7.com/plans');
  assert.strictEqual(normaliseUrl('https://ott24✕7.com'), 'https://ott24x7.com');
});
t('strips zero-width characters and trims', () => {
  assert.strictEqual(normaliseUrl('  https://a.com​/x  '), 'https://a.com/x');
});
t('leaves a correct address untouched', () => {
  assert.strictEqual(normaliseUrl('https://ott24x7.com/plans'), 'https://ott24x7.com/plans');
});

console.log(fail ? `\n  ${fail} failing` : `\n  all ${pass} passing`);
process.exit(fail ? 1 : 0);
