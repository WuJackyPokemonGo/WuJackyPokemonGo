-- Isolated staging only. Add admin-only entry and lifecycle operations.
begin;
alter table public.orders add column payment_reference_private text not null default '',
 add column supplier_reference_private text not null default '',
 add column refund_reference_private text not null default '',
 add column refund_recorded_at timestamptz;
create table private.store_operation_requests(
 request_id uuid primary key,
 actor_user_id uuid not null references auth.users(id),
 action text not null,
 payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
alter table private.store_operation_requests enable row level security;
revoke all on private.store_operation_requests from public,anon,authenticated;
create policy "deny direct client operation ledger access" on private.store_operation_requests as restrictive for all to anon,authenticated using(false) with check(false);
create index store_operation_actor_idx on private.store_operation_requests(actor_user_id);

create or replace function private.admin_store_operation(p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); previous private.store_operation_requests; result jsonb;
 purchase public.purchase_batches; ord public.orders; old_data jsonb; product public.products;
 target public.order_status; item jsonb; pid uuid; qty integer; sale integer; cost numeric;
 subtotal bigint:=0; received integer; refunded integer; amount numeric; extra numeric; oid uuid; reason text;
begin
 if actor is null or not private.is_store_admin() then raise insufficient_privilege using message='Administrator required'; end if;
 if p_request_id is null or p_action is null or jsonb_typeof(p_payload) is distinct from 'object' then raise invalid_parameter_value using message='Invalid operation'; end if;
 if p_action not in ('create_purchase','save_order','transition_order','receive_purchase','complete_order','return_stock') then raise invalid_parameter_value using message='Unknown operation'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into previous from private.store_operation_requests where request_id=p_request_id;
 if found then
  if previous.actor_user_id<>actor or previous.action<>p_action or previous.payload is distinct from p_payload then raise unique_violation using message='Operation key reused with different input'; end if;
  return previous.result;
 end if;
 -- Shared keys must never alias an older inventory operation from another endpoint.
 if exists(select 1 from public.inventory_movements where idempotency_key=p_request_id)
 or exists(select 1 from public.purchase_batches where receipt_idempotency_key=p_request_id)
 or exists(select 1 from public.orders where fulfillment_idempotency_key=p_request_id) then raise unique_violation using message='Operation key already used'; end if;

 if p_action='create_purchase' then
  pid:=(p_payload->>'product_id')::uuid;
  select * into product from public.products where id=pid for share;
  if not found or product.publication_status='archived' then raise invalid_parameter_value using message='Product unavailable'; end if;
  qty:=(p_payload->>'quantity')::integer; amount:=(p_payload->>'unit_cost_twd')::numeric; extra:=(p_payload->>'extra_cost_twd')::numeric;
  if qty is null or qty<=0 or amount is null or amount<0 or amount>9999999999.99 or amount<>round(amount,2) or extra is null or extra<0 or extra>9999999999.99 or extra<>round(extra,2) then raise check_violation using message='Invalid purchase quantity or amount'; end if;
  if (p_payload->>'purchased_at')::date is null then raise check_violation using message='Purchase date required'; end if;
  if length(coalesce(p_payload->>'supplier_name',''))>120 or length(coalesce(p_payload->>'source_url',''))>1000 or length(coalesce(p_payload->>'notes_private',''))>2000 then raise check_violation using message='Purchase text too long'; end if;
  insert into public.purchase_batches(product_id,purchased_at,quantity,unit_cost_twd,extra_cost_twd,supplier_name,source_url,notes_private,created_by)
  values(pid,(p_payload->>'purchased_at')::date,qty,amount,extra,coalesce(p_payload->>'supplier_name',''),coalesce(p_payload->>'source_url',''),coalesce(p_payload->>'notes_private',''),actor) returning * into purchase;
  insert into public.audit_logs(actor_user_id,entity_type,entity_id,action,after_data) values(actor,'purchase_batch',purchase.id::text,'purchase_created',to_jsonb(purchase));
  result:=jsonb_build_object('id',purchase.id);
 elsif p_action='save_order' then
  if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items')<1 or jsonb_array_length(p_payload->'items')>50 then raise check_violation using message='Order requires 1 to 50 items'; end if;
  if length(coalesce(p_payload->>'customer_alias',''))>120 or length(coalesce(p_payload->>'customer_contact_private',''))>500 or length(coalesce(p_payload->>'customer_note',''))>2000 then raise check_violation using message='Customer text too long'; end if;
  if nullif(btrim(p_payload->>'customer_alias'),'') is null then raise check_violation using message='Customer alias required'; end if;
  oid:=(p_payload->>'id')::uuid;
  if oid is null then
   insert into public.orders(channel,customer_alias,customer_contact_private,customer_note,created_by)
   values((p_payload->>'channel')::public.sales_channel,btrim(p_payload->>'customer_alias'),coalesce(p_payload->>'customer_contact_private',''),coalesce(p_payload->>'customer_note',''),actor) returning * into ord;
   oid:=ord.id;
  else
   select * into ord from public.orders where id=oid for update;
   if not found then raise no_data_found using message='Order not found'; end if;
   if ord.updated_at is distinct from (p_payload->>'expected_updated_at')::timestamptz then raise sqlstate 'PT409' using message='Order changed on another device'; end if;
   if ord.status not in ('pending_review','awaiting_payment') then raise check_violation using message='Only unconfirmed or unpaid orders can be edited'; end if;
   old_data:=to_jsonb(ord);
   -- Delete only editable draft details, never historical fulfilled records.
   delete from public.order_items where order_id=oid;
  end if;
  -- Stable product locks avoid cross-order lock inversion during multi-item saves.
  perform 1 from public.products p where p.id in(select (j->>'product_id')::uuid from jsonb_array_elements(p_payload->'items') j) order by p.id for share;
  for item in select * from jsonb_array_elements(p_payload->'items') loop
   pid:=(item->>'product_id')::uuid; qty:=(item->>'quantity')::integer;
   sale:=(item->>'sale_unit_price_twd')::integer; cost:=(item->>'unit_cost_snapshot_twd')::numeric;
   select * into product from public.products where id=pid;
   if not found or product.publication_status='archived' then raise check_violation using message='Order product unavailable'; end if;
   if qty is null or qty<=0 or sale<0 or cost<0 or cost>9999999999.99 or cost<>round(cost,2) then raise check_violation using message='Invalid order item quantity or amount'; end if;
   if ord.status='awaiting_payment' and (sale is null or cost is null) then raise check_violation using message='Confirmed orders require prices and cost snapshots'; end if;
   subtotal:=subtotal+coalesce(sale::bigint*qty,0);
   if subtotal>2147483647 then raise check_violation using message='Order total exceeds supported amount'; end if;
   insert into public.order_items(order_id,product_id,product_name_snapshot,quantity,sale_unit_price_twd,unit_cost_snapshot_twd,is_inquiry_price)
   values(oid,pid,product.name_zh,qty,sale,cost,sale is null);
  end loop;
  update public.orders set channel=(p_payload->>'channel')::public.sales_channel,customer_alias=btrim(p_payload->>'customer_alias'),
   customer_contact_private=coalesce(p_payload->>'customer_contact_private',''),customer_note=coalesce(p_payload->>'customer_note',''),public_subtotal_twd=subtotal,
   fee_twd=coalesce((p_payload->>'fee_twd')::integer,0),other_cost_twd=coalesce((p_payload->>'other_cost_twd')::integer,0),updated_at=clock_timestamp()
  where id=oid returning * into ord;
  insert into public.audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data)
  values(actor,'order',oid::text,'order_saved',old_data,to_jsonb(ord)||jsonb_build_object('items',p_payload->'items'));
  result:=jsonb_build_object('id',oid,'order_number',ord.order_number);
 elsif p_action='transition_order' then
  oid:=(p_payload->>'id')::uuid;target:=(p_payload->>'status')::public.order_status;reason:=btrim(p_payload->>'reason');
  select * into ord from public.orders where id=oid for update;
  if not found then raise no_data_found using message='Order not found'; end if;
  if ord.updated_at is distinct from (p_payload->>'expected_updated_at')::timestamptz then raise sqlstate 'PT409' using message='Order changed on another device'; end if;
  if reason is null or length(reason)<3 or length(reason)>500 then raise check_violation using message='A reason of 3 to 500 characters is required'; end if;
  if target is null or not ((ord.status='pending_review' and target in ('awaiting_payment','cancelled'))
   or (ord.status='awaiting_payment' and target in ('paid_awaiting_purchase','cancelled'))
   or (ord.status='paid_awaiting_purchase' and target in ('ordered_from_supplier','refund_pending'))
   or (ord.status='ordered_from_supplier' and target in ('arrived_for_check','refund_pending'))
   or (ord.status in ('arrived_for_check','completed') and target='refund_pending')
   or (ord.status='refund_pending' and target='refunded')) then raise check_violation using message='Invalid order status transition'; end if;
  old_data:=to_jsonb(ord);
  if target in ('awaiting_payment','paid_awaiting_purchase') then
   if not exists(select 1 from public.order_items where order_id=oid) or exists(select 1 from public.order_items where order_id=oid and (sale_unit_price_twd is null or unit_cost_snapshot_twd is null or is_inquiry_price)) then raise check_violation using message='Confirm all selling prices and cost snapshots first'; end if;
  end if;
  if target='paid_awaiting_purchase' then
   received:=(p_payload->>'received_amount_twd')::integer;
   if received is null or received<greatest(ord.public_subtotal_twd::bigint+ord.private_adjustments_twd,0) or (p_payload->>'received_at')::timestamptz is null or nullif(btrim(p_payload->>'payment_reference_private'),'') is null or length(p_payload->>'payment_reference_private')>500 then raise check_violation using message='Record full payment, actual receipt time and payment reference'; end if;
   update public.orders set received_amount_twd=received,received_at=(p_payload->>'received_at')::timestamptz,payment_reference_private=p_payload->>'payment_reference_private' where id=oid;
  elsif target='ordered_from_supplier' then
   if nullif(btrim(p_payload->>'supplier_reference_private'),'') is null or length(p_payload->>'supplier_reference_private')>500 then raise check_violation using message='Supplier order reference required'; end if;
   update public.orders set supplier_reference_private=p_payload->>'supplier_reference_private' where id=oid;
  elsif target='refunded' then
   refunded:=(p_payload->>'refund_amount_twd')::integer;
   if refunded is null or refunded<=0 or refunded>ord.received_amount_twd or (p_payload->>'refund_recorded_at')::timestamptz is null or nullif(btrim(p_payload->>'refund_reference_private'),'') is null or length(p_payload->>'refund_reference_private')>500 then raise check_violation using message='Record valid refund amount, actual refund time and reference'; end if;
   update public.orders set refund_amount_twd=refunded,refund_recorded_at=(p_payload->>'refund_recorded_at')::timestamptz,refund_reference_private=p_payload->>'refund_reference_private' where id=oid;
  end if;
  update public.orders set status=target,updated_at=clock_timestamp(),cancelled_at=case when target='cancelled' then clock_timestamp() else cancelled_at end,cancellation_reason=case when target in ('cancelled','refund_pending') then reason else cancellation_reason end where id=oid returning * into ord;
  insert into public.audit_logs(actor_user_id,entity_type,entity_id,action,reason,before_data,after_data)
  values(actor,'order',oid::text,'order_status_changed',reason,old_data,to_jsonb(ord));
  result:=jsonb_build_object('id',oid,'status',target);
 elsif p_action='receive_purchase' then
  select to_jsonb(r) into result from public.admin_receive_purchase_batch((p_payload->>'id')::uuid,p_request_id) r;
 elsif p_action='complete_order' then
  select * into ord from public.orders where id=(p_payload->>'id')::uuid for update;
  if not found then raise no_data_found using message='Order not found'; end if;
  if ord.updated_at is distinct from (p_payload->>'expected_updated_at')::timestamptz then raise sqlstate 'PT409' using message='Order changed on another device'; end if;
  select to_jsonb(r) into result from public.admin_complete_order_and_deduct_stock(ord.id,p_request_id) r;
 elsif p_action='return_stock' then
  select to_jsonb(r) into result from public.admin_record_order_stock_return((p_payload->>'id')::uuid,(p_payload->>'product_id')::uuid,(p_payload->>'quantity')::integer,p_payload->>'reason',p_request_id) r;
 end if;
 insert into private.store_operation_requests(request_id,actor_user_id,action,payload,result) values(p_request_id,actor,p_action,p_payload,result);
 return result;
end; $$;
revoke all on function private.admin_store_operation(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function private.admin_store_operation(text,jsonb,uuid) to authenticated;
create function public.admin_store_operation(p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.admin_store_operation(p_action,p_payload,p_request_id); $$;
revoke all on function public.admin_store_operation(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.admin_store_operation(text,jsonb,uuid) to authenticated;
commit;
