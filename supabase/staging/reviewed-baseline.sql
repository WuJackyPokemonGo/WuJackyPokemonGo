-- Reviewed staging baseline. Isolated project only; this does not configure production.
-- Original draft files remain historical inputs and must not be applied separately after this bundle.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated;


-- Wu Jacky Pokemon GO store: initial data model draft
-- Security model: public catalog fields are separated from private operations/finance.



create type public.product_publication_status as enum ('draft','published','archived');
create type public.product_supply_status as enum ('available','low_stock','sold_out','inquiry_only','coming_soon');
create type public.order_status as enum ('pending_review','awaiting_payment','paid_awaiting_purchase','ordered_from_supplier','arrived_for_check','completed','cancelled','refund_pending','refunded');
create type public.sales_channel as enum ('website','line','facebook','threads','marketplace_8591','other');

create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);
alter table public.admin_profiles enable row level security;
create policy "admins can read own profile" on public.admin_profiles
  for select to authenticated using (user_id = auth.uid());
-- Profile creation/role grants must be done by a trusted operator; never allow public self-promotion.

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name_zh text not null,
  name_en text not null default '',
  aliases text[] not null default '{}',
  pokedex_number integer,
  description_public text not null default '',
  publication_status public.product_publication_status not null default 'draft',
  supply_status public.product_supply_status not null default 'inquiry_only',
  public_price_twd integer check (public_price_twd is null or public_price_twd >= 0),
  price_is_inquiry boolean not null default false,
  show_exact_stock_publicly boolean not null default false,
  low_stock_threshold integer not null default 3 check (low_stock_threshold >= 0),
  manual_sort_order integer not null default 0,
  hot_rank integer,
  first_stocked_at timestamptz,
  coming_soon_at timestamptz,
  source_reference text,
  image_rights_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index products_publication_sort_idx on public.products(publication_status, manual_sort_order);
create index products_name_zh_idx on public.products using gin (to_tsvector('simple', name_zh));
create index products_aliases_idx on public.products using gin (aliases);

create table public.category_assignments (
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.product_categories(id) on delete restrict,
  sort_order integer not null default 0,
  primary key (product_id, category_id)
);
create index category_assignments_category_idx on public.category_assignments(category_id, sort_order);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  alt_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(product_id, storage_path)
);

-- Private inventory ledger. Public users must never receive exact on-hand quantity or unit cost.
create table public.inventory_balances (
  product_id uuid primary key references public.products(id) on delete restrict,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  updated_at timestamptz not null default now()
);
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in ('opening','purchase_received','sale','cancel_return','manual_adjustment','damage','loss')),
  quantity_delta integer not null check (quantity_delta <> 0),
  -- Request key and before/after snapshot make retried manual adjustments idempotent.
  idempotency_key uuid unique,
  quantity_before integer,
  quantity_after integer,
  reason text not null,
  check ((quantity_before is null and quantity_after is null) or
         (quantity_before is not null and quantity_after is not null and quantity_before >= 0 and quantity_after >= 0)),
  related_order_id uuid,
  actor_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index inventory_movements_product_date_idx on public.inventory_movements(product_id, created_at desc);

create table public.purchase_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  purchased_at date not null,
  quantity integer not null check (quantity > 0),
  unit_cost_twd numeric(12,2) not null check (unit_cost_twd >= 0),
  extra_cost_twd numeric(12,2) not null default 0 check (extra_cost_twd >= 0),
  supplier_name text not null default '',
  source_url text not null default '',
  notes_private text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  received_at timestamptz,
  received_by uuid references auth.users(id),
  receipt_idempotency_key uuid unique,
  check ((received_at is null and received_by is null and receipt_idempotency_key is null) or
         (received_at is not null and received_by is not null and receipt_idempotency_key is not null))
);

