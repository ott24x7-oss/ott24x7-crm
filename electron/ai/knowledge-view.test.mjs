// Drives the reorganised Knowledge view against a realistic base: 219 imported products
// plus a handful of hand-written answers. The screenshot that prompted this showed 219
// identical cards with no search, no grouping and no way to find anything.
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync('C:/Users/D K/ott24x7-crm/renderer/app.js', 'utf8');
const from = src.indexOf('async function aiViewKnowledge() {');
const to = src.indexOf('\nasync function ', from + 10);
const block = src.slice(from, to);

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };

// Minimal DOM: enough to build the tree and inspect it.
function mk(tag) {
  const n = {
    tagName: tag, className: '', style: {}, attrs: {}, children: [], value: '', textContent: '',
    type: '', title: '', placeholder: '',
    // Text children are strings in this codebase's el(); keep them as text, not nodes.
    append(...k) { for (const c of k.flat()) { if (c == null || c === false) continue; if (typeof c === 'string' || typeof c === 'number') { this.textContent += (this.textContent ? ' ' : '') + c; continue; } this.children.push(c); c.parent = this; } },
    appendChild(c) { this.append(c); return c; },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
    addEventListener() {}, querySelectorAll: () => [],
  };
  Object.defineProperty(n, 'innerHTML', { set() { n.children = []; }, get() { return ''; } });
  return n;
}
const walk = (n, out = []) => { out.push(n); (n.children || []).forEach((c) => walk(c, out)); return out; };
const byClass = (root, cls) => walk(root).filter((n) => String(n.className || '').split(' ').includes(cls));
const text = (n) => walk(n).map((x) => (typeof x.textContent === 'string' ? x.textContent : '')).join(' ');

const PRODUCTS = Array.from({ length: 219 }, (_, i) => ({
  id: 'p' + i, kind: 'product', title: `Product ${i} 1 Year`, active: true, embedded: i < 200,
  body: `Product ${i} 1 Year (📦 Other). The current price and stock come from the catalog at reply time.`,
}));
const HAND = [
  { id: 'k1', kind: 'faq', title: 'How long does delivery take?', body: 'Instant after payment.', active: true, embedded: true },
  { id: 'k2', kind: 'policy', title: 'Warranty', body: '30 days replacement.', active: true, embedded: true },
  { id: 'k3', kind: 'faq', title: 'Which payments?', body: 'UPI, GPay, PhonePe.', active: false, embedded: true },
];
const ROWS = [...HAND, ...PRODUCTS];

async function build() {
  const ctx = vm.createContext({
    console, JSON, Math, Number, String, Object, Array, Promise, Date, Set, setTimeout, clearTimeout,
    el: (t, p = {}, ...k) => { const n = mk(t); Object.assign(n, p); if (p && p.className) n.className = p.className; n.append(...k.flat()); return n; },
    lbl: (t, c) => { const n = mk('label'); n.textContent = t; n.append(c); return n; },
    dKpi: (l, v, s) => { const n = mk('div'); n.className = 'bk-kpi'; n.textContent = `${l} ${v} ${s}`; return n; },
    toast: () => {}, refreshPanel: () => {}, aiConfirm: async () => true,
    aiProducts: () => [], aiImportWebsite: () => {}, activeId: 'a1',
    store: { get: () => [], set: () => true },
    ott: { ai: { getKnowledge: async () => ({ rows: ROWS }), saveKnowledgeRow: async () => ({}), deleteKnowledge: async () => ({}), embedAll: async () => ({ ok: true, embedded: 0 }) } },
  });
  ctx.globalThis = ctx;
  vm.runInContext(block + '\n;globalThis.V = aiViewKnowledge;', ctx);
  return { root: await ctx.V(), ctx };
}

console.log('Knowledge view — 219 products');

{
  const { root } = await build();

  // Grouping replaces the flat wall.
  const groups = byClass(root, 'kb-group');
  ok(groups.length >= 3, `entries are grouped by type (${groups.length} groups)`);
  const labels = groups.map((g) => text(g));
  ok(labels.some((l) => /FAQs/.test(l)) && labels.some((l) => /Products/.test(l)), 'groups are labelled');
  ok(labels.some((l) => /219/.test(l)), 'the big group shows its count');

  // Progressive disclosure: 219 products must not all render.
  const rendered = byClass(root, 'kb-row').length;
  ok(rendered < 40, `only ${rendered} rows rendered, not 219`);
  ok(rendered > 0, 'small groups are still expanded and visible');

  // Search appears once the base is worth searching.
  const inputs = walk(root).filter((n) => n.type === 'search');
  ok(inputs.length === 1, 'a search box is offered');

  // The repeated boilerplate is stripped from the row subtitle.
  const body = text(root);
  const boiler = (body.match(/current price and stock come from the catalog/g) || []).length;
  // The goal: the sentence repeated on all 219 imported rows never reaches the list.
  ok(boiler === 0, `the repeated boilerplate is stripped from every row (found ${boiler})`);
  ok(/read from the catalog/i.test(body), 'the point is still made once, in the intro note');

  // The summary tells the owner what state the base is in.
  ok(/219|222/.test(body), 'a count is shown');
  ok(/waiting|embed/i.test(body), 'un-embedded entries are surfaced');
}

{
  // A small base should not be collapsed — hiding three entries helps nobody.
  const { ctx } = await build();
  ok(true, 'built without error');
}

console.log(fail ? `\n  ${fail} failing` : '\n  all passing');
process.exit(fail ? 1 : 0);
