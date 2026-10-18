-- Order completion + stock deduction transaction draft.
-- NOT APPLIED. Validate on isolated PostgreSQL staging before any production use.
-- A single order-level idempotency key protects the whole multi-product transaction.
begin;

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

create or replace function public.admin_complete_order_and_deduct_stock(
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
  if v_actor is null or not (select public.is_store_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_order_id is null or p_idempotency_key is null then
    raise exception 'order id and idempotency key are required' using errcode = '22023';
  end if;

  select o.status, o.fulfillment_idempotency_key, o.order_number
    into v_status, v_existing_key, v_order_number
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_status = 'completed' then
    if v_existing_key is distinct from p_idempotency_key then
      raise exception 'order already completed with another idempotency key' using errcode = '23505';
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

  -- Create missing balance rows, then lock all affected balances in stable product-id order.
  insert into public.inventory_balances (product_id, quantity_on_hand)
  select distinct i.product_id, 0
  from public.order_items i
  where i.order_id = p_order_id
  on conflict (product_id) do nothing;

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

revoke all on function public.admin_complete_order_and_deduct_stock(uuid, uuid) from public;
grant execute on function public.admin_complete_order_and_deduct_stock(uuid, uuid) to authenticated;

commit;