alter table public.inventory_movements
  add column related_purchase_batch_id uuid references public.purchase_batches(id) on delete restrict;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  channel public.sales_channel not null default 'website',
  status public.order_status not null default 'pending_review',
  customer_alias text not null default '',
  customer_contact_private text not null default '',
  customer_note text not null default '',
  public_subtotal_twd integer not null default 0 check (public_subtotal_twd >= 0),
  private_adjustments_twd integer not null default 0,
  fee_twd integer not null default 0 check (fee_twd >= 0),
  other_cost_twd integer not null default 0 check (other_cost_twd >= 0),
  received_amount_twd integer not null default 0 check (received_amount_twd >= 0),
  refund_amount_twd integer not null default 0 check (refund_amount_twd >= 0),
  received_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  product_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  sale_unit_price_twd integer check (sale_unit_price_twd is null or sale_unit_price_twd >= 0),
  unit_cost_snapshot_twd numeric(12,2) check (unit_cost_snapshot_twd is null or unit_cost_snapshot_twd >= 0),
  is_inquiry_price boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  spent_at date not null,
  category text not null,
  amount_twd numeric(12,2) not null check (amount_twd >= 0),
  channel public.sales_channel,
  note_private text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  reason text not null default '',
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

create table public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- RLS is enabled everywhere. No public policies are granted in this initial migration.
-- Admin access is intentionally fail-closed until a reviewed admin authorization function
-- and policies are added. Do not use a client-supplied metadata field as an admin role.
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.category_assignments enable row level security;
alter table public.product_images enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.purchase_batches enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.expenses enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_settings enable row level security;

-- Public storefront should be served through a deliberately limited view or server endpoint,
-- exposing only published product fields, category labels, and non-exact stock labels.
-- Do not grant anon/authenticated SELECT on the base products/inventory/orders tables.
-- Admin policies, safe public views/RPCs, storage policies, and transaction-safe inventory
-- functions must be reviewed and added before connecting any frontend to this schema.


-- Security-first follow-up migration draft.

-- Helper checks membership in the trusted admin profile table. Client-editable
-- auth metadata is intentionally not used as a role signal.
create or replace function private.is_store_admin()
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
revoke all on function private.is_store_admin() from public;
grant execute on function private.is_store_admin() to authenticated;

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

-- No direct client grant on admin_profiles: the SECURITY DEFINER helper performs the membership check.
create policy "admins can manage product categories" on public.product_categories
  for all to authenticated using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));
create policy "admins can manage products" on public.products
  for all to authenticated using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));
create policy "admins can manage category assignments" on public.category_assignments
  for all to authenticated using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));
create policy "admins can manage product images" on public.product_images
  for all to authenticated using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));
create policy "admins can read inventory balances" on public.inventory_balances
  for select to authenticated using ((select private.is_store_admin()));
create policy "admins can read inventory movements" on public.inventory_movements
  for select to authenticated using ((select private.is_store_admin()));
create policy "admins can manage purchase batches" on public.purchase_batches
  for all to authenticated using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));
create policy "admins can manage orders" on public.orders
  for all to authenticated using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));
create policy "admins can manage order items" on public.order_items
  for all to authenticated using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));
create policy "admins can manage expenses" on public.expenses
  for all to authenticated using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));
create policy "admins can read audit logs" on public.audit_logs
  for select to authenticated using ((select private.is_store_admin()));
-- Audit log writes must be made by trusted database functions, not directly by clients.
create policy "admins can manage settings" on public.app_settings
  for all to authenticated using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));

-- Table privileges are separate from RLS policies. Grant only the operations needed
-- by authenticated clients; RLS still limits every row to trusted admins.
grant select, insert, update, delete on public.product_categories to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.category_assignments to authenticated;
grant select, insert, update, delete on public.product_images to authenticated;
grant select on public.inventory_balances to authenticated;
grant select on public.inventory_movements to authenticated;
grant select on public.purchase_batches to authenticated;
grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant select on public.expenses to authenticated;
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
with (security_barrier = true, security_invoker = true)
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
  p.manual_sort_order,
  p.hot_rank,
  p.first_stocked_at,
  p.coming_soon_at,
  p.updated_at
from public.products p
where p.publication_status = 'published';

-- Explicitly revoke any default grants; do not rely on project-wide default privileges.
revoke all on public.public_catalog_draft from public, anon, authenticated;

-- Intentionally no GRANT on public_catalog_draft in this draft migration:
-- public visibility should be enabled only after security-invoker/view policy semantics,
-- allowed columns, alias privacy and anonymous API behavior are reviewed.

-- Inventory manual-adjustment transaction draft.
-- This function handles manual adjustments only; purchases, sales, refunds, and
-- cancellation flows need separate reviewed transaction functions.

