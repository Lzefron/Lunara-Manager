# Lunara Manager — Project Plan

> **Instructions for Claude Code:** Read this entire file before writing any code. Build the project phase by phase, in order. Complete and verify each phase before starting the next. Ask before making assumptions about business logic. After each phase, update `CLAUDE.md` with what was built and what is next.

---

## 1. Context

Lunara is a small reselling business in Bangladesh run by two people (siblings). Products are sourced from China, sold through Facebook, and delivered by Steadfast courier. The current pain: when a customer asks a price, finding the product and its price is slow.

**Users and devices:**
- Owner: Windows 11 PC (Chrome/Edge) + Samsung Galaxy S20+ (Android)
- Co-owner: Samsung Galaxy S24+ (Android)

**Hard constraints:**
- Free to run. No paid services, no always-on server.
- Local-first: every device keeps the full database locally and works 100% offline.
- Sync happens ONLY when a user presses a Sync button. Nothing polls, nothing runs in the background.
- Fast on mobile. The S24+ is the primary device.

---

## 2. Stack

- **Frontend:** React + Vite + TypeScript, Tailwind CSS
- **Local database:** Dexie.js (IndexedDB) — source of truth on each device
- **PWA:** installable on Android and Windows; offline-capable via service worker; `share_target` in the manifest so Android screenshots can be shared directly into the app
- **Sync backend:** Supabase free tier (Postgres + Storage), touched only on manual sync
- **Image search:** perceptual hashing (pHash) computed in the browser — no ML, no server
- **Deploy:** Vercel free tier
- Provide `.env.example` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

---

## 3. Data Model

Every table has: `id` (uuid), `created_at`, `updated_at`, `deleted` (boolean, soft delete for sync).

### products
| field | type | notes |
|---|---|---|
| name | text | |
| sell_price | number | BDT — shown on the card, outside |
| cost_rmb | number | |
| weight_g | number | |
| colors | string[] | |
| available | boolean | default `true` |
| photos | object[] | `{ id, webp_blob, thumb_blob, phash }` — compressed WebP ~800px + ~150px thumbnail |
| notes | text | |
| price_code | text | generated code, see Calculator |

### orders
| field | type | notes |
|---|---|---|
| customer_name | text | |
| phone | text | |
| address | text | |
| product_ids | string[] | |
| total_price | number | BDT |
| status | enum | `china` \| `shipped_bd` \| `steadfast` \| `delivered` \| `returned` |
| status_dates | object | `{ status: ISO date }` — stamped when status is tapped |
| steadfast_tracking_id | text | optional |
| notes | text | |

### settings (single row)
| field | type | notes |
|---|---|---|
| rmb_to_bdt_rate | number | saved once, editable |
| shipping_rate_per_kg | number | BDT per kg |
| default_profit_mode | enum | `percent` \| `fixed` |
| default_profit_value | number | |

### replies
| field | type | notes |
|---|---|---|
| category | text | e.g. greeting, price, delivery, payment |
| title | text | |
| text | text | copied to clipboard on tap |

### sync_meta (single row)
| field | type |
|---|---|
| last_synced_at | ISO date |

---

## 4. Features

### 4.1 Products tab
- Card grid. Each card: thumbnail, **sell price in large text overlaid on the card**, availability badge. Price must be readable without opening the product.
- Detail view: all photos (swipeable on mobile), every field editable.
- Add/edit: upload or paste photos → compress to WebP (~800px, quality ~0.8) + generate 150px thumbnail → compute pHash per photo (canvas: downscale to 32×32 grayscale → DCT → 64-bit hash).
- **Name search:** fuzzy, instant, as-you-type.
- **Photo search:** three input paths, all leading to the same search:
  1. Ctrl+V paste anywhere in the app (PC)
  2. File upload
  3. Android `share_target` — screenshot shared from Samsung's share sheet opens the app with the image loaded and searches immediately
  - Compute pHash of the incoming image → rank all product photos by Hamming distance → show matches sorted by similarity %, best first. Must work fully offline.

### 4.2 Orders tab
- **Paste-order box:** paste a raw customer message → parse:
  - **Phone:** Bangladesh formats — `+8801XXXXXXXXX`, `8801XXXXXXXXX`, `01XXXXXXXXX`; tolerate spaces/dashes; valid prefixes 013–019.
  - **Address:** match tokens against an embedded JSON dataset of Bangladesh divisions, districts, and thanas/upazilas (include this dataset in the repo). The segment containing a known location is proposed as the address.
  - **Name:** leading remaining text heuristic.
  - Parsed result appears in an **editable form** — nothing is saved without user confirmation. Manual entry must also be possible.
- **Status pipeline:** four large tap-buttons — China → Shipment (BD) → Steadfast → Delivered — plus Returned. Tapping stamps today's date into `status_dates`. Dates editable afterwards.
- `steadfast_tracking_id` field with a button linking to `https://steadfast.com.bd/t/{id}`.
- Order list: filter by status and date range, newest first.

