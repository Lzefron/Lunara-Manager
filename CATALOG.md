# Customer catalog and sync update

Apply `supabase/migrations/0004_customer_catalog.sql` once after 0001–0003.
Existing products stay private until **Show in customer catalog** is enabled.
The public catalog is a safe RPC projection; private table RLS remains unchanged.

Open **Customer catalog** above the main view to create main categories and
subcategories. Product editing now includes category, subcategory, customer
description (separate from internal notes), catalog visibility, and featuring.
The first photo is the storefront cover; **Use as cover** moves another photo
to that position. Label images and classify them as catalog, color/design, or
real photos. All photo metadata and bytes sync between the shared account's
devices. The storefront's product gallery can filter those photo types.

Sync now runs after edits (2-second debounce), every 30 seconds while visible,
on focus and reconnect, after the initial shared-account sign-in. The manual
button explicitly says Sync. Network errors persist until a successful sync and
explain that local data is retained; sign-in failures also recover from thrown
network errors. A request timeout prevents indefinite network waits.

The push watermark is the start of the sync so edits made during it are retried.
Timestamp comparison uses actual instants, not ISO string formatting. Pulls page
beyond PostgREST's response limit and re-check local versions transactionally
after photo downloads. A server trigger rejects older offline writes before they
can overwrite newer server records. Same-row conflicts still use the existing
whole-row last-write-wins model and depend on reasonably accurate device clocks.
Web Locks serialize sync across browser tabs where supported.

`npm test` covers sync races, stale writes, full recovery, equivalent timestamps,
and cached-photo metadata. The customer repo defines a daily Vercel cron to
generate database activity; free-plan uptime/pausing cannot be guaranteed.
