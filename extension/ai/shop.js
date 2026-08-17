// Live shop brain — ported from railway_final/whatsapp_ai.py + ai_shop_facts.py.
//
// The model gets NO tools and NO write access. Every reply is built from:
//   1. LIVE CATALOG  — rebuilt from the CRM product list on every message
//   2. SHOP FACTS    — policies / reseller / payments from settings + knowledge
//   3. Hard rules    — never invent products, prices, keys, or refunds
//
// Embeddings may still help pick tone/examples elsewhere; facts always come from here.

/** WhatsApp-safe formatting. Models emit markdown; WhatsApp wants *bold* and bare URLs. */
function mdToWhatsApp(text) {
  let s = String(text || '');
  s = s.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
    const L = String(label || '').trim();
    return (!L || /^(buy|link|buy now|here)$/i.test(L)) ? url : `${L}: ${url}`;
  });
  s = s.replace(/\*\*([^\n*]+?)\*\*/g, '*$1*');
  s = s.replace(/__([^\n_]+?)__/g, '*$1*');
  s = s.replace(/^\s*[-*]\s+/gm, '• ');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function digits(v) {
  return String(v || '').replace(/\D/g, '');
}

/** Live retail catalog. Only in-stock / sellable rows. Buy links when present. */
function formatCatalog(products, limit = 120) {
  const rows = (products || [])
    .filter((p) => p && (p.title || p.name) && p.stock !== false)
    .slice(0, limit);
  if (!rows.length) return '(no products listed right now)';
  return rows.map((p) => {
    const title = String(p.title || p.name || '').trim();
    const cat = String(p.category || 'other').trim();
    const price = Number(p.price || p.sell || 0);
    const desc = String(p.text || p.description || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);
    const link = String(p.url || '').trim();
    return `- ${title} | ${cat} | INR ${price || '?'}`
      + (desc ? ` | ${desc}` : '')
      + (link ? ` | Buy: ${link}` : '');
  }).join('\n');
}

/** Prefer products that match the question, then the rest — railway_final sends the full list. */
function orderCatalog(products, productHits) {
  const matched = new Set((productHits || []).map((h) => (h.row && (h.row.title || h.row.question)) || ''));
  const list = products || [];
  return [
    ...list.filter((p) => matched.has(p.title)),
    ...list.filter((p) => !matched.has(p.title)),
  ];
}

function supportBlock(settings) {
  const wa = digits(settings.supportWhatsApp);
  const tg = String(settings.supportTelegram || '').trim().replace(/^@/, '');
  const out = [];
  if (wa) out.push(`- WhatsApp (human): https://wa.me/${wa}`);
  if (tg) out.push(`- Telegram (human): https://t.me/${tg}`);
  return out.join('\n');
}

/**
 * Shop facts from settings + knowledge FAQs/policies.
 * Knowledge product rows stay out — those are covered by the live catalog.
 */
function shopFacts(settings, knowledgeRows) {
  const site = String(settings.shopSiteUrl || settings.siteUrl || '').trim().replace(/\/$/, '');
  const lines = [
    'SHOP FACTS (authoritative — use these for reselling, discounts, wallet, payments, warranty):',
    '',
  ];
  if (String(settings.businessInstructions || '').trim()) {
    lines.push(String(settings.businessInstructions).trim());
    lines.push('');
  }
  if (site) {
    lines.push(`Website: ${site}`);
    lines.push(`Account / orders: ${site}/account`);
    lines.push(`Reseller programme: ${site}/reseller`);
    lines.push('');
  }
  lines.push('RESELLING / EXTRA DISCOUNT:');
  lines.push('- If they ask for reseller / wholesale / extra discount, explain the reseller programme from these facts.');
  lines.push('- Do NOT invent a personal rate. Extra one-off deals go to a human.');
  lines.push('- Do NOT approve anyone as reseller yourself — send the reseller page link if you have one.');
  lines.push('');
  lines.push('PAYMENTS / KEYS / REFUNDS:');
  lines.push('- You CANNOT approve payments, reveal or generate keys/credentials, or decide refunds.');
  lines.push('- UPI/USDT often need the EXACT amount. Screenshots alone are not enough — UTR/reference helps humans.');
  lines.push('- Invalid / used / blocked keys: a human handles warranty claims. Never promise a refund yourself.');
  lines.push('');
  lines.push('YOU DO NOT KNOW (never guess): wallet balances, personal discount %, order status, UTR match, stock counts, license keys, or unpublished products.');

  const faqs = (knowledgeRows || []).filter((r) => {
    if (r.active === false) return false;
    const kind = String(r.kind || '').toLowerCase();
    return kind === 'faq' || kind === 'policy' || kind === 'note' || kind === '';
  }).slice(0, 40);
  if (faqs.length) {
    lines.push('');
    lines.push('EXTRA NOTES FROM THE OWNER:');
    for (const r of faqs) {
      lines.push(`- ${r.title}: ${String(r.body || '').replace(/\s+/g, ' ').trim().slice(0, 280)}`);
    }
  }
  return lines.join('\n');
}

