-- Purchase receipt transaction draft.
-- NOT APPLIED. Only an explicitly received batch may add stock.
-- Receipt, balance, movement, and audit log commit or roll back together.
begin;

create or replace function public.admin_receive_purchase_batch(
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
  if (select auth.uid()) is null or not (select public.is_store_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_purchase_batch_id is null or p_idempotency_key is null then
    raise exception 'purchase batch id and idempotency key are required' using errcode = '22023';
  end if;

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
      and m.idempotency_key = p_idempotency_key;
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
  for key share;
  if not found then
    raise exception 'product not found or archived' using errcode = 'P0002';
  end if;

  insert into public.inventory_balances (product_id, quantity_on_hand)
  values (v_product_id, 0)
  on conflict (product_id) do nothing;

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

revoke all on function public.admin_receive_purchase_batch(uuid, uuid) from public;
grant execute on function public.admin_receive_purchase_batch(uuid, uuid) to authenticated;

commit;
