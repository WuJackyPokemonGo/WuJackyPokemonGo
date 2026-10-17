-- Security-first follow-up migration draft.
-- NOT APPLIED to any database. Review and test on a staging project first.
begin;

-- Helper checks membership in the trusted admin profile table. Client-editable
-- auth metadata is intentionally not used as a role signal.
create or replace function public.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_profiles ap
    where ap.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_store_admin() from public;
grant execute on function public.is_store_admin() to authenticated;

-- Explicit table grants: enable RLS plus restrict base-table reads/writes to trusted
-- admins. This draft intentionally does not grant anon access to base tables.
revoke all on table public.admin_profiles from anon, authenticated;
revoke all on table public.product_categories from anon, authenticated;
revoke all on table public.products from anon, authenticated;
revoke all on table public.category_assignments from anon, authenticated;
revoke all on table public.product_images from anon, authenticated;
revoke all on table public.inventory_balances from anon, authenticated;
revoke all on table public.inventory_movements from anon, authenticated;
revoke all on table public.purchase_batches from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.expenses from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;
revoke all on table public.app_settings from anon, authenticated;

grant select on public.admin_profiles to authenticated;
create policy "admins can manage product categories" on public.product_categories
  for all to authenticated using ((select public.is_store_admin()))
  with check ((select public.is_store_admin()));
create policy "admins can manage products" on public.products
  for all to authenticated using ((select public.is_store_admin()))
  with check ((select public.is_store_admin()));
create policy "admins can manage category assignments" on public.category_assignments
  for all to authenticated using ((select public.is_store_admin()))
  with check ((select public.is_store_admin()));
create policy "admins can manage product images" on public.product_images
  for all to authenticated using ((select public.is_store_admin()))
  with check ((select public.is_store_admin()));
create policy "admins can read inventory balances" on public.inventory_balances
  for select to authenticated using ((select public.is_store_admin()));
create policy "admins can read inventory movements" on public.inventory_movements
  for select to authenticated using ((select public.is_store_admin()));
create policy "admins can manage purchase batches" on public.purchase_batches
  for all to authenticated using ((select public.is_store_admin()))
  with check ((select public.is_store_admin()));
create policy "admins can manage orders" on public.orders
  for all to authenticated using ((select public.is_store_admin()))
  with check ((select public.is_store_admin()));
create policy "admins can manage order items" on public.order_items
  for all to authenticated using ((select public.is_store_admin()))
  with check ((select public.is_store_admin()));
create policy "admins can manage expenses" on public.expenses
  for all to authenticated using ((select public.is_store_admin()))
  with check ((select public.is_store_admin()));
create policy "admins can read audit logs" on public.audit_logs
  for select to authenticated using ((select public.is_store_admin()));
-- Audit log writes must be made by trusted database functions, not directly by clients.
create policy "admins can manage settings" on public.app_settings
  for all to authenticated using ((select public.is_store_admin()))
  with check ((select public.is_store_admin()));

-- Table privileges are separate from RLS policies. Grant only the operations needed
-- by authenticated clients; RLS still limits every row to trusted admins.
grant select, insert, update, delete on public.product_categories to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.category_assignments to authenticated;
grant select, insert, update, delete on public.product_images to authenticated;
grant select on public.inventory_balances to authenticated;
grant select on public.inventory_movements to authenticated;
grant select, insert, update, delete on public.purchase_batches to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select on public.audit_logs to authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;

-- Inventory balances/movements and audit logs are read-only to authenticated clients.
-- A future SECURITY DEFINER RPC must atomically validate and update inventory balance,
-- insert the matching movement and append an audit log; expose only EXECUTE on that RPC.
-- Those transaction functions are intentionally not implemented in this draft.

-- A narrowly scoped public view is the intended read surface for a future catalog endpoint.
-- It purposely contains no stock quantity, supplier/cost fields, customer/order/finance data.
-- Do not grant access to this view before confirming view-owner/RLS semantics for your hosted
-- PostgreSQL version and testing anonymous access with actual API keys on staging.
create or replace view public.public_catalog_draft
with (security_barrier = true)
as
select
  p.id,
  p.sku,
  p.name_zh,
  p.name_en,
  p.aliases,
  p.pokedex_number,
  p.description_public,
  p.supply_status,
  p.public_price_twd,
  p.price_is_inquiry,
  p.low_stock_threshold,
  p.manual_sort_order,
  p.hot_rank,
  p.first_stocked_at,
  p.coming_soon_at,
  p.updated_at
from public.products p
where p.publication_status = 'published';

-- Explicitly revoke any default grants; do not rely on project-wide default privileges.\nrevoke all on public.public_catalog_draft from public, anon, authenticated;\n\n-- Intentionally no GRANT on public_catalog_draft in this draft migration:
-- public visibility should be enabled only after security-invoker/view policy semantics,
-- allowed columns, alias privacy and anonymous API behavior are reviewed.
commit;