create or replace function private.admin_adjust_inventory(
  p_product_id uuid,
  p_delta integer,
  p_reason text,
  p_idempotency_key uuid
)
returns table (
  product_id uuid,
  previous_quantity integer,
  new_quantity integer,
  movement_id uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before integer;
  v_after integer;
  v_movement_id uuid;
  v_existing_type text;
  v_existing_reason text;
  v_existing_product_id uuid;
  v_existing_delta integer;
  v_existing_actor uuid;
  v_existing_before integer;
  v_existing_after integer;
  v_existing_movement_id uuid;
begin
  if (select auth.uid()) is null or not (select private.is_store_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;
  if p_product_id is null then
    raise exception 'product id is required' using errcode = '22023';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'adjustment must be a non-zero integer' using errcode = '22023';
  end if;
  if p_reason is null or pg_catalog.length(pg_catalog.btrim(p_reason)) < 3 then
    raise exception 'reason must contain at least 3 non-space characters' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));

  -- Serialize retries using the unique key. A retry returns the original result only
  -- when actor, product, and delta match; reusing a key for a different action is rejected.
  select m.movement_type, m.reason, m.product_id, m.quantity_delta, m.actor_user_id,
         m.quantity_before, m.quantity_after, m.id
    into v_existing_type, v_existing_reason, v_existing_product_id, v_existing_delta, v_existing_actor,
         v_existing_before, v_existing_after, v_existing_movement_id
  from public.inventory_movements m
  where m.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_type <> 'manual_adjustment'
       or v_existing_reason is distinct from pg_catalog.btrim(p_reason)
       or v_existing_product_id <> p_product_id
       or v_existing_delta <> p_delta
       or v_existing_actor is distinct from (select auth.uid()) then
      raise exception 'idempotency key already used for a different operation' using errcode = '23505';
    end if;
    if v_existing_before is null or v_existing_after is null then
      raise exception 'existing idempotency record has no result snapshot' using errcode = '55000';
    end if;
    return query select p_product_id, v_existing_before, v_existing_after, v_existing_movement_id;
    return;
  end if;

  perform 1
  from public.products p
  where p.id = p_product_id
    and p.publication_status <> 'archived'
  for share;

  if not found then
    raise exception 'product not found or archived' using errcode = 'P0002';
  end if;

  insert into public.inventory_balances (product_id, quantity_on_hand)
  values (p_product_id, 0)
  on conflict on constraint inventory_balances_pkey do nothing;

  select b.quantity_on_hand
    into v_before
  from public.inventory_balances b
  where b.product_id = p_product_id
  for update;

  v_after := v_before + p_delta;
  if v_after < 0 then
    raise exception 'adjustment would create negative inventory' using errcode = '23514';
  end if;

  update public.inventory_balances
  set quantity_on_hand = v_after,
      updated_at = pg_catalog.now()
  where inventory_balances.product_id = p_product_id;

  insert into public.inventory_movements (
    product_id, movement_type, quantity_delta, idempotency_key,
    quantity_before, quantity_after, reason, actor_user_id
  ) values (
    p_product_id, 'manual_adjustment', p_delta, p_idempotency_key,
    v_before, v_after, pg_catalog.btrim(p_reason), (select auth.uid())
  )
  returning id into v_movement_id;

  insert into public.audit_logs (
    actor_user_id, entity_type, entity_id, action, reason, before_data, after_data
  ) values (
    (select auth.uid()),
    'inventory_balance',
    p_product_id::text,
    'manual_adjustment',
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object('quantity_on_hand', v_before),
    pg_catalog.jsonb_build_object('quantity_on_hand', v_after, 'movement_id', v_movement_id)
  );

  return query select p_product_id, v_before, v_after, v_movement_id;
end;
$function$;


