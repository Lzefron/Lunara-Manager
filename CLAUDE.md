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

Dexie schema v1:
```
products: 'id, name, updated_at'
orders:   'id, status, updated_at, phone, customer_name'
settings: 'id'
replies:  'id, category, updated_at'
syncMeta: 'id'
```

## Sync strategy

Manual push → pull → last-write-wins merge on `updated_at`, keyed by `id`. Soft deletes via `deleted` flag propagate like any other field update. Photos sync separately to Supabase Storage. See `PLAN.md` §4.6 and the Phase 7 entry below for the actual implementation (`lib/sync.ts`); live end-to-end verification is still pending real Supabase credentials.

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

**Phase 7 (Sync) — code complete; live end-to-end verification pending real Supabase credentials (user is providing them).**

Built:
- `supabase/migrations/0001_init.sql`: `products`/`orders`/`settings`/`replies` tables mirroring the Dexie schema (same `id/created_at/updated_at/deleted` shape), RLS enabled with a single "any authenticated user" policy per table (matches the plan's "simple shared login, two trusted users" model — no per-row ownership), plus a private `product-photos` Storage bucket with matching authenticated-only policies. `sync_meta` is intentionally NOT in this migration — it's local-only, never synced (see Phase 1 data model note).
- `lib/sync.ts#runSync()`: push-then-pull, last-write-wins on `updated_at`. Push sends only rows with `updated_at > last_synced_at`; pull fetches remote rows `updated_at > last_synced_at` and applies each only if `remote.updated_at > local.updated_at` (or local is missing) — so a pulled echo of what we just pushed is a safe no-op, and three-way (or more) device sync just falls out of pairwise LWW with no special-casing. The `last_synced_at` watermark only advances after every push+pull step succeeds, so a failure partway through leaves the next attempt to safely redo the same idempotent (upsert-by-id) work rather than risk corrupting or losing local data.
- **Photos sync separately from rows**: `products.photos` in Postgres holds only `{id, phash, webp_path, thumb_path}` — the actual WebP bytes live in the `product-photos` bucket at `{productId}/{photoId}.webp` (+ `_thumb.webp`). Push uploads any photo belonging to a pushed product (upsert, so re-uploading an unchanged photo is harmless); pull downloads blobs for any product it's about to apply, reconstructing the local `Photo` shape.
- Shared login: `SyncAuthModal` (email + password → `supabase.auth.signInWithPassword`), shown on-demand when Sync is tapped without an active session.
- **Code-split**: `@supabase/supabase-js` is never statically imported from `App.tsx` — `lib/supabase.ts` and `lib/sync.ts` are only loaded via dynamic `import()` inside the sync click-handler. `lib/supabaseConfig.ts` holds just the cheap `isSupabaseConfigured` env-var check so the header/UI can react to configuration state without pulling in the client library. This took the library (204KB / 52KB gzip) out of the initial bundle entirely for the common case where sync is never touched — matches "sync backend touched only on manual sync."

Verified without a live backend: type-checks clean; production build succeeds with `supabase` and `sync` as separate chunks (confirming the code-split actually works, not just compiles); tapping Sync with an empty `.env` shows the friendly "Supabase is not configured" message with no crash, no auth modal, and — critically — local product/order counts unchanged in IndexedDB afterward (zero risk of the unconfigured path touching local data).

**Not yet verified (needs real credentials):** actual push/pull against a live Supabase project; the plan's specific two-browser-profile edit/sync/sync/confirm-last-write-wins test; photo upload/download round-trip through real Storage; RLS policies actually behaving as written. Once the user supplies `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` and runs the migration, this needs a real test pass before Phase 7 can be marked fully done.

**Phase 8 (Polish & ship) — complete for everything not blocked on live Supabase credentials.**

Built:
- `lib/toast.ts` + `components/ToastHost.tsx`: a minimal global toast system (module-level subscribe/publish, no context provider needed) mounted once in `App.tsx`. Wired into every previously-bare `db.*` write and clipboard call across Products/Orders/Replies/Calculator (forms, detail-view status/date/tracking edits, deletes, copy-to-clipboard) so failures surface to the user instead of silently rejecting. `PhotoInput` specifically switched from `Promise.all` to `Promise.allSettled` for multi-file adds — one corrupt/undecodable file no longer silently drops the *other* successfully-processed photos in the same batch; it now reports "Couldn't process N photo(s)" and still keeps the good ones.
- Loading/empty states were already in place per-phase (each page's `useLiveQuery === undefined` → "Loading…", `.length === 0` → a specific empty message) — reviewed this phase, no gaps found.
- `README.md` rewritten: run locally, Supabase setup steps (project → run migration → add one shared Auth user → copy URL/anon key → `.env`), Vercel deploy, PWA install (Android + Windows), and how the Samsung share-to-app flow works end to end.
- `vercel.json`: pins the Vite framework preset + build/output settings and adds the SPA rewrite (`/(.*) → /index.html`) so deep links and reloads on non-root paths resolve — static assets (`/assets/*`, `/icons/*`, `/sw.js`, `/manifest.webmanifest`) are still served directly since Vercel's rewrite only applies when no static file matches.

Verified: production build clean; a full smoke pass against `vite preview` (not dev) across all 5 tabs at both the default mobile viewport and specifically 380px width found zero console errors and zero horizontal scroll (the plan's explicit "test at 380px width" requirement); the corrupt-file toast path was verified live (uploaded a non-image file through the Add Product photo picker, confirmed the red toast appears with the exact expected copy and auto-dismisses after ~4s, and that no bad photo was added to the form).

## Remaining before this project is fully "shipped"

1. **Live Supabase test** (blocked on user-provided credentials — see Phase 7 above): run the migration, sign in, two-profile edit/sync/merge test, real photo upload/download round-trip.
2. Everything else in `PLAN.md` is built and verified. Once the Supabase test above passes, the project is complete.
