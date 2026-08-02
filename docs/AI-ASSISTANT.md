# AI Sales Assistant

A self-hosted sales assistant for WA-CRM. The model runs on the owner's own machine via
Ollama; no customer data leaves the computer.

## Why it is built this way

The usual design for this feature — Postgres + pgvector, an ORM with migrations, a
WhatsApp webhook and a queue worker — assumes a server-side CRM. **WA-CRM has no such
server.** WhatsApp Web runs inside the owner's own Electron webview, all CRM data lives in
`localStorage` on their machine, and the only backend (`ott24x7-license-server`) is a
licence/storefront on SQLite that never sees a message, contact or conversation.

So the assistant is built where the data actually is:

| Spec assumed | What this product has |
|---|---|
| Postgres + pgvector | Local JSON index under Electron `userData`, cosine similarity in JS |
| ORM migrations | Versioned JSON files, created on first write |
| WhatsApp webhook | `WPP.on('chat.new_message')` inside the webview → `__ott_inq` → poll tick |
| Queue worker | In-process async queue, drained off the poll tick |
| Multi-tenant `business_id` | **WhatsApp account id** — the app runs several accounts side by side |

Brute-force vector search is the right call at this scale: a knowledge base is hundreds of
rows, and an exact scan of ~2k × 768 floats takes about a millisecond. An ANN index would
add failure modes for no measurable gain.

## Architecture

```
WhatsApp webview                Electron renderer            Electron main
────────────────                ─────────────────            ─────────────
chat.new_message ──► __ott_inq ──► pollTick ──► aiOnIncoming ──► ai:generate
                                        │                            │
                                        │                    ┌───────┴────────┐
                                        │                    │ rag.js         │
                                        │                    │  retrieve      │
                                        │                    │  prompt        │
                                        │                    │  validate      │
                                        │                    │  confidence    │
                                        │                    └───────┬────────┘
                                        │                            │
                                        │                    provider.js ──► Ollama
                                        │                            │
                                        ◄──── send | suggest | handover
                                        │
                                   sendTextOn()
```

**The live-facts rule.** Embeddings inform tone and phrasing, never facts. Prices, stock
and payment details are read from the CRM catalog on every single request and passed in
with the call. Any rupee figure in a generated reply that is not in that live data causes
the reply to be refused. A stale embedded price is a wrong price.

## Files

| File | Purpose |
|---|---|
| `electron/ai/provider.js` | Swappable model provider. Ollama today; OpenAI/Gemini/Groq/Anthropic drop in by adding one registry entry. Timeouts, selective retry, human-readable errors. |
| `electron/ai/store.js` | Per-account persistence: settings, knowledge, examples, logs, conversation state. Atomic writes. Refuses unscoped writes. |
| `electron/ai/rag.js` | Retrieval, language/intent detection, prompt building, response validation, confidence, PII redaction. |
| `electron/ai/index.js` | Orchestration + IPC surface. Owner availability. |
| `electron/ai/ai.test.js` | 32 tests over the safety-critical paths. |

## Setup

### 1. Install Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Windows: download from <https://ollama.com/download>.

### 2. Pull the models

```bash
ollama pull qwen3:4b
```

```bash
ollama pull nomic-embed-text
```

`qwen3:4b` handles English, Hindi and Hinglish and runs on a normal laptop (~4 GB RAM).
On a machine with a GPU or 16 GB+, `qwen3:8b` gives noticeably better Hinglish.
On a very small machine, `qwen3:1.7b` works but hands over more often.

### 3. Confirm it is serving

```bash
ollama serve
```

Then in WA-CRM: **AI Assistant → Settings → Test connection**.

## Environment variables

Optional — the settings screen is the primary interface, and these only supply defaults.
Follow the existing `config.js` style.

```
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_CHAT_MODEL=qwen3:4b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
AI_DEFAULT_CONFIDENCE_THRESHOLD=0.62
```

No secrets are needed in self-hosted mode: there is no API key, because there is no
external service.

## Data

Written to Electron `userData/data/`, one set per WhatsApp account:

```
ai-settings-<acc>.json     modes, thresholds, business rules
ai-knowledge-<acc>.json    knowledge entries + embedding vectors
ai-examples-<acc>.json     approved sales-chat examples (redacted)
ai-logs-<acc>.json         reply log, capped at 1000
ai-state-<acc>.json        per-conversation replies / takeover / seen ids
```

There are no migrations to run. Files are created on first write and new settings keys
merge over `DEFAULT_SETTINGS`, so an older file keeps working after an update.

## Modes

| Mode | Behaviour |
|---|---|
| `off` | Disabled. |
| `suggest` | **Default.** Drafts replies for review. Never sends. |
| `offline` | Sends automatically only while the owner is away. |
| `always` | Sends automatically 24×7. |

Auto-reply is never enabled by an update. The owner must switch it on, and must tick the
consent box before any mode above `off` takes effect.

## Owner availability

Four inputs, in priority order:

1. Global **Pause AI** — counts as present.
2. Manual **online/away** toggle.
3. Business hours, if enabled.
4. Inactivity (pointer/key/focus in the CRM window), default 10 minutes.

Replying to a chat in WhatsApp marks the owner present. Taking over a conversation pauses
the assistant for that conversation until resumed.

## Safety

Refused automatically, every time:

- a price not in the live catalog
- promising an out-of-stock product
- confirming a payment, approving a refund or a return
- inventing a discount
- absolute promises ("100% guaranteed")
- leaked system prompt, or revealing itself as an AI
- over-length replies

Forced to a human regardless of confidence: refund disputes, payment mismatches, discount
requests, angry customers, legal threats, plus any owner-configured keyword.

