# Lunara Manager — CLAUDE.md

Working notes for whoever (human or Claude) picks this project up next. See `PLAN.md` for the full spec — this file tracks what's actually been built, decisions made along the way, and what's next.

## Stack

- React 19 + Vite + TypeScript + Tailwind CSS v4 (via `@tailwindcss/vite`, no separate config file needed)
- Dexie.js (IndexedDB) — local source of truth, schema in `src/db/db.ts`
- `vite-plugin-pwa` with the **injectManifest** strategy (not generateSW) — a custom service worker (`src/sw.ts`) is required because Android share-target needs a `fetch` handler that intercepts a POST and stores the shared file, which the generated-SW strategy can't express
- `dexie-react-hooks` for live queries (`useLiveQuery`) in components
- `@supabase/supabase-js` — sync backend, code-split out of the main bundle (see Phase 7 below), only loaded when Sync is tapped
- Deploy target: Vercel free tier, config in `vercel.json`

## Data model

Implemented exactly as specified in `PLAN.md` §3, in `src/types/index.ts` and `src/db/db.ts`. One deviation:

**`deleted` and `available` are NOT Dexie/IndexedDB indexes**, even though they're boolean fields on the records. IndexedDB key paths cannot be booleans (valid key types are number, string, Date, ArrayBuffer, and Array) — attempting to index a boolean throws at write time. These fields are filtered in memory instead (`.filter(p => !p.deleted)`), which is fine at this app's scale (hundreds, not millions, of rows).

**Products/Orders/Replies also carry `trashed_at: string | null`** (added post-launch — see "Trash / soft-delete" below). Settings does not have it; it's a singleton config row, not something you delete.

Dexie schema v2 (v1 → v2 just adds the `trashed_at` index):
```
products: 'id, name, updated_at, trashed_at'
orders:   'id, status, updated_at, phone, customer_name, trashed_at'
settings: 'id'
replies:  'id, category, updated_at, trashed_at'
syncMeta: 'id'
```

## Sync strategy

Manual push → pull → last-write-wins merge on `updated_at`, keyed by `id`. Photos sync separately to Supabase Storage. See `PLAN.md` §4.6 and the Phase 7 entry below for the original implementation, and "Wiped-device recovery" below for a significant post-launch revision to how pull works.

## Decisions made

- **Seed data races**: `seedIfEmpty()` (`src/db/seed.ts`) does its empty-check *and* its writes inside one `db.transaction('rw', ...)`. Without this, React StrictMode's intentional double-invocation of mount effects called `seedIfEmpty()` twice; both calls read "count === 0" before either had written, and the app ended up with 6 products / 4 orders / 8 replies instead of 3/2/4. IndexedDB serializes overlapping readwrite transactions on the same object stores (even across browser tabs), so re-checking counts *inside* the transaction is what actually closes the race — a plain in-memory guard would only fix the same-tab case.

- **Fuzzy name search**: `lib/fuzzySearch.ts` is a hand-rolled subsequence matcher (query chars must appear in target in order, not necessarily contiguous) with score bonuses for prefix/substring/consecutive-run matches, rather than pulling in Fuse.js or similar — product names are short strings, and this stayed fast (82ms filter) at 250+ products in testing.
- **PWA icons**: generated programmatically with .NET `System.Drawing` (Windows-only, one-time) rather than adding an image-generation dependency — see `public/icons/`. If they ever need to be regenerated on a non-Windows machine, redraw by hand or with any image tool; nothing in the build depends on how they were made.
- **Bangla font support**: no web font is bundled. `src/index.css` sets a system font stack (`Noto Sans Bengali, Nirmala UI, ...`) that relies on fonts already present on Android (Noto Sans Bengali) and Windows (Nirmala UI), keeping the app fully offline-capable with no font download.
- **pHash implementation**: hand-rolled in `src/lib/image.ts` (32×32 grayscale → 2D DCT via separable 1D DCT-II → top-left 8×8 low-frequency block → threshold at median → 64-bit hash → hex). No image-hashing library used, per the "no ML, no server" constraint and to keep the dependency count down. `hammingDistance()` compares two hex hashes via BigInt XOR + popcount.
- **Image compression**: also hand-rolled (`compressImage` in `src/lib/image.ts`) using `createImageBitmap` + `<canvas>.toBlob(..., 'image/webp', quality)` — no `browser-image-compression` or similar dependency.
- **Share-target flow**: the manifest declares `share_target` (POST, multipart/form-data, file field `photo`) pointing at `/share-target`. Since there's no backend, `src/sw.ts` intercepts that POST in the `fetch` event, stashes the file in a Cache API entry (`lunara-share-target` cache, key `/shared-photo`), and 303-redirects to `/?shared=1`. The app reads and clears that cache entry via `src/lib/shareTarget.ts#consumeSharedPhoto()`. Wiring the `?shared=1` detection + search trigger into the UI is Phase 3 work.
- **Routing**: no router library — the 5 tabs are plain React state (`src/types/nav.ts` + `App.tsx`), matching a single-screen PWA that doesn't need deep-linkable routes (share-target is handled via the SW + query param above, not a route).

