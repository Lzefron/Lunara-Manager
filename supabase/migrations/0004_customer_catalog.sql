-- Public access is restricted to this safe projection. Never grant anon
-- SELECT on products/settings: those rows contain private business fields.
begin;
alter table public.products add column if not exists catalog_visible boolean not null default false;
alter table public.products add column if not exists category text not null default '';
alter table public.products add column if not exists subcategory text not null default '';
alter table public.products add column if not exists public_description text not null default '';
alter table public.products add column if not exists featured boolean not null default false;
alter table public.settings add column if not exists catalog_categories jsonb not null default '[{"name":"Bags","subcategories":["Shoulder bags","Crossbody bags","Handbags","Backpacks"]},{"name":"Clothes","subcategories":["Tops","Dresses","Co-ords"]},{"name":"Cosmetics","subcategories":["Makeup","Skincare","Beauty tools"]},{"name":"Shoes","subcategories":["Flats","Heels","Sneakers"]},{"name":"Tote bags","subcategories":["Canvas totes","Everyday totes"]}]';

create or replace function public.customer_catalog()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'products', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'sell_price', p.sell_price,
      'colors', p.colors, 'available', p.available, 'photos', p.photos,
      'category', p.category, 'subcategory', p.subcategory,
      'description', p.public_description, 'featured', p.featured,
      'created_at', p.created_at, 'updated_at', p.updated_at
    ) order by p.created_at desc) from public.products p
      where p.catalog_visible and not p.deleted and p.trashed_at is null), '[]'::jsonb),
    'categories', coalesce((select s.catalog_categories from public.settings s
      where s.id = 'default' and not s.deleted), '[]'::jsonb)
  );
$$;
revoke all on function public.customer_catalog() from public;
grant execute on function public.customer_catalog() to anon, authenticated;

-- Remains a private bucket. Anonymous users may download only the exact
-- original/thumbnail paths referenced by currently published products.
create or replace function public.is_catalog_photo(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.products p,
    lateral jsonb_array_elements(p.photos) photo
    where p.catalog_visible and not p.deleted and p.trashed_at is null
    and (photo->>'webp_path' = object_name or photo->>'thumb_path' = object_name));
$$;
revoke all on function public.is_catalog_photo(text) from public;
grant execute on function public.is_catalog_photo(text) to anon, authenticated;
drop policy if exists "read published catalog photos" on storage.objects;
create policy "read published catalog photos" on storage.objects for select to anon
  using (bucket_id = 'product-photos' and public.is_catalog_photo(name));

-- An offline device must not replace a newer edit already on the server.
create or replace function public.reject_stale_sync_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.updated_at < old.updated_at then return null; end if;
  return new;
end;
$$;
drop trigger if exists reject_stale_sync_write on public.products;
create trigger reject_stale_sync_write before update on public.products for each row execute function public.reject_stale_sync_write();
drop trigger if exists reject_stale_sync_write on public.orders;
create trigger reject_stale_sync_write before update on public.orders for each row execute function public.reject_stale_sync_write();
drop trigger if exists reject_stale_sync_write on public.settings;
create trigger reject_stale_sync_write before update on public.settings for each row execute function public.reject_stale_sync_write();
drop trigger if exists reject_stale_sync_write on public.replies;
create trigger reject_stale_sync_write before update on public.replies for each row execute function public.reject_stale_sync_write();
commit;