Also blocked: group chats (unless enabled), excluded contacts, conversations the owner has
taken over, messages already processed (by WhatsApp message id), and any conversation that
has hit its reply cap.

## Confidence

Blended from knowledge-match strength, corroboration across sources, intent confidence,
validation result, conversation context and whether live product data was available.

- `≥ minConfidence` (default 0.62) **and** clean validation **and** a permitting mode → send
- between thresholds → save as a suggestion
- `< suggestConfidence` (default 0.35) → hand to the owner

## Privacy

- Nothing is sent to any external service in self-hosted mode.
- Chat examples are redacted before storage: phone numbers, emails, UPI handles, card-like
  digit runs and order references.
- **Delete all AI data** removes knowledge, examples, logs and state for that account.
- Accounts are fully isolated; an unscoped write is refused rather than pooled.

## Deployment

The assistant is **client-side only** and needs no Railway change. The licence server is
untouched. Do not attempt to run Ollama on the Railway instance: it has no GPU and the
customer data would then leave the owner's machine, which is the opposite of the point.

For a shop wanting a shared assistant across several staff machines, run Ollama on one
local machine (16 GB RAM, or any consumer GPU) and point each CRM's **Ollama address** at
its LAN IP.

## Troubleshooting

| Symptom | Cause |
|---|---|
| "Cannot reach the AI server" | Ollama is not running. `ollama serve`. |
| "The model … is not installed" | `ollama pull <model>`. |
| "ran out of memory" | Use a smaller model (`qwen3:1.7b`). |
| Replies always become suggestions | Knowledge base is empty or not embedded — press **Re-embed**. |
| Nothing happens at all | Mode is `off`, or consent is not ticked. |
| Replies are in the wrong language | The model mirrors the customer; add a business instruction. |

## Testing

```bash
node electron/ai/ai.test.js
```

Covers price and stock validation, refund/payment/discount refusal, prompt-leak detection,
forced handover, language detection, PII redaction, confidence behaviour, vector search
filtering, all five availability paths, tenant isolation, unscoped-write refusal,
conversation state, purge, and the suggestions-only default.

## Learning from real sales chats

The model is **never fine-tuned**. A conversation that closed well is read out of WhatsApp,
split into question → reply pairs, stripped of personal data and put in front of the owner
to approve. Approved pairs are embedded as *style* examples only — the system prompt tells
the model to copy the phrasing, never the facts, because a price quoted in a chat from
three months ago is exactly the kind of stale number that must not resurface.

**AI Assistant → Learn from chats:**

1. Pick a customer from your leads and deals, or type a number.
2. Mark it *Successful sale*, *Good example*, or *Do not use for AI*.
   Choosing "do not use" adds that contact to the exclusion list, so the assistant will
   neither learn from them nor reply to them.
3. Press **Read conversation**. The last 60 messages (configurable, 10–200) are read.
4. Each pair is shown with an auto-detected language, product, objection and whether it
   looks like a closing message. All of it is editable.
5. Tick the pairs worth keeping and press **Save this one** or **Approve all shown**.
6. Press **Re-embed** in Knowledge to make them searchable.

Consecutive messages from the same side are joined — people send three short lines where
one would do, and the reply belongs to the whole question. Bare greetings and "ok" are
dropped.

### Redaction

Applied twice: once in the renderer before anything appears on screen, and again in the
main process before it is written to disk. Phone numbers, emails, UPI handles, card-like
digit runs and order references are replaced with placeholders. Prices are deliberately
left intact — they make the example readable and can never become a quotable fact, because
validation rejects any figure not in the live catalog.

Examples start as **Awaiting review** and are only used once approved. Each can be turned
off or deleted from the same screen.

## Importing a catalog from your website

**AI Assistant → Knowledge → Import from website.** Point it at your shop or
product-listing page.

No API is required. Most storefronts already publish their catalog in machine-readable
form because Google requires it for rich results — schema.org JSON-LD. Verified against
ott24x7.com: the listing page carries an ItemList and each product page carries a full
Product block with price, availability, category and description. Shopify, WooCommerce and
most modern carts emit the same.

Three routes are tried in order:

1. **A JSON product feed**, if the site has one — one request, exact data, includes stock.
   Tried at `/api/catalog`, `/api/products` and `/products.json` (Shopify's default).
2. **JSON-LD crawl** — the listing page, or `sitemap.xml` if there is no listing, then each
   product page. Four at a time, capped.
3. **OpenGraph meta tags**, for sites with neither.

### Where imported products land

Into the **catalog** (`ott_quick`), not only the knowledge base. That is deliberate: the
reply validator checks every rupee figure against the catalog, so a price becomes quotable
only once it is a live CRM fact. Product descriptions are saved to knowledge separately —
**without prices** — so the assistant can describe an item while the number is always read
live at reply time.

Re-importing updates prices on products already present rather than duplicating them.
Imported products are not pinned as chat-bar chips; a 50-item catalog would otherwise
bury the composer.

Press **Re-embed** afterwards to make the new descriptions searchable.

### Adding a feed to your own site

If you run the shop yourself, a read-only JSON endpoint is faster and carries stock. For a
Flask site such as `railway_final`:

```python
@bp.get("/api/catalog")
def api_catalog():
    return jsonify([
        {"name": p["name"], "price": p["price"], "category": p.get("category"),
         "description": p.get("description"), "activation_guide": p.get("activation_guide"),
         "active": p.get("active", 1)}
        for p in db.get_products() if p.get("active")
    ])
```

The importer finds it automatically. Add a bearer token if you would rather it were not
public — the import dialog has a field for it.
