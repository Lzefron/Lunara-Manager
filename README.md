# Lunara Manager

A local-first product, order, and pricing manager for Lunara — a small reselling business run by two people. Every device keeps the full database offline in IndexedDB; syncing between devices only happens when someone presses the Sync button.

See `PLAN.md` for the full product spec and `CLAUDE.md` for build notes, decisions, and current status.

## Run locally

Requires Node 20+.

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. With no `.env` configured, the app seeds itself with sample products, orders, and replies on first run — no setup required to try it out, and everything works fully offline. Once Supabase sync *is* configured (see below), sample seeding turns itself off — a synced setup should only ever contain your real data, never demo placeholders, so a fresh or recovered device starts empty and waits for a Sync to pull the real thing (see "Trash & data recovery" below).

Other scripts:

```bash
npm run build     # production build to dist/
npm run preview   # serve the production build locally (needed to test PWA/offline behavior — vite dev doesn't precache real assets)
npm run lint       # oxlint
```

## Setting up Supabase (for sync)

Sync is optional — skip this section if you only need one device. To share data between devices:

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run the migrations in `supabase/migrations/` **in order** — `0001_init.sql`, then `0002_server_timestamp.sql`, then `0003_trash.sql`. Each is a separate query; paste and run one at a time. Together they create the `products`/`orders`/`settings`/`replies` tables (row-level security limited to signed-in users), a private `product-photos` Storage bucket, and the columns Trash and sync-recovery rely on.
3. In **Authentication → Users**, add one user (an email + password) — both devices sign in with this same shared account. This is a private two-person tool, so one shared login is intentional (see `PLAN.md` §4.6).
4. In **Project Settings → API**, copy the **Project URL** and **anon public key**.
5. Copy `.env.example` to `.env` and fill in both values:

   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
6. Restart the dev server (or redeploy) so Vite picks up the new env vars.

Tap the sync button (top right) on each device, sign in once with the shared account, and press it again whenever you want to push/pull changes. Sync merges last-write-wins by record — editing the same product on two devices and syncing both just keeps whichever edit happened last.

### Data recovery (wiped or new device)

If a device's app storage gets cleared — or it's a brand-new device joining an already-in-use setup — it starts empty (once sync is configured, it deliberately does *not* fall back to demo sample data; see above). Sign in and press Sync: it rebuilds everything from the server — every product (with photos), order, reply, and your settings — not just whatever's changed recently. Nothing about this can push or overwrite other devices' data: an empty device has nothing to push, and pulling is always a full, safe rebuild.

## Trash

Deleting a product, order, or reply doesn't erase it — it moves to **Trash**, which is fully synced: if your sister deletes something, it shows up trashed on your device too the next time you sync (and vice versa for restoring).

- Open Trash from the trash-can icon in the header.
- Each trashed item shows what it was and how long ago it was trashed, with a **Restore** button to bring it back exactly as it was.
- **Empty Trash** permanently deletes everything currently in the list — this is the only way to truly, irreversibly delete something, and it also syncs to other devices.
- Anything left in Trash for more than **7 days** is deleted automatically — checked whenever the app opens and after every sync.

## Deploying to Vercel

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. In Vercel, "Add New Project" → import the repo. Vercel auto-detects the Vite framework preset (build command `npm run build`, output directory `dist`) — the included `vercel.json` also pins this and adds the SPA rewrite so client-side routes and deep links (share-target, etc.) resolve correctly on refresh.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Environment Variables in the Vercel project settings (same values as your `.env`), if you're using sync.
4. Deploy. Free tier is enough for this app's traffic.

## Installing as a PWA

### Android (Samsung / Chrome)

1. Open the deployed URL in Chrome.
2. Tap the **⋮** menu → **Add to Home screen** (Chrome may also prompt this automatically after a visit or two).
3. Confirm — Lunara now opens full-screen from the home screen, and works offline immediately (the service worker precaches the app on install).

### Windows (Chrome / Edge)

1. Open the deployed URL.
2. Click the install icon in the address bar (or **⋮** → **Install Lunara Manager…**).
3. It opens in its own window from the Start menu / taskbar going forward.

### Sharing a screenshot into the app (Samsung → photo search)

Once installed as a PWA, Lunara registers as a share target for images:

1. Take or find a screenshot of a product (e.g. from a Facebook conversation).
2. Open the Android share sheet on that image (long-press → Share, or the share icon in Gallery).
3. Pick **Lunara** from the list of apps.
4. The app opens directly into photo search with that image already loaded, showing matching products ranked by similarity — no need to manually upload or paste it.

You can also trigger the same photo search by pasting an image with Ctrl+V anywhere in the app on desktop, or via the photo-search button in the header (file picker) on any device.

## Project structure

- `src/db/` — Dexie (IndexedDB) schema and first-run seed data
- `src/lib/` — standalone logic: image compression/pHash, fuzzy search, BD phone/address parsing, pricing, sync, trash
- `src/features/` — one folder per tab (products, orders, calculator, replies, dashboard) plus `trash/` (the Trash view, opened from the header, not a tab)
- `src/data/bdLocations.json` — embedded Bangladesh divisions/districts/upazilas dataset, used by the order paste-parser
- `supabase/migrations/` — SQL schema for the optional sync backend
- `src/sw.ts` — custom service worker (handles offline precaching and the Android share-target POST)
