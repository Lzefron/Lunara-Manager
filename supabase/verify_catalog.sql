-- Transactional verification. Test row is rolled back; business data untouched.
begin;
insert into public.products (id, created_at, updated_at, name, notes, cost_rmb, catalog_visible, category, photos)
values ('__lunara_catalog_boundary_test__', '2026-01-01', '2026-01-02', 'Catalog boundary test', 'PRIVATE_SENTINEL', 999, true, 'Bags', '[{"id":"test","phash":"","webp_path":"__test__/cover.webp","thumb_path":"__test__/thumb.webp"}]');
update public.products set name = 'Stale device overwrite', updated_at = '2026-01-01' where id = '__lunara_catalog_boundary_test__';
do $$ begin
  if (select name from public.products where id = '__lunara_catalog_boundary_test__') <> 'Catalog boundary test' then raise exception 'Stale write guard failed'; end if;
end $$;
set local role anon;
do $$ declare payload jsonb; begin
  payload := public.customer_catalog();
  if not exists (select 1 from jsonb_array_elements(payload->'products') p where p->>'id' = '__lunara_catalog_boundary_test__') then raise exception 'Published product missing'; end if;
  if payload::text like '%PRIVATE_SENTINEL%' then raise exception 'Private note exposed'; end if;
  if exists (select 1 from jsonb_array_elements(payload->'products') p where p ?| array['notes','cost_rmb','weight_g','price_code']) then raise exception 'Private field exposed'; end if;
  if exists (select 1 from public.products where id = '__lunara_catalog_boundary_test__') then raise exception 'Raw product table exposed'; end if;
  if exists (select 1 from public.orders) then raise exception 'Orders exposed'; end if;
  if not public.is_catalog_photo('__test__/cover.webp') then raise exception 'Published photo denied'; end if;
  if public.is_catalog_photo('__private__/not_published.webp') then raise exception 'Private photo allowed'; end if;
end $$;
reset role;
update public.products set catalog_visible = false, updated_at = '2026-01-03' where id = '__lunara_catalog_boundary_test__';
set local role anon;
do $$ begin
  if exists (select 1 from jsonb_array_elements(public.customer_catalog()->'products') p where p->>'id' = '__lunara_catalog_boundary_test__') then raise exception 'Unpublished product visible'; end if;
  if public.is_catalog_photo('__test__/cover.webp') then raise exception 'Unpublished photo allowed'; end if;
end $$;
reset role;
rollback;
