-- Local PostgreSQL WASM fixture. Never run this against a connected Supabase project.
create role anon;create role authenticated;create role service_role;
create schema auth;create schema private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.admin_profiles(user_id uuid primary key);
insert into public.admin_profiles values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
create type public.order_status as enum('pending_review','awaiting_payment','paid_awaiting_purchase','ordered_from_supplier','arrived_for_check','completed','cancelled','refund_pending','refunded');
create table public.products(id uuid primary key default gen_random_uuid(),sku text,name_zh text,name_en text default '',aliases text[] default '{}',pokedex_number int,description_public text default '',publication_status text default 'published',supply_status text default 'available',public_price_twd int default 80,price_is_inquiry boolean default false,is_live boolean default true,low_stock_threshold int default 3,first_stocked_at timestamptz,manual_sort_order int default 0);
create table public.inventory_balances(product_id uuid primary key references products(id),quantity_on_hand int not null default 0,updated_at timestamptz default now());
create table public.inventory_valuations(product_id uuid primary key,unit_cost_twd numeric);
create table public.orders(id uuid primary key default gen_random_uuid(),order_number bigint generated always as identity,channel text default 'website',status order_status default 'pending_review',customer_alias text default '',customer_contact_private text default '',customer_note text default '',public_subtotal_twd int default 0,private_adjustments_twd int default 0,received_amount_twd int default 0,refund_amount_twd int default 0,created_at timestamptz default now(),updated_at timestamptz default now(),cancelled_at timestamptz,cancellation_reason text,completed_at timestamptz,fulfilled_at timestamptz,fulfilled_by uuid,fulfillment_idempotency_key uuid);
create table public.order_items(id uuid primary key default gen_random_uuid(),order_id uuid references orders(id),product_id uuid references products(id),product_name_snapshot text,quantity int,sale_unit_price_twd int,unit_cost_snapshot_twd numeric,is_inquiry_price boolean default false);
create table public.app_settings(key text primary key,value jsonb not null,updated_by uuid,updated_at timestamptz default now());
create table public.audit_logs(id uuid default gen_random_uuid(),actor_user_id uuid,entity_type text,entity_id text,action text,reason text,before_data jsonb,after_data jsonb);
create table public.inventory_movements(id uuid primary key default gen_random_uuid(),product_id uuid,movement_type text,quantity_delta int,idempotency_key uuid,quantity_before int,quantity_after int,reason text,related_order_id uuid,actor_user_id uuid);
create table public.product_categories(id uuid primary key,name text,sort_order int);
create table public.category_assignments(product_id uuid,category_id uuid);
create table public.product_images(id uuid primary key,product_id uuid,public_path text,alt_text text,sort_order int,is_approved boolean);
create function private.is_store_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.admin_profiles where user_id=auth.uid())$$;
grant usage on schema private to authenticated;

CREATE OR REPLACE FUNCTION private.admin_complete_order_and_deduct_stock(p_order_id uuid, p_idempotency_key uuid)
 RETURNS TABLE(completed_order_id uuid, resulting_status order_status, movements_created integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