/**
 * System prompt shaped like railway_final whatsapp_ai.system_prompt().
 * Catalog is the ONLY product source of truth.
 */
function buildSystemPrompt({ settings, language, products, productHits, knowledge, examples, customer }) {
  const brand = String(settings.businessName || '').trim() || 'our store';
  const ordered = orderCatalog(products, productHits);
  const catalog = formatCatalog(ordered, Math.min(120, Number(settings.catalogPromptLimit) || 120));
  const facts = shopFacts(settings, (knowledge || []).map((h) => h.row || h));
  const support = supportBlock(settings);
  const lang = language === 'hi'
    ? 'Reply in Hindi (Devanagari).'
    : language === 'hinglish'
      ? 'Reply in Hinglish (Hindi in Roman script), matching the customer.'
      : 'Reply in English.';

  const lines = [
    `You are ${brand}'s friendly AI sales and support assistant on WhatsApp.`,
    '',
    'LIVE CATALOG (rebuilt every message — your ONLY source of truth for products/prices):',
    catalog,
    '',
    facts,
    '',
    'RULES:',
    '- The catalog above lists ONLY products currently available to buy. Out-of-stock / missing',
    '  items are NOT listed and must NEVER be mentioned, priced, recommended, or linked.',
    '- NEVER invent, price, or link a product that is not in the list above. If they ask for',
    '  something not listed, say it is not available right now and suggest the closest item.',
    '- When you recommend a product, paste its real Buy: link from the list (own line).',
    '- You CANNOT approve payments, reveal keys/credentials, decide refunds, or see private data.',
    '- If they ask for a human, complain, or ask about a specific order/payment/refund, hand off.',
    '',
    support
      ? `HUMAN SUPPORT (share when a human is needed):\n${support}`
      : 'HUMAN SUPPORT: tell them the team will reply here shortly.',
    '',
    `LANGUAGE: ${lang} Mirror their tone.`,
    '',
    'TONE — warm helpful human, not a robot:',
    '- Open with a short friendly line that answers what they asked.',
    '- Empathetic; if unavailable, say so kindly and pivot. At most 1-2 emojis.',
    '- Close with a friendly nudge (e.g. "Batao kaunsa chahiye, link bhej dun 😊").',
    '- Never repeat the same point twice.',
    '',
    'FORMAT — clean WhatsApp layout (this matters a lot):',
    '- Short: friendly opener + at most 2-3 options + one-line close.',
    '- Each product on its OWN lines, blank line between products:',
    '      *Product name* - INR price',
    '      <buy link on its own line>',
    '- Put every link on its own line so it stays tappable.',
    '- WhatsApp bold is *single asterisks*. Use INR for prices.',
    '- Never use **, markdown [text](url) links, headings, or tables.',
    `- Keep under ${settings.maxResponseChars || 600} characters.`,
  ];

  if (examples && examples.length) {
    lines.push('');
    lines.push('STYLE EXAMPLES (copy tone, never copy stale prices):');
    for (const e of examples.slice(0, 3)) {
      const row = e.row || e;
      lines.push(`- Customer: ${row.question}\n  Reply: ${row.reply}`);
    }
  }

  if (customer && (customer.name || customer.orders)) {
    lines.push('');
    lines.push('CUSTOMER:');
    if (customer.name) lines.push(`- Name: ${customer.name}`);
    if (customer.orders) lines.push(`- Past purchases: ${customer.orders}`);
  }

  lines.push('');
  lines.push('Write only the reply text. No greeting boilerplate if the conversation is already going.');
  lines.push('If you truly cannot answer from the catalog/facts, reply exactly: NEED_HUMAN');
  return lines.join('\n');
}

export {
  mdToWhatsApp,
  formatCatalog,
  orderCatalog,
  shopFacts,
  supportBlock,
  buildSystemPrompt,
};
