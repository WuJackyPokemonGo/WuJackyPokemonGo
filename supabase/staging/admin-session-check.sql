begin;
-- Public invoker facade; membership lookup remains inside the non-exposed schema.
create function public.store_admin_status()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.is_store_admin(); $$;
revoke all on function public.store_admin_status() from public, anon, authenticated;
grant execute on function public.store_admin_status() to authenticated;

create function private.touch_product_updated_at()
returns trigger language plpgsql security invoker set search_path = ''
as $$ begin new.updated_at := pg_catalog.clock_timestamp(); return new; end; $$;
revoke all on function private.touch_product_updated_at() from public, anon, authenticated;
create trigger products_touch_updated_at before update on public.products
for each row execute function private.touch_product_updated_at();
commit;
