-- Inventory manual-adjustment transaction draft.
-- NOT APPLIED. Requires SQL review and staging tests before use.
-- This function handles manual adjustments only; purchases, sales, refunds, and
-- cancellation flows need separate reviewed transaction functions.
begin;

create or replace function public.admin_adjust_inventory(
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
  v_existing_product_id uuid;
  v_existing_delta integer;
  v_existing_actor uuid;
  v_existing_before integer;
  v_existing_after integer;
  v_existing_movement_id uuid;
begin
  if (select auth.uid()) is null or not (select public.is_store_admin()) then
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

  -- Serialize retries using the unique key. A retry returns the original result only
  -- when actor, product, and delta match; reusing a key for a different action is rejected.
  select m.product_id, m.quantity_delta, m.actor_user_id,
         m.quantity_before, m.quantity_after, m.id
    into v_existing_product_id, v_existing_delta, v_existing_actor,
         v_existing_before, v_existing_after, v_existing_movement_id
  from public.inventory_movements m
  where m.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_product_id <> p_product_id
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
  for key share;

  if not found then
    raise exception 'product not found or archived' using errcode = 'P0002';
  end if;

  insert into public.inventory_balances (product_id, quantity_on_hand)
  values (p_product_id, 0)
  on conflict (product_id) do nothing;

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

revoke all on function public.admin_adjust_inventory(uuid, integer, text, uuid) from public;
grant execute on function public.admin_adjust_inventory(uuid, integer, text, uuid) to authenticated;

commit;