## Build history

**Phase 1 (Skeleton & data layer) — complete and verified.**

Built:
- Vite + React + TS + Tailwind scaffold, cleaned of template boilerplate
- PWA manifest + icons + custom injectManifest service worker (includes the share-target handler ahead of Phase 3 needing it)
- Full Dexie schema for all 5 tables
- Seed data: 3 products (procedurally drawn placeholder photos, run through the real compression/pHash pipeline so Phase 3 has real hashes to test against), 2 orders, 4 replies (with Bangla text), 1 settings row, 1 syncMeta row
- App shell: header (title + sync-status button, inert until Phase 7) + 5-tab bottom nav + one placeholder page per tab, each reading live from Dexie to prove the data layer end-to-end

Verified with a scripted Playwright pass against `vite build` + `vite preview` (not `vite dev` — the dev server doesn't precache real assets, so offline needs the production SW) at a 390px mobile viewport: seed counts correct (3/2/4/1/1, confirming the race fix above holds), all 5 tabs render, Bangla replies render correctly, and a full page reload with the network disabled (`context.setOffline(true)`) still renders the app shell and product data from cache + IndexedDB.

**Phase 2 (Products) — complete and verified.**

Built:
- `ProductCard` (grid tile: thumbnail, large price overlay with gradient scrim for legibility over any photo, availability badge)
- `ProductForm` (add/edit modal): name, sell price, cost, weight, colors (`TagInput` chips), available toggle, notes, price code (auto-generated via `lib/pricing.ts#generatePriceCode`, regenerate button, manually editable), photos
- `PhotoInput`: file-picker button and a paste target (click-to-focus, then Ctrl+V) — both paths run through the same `fileToPhoto()` pipeline (parallel `compressImage` at 800px/0.8 and 150px/0.7, plus `computePHash`) before being added to the form's photo list
- `ProductDetail` modal: scroll-snap photo carousel with dot indicators (works as a touch swipe on mobile, no library), all fields, Edit and two-step Delete (soft delete)
- `ProductsPage`: search box wired to `lib/fuzzySearch.ts` (custom subsequence matcher — see Decisions), responsive grid (2 cols mobile → up to 4 on desktop)
- `lib/pricing.ts`: extracted `generatePriceCode()` out of `seed.ts` so the form and seed share one implementation

Verified with Playwright against `vite dev` at 390px: grid renders with correct prices/badges; fuzzy search narrows correctly ("earbud" → only "Wireless Earbuds Pro"); edit form pre-fills every field including existing photo; add flow through a real file upload (`icon-512.png`) produced a valid webp (3.6KB) + thumb (1.3KB) + 16-hex-char pHash, and the product persisted to Dexie; a synthetic perf run bulk-inserted 250 dummy products directly into IndexedDB (bypassing the compression pipeline, since this is a grid-rendering perf test, not another compression test) and the grid still rendered all 253 cards in ~1.45s with an 82ms search-filter latency and zero console errors.

**Phase 3 (Photo search) — complete and verified.**

Built:
- `PhotoSearchOverlay` (`src/features/products/PhotoSearchOverlay.tsx`): full-screen result view. Hashes the query image via `computePHash`, ranks all non-deleted products that have ≥1 photo by their *best* photo's similarity (`similarityFromHamming(hammingDistance(...))`), shows top 30. Tapping a result opens the same `ProductDetail`/`ProductForm` used in Products (self-contained, no dependency on which tab is active).
- Three entry points, all converging on `App.tsx`'s `searchImage` state:
  1. **Ctrl+V anywhere**: a `window`-level `paste` listener in `App.tsx`. Checks `e.defaultPrevented` first so it backs off when the per-product `PhotoInput` (Phase 2) already claimed the paste — only genuinely-global pastes open search.
  2. **Upload button**: new photo-search icon button in `Header.tsx` (hidden file input, same as before).
  3. **Android share-target**: `App.tsx` checks `?shared=1` on mount, calls `consumeSharedPhoto()` (built in Phase 1), strips the query param via `history.replaceState`.

Verified with Playwright:
- A realistic mild transform (resize to 480px + JPEG re-encode, no cropping) on each of the 3 seed products correctly self-matched at 97–100% with a wide margin (next-best 69–75%) — confirms the hash algorithm discriminates well under real screenshot-like conditions.
- A deliberately aggressive stress transform (crop to 70% center + resize + PNG re-encode) still returned the correct product as the #1 result via both the simulated-paste path and the upload path (`ClipboardEvent`/`DataTransfer` construction in-page, since headless Chromium has no OS clipboard) — though at only 59%, tied with one other product. That's a synthetic-placeholder artifact (all 3 seed photos are flat-color-background + centered-circle + text, so they're unusually similar to each other under heavy cropping); real product photos have far more texture and should discriminate better than this worst-case test.
- The share-target path was verified end-to-end for real: an in-page `<form method=POST enctype=multipart/form-data action=/share-target>` with a `DataTransfer`-assigned file, actually submitted (real navigation, not `fetch()`, since `fetch` would just follow the redirect internally rather than exercise the SW-intercepted navigation the way a real Android share does) — confirmed the SW intercepted it, cached the file, redirected to `/?shared=1`, and the app auto-opened the overlay with the correct top match (100%).
- Zero console errors across all of the above.

**Phase 4 (Calculator & price codes) — complete and verified.**

Built `CalculatorPage` (`src/features/calculator/CalculatorPage.tsx`):
- Settings (RMB rate, shipping ৳/kg) editable inline, saved to `db.settings` on a 400ms debounce per keystroke (verified: change persists across a full page reload).
- Forward calc: `cost_bdt = cost_rmb × rate`, `shipping = (weight_g/1000) × shipping_rate_per_kg`, `total_cost = cost_bdt + shipping`, `suggested_price = profitMode==='percent' ? total_cost×(1+value/100) : total_cost+value`.
- **Unified forward/reverse in one field** rather than a mode switch: the Sell price input is pre-filled with the suggested price and stays in sync with it until the user types their own value, at which point it's treated as an override and profit/% are computed against *that* number instead — with the suggested price shown alongside and a "Use suggested price" link to drop the override. This satisfies both "shows suggested sell price" and "type any sell price → shows profit" from one control instead of two.
- Price code via the shared `lib/pricing.ts#generatePriceCode()`, copy button (Clipboard API, "Copied" feedback).
- "Save as product" renders the same `ProductForm` from Phase 2 with `prefill={cost_rmb, weight_g, sell_price}`.

Verified by hand-computed example (rate 16.5, shipping 900/kg, cost 50 RMB, weight 500g): total cost ৳1275.00 exact; forward suggestion at 30% profit → ৳382.50 profit (30.0%) exact; typing sell price 2000 directly → ৳725.00 profit (56.9%) exact; price code and clipboard content both `2507262000` (25 Jul 2026 + ৳2000); Save-as-product correctly pre-filled name-empty form with sell 2000/cost 50/weight 500.

**Phase 5 (Orders) — complete and verified.**

Built:
- `src/data/bdLocations.json`: 8 divisions, 64 districts, 494 upazilas (English + Bangla names), sourced from the public `nuhil/bangladesh-geocode` dataset and trimmed to `{id, name, bn_name}` (districts/upazilas also keep their `division_id`/`district_id` parent reference).
- `lib/bdPhone.ts#extractPhone()`: regex-scans for digit runs (tolerating spaces/dashes), accepts `+880`/`880`/`0` prefix + operator digit 3-9 + 8 more digits, normalizes to local `01XXXXXXXXX`.
- `lib/bdAddress.ts#containsKnownLocation()`: checks a text segment against the flattened, longest-name-first location list (English case-insensitive, Bangla exact).
- `lib/orderParser.ts#parseOrderMessage()`: multi-line paste (name/phone/address each on their own line — the common Messenger pattern) picks one line per field directly. Single-line paste falls back to splitting on commas/semicolons, but — importantly — once a part matching a known location is found, every part *from that point to the end* is joined back into the address, rather than stopping at the first fragment; a naive "just take the matching part" approach would turn `"Sumon Mia, 017…, Boalkhali, Chattogram"` into address `"Boalkhali"`, silently dropping `", Chattogram"`. Whatever isn't confidently identified is left blank — nothing is invented, matching the "editable form, nothing saved without confirmation" requirement.
- `OrderPasteBox` → `OrderForm` (add/edit, with `ProductPicker` fuzzy multi-select and a live products-total suggestion for the price field) → `OrderDetail` (status pipeline: 4 tap-buttons for the forward pipeline + a separate Returned button; tapping any sets `status` and stamps `status_dates[status]` to now; each stamped date has an editable `<input type=date>`; Steadfast tracking ID field + Track button linking to `https://steadfast.com.bd/t/{id}`).
- `OrdersPage`: status + date-range filters, newest-first list. Detail is looked up live from the `useLiveQuery` result by id (not held as a static snapshot) so status/date edits made inside `OrderDetail` re-render immediately without closing the modal.

Verified with Playwright against 5 differently-formatted realistic messages: a labeled multi-line message, an unlabeled multi-line message with a `+880 dash-formatted` phone, a single-line comma-separated message, a message with a Bangla name and bare `880` country code, and a deliberately messy free-text blob. 4/5 extracted every field correctly; the messy blob correctly extracted phone and a reasonable address but not the name (embedded mid-sentence, past what a line/segment heuristic can reasonably find) — an accepted graceful degradation since the confirmation form is always editable. Also verified: tapping a status button stamps the real current timestamp into `status_dates` and persists it; the tracking link builds the exact expected URL; status and date-range filters correctly narrow the list (including a "no orders match" empty state).

- **BD locations dataset gap**: the source dataset is division/district/**upazila** (rural sub-district) level — it does not include Dhaka/Chattogram metropolitan **thana** subdivisions like Dhanmondi or Gulshan. Addresses naming only a metro thana (no district/division alongside) won't be recognized by `containsKnownLocation`. Not fixed — no equally-authoritative free thana-level dataset was found; the editable confirmation form covers the gap.

**Phase 6 (Replies & Dashboard) — complete and verified.**

Built:
- `ReplyForm` (add/edit), `ReplyRow` (tap-anywhere-on-the-row copies via Clipboard API with an inline "Copied" flash; small edit/delete icon buttons in the corner use `stopPropagation` so they don't also trigger a copy), `RepliesPage` groups replies by `category` (alphabetical sections).
- `DashboardPage`: counts-by-status tiles; orders today/this month (`lib/time.ts#isSameDay/isSameMonth`, new helpers this phase); revenue this month = `Σ total_price` over this-month orders excluding `returned`; est. profit = revenue − `Σ` per-order product cost, where each linked product's cost is recomputed live as `cost_rmb × current rate + (weight_g/1000) × current shipping rate` (the same formula as the Calculator) — products that no longer exist (deleted) are silently skipped rather than erroring, matching "total cost of linked products **where available**"; stuck-orders list = orders in `china`/`shipped_bd`/`steadfast` (not `delivered`/`returned` — those are end states, not "stuck") whose *current* status hasn't changed in over 7 days (measured from `status_dates[status]`, falling back to `created_at` if that status was somehow never stamped).

Verified with Playwright: reply copy-to-clipboard matched the exact Bangla source text; add flow persisted (4→5 replies); grouped-by-category rendering confirmed visually. Dashboard math hand-checked against the two seed orders: revenue ৳1600 (950+650), profit **−৳230** (cost ৳1830 > revenue, correctly shown in red) — both exact. Stuck-orders list correctly showed "Nothing stuck" initially, then correctly surfaced an order after backdating its `status_dates.china` to 10 days ago directly in IndexedDB.

**Phase 7 (Sync) — complete and verified live against a real Supabase project.**

Built:
- `supabase/migrations/0001_init.sql`: `products`/`orders`/`settings`/`replies` tables mirroring the Dexie schema (same `id/created_at/updated_at/deleted` shape), RLS enabled with a single "any authenticated user" policy per table (matches the plan's "simple shared login, two trusted users" model — no per-row ownership), plus a private `product-photos` Storage bucket with matching authenticated-only policies. `sync_meta` is intentionally NOT in this migration — it's local-only, never synced (see Phase 1 data model note).
- `lib/sync.ts#runSync()`: push-then-pull, last-write-wins on `updated_at`.
- **Photos sync separately from rows**: `products.photos` in Postgres holds only `{id, phash, webp_path, thumb_path}` — the actual WebP bytes live in the `product-photos` bucket at `{productId}/{photoId}.webp` (+ `_thumb.webp`). Push uploads any photo belonging to a pushed product (upsert, so re-uploading an unchanged photo is harmless); pull downloads blobs for any product it's about to apply, reconstructing the local `Photo` shape.
- Shared login: `SyncAuthModal` (email + password → `supabase.auth.signInWithPassword`), shown on-demand when Sync is tapped without an active session.
- **Code-split**: `@supabase/supabase-js` is never statically imported from `App.tsx` — `lib/supabase.ts` and `lib/sync.ts` are only loaded via dynamic `import()` inside the sync click-handler. `lib/supabaseConfig.ts` holds just the cheap `isSupabaseConfigured` env-var check so the header/UI can react to configuration state without pulling in the client library. This took the library (204KB / 52KB gzip) out of the initial bundle entirely for the common case where sync is never touched — matches "sync backend touched only on manual sync."

**Sync watermark bug, found and fixed during live two-device testing** (`supabase/migrations/0002_server_timestamp.sql`): the first cut of `runSync()` tracked "what have I already pulled" using the same `updated_at` field used for last-write-wins conflict resolution, and advanced the local watermark to `nowIso()` after every sync. That's broken: `updated_at` is a client-set *edit* timestamp, independent per device, while the watermark needs to represent "what the server has already shown me." Concretely — Device A syncs (its watermark becomes local-A's "now"); Device B then edits a record at a timestamp that's chronologically *before* A's just-set watermark (B just hadn't pushed yet); once B does push, `remote.updated_at > A's_watermark` is false forever, and A permanently stops seeing that change on future pulls, even though it was never applied. Live-tested and reproduced exactly this way. Fix: added a trigger-assigned `server_updated_at timestamptz` column (the client cannot set it — `BEFORE INSERT OR UPDATE` trigger forces it to `now()` on write) used *only* for the pull watermark; `updated_at` remains the field compared for last-write-wins. The local watermark now advances to the max `server_updated_at` actually observed in a sync round (from both the push response and any pulled rows) — never to local wall-clock time — so it can't race ahead of a not-yet-pushed remote edit.

Verified live against the user's real Supabase project (`effvtiufxynirkeojzdr`), via Playwright driving two separate browser contexts (two isolated IndexedDBs = two "devices") signed into the same shared Auth account:
- Simple one-way propagation: edit on device A, both sync → device B receives the new value.
- **The plan's specific conflict test**: edited the *same* product record (verified identical `id` on both devices, not just matching name) concurrently on both devices before either re-synced, with device B's edit strictly later in wall-clock time. After A pushes, then B pushes, then A syncs once more: both devices converge to B's value (555) — confirmed correct last-write-wins with the `server_updated_at` fix. (Before the fix, this exact test failed: A stuck on its own 999, B on 555 — permanently diverged. That's what led to the fix above.)
- Stability: one extra sync round on the already-converged device left the value unchanged (no oscillation).
- Photo round-trip: the synced product's photo was confirmed present with correct byte size on the receiving device, i.e. actually downloaded from Storage, not just metadata.
- Zero console errors on either simulated device throughout.
- Cleaned up all test-run data from the live project afterward (`delete` on all 4 tables + removed all Storage objects) — confirmed empty before handing back, so the user's first real sync starts from a clean slate instead of picking up a dozen duplicate test products.

**Phase 8 (Polish & ship) — complete for everything not blocked on live Supabase credentials.**

Built:
- `lib/toast.ts` + `components/ToastHost.tsx`: a minimal global toast system (module-level subscribe/publish, no context provider needed) mounted once in `App.tsx`. Wired into every previously-bare `db.*` write and clipboard call across Products/Orders/Replies/Calculator (forms, detail-view status/date/tracking edits, deletes, copy-to-clipboard) so failures surface to the user instead of silently rejecting. `PhotoInput` specifically switched from `Promise.all` to `Promise.allSettled` for multi-file adds — one corrupt/undecodable file no longer silently drops the *other* successfully-processed photos in the same batch; it now reports "Couldn't process N photo(s)" and still keeps the good ones.
- Loading/empty states were already in place per-phase (each page's `useLiveQuery === undefined` → "Loading…", `.length === 0` → a specific empty message) — reviewed this phase, no gaps found.
- `README.md` rewritten: run locally, Supabase setup steps (project → run migration → add one shared Auth user → copy URL/anon key → `.env`), Vercel deploy, PWA install (Android + Windows), and how the Samsung share-to-app flow works end to end.
- `vercel.json`: pins the Vite framework preset + build/output settings and adds the SPA rewrite (`/(.*) → /index.html`) so deep links and reloads on non-root paths resolve — static assets (`/assets/*`, `/icons/*`, `/sw.js`, `/manifest.webmanifest`) are still served directly since Vercel's rewrite only applies when no static file matches.

Verified: production build clean; a full smoke pass against `vite preview` (not dev) across all 5 tabs at both the default mobile viewport and specifically 380px width found zero console errors and zero horizontal scroll (the plan's explicit "test at 380px width" requirement); the corrupt-file toast path was verified live (uploaded a non-image file through the Add Product photo picker, confirmed the red toast appears with the exact expected copy and auto-dismisses after ~4s, and that no bad photo was added to the form).

## Post-launch: wiped-device recovery + Trash

Requested after initial ship, in response to two concrete risks: (1) what happens if a device's local storage is wiped or a fresh device joins — could it push empty/fake state and destroy the other device's real data? and (2) deletions had no undo. Both required rethinking part of the sync design, not just adding a feature on top.

### Wiped-device recovery guarantee

**The risk was never really "empty push deletes things"** — push has never had a delete-by-absence code path; it only ever upserts rows it actually has, so a genuinely empty local device already pushes nothing, safely. The real risks were subtler:

1. **Auto-seeded demo data would get pushed as pollution.** `seedIfEmpty()` used to run unconditionally on every app mount. After a wipe, it would recreate 3 sample products with fresh random UUIDs and a fresh `updated_at`. On the next sync, that fabricated data would get pushed as if it were real.
2. **A fabricated default Settings row could actively overwrite real data.** Settings is a *singleton* (`id: 'default'`). A freshly-recreated default settings row has `updated_at = now()` — newer than genuinely-old real settings on the server. Since **push always blindly upserts** (there's no "only if mine is actually newer" check on the way out — last-write-wins is only evaluated during pull), a wiped device could push fabricated defaults that look newer and clobber the real settings, which every other device would then also adopt on their next pull. This is the sharpest version of "must never push empty state that overwrites other devices' data," and it's fixed at the seeding layer, not the sync layer.
3. **Incremental pull is inherently fragile for "always fully recover."** This is the same class of bug as the earlier sync watermark issue (see below) — any pull that filters by "what's changed since X" is one edge case away from missing something.

**Where the fix lives** — three places, all working together:

- `src/db/seed.ts#seedIfEmpty()`: now gated with `if (isSupabaseConfigured) return` before any sample data is created (it still always ensures the local-only `syncMeta` row exists, which is harmless — that table never syncs). When Supabase is configured, a wiped or brand-new device is left genuinely empty until the user presses Sync or types something themselves. No demo data, ever, once sync is in play.
- `src/features/calculator/CalculatorPage.tsx`: previously auto-created a default Settings row from `useEffect` the moment the tab was opened — a *second*, independent path to the exact same "fabricated row with a fresh timestamp" problem, undiscovered until specifically checked for while fixing #1. Now it does a one-time direct `db.settings.get()` (not `useLiveQuery`, which can't distinguish "still loading" from "confirmed no row" on its first render) to pre-fill the inputs with sensible display defaults, but a `userEdited` flag — set only by the input `onChange` handlers, never by the initial pre-fill — gates whether anything is actually written to Dexie. Verified live: opening the tab and waiting past the debounce window creates zero rows; typing an actual value creates exactly one.
- `src/lib/sync.ts`: **pull no longer filters by any watermark at all** — it always fetches the complete current row set for products/orders/settings/replies from Supabase, every sync. This is the one place a straightforward "just make it always-correct" beats "make it correct under all timing conditions": at this app's scale (a small business's catalog), full metadata pulls are trivially cheap, and it makes recovery correct *by construction* rather than by careful reasoning about clocks. Photo *blobs* are the one thing still handled incrementally — `pullProducts()` builds a local id→blob index up front and only downloads a photo it doesn't already have cached, so recovery doesn't mean re-downloading every image every time. Push stays incremental (`updated_at > since`) — safe, because it only ever competes against this same device's own timeline, not another device's clock.

**Verified live** against the real Supabase project: pushed a product (with photo) + a reply from a signed-in session, wiped that browser context's IndexedDB (`indexedDB.deleteDatabase` on every database) while leaving `localStorage` untouched — confirming the Supabase auth session survives an IndexedDB wipe, since `supabase-js` persists it separately — reloaded (confirmed zero rows locally, no demo data), pressed Sync, and confirmed the product (with its photo byte-for-byte), the reply, and settings all came back correctly. Zero console errors.

*Scope note*: this guarantees full recovery from "local storage empty/wiped," which is what a real "clear site data" or corrupted-profile event actually looks like (IndexedDB is cleared as a whole database, not selectively). It does not implement a full reconciliation protocol for a hypothetical *partial* record loss with `syncMeta` intact — that would need a much more expensive protocol and isn't a realistic browser failure mode.

### Trash / soft-delete with restore

Tapping Delete on a product, order, or reply no longer hard-deletes. Three states now exist per record, in order:

1. **Active** — `trashed_at: null`. Normal.
2. **Trashed** — `trashed_at` set to when it was trashed. Hidden from every normal view (every list/filter query across Products/Orders/Replies/Dashboard/ProductPicker/PhotoSearchOverlay was updated to `!x.deleted && !x.trashed_at`), but fully recoverable, and listed in the new Trash view.
3. **Permanently deleted** — the pre-existing `deleted: true` tombstone flag. The *only* way here is Empty Trash or the 7-day auto-purge.

**Why `deleted: true` was reused for permanent deletion instead of inventing something new**: propagating an actual deletion through an upsert-only sync system needs a tombstone (you can't sync "this row is gone" as a delta without leaving *something* behind for other devices to eventually pull and act on). `deleted` already *was* exactly that tombstone — it was already syncing correctly, already filtered out of every view, already proven live during the two-device conflict test in Phase 7. Empty Trash and the auto-purge just set it on demand instead of it being the only delete path; no sync-side changes were needed for permanent deletion to propagate.

Built:
- `lib/trash.ts`: `trashItem`/`restoreItem` (set/clear `trashed_at` + bump `updated_at`), `emptyTrash`/`purgeExpiredTrash` (tombstone everything trashed / everything trashed past `TRASH_RETENTION_DAYS = 7`), `listTrashed` (unified, newest-first list across all three tables for the UI).
- `supabase/migrations/0003_trash.sql`: adds `trashed_at timestamptz` to products/orders/replies (Settings excluded — singleton config, not a deletable item).
- `ProductDetail`/`OrderDetail`/`ReplyRow`'s existing Delete buttons now call `trashItem` instead of setting `deleted` directly — same two-step confirm UI as before, different underlying action.
- `features/trash/TrashPage.tsx`: lists everything trashed (type badge, label, "Trashed N days ago", Restore button), plus an Empty Trash button (same two-step confirm pattern used elsewhere in the app). Opened via a new Trash icon in the Header — there's no dedicated Settings tab in this app, so the header is the closest thing to a persistent "menu."
- `purgeExpiredTrash()` runs on every app mount and after every successful sync (`App.tsx`), matching "checked on app open and after sync." A purge that runs on Device A pushes on Device A's *next* sync (not synchronously within the same click) — acceptable, since the requirement was that it eventually syncs, not that it does so within one button press.

**Edit-vs-delete conflict resolution**: trashing a record is modeled as nothing more than a timestamped field change (`trashed_at` + `updated_at`, just like editing any other field) — so the exact same whole-row last-write-wins mechanism already proven in Phase 7 resolves this automatically, with no new merge logic:
- Device A edits a product's price at T1. Device B trashes the *same* product at T2 > T1. After both sync, whichever device is later reflects T2's full row state — the product ends up **trashed**, and A's price edit is superseded (it's still "last write wins" over the whole record, not a field-level merge).
- If instead B had trashed it *before* A's edit (T2 < T1), A's later edit wins — the product ends up **active** again with A's new price. A fresh edit after a delete effectively un-deletes it.

This is a deliberate consequence of whole-row LWW rather than field-level merging, and it was already the app's conflict model before Trash existed — trashing didn't need to introduce anything new, it just needed to *be* a normal timestamped edit rather than a special out-of-band operation.

**Status**: complete and verified live, both locally and against the real Supabase project.

While first testing this against the live project (before asking the user to run the migration), every push started failing with `PGRST204: Could not find the 'trashed_at' column of 'products'` — every push now includes that field on every table, so *nothing* could sync at all, not just trash-specific actions, until `0003_trash.sql` was run. That migration is now applied.

With it applied, the live two-device test (two separate Playwright browser contexts, same shared Auth account, against project `effvtiufxynirkeojzdr`) confirmed all of the following, each with zero console errors:
- Device A adds a product and syncs; Device B signs in and syncs, receives it.
- Device A trashes it; both sync; it disappears from Device B's normal Products view *and* correctly appears in Device B's Trash view, labeled "Trashed today."
- Device B restores it; both sync; it's active again on Device A.
- Device A trashes it again; both sync; Device B presses Empty Trash; both sync again; it's gone from *both* devices' Trash views — the permanent deletion propagated correctly.
- Separately (single device, no network involved): a product manually backdated to `trashed_at` 10 days ago was correctly tombstoned (`deleted: true`) the next time the app was opened, confirming the 7-day auto-purge.

All test data was cleaned up from the live project afterward (same as after the Phase 7 sync test) — tables and Storage confirmed empty.

## Status

Every phase in `PLAN.md` is built and verified, including live two-device tests against the user's real Supabase project for both the original sync conflict scenario (Phase 7) and the wiped-device recovery + Trash sync scenarios above. The `.env` in this working copy has real credentials for project `effvtiufxynirkeojzdr` — before deploying, add the same `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` as environment variables in the Vercel project settings (`.env` itself is gitignored and won't ship with a deploy). All three migrations (`0001_init.sql`, `0002_server_timestamp.sql`, `0003_trash.sql`) have been run against that project, in order.

Nothing outstanding. If picking this project back up, next steps would be user-driven, not spec-driven — real product photos, real customer traffic, and the Phase 2 roadmap items explicitly deferred in `PLAN.md` §7 (Steadfast API, Meta APIs, etc.) — build those only when actually asked for.