revoke all on function private.admin_adjust_inventory(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function private.admin_adjust_inventory(uuid, integer, text, uuid) to authenticated;
create or replace function public.admin_adjust_inventory(p_product_id uuid, p_delta integer, p_reason text, p_idempotency_key uuid)
returns table (product_id uuid, previous_quantity integer, new_quantity integer, movement_id uuid)
language sql security invoker set search_path = ''
as $wrapper$ select * from private.admin_adjust_inventory(p_product_id, p_delta, p_reason, p_idempotency_key); $wrapper$;
revoke all on function public.admin_adjust_inventory(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_adjust_inventory(uuid, integer, text, uuid) to authenticated;


-- Purchase receipt transaction draft.
-- Receipt, balance, movement, and audit log commit or roll back together.

create or replace function private.admin_receive_purchase_batch(
  p_purchase_batch_id uuid,
  p_idempotency_key uuid
)
returns table (
  purchase_batch_id uuid,
  product_id uuid,
  previous_quantity integer,
  new_quantity integer,
  movement_id uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_product_id uuid;
  v_quantity integer;
  v_received_at timestamptz;
  v_existing_key uuid;
  v_before integer;
  v_after integer;
  v_movement_id uuid;
begin
  if (select auth.uid()) is null or not (select private.is_store_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_purchase_batch_id is null or p_idempotency_key is null then
    raise exception 'purchase batch id and idempotency key are required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));

  select b.product_id, b.quantity, b.received_at, b.receipt_idempotency_key
    into v_product_id, v_quantity, v_received_at, v_existing_key
  from public.purchase_batches b
  where b.id = p_purchase_batch_id
  for update;

  if not found then
    raise exception 'purchase batch not found' using errcode = 'P0002';
  end if;

  if v_received_at is not null then
    if v_existing_key is distinct from p_idempotency_key then
      raise exception 'purchase batch has already been received with another key' using errcode = '23505';
    end if;
    select m.quantity_before, m.quantity_after, m.id
      into v_before, v_after, v_movement_id
    from public.inventory_movements m
    where m.related_purchase_batch_id = p_purchase_batch_id
      and m.idempotency_key = p_idempotency_key
      and m.movement_type = 'purchase_received'
      and m.actor_user_id = (select auth.uid());
    if not found or v_before is null or v_after is null then
      raise exception 'received batch is missing its inventory movement snapshot' using errcode = '55000';
    end if;
    return query select p_purchase_batch_id, v_product_id, v_before, v_after, v_movement_id;
    return;
  end if;

  perform 1
  from public.products p
  where p.id = v_product_id
    and p.publication_status <> 'archived'
  for share;
  if not found then
    raise exception 'product not found or archived' using errcode = 'P0002';
  end if;

  insert into public.inventory_balances (product_id, quantity_on_hand)
  values (v_product_id, 0)
  on conflict on constraint inventory_balances_pkey do nothing;

  select b.quantity_on_hand
    into v_before
  from public.inventory_balances b
  where b.product_id = v_product_id
  for update;

  v_after := v_before + v_quantity;

  update public.inventory_balances
  set quantity_on_hand = v_after,
      updated_at = pg_catalog.now()
  where inventory_balances.product_id = v_product_id;

  insert into public.inventory_movements (
    product_id, movement_type, quantity_delta, idempotency_key,
    quantity_before, quantity_after, reason, actor_user_id, related_purchase_batch_id
  ) values (
    v_product_id, 'purchase_received', v_quantity, p_idempotency_key,
    v_before, v_after, 'Purchase batch receipt ' || p_purchase_batch_id::text,
    (select auth.uid()), p_purchase_batch_id
  )
  returning id into v_movement_id;

  update public.purchase_batches
  set received_at = pg_catalog.now(),
      received_by = (select auth.uid()),
      receipt_idempotency_key = p_idempotency_key
  where id = p_purchase_batch_id;

  insert into public.audit_logs (
    actor_user_id, entity_type, entity_id, action, reason, before_data, after_data
  ) values (
    (select auth.uid()),
    'purchase_batch',
    p_purchase_batch_id::text,
    'purchase_received',
    'Purchase batch received and inventory increased',
    pg_catalog.jsonb_build_object('quantity_on_hand', v_before),
    pg_catalog.jsonb_build_object(
      'quantity_on_hand', v_after,
      'quantity_received', v_quantity,
      'movement_id', v_movement_id
    )
  );

  return query select p_purchase_batch_id, v_product_id, v_before, v_after, v_movement_id;
end;
$function$;


revoke all on function private.admin_receive_purchase_batch(uuid, uuid) from public, anon, authenticated;
grant execute on function private.admin_receive_purchase_batch(uuid, uuid) to authenticated;
create or replace function public.admin_receive_purchase_batch(p_purchase_batch_id uuid, p_idempotency_key uuid)
returns table (purchase_batch_id uuid, product_id uuid, previous_quantity integer, new_quantity integer, movement_id uuid)
language sql security invoker set search_path = ''
as $wrapper$ select * from private.admin_receive_purchase_batch(p_purchase_batch_id, p_idempotency_key); $wrapper$;
revoke all on function public.admin_receive_purchase_batch(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_receive_purchase_batch(uuid, uuid) to authenticated;


-- Order completion + stock deduction transaction draft.
-- A single order-level idempotency key protects the whole multi-product transaction.

alter table public.orders
  add column fulfillment_idempotency_key uuid unique,
  add column fulfilled_at timestamptz,
  add column fulfilled_by uuid references auth.users(id),
  add constraint orders_fulfillment_metadata_all_or_none check (
    (fulfillment_idempotency_key is null and fulfilled_at is null and fulfilled_by is null)
    or
    (fulfillment_idempotency_key is not null and fulfilled_at is not null and fulfilled_by is not null)
  );

alter table public.inventory_movements
  add constraint inventory_movements_related_order_fk
  foreign key (related_order_id) references public.orders(id) on delete restrict;

create or replace function private.admin_complete_order_and_deduct_stock(
  p_order_id uuid,
  p_idempotency_key uuid
)
returns table (
  completed_order_id uuid,
  resulting_status public.order_status,
  movements_created integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status public.order_status;
  v_existing_key uuid;
  v_order_number bigint;
  v_actor uuid;
  v_item_count integer;
  v_movement_count integer := 0;
  v_item record;
  v_before integer;
  v_after integer;
  v_movement_id uuid;
begin
  v_actor := (select auth.uid());
  if v_actor is null or not (select private.is_store_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_order_id is null or p_idempotency_key is null then
    raise exception 'order id and idempotency key are required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));

  select o.status, o.fulfillment_idempotency_key, o.order_number
    into v_status, v_existing_key, v_order_number
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_existing_key is not null then
    if v_existing_key is distinct from p_idempotency_key then
      raise exception 'order already completed with another idempotency key' using errcode = '23505';
    end if;
    if not exists (select 1 from public.orders o where o.id=p_order_id and o.fulfilled_by=v_actor) then
      raise exception 'fulfillment belongs to another actor' using errcode='23505';
    end if;
    select count(*)::integer into v_movement_count
    from public.inventory_movements m
    where m.related_order_id = p_order_id and m.movement_type = 'sale';
    if v_movement_count = 0 then
      raise exception 'completed order is missing sale movements' using errcode = '55000';
    end if;
    return query select p_order_id, v_status, v_movement_count;
    return;
  end if;

  if v_status <> 'arrived_for_check' then
    raise exception 'order must be arrived_for_check before completion' using errcode = '22023';
  end if;

  select count(*)::integer into v_item_count
  from public.order_items i
  where i.order_id = p_order_id;
  if v_item_count = 0 then
    raise exception 'order has no items' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.order_items i
    left join public.products p on p.id = i.product_id
    where i.order_id = p_order_id
      and (
        i.product_id is null
        or i.sale_unit_price_twd is null
        or i.is_inquiry_price
        or i.unit_cost_snapshot_twd is null
        or p.id is null
        or p.publication_status = 'archived'
      )
  ) then
    raise exception 'order contains an unconfirmed price, missing cost snapshot, or unavailable product' using errcode = '22023';
  end if;

  -- Keep the participating products stable while validating and changing stock.
  perform 1 from public.products p where p.id in
    (select i.product_id from public.order_items i where i.order_id=p_order_id)
    order by p.id for share;

  -- Create missing balance rows, then lock all affected balances in stable product-id order.
  insert into public.inventory_balances (product_id, quantity_on_hand)
  select distinct i.product_id, 0
  from public.order_items i
  where i.order_id = p_order_id
  on conflict on constraint inventory_balances_pkey do nothing;

  for v_item in
    select b.product_id
    from public.inventory_balances b
    join (
      select i.product_id
      from public.order_items i
      where i.order_id = p_order_id
      group by i.product_id
    ) needed on needed.product_id = b.product_id
    order by b.product_id
    for update of b
  loop
    null;
  end loop;

  -- Check all stock levels before changing any; duplicate order lines are aggregated.
  for v_item in
    select i.product_id, sum(i.quantity)::integer as quantity_needed
    from public.order_items i
    where i.order_id = p_order_id
    group by i.product_id
    order by i.product_id
  loop
    select b.quantity_on_hand into v_before
    from public.inventory_balances b
    where b.product_id = v_item.product_id;
    if v_before < v_item.quantity_needed then
      raise exception 'insufficient stock for product %', v_item.product_id using errcode = '23514';
    end if;
  end loop;

  -- One sale movement per distinct product, with before/after snapshots.
  for v_item in
    select i.product_id, sum(i.quantity)::integer as quantity_needed
    from public.order_items i
    where i.order_id = p_order_id
    group by i.product_id
    order by i.product_id
  loop
    select b.quantity_on_hand into v_before
    from public.inventory_balances b
    where b.product_id = v_item.product_id;
    v_after := v_before - v_item.quantity_needed;

    update public.inventory_balances
    set quantity_on_hand = v_after,
        updated_at = pg_catalog.now()
    where product_id = v_item.product_id;

    insert into public.inventory_movements (
      product_id, movement_type, quantity_delta, quantity_before, quantity_after,
      reason, related_order_id, actor_user_id
    ) values (
      v_item.product_id, 'sale', -v_item.quantity_needed, v_before, v_after,
      'Order #' || v_order_number::text || ' completed',
      p_order_id, v_actor
    ) returning id into v_movement_id;

    v_movement_count := v_movement_count + 1;
  end loop;

  update public.orders
  set status = 'completed',
      completed_at = pg_catalog.now(),
      fulfilled_at = pg_catalog.now(),
      fulfilled_by = v_actor,
      fulfillment_idempotency_key = p_idempotency_key,
      updated_at = pg_catalog.now()
  where id = p_order_id;

  insert into public.audit_logs (
    actor_user_id, entity_type, entity_id, action, reason, before_data, after_data
  ) values (
    v_actor,
    'order',
    p_order_id::text,
    'order_completed_stock_deducted',
    'Order completed; inventory deducted atomically',
    pg_catalog.jsonb_build_object('status', v_status),
    pg_catalog.jsonb_build_object(
      'status', 'completed',
      'order_number', v_order_number,
      'movements_created', v_movement_count,
      'idempotency_key', p_idempotency_key
    )
  );

  return query select p_order_id, 'completed'::public.order_status, v_movement_count;
end;
$function$;


revoke all on function private.admin_complete_order_and_deduct_stock(uuid, uuid) from public, anon, authenticated;
grant execute on function private.admin_complete_order_and_deduct_stock(uuid, uuid) to authenticated;
create or replace function public.admin_complete_order_and_deduct_stock(p_order_id uuid, p_idempotency_key uuid)
returns table (completed_order_id uuid, resulting_status public.order_status, movements_created integer)
language sql security invoker set search_path = ''
as $wrapper$ select * from private.admin_complete_order_and_deduct_stock(p_order_id, p_idempotency_key); $wrapper$;
revoke all on function public.admin_complete_order_and_deduct_stock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_complete_order_and_deduct_stock(uuid, uuid) to authenticated;


-- Approved physical-return stock transaction draft.
-- a physically received, inspected, resale-eligible return approved by an admin.

create or replace function private.admin_record_order_stock_return(
  p_order_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_reason text,
  p_idempotency_key uuid
)
returns table (
  returned_order_id uuid,
  returned_product_id uuid,
  previous_quantity integer,
  new_quantity integer,
  movement_id uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid;
  v_order_status public.order_status;
  v_before integer;
  v_after integer;
  v_sold_quantity integer;
  v_already_returned integer;
  v_existing public.inventory_movements%rowtype;
  v_movement_id uuid;
begin
  v_actor := (select auth.uid());
  if v_actor is null or not (select private.is_store_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_order_id is null or p_product_id is null or p_idempotency_key is null
     or p_quantity is null or p_quantity <= 0
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'order, product, positive quantity, reason and idempotency key are required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));

  -- An exact retry returns the original result; key reuse for a different operation is rejected.
  select m.* into v_existing
  from public.inventory_movements m
  where m.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.movement_type <> 'cancel_return'
       or v_existing.reason is distinct from pg_catalog.btrim(p_reason)
       or v_existing.related_order_id is distinct from p_order_id
       or v_existing.product_id is distinct from p_product_id
       or v_existing.quantity_delta is distinct from p_quantity
       or v_existing.actor_user_id is distinct from v_actor
       or v_existing.quantity_before is null
       or v_existing.quantity_after is null then
      raise exception 'idempotency key was already used for a different operation' using errcode = '23505';
    end if;
    return query select p_order_id, p_product_id, v_existing.quantity_before,
                        v_existing.quantity_after, v_existing.id;
    return;
  end if;

  select o.status into v_order_status
  from public.orders o
  where o.id = p_order_id
  for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_order_status not in ('completed', 'refund_pending', 'refunded') then
    raise exception 'stock can only be returned for a completed or refund-processing order' using errcode = '22023';
  end if;

  perform 1
  from public.products p
  where p.id = p_product_id
  for share;
  if not found then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  select coalesce(-sum(m.quantity_delta) filter (where m.movement_type = 'sale'), 0)::integer,
         coalesce(sum(m.quantity_delta) filter (where m.movement_type = 'cancel_return'), 0)::integer
    into v_sold_quantity, v_already_returned
  from public.inventory_movements m
  where m.related_order_id = p_order_id
    and m.product_id = p_product_id
    and m.movement_type in ('sale', 'cancel_return');

  if v_sold_quantity <= 0 or p_quantity > v_sold_quantity - v_already_returned then
    raise exception 'return quantity exceeds unreturned quantity sold on this order' using errcode = '23514';
  end if;

  insert into public.inventory_balances (product_id, quantity_on_hand)
  values (p_product_id, 0)
  on conflict on constraint inventory_balances_pkey do nothing;

  select b.quantity_on_hand into v_before
  from public.inventory_balances b
  where b.product_id = p_product_id
  for update;
  v_after := v_before + p_quantity;

  update public.inventory_balances
  set quantity_on_hand = v_after,
      updated_at = pg_catalog.now()
  where product_id = p_product_id;

  insert into public.inventory_movements (
    product_id, movement_type, quantity_delta, idempotency_key,
    quantity_before, quantity_after, reason, related_order_id, actor_user_id
  ) values (
    p_product_id, 'cancel_return', p_quantity, p_idempotency_key,
    v_before, v_after, pg_catalog.btrim(p_reason), p_order_id, v_actor
  ) returning id into v_movement_id;

  insert into public.audit_logs (
    actor_user_id, entity_type, entity_id, action, reason, before_data, after_data
  ) values (
    v_actor,
    'order',
    p_order_id::text,
    'order_stock_returned',
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object('product_id', p_product_id, 'quantity_on_hand', v_before),
    pg_catalog.jsonb_build_object(
      'product_id', p_product_id,
      'quantity_returned', p_quantity,
      'quantity_on_hand', v_after,
      'movement_id', v_movement_id,
      'idempotency_key', p_idempotency_key
    )
  );

  return query select p_order_id, p_product_id, v_before, v_after, v_movement_id;
end;
$function$;


revoke all on function private.admin_record_order_stock_return(uuid, uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function private.admin_record_order_stock_return(uuid, uuid, integer, text, uuid) to authenticated;
create or replace function public.admin_record_order_stock_return(p_order_id uuid, p_product_id uuid, p_quantity integer, p_reason text, p_idempotency_key uuid)
returns table (returned_order_id uuid, returned_product_id uuid, previous_quantity integer, new_quantity integer, movement_id uuid)
language sql security invoker set search_path = ''
as $wrapper$ select * from private.admin_record_order_stock_return(p_order_id, p_product_id, p_quantity, p_reason, p_idempotency_key); $wrapper$;
revoke all on function public.admin_record_order_stock_return(uuid, uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_record_order_stock_return(uuid, uuid, integer, text, uuid) to authenticated;



-- Revoke default table/sequence privileges inherited by early projects.
revoke all on all tables in schema public from public, anon;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on function private.is_store_admin() from public, anon;
-- Ledger consistency and operation uniqueness backstop transaction code.
alter table public.inventory_movements add constraint movement_snapshot_matches_delta
check (quantity_before is null or quantity_after::bigint - quantity_before::bigint = quantity_delta::bigint);
create unique index one_sale_per_order_product on public.inventory_movements(related_order_id,product_id) where movement_type='sale';
create unique index one_receipt_per_batch on public.inventory_movements(related_purchase_batch_id) where movement_type='purchase_received';
-- Foreign-key indexes support operational queries without scanning the full tables.
create index product_images_product_idx on public.product_images(product_id,sort_order);
create index inventory_movements_order_idx on public.inventory_movements(related_order_id,product_id);
create index purchase_batches_product_idx on public.purchase_batches(product_id);
create index order_items_order_idx on public.order_items(order_id);
create index order_items_product_idx on public.order_items(product_id);
comment on view public.public_catalog_draft is 'Closed staging-only catalog view. No anonymous grants. Frontend connection not yet enabled.';
commit;
