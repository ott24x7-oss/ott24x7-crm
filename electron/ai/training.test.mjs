// Tests for turning a real WhatsApp conversation into training examples.
// The risk here is privacy: a customer's phone number or UPI id ending up in the vector
// store, where it would later be fed back into a prompt.
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../../renderer/app.js', import.meta.url), 'utf8');
const from = src.indexOf('// ---------- Learn from real sales chats ----------');
const to = src.indexOf('async function aiViewTraining()');
const block = src.slice(from, to);

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };

const ctx = vm.createContext({ console, JSON, Math, Number, String, Object, Array, Date, RegExp });
ctx.globalThis = ctx;
vm.runInContext(block + '\n;globalThis.T={aiPairs,aiClassifyPair,aiDetectLangLocal,aiRedactLocal};', ctx);
const T = ctx.T;

console.log('AI training extraction');

// ---- pairing ----
{
  const msgs = [
    { fromMe: false, body: 'hi', ts: 1 },
    { fromMe: false, body: 'netflix ka price kya hai bhai?', ts: 2 },
    { fromMe: true, body: 'Netflix 1 month is 250.', ts: 3 },
    { fromMe: true, body: 'Single screen, 30 days.', ts: 4 },
    { fromMe: false, body: 'ok', ts: 5 },
    { fromMe: false, body: 'thoda mehnga hai, kam karo', ts: 6 },
    { fromMe: true, body: 'That is our best rate, and it comes with replacement support.', ts: 7 },
  ];
  const pairs = T.aiPairs(msgs);
  ok(pairs.length === 2, `two teachable pairs (got ${pairs.length})`);
  ok(/netflix ka price/.test(pairs[0].question) && /hi/.test(pairs[0].question),
    'consecutive customer messages are joined into one question');
  ok(/Single screen/.test(pairs[0].reply), 'consecutive owner messages are joined into one reply');
  ok(!pairs.some((p) => /^ok$/i.test(p.question.trim())), 'a bare "ok" is not taught');
}
{
  // Owner-first and owner-only transcripts must produce nothing rather than garbage.
  ok(T.aiPairs([{ fromMe: true, body: 'Any update?' }]).length === 0, 'an owner-only chat yields no pairs');
  ok(T.aiPairs([{ fromMe: false, body: 'hello there' }]).length === 0, 'an unanswered question yields no pair');
}

// ---- redaction, the part that must not fail ----
{
  const dirty = 'Call me on 9812345678 or mail a.b+x@shop.co.in. Pay to ravi@okaxis. '
    + 'Card 4111 1111 1111 1111. Order #AB12345 shipped.';
  const clean = T.aiRedactLocal(dirty);
  ok(!/9812345678/.test(clean), 'phone removed');
  ok(!/@shop\.co\.in/.test(clean), 'email removed');
  ok(!/okaxis/.test(clean), 'UPI handle removed');
  ok(!/4111/.test(clean), 'card number removed');
  ok(!/AB12345/.test(clean), 'order reference removed');
  ok(/\[phone\]|\[email\]|\[upi\]|\[card\]|\[reference\]/.test(clean), 'replaced with placeholders, not deleted silently');
}
{
  // A price must survive: it is the thing that makes the example readable, and it never
  // becomes a quotable fact because the prompt forbids it.
  ok(/250/.test(T.aiRedactLocal('Netflix is 250 rupees')), 'a price is not mistaken for personal data');
}

// ---- classification ----
{
  const products = [{ title: 'Netflix 1 Month' }];
  const p = T.aiClassifyPair({ question: 'bahut mehnga hai', reply: 'Netflix 1 Month best rate hai, payment ke baad turant activate.' }, products);
  ok(p.objection === 'price', `price objection detected (${p.objection})`);
  ok(p.product === 'Netflix 1 Month', 'product matched from the catalog');
  ok(p.closing === true, 'closing message detected');
  ok(p.language === 'hinglish', `language detected (${p.language})`);
  ok(p.tags.includes('price') && p.tags.includes('closing'), `tags built (${p.tags.join(',')})`);
}
{
  const p = T.aiClassifyPair({ question: 'is this genuine or fake?', reply: 'It is genuine, we have been selling for 3 years.' }, []);
  ok(p.objection === 'trust', 'trust objection detected');
  ok(p.product === '', 'no product invented when none matches');
  ok(p.language === 'en', 'English detected');
}

// ---- language ----
ok(T.aiDetectLangLocal('नमस्ते कीमत क्या है') === 'hi', 'Hindi detected');
ok(T.aiDetectLangLocal('price kitna hai') === 'hinglish', 'Hinglish detected');
ok(T.aiDetectLangLocal('what is the price') === 'en', 'English detected');

console.log(fail ? `\n  ${fail} failing` : '\n  all passing');
process.exit(fail ? 1 : 0);
