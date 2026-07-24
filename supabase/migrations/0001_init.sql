-- Lunara Manager — initial schema
--
-- Mirrors the Dexie schema in src/db/db.ts for the 4 tables that sync
-- (products, orders, settings, replies). sync_meta is local-only and never
-- touches this database. Every synced table carries the same
-- (id, created_at, updated_at, deleted) shape used for last-write-wins
-- merge on the client — see src/lib/sync.ts.
--
-- Photo *bytes* never live in Postgres: `products.photos` stores only
-- {id, phash, webp_path, thumb_path} per photo, pointing at objects in the
-- `product-photos` Storage bucket created below.

create table if not exists products (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  name text not null default '',
  sell_price numeric not null default 0,
  cost_rmb numeric not null default 0,
  weight_g numeric not null default 0,
  colors text[] not null default '{}',
  available boolean not null default true,
  photos jsonb not null default '[]',
  notes text not null default '',
  price_code text not null default ''
);

create table if not exists orders (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  customer_name text not null default '',
  phone text not null default '',
  address text not null default '',
  product_ids text[] not null default '{}',
  total_price numeric not null default 0,
  status text not null default 'china',
  status_dates jsonb not null default '{}',
  steadfast_tracking_id text not null default '',
  notes text not null default ''
);

create table if not exists settings (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  rmb_to_bdt_rate numeric not null default 0,
  shipping_rate_per_kg numeric not null default 0,
  default_profit_mode text not null default 'percent',
  default_profit_value numeric not null default 0
);

create table if not exists replies (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  category text not null default '',
  title text not null default '',
  text text not null default ''
);

create index if not exists products_updated_at_idx on products (updated_at);
create index if not exists orders_updated_at_idx on orders (updated_at);
create index if not exists replies_updated_at_idx on replies (updated_at);

-- Private tool, two trusted users sharing one Supabase Auth login (see
-- README). RLS just requires *some* authenticated session — there is no
-- per-row ownership model to enforce.
alter table products enable row level security;
alter table orders enable row level security;
alter table settings enable row level security;
alter table replies enable row level security;

create policy "authenticated full access" on products
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on orders
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on settings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on replies
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Storage bucket for compressed product photos (webp originals + thumbs).
-- Not public — only readable/writable by the authenticated shared login,
-- same trust model as the tables above.
insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', false)
on conflict (id) do nothing;

create policy "authenticated read product photos" on storage.objects
  for select using (bucket_id = 'product-photos' and auth.role() = 'authenticated');
create policy "authenticated write product photos" on storage.objects
  for insert with check (bucket_id = 'product-photos' and auth.role() = 'authenticated');
create policy "authenticated update product photos" on storage.objects
  for update using (bucket_id = 'product-photos' and auth.role() = 'authenticated');
create policy "authenticated delete product photos" on storage.objects
  for delete using (bucket_id = 'product-photos' and auth.role() = 'authenticated');
