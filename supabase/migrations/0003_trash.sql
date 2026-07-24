-- Adds soft-trash support (Products/Orders/Replies only — Settings is a
-- singleton config row, not something you "delete"). `trashed_at` is a
-- normal syncable field, just like any other column: it flows through the
-- existing push/pull/last-write-wins machinery with no special-casing.
-- Permanent deletion still uses the pre-existing `deleted` tombstone flag
-- (Empty Trash / the 7-day auto-purge set it), which already propagates
-- correctly through sync.

alter table products add column if not exists trashed_at timestamptz;
alter table orders add column if not exists trashed_at timestamptz;
alter table replies add column if not exists trashed_at timestamptz;

create index if not exists products_trashed_at_idx on products (trashed_at);
create index if not exists orders_trashed_at_idx on orders (trashed_at);
create index if not exists replies_trashed_at_idx on replies (trashed_at);
