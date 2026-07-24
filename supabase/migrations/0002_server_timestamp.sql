-- Fixes a real sync bug found during live two-device testing: the pull
-- watermark was being compared against the client-supplied `updated_at`
-- (when a record was *edited*), not against when it actually landed on the
-- server. Since two devices' clocks/edit-times are independent, a device's
-- own watermark (set to its local "now" right after its own sync) can end
-- up chronologically *after* another device's edit timestamp even though
-- that edit hadn't been pushed yet — so once it finally does get pushed,
-- `updated_at > since` is false forever and the change is silently never
-- pulled again. See CLAUDE.md "Sync watermark bug" for the full trace.
--
-- Fix: add a server-assigned `server_updated_at`, forced to `now()` by a
-- trigger on every insert/update (the client cannot set it). The pull
-- watermark compares against this column instead — it's monotonic in
-- server write order, which is what "what's changed since I last pulled"
-- actually needs. `updated_at` is still used for last-write-wins conflict
-- resolution (deciding whose edit content wins), just not for watermarking.

create or replace function set_server_updated_at()
returns trigger as $$
begin
  new.server_updated_at = now();
  return new;
end;
$$ language plpgsql;

alter table products add column if not exists server_updated_at timestamptz not null default now();
alter table orders add column if not exists server_updated_at timestamptz not null default now();
alter table settings add column if not exists server_updated_at timestamptz not null default now();
alter table replies add column if not exists server_updated_at timestamptz not null default now();

drop trigger if exists products_server_updated_at on products;
create trigger products_server_updated_at before insert or update on products
  for each row execute function set_server_updated_at();

drop trigger if exists orders_server_updated_at on orders;
create trigger orders_server_updated_at before insert or update on orders
  for each row execute function set_server_updated_at();

drop trigger if exists settings_server_updated_at on settings;
create trigger settings_server_updated_at before insert or update on settings
  for each row execute function set_server_updated_at();

drop trigger if exists replies_server_updated_at on replies;
create trigger replies_server_updated_at before insert or update on replies
  for each row execute function set_server_updated_at();

create index if not exists products_server_updated_at_idx on products (server_updated_at);
create index if not exists orders_server_updated_at_idx on orders (server_updated_at);
create index if not exists settings_server_updated_at_idx on settings (server_updated_at);
create index if not exists replies_server_updated_at_idx on replies (server_updated_at);