### 4.3 Calculator tab
- Reads settings (RMB rate, shipping per kg); editable inline; persists immediately.
- Inputs: cost in RMB, weight in grams.
- Computes: `cost_bdt = cost_rmb × rate`, `shipping = (weight_g / 1000) × shipping_rate_per_kg`, `total_cost = cost_bdt + shipping`.
- Profit input with a **% / fixed ৳ toggle** → shows suggested sell price.
- **Reverse mode:** type any sell price → shows profit in ৳ and %.
- **Save as product** button → opens Add Product pre-filled with cost, weight, sell price.
- **Price code generator:** `DDMMYY` + price, no separators (e.g. 24 July 2026, ৳1250 → `2407261250`). Copy button.

### 4.4 Replies tab
- CRUD for snippets grouped by category. One tap copies the text to clipboard with a brief "Copied" confirmation.

### 4.5 Dashboard tab
- Counts by order status.
- Orders today / this month.
- Revenue and estimated profit this month (profit = total_price − total cost of linked products where available).
- "Stuck" list: orders sitting in the same status more than 7 days.

### 4.6 Sync
- Header button showing `last_synced_at` ("Synced 2h ago"), spinner while running.
- On press: push local records with `updated_at > last_synced_at` → pull remote records with `updated_at > last_synced_at` → merge **last-write-wins per record** → update `last_synced_at`.
- Soft deletes propagate via the `deleted` flag.
- Photos upload to Supabase Storage (compressed WebP only); other devices download on pull.
- **Three devices** share one dataset; the same merge logic must handle three-way sync.
- Auth: simple shared login (one email/password pair both users know) via Supabase Auth is acceptable — private tool, two trusted users.
- Include the Supabase schema migration SQL in `/supabase/migrations/`.
- Everything except sync must work with zero connectivity. Sync failures must never corrupt local data.

---

## 5. Quality Requirements

- Mobile-first responsive layout; test at 380px width. Desktop gets a wider grid, not a different app.
- Prices displayed with `৳`. Bangla text must render correctly (font stack with Bangla support).
- Seed data: 3 sample products (use placeholder images), 2 sample orders, 4 sample replies.
- No heavy dependencies. Bundle should stay lean; the app must open fast on mobile data.
- `README.md` must cover: run locally; create the free Supabase project and fill `.env`; deploy to Vercel; install the PWA on Android (Chrome → Add to Home Screen) and on Windows; how share-to-app works on Samsung.
- `CLAUDE.md` must document: stack, data model, sync strategy, decisions made, current phase, next steps.

---

## 6. Build Phases — do these in order

### Phase 1 — Skeleton & data layer
Vite + React + TS + Tailwind setup. PWA manifest + service worker. Dexie schema for all tables. Seed data. App shell with 5-tab navigation. Verify: app installs as PWA and opens offline.

### Phase 2 — Products
Card grid with price-on-card. Add/edit with photo compression + pHash generation. Name search. Verify: add a product with 3 photos on mobile viewport; grid stays fast with 200+ seeded dummy products.

### Phase 3 — Photo search
Paste (Ctrl+V), upload, and `share_target` input paths. Hamming-distance ranking UI. Verify: a cropped/resized screenshot of a seeded product photo returns that product as the top match.

### Phase 4 — Calculator & price codes
Settings persistence, forward and reverse calculation, % / fixed toggle, Save-as-product flow, code generator with copy. Verify calculations against hand-computed examples.

### Phase 5 — Orders
Paste-parser (phone regex, BD location dataset, name heuristic) with editable confirmation form. Status pipeline with date stamping. Filters. Tracking link. Verify: paste 5 differently-formatted realistic order messages; parser extracts correctly or degrades gracefully to manual entry.

### Phase 6 — Replies & Dashboard
Snippet CRUD with copy. Dashboard metrics and stuck-orders list.

### Phase 7 — Sync
Supabase migration SQL, auth, push/pull/merge, photo storage sync, conflict handling, last-synced indicator. Verify: edit the same product on two browser profiles, sync both, confirm last-write-wins and no data loss.

### Phase 8 — Polish & ship
Loading states, empty states, error toasts, README, final CLAUDE.md update, Vercel deploy config.

---

## 7. Phase 2 Roadmap (do NOT build now — document in CLAUDE.md only)

- **Steadfast API** (`https://portal.steadfast.com.bd/api/v1`, API key + secret from merchant portal): create consignments from orders, pull delivery status, balance check.
- **Meta APIs** (Messenger/WhatsApp Business): requires business verification + app review. Evaluate later.
- Native Android floating-bubble screenshot capture (overlay permission) if share-sheet flow proves insufficient.
- Multi-tenant version for other businesses.
