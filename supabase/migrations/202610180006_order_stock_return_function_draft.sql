-- Approved physical-return stock transaction draft.
-- NOT APPLIED. A refund alone never adds inventory; this function records only
-- a physically received, inspected, resale-eligible return approved by an admin.
begin;

create or replace function public.admin_record_order_stock_return(
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
  if v_actor is null or not (select public.is_store_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_order_id is null or p_product_id is null or p_idempotency_key is null
     or p_quantity is null or p_quantity <= 0
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'order, product, positive quantity, reason and idempotency key are required' using errcode = '22023';
  end if;

  -- An exact retry returns the original result; key reuse for a different operation is rejected.
  select m.* into v_existing
  from public.inventory_movements m
  where m.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.movement_type <> 'cancel_return'
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
  for key share;
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
  on conflict (product_id) do nothing;

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

revoke all on function public.admin_record_order_stock_return(uuid, uuid, integer, text, uuid) from public;
grant execute on function public.admin_record_order_stock_return(uuid, uuid, integer, text, uuid) to authenticated;

commit;
