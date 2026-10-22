-- Additive business extensions. Existing transactions and aggregate amounts are preserved.
alter table public.purchase_batches add column if not exists updated_at timestamptz, add column if not exists cancelled_at timestamptz, add column if not exists cancellation_reason text not null default '';
alter table public.orders add column if not exists refund_resume_status public.order_status;
alter table public.expenses add column if not exists voided_at timestamptz, add column if not exists void_reason text not null default '';
create table if not exists public.order_payments(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),kind text not null check(kind in ('receipt','refund')),
 amount_twd integer not null check(amount_twd>0),occurred_at timestamptz,reference_private text not null default '',reason text not null default '',
 receipt_id uuid references public.order_payments(id),affects_revenue boolean,legacy boolean not null default false,
 voided_at timestamptz,void_reason text not null default '',actor_user_id uuid references auth.users(id),created_at timestamptz not null default now(),
 check(legacy or (occurred_at is not null and length(btrim(reference_private)) between 1 and 500)),check(kind='refund' or receipt_id is null));
create index if not exists order_payments_order_idx on public.order_payments(order_id,created_at,id);
create index if not exists order_payments_receipt_idx on public.order_payments(receipt_id) where receipt_id is not null;
create index if not exists order_payments_time_idx on public.order_payments(occurred_at) where voided_at is null;
create table if not exists public.inventory_valuations(product_id uuid primary key references public.products(id),unit_cost_twd numeric(18,6) check(unit_cost_twd>=0),updated_at timestamptz not null default now());
create table if not exists public.valuation_events(id uuid primary key default gen_random_uuid(),product_id uuid not null references public.products(id),movement_id uuid unique references public.inventory_movements(id),quantity_delta integer not null default 0,unit_cost_twd numeric(18,6),before_cost_twd numeric(18,6),after_cost_twd numeric(18,6),reason text not null,actor_user_id uuid references auth.users(id),created_at timestamptz not null default now());
create index if not exists valuation_events_product_idx on public.valuation_events(product_id,created_at);
alter table public.order_payments enable row level security;alter table public.inventory_valuations enable row level security;alter table public.valuation_events enable row level security;
revoke all on public.order_payments,public.inventory_valuations,public.valuation_events from public,anon,authenticated;
grant select on public.order_payments,public.inventory_valuations,public.valuation_events to authenticated;
create policy "admins read payment ledger" on public.order_payments for select to authenticated using((select private.is_store_admin()));
create policy "admins read inventory valuations" on public.inventory_valuations for select to authenticated using((select private.is_store_admin()));
create policy "admins read valuation events" on public.valuation_events for select to authenticated using((select private.is_store_admin()));
-- Preserve only facts already present. Unknown historical times/references remain unknown.
insert into public.order_payments(order_id,kind,amount_twd,occurred_at,reference_private,reason,legacy,actor_user_id)
 select o.id,'receipt',o.received_amount_twd,o.received_at,o.payment_reference_private,'既有訂單實收彙總轉入；未補填未知交易資訊',true,o.created_by from public.orders o
 where o.received_amount_twd>0 and not exists(select 1 from public.order_payments p where p.order_id=o.id and p.kind='receipt');
insert into public.order_payments(order_id,kind,amount_twd,occurred_at,reference_private,reason,receipt_id,affects_revenue,legacy,actor_user_id)
 select o.id,'refund',o.refund_amount_twd,o.refund_recorded_at,o.refund_reference_private,'既有訂單退款彙總轉入；營收歸屬待確認',null,null,true,o.created_by from public.orders o
 where o.refund_amount_twd>0 and not exists(select 1 from public.order_payments p where p.order_id=o.id and p.kind='refund');

create or replace function private.track_inventory_value() returns trigger language plpgsql security definer set search_path='' as $$
declare old_cost numeric;next_cost numeric;incoming_cost numeric;batch public.purchase_batches;
begin
 if current_setting('wj.restoring',true)='true' then return new;end if;
 insert into public.inventory_valuations(product_id) values(new.product_id) on conflict do nothing;
 select unit_cost_twd into old_cost from public.inventory_valuations where product_id=new.product_id for update;
 next_cost:=old_cost;
 if new.movement_type='purchase_received' then
  select * into batch from public.purchase_batches where id=new.related_purchase_batch_id;
  incoming_cost:=(batch.quantity*batch.unit_cost_twd+batch.extra_cost_twd)/batch.quantity;
 elsif new.movement_type='cancel_return' then
  select case when count(*)filter(where i.unit_cost_snapshot_twd is null)=0 then sum(i.quantity*i.unit_cost_snapshot_twd)/nullif(sum(i.quantity),0) end into incoming_cost from public.order_items i where i.order_id=new.related_order_id and i.product_id=new.product_id;
 end if;
 if new.quantity_delta>0 then
  if new.quantity_before=0 then next_cost:=incoming_cost;
  elsif incoming_cost is null or old_cost is null then next_cost:=null;
  else next_cost:=(new.quantity_before*old_cost+new.quantity_delta*incoming_cost)/new.quantity_after;end if;
 end if;
 update public.inventory_valuations set unit_cost_twd=next_cost,updated_at=clock_timestamp() where product_id=new.product_id;
 insert into public.valuation_events(product_id,movement_id,quantity_delta,unit_cost_twd,before_cost_twd,after_cost_twd,reason,actor_user_id)
 values(new.product_id,new.id,new.quantity_delta,incoming_cost,old_cost,next_cost,new.reason,new.actor_user_id);return new;
end $$;
create trigger inventory_value_after_movement after insert on public.inventory_movements for each row execute function private.track_inventory_value();
revoke all on function private.track_inventory_value() from public,anon,authenticated;

create or replace function private.money_value(v text,max_value numeric default 2147483647,places integer default 0) returns numeric language plpgsql immutable set search_path='' as $$
declare n numeric;begin if v is null or v !~ '^\d+(\.\d+)?$' then raise check_violation using message='Explicit non-negative amount required';end if;n:=v::numeric;if n>max_value or n<>round(n,places) then raise check_violation using message='Amount outside supported precision';end if;return n;end $$;
revoke all on function private.money_value(text,numeric,integer) from public,anon,authenticated;

create or replace function private.fee_quote(p_channel text,p_subtotal integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare config jsonb;rule jsonb;raw numeric;fee numeric;begin
 if not private.is_store_admin() then raise insufficient_privilege;end if;
 select value into config from public.app_settings where key='fee_rules';rule:=config->p_channel;
 if rule is null or rule->>'enabled'is distinct from'true' then raise check_violation using message='This channel has no confirmed fee rule; enter an explicit manual fee';end if;
 raw:=greatest(p_subtotal,0)::numeric*(rule->>'basis_points')::numeric/10000+(rule->>'fixed_twd')::numeric;
 fee:=case rule->>'rounding' when 'ceil' then ceil(raw) when 'floor' then floor(raw) else round(raw) end;
 if fee>2147483647 then raise check_violation using message='Fee overflow';end if;
 return jsonb_build_object('fee_twd',fee,'rule',rule,'version',(select updated_at from public.app_settings where key='fee_rules'));
end $$;
revoke all on function private.fee_quote(text,integer) from public,anon,authenticated;

create or replace function private.sync_order_money(oid uuid) returns void language plpgsql security definer set search_path='' as $$
declare received bigint;refunded bigint;latest public.order_payments;begin
 select coalesce(sum(amount_twd) filter(where kind='receipt'),0),coalesce(sum(amount_twd) filter(where kind='refund'),0) into received,refunded from public.order_payments where order_id=oid and voided_at is null;
 if received>2147483647 or refunded>received then raise check_violation using message='Payment ledger does not reconcile';end if;
 update public.orders set received_amount_twd=received,refund_amount_twd=refunded,updated_at=clock_timestamp() where id=oid;
 select * into latest from public.order_payments where order_id=oid and kind='receipt' and voided_at is null order by occurred_at desc nulls last,created_at desc limit 1;
 update public.orders set received_at=latest.occurred_at,payment_reference_private=coalesce(latest.reference_private,'') where id=oid;
 select * into latest from public.order_payments where order_id=oid and kind='refund' and voided_at is null order by occurred_at desc nulls last,created_at desc limit 1;
 update public.orders set refund_recorded_at=latest.occurred_at,refund_reference_private=coalesce(latest.reference_private,'') where id=oid;
end $$;
revoke all on function private.sync_order_money(uuid) from public,anon,authenticated;

create or replace function private.admin_store_operation(p_action text,p_payload jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=auth.uid();prior private.store_operation_requests;result jsonb;ord public.orders;batch public.purchase_batches;payment public.order_payments;receipt public.order_payments;
 oid uuid;pid uuid;target public.order_status;reason text;amount numeric;payload jsonb:=p_payload;old_data jsonb;fee jsonb;item jsonb;items jsonb:='[]';unit_cost numeric;adjustment bigint;total bigint;rev_refunds bigint;legacy_done boolean:=false;
begin
 if actor is null or not private.is_store_admin() then raise insufficient_privilege using message='Administrator required';end if;
 if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>262144 then raise invalid_parameter_value using message='Invalid operation';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into prior from private.store_operation_requests where request_id=p_request_id;
 if found then if prior.actor_user_id<>actor or prior.action<>p_action or prior.payload is distinct from p_payload then raise unique_violation using message='Operation key reused with different input';end if;return prior.result;end if;
 reason:=btrim(coalesce(p_payload->>'reason',''));
 if p_action in ('record_payment','void_payment','cancel_refund','set_inventory_cost','edit_purchase','cancel_purchase','create_expense','void_expense','correct_order_costs') and length(reason) not between 3 and 500 then raise check_violation using message='A reason of 3 to 500 characters is required';end if;
 if p_action in ('record_payment','void_payment','cancel_refund','correct_order_costs','transition_order','save_order') and nullif(p_payload->>'id','') is not null then
  select * into ord from public.orders where id=(p_payload->>'id')::uuid for update;
  if not found then raise no_data_found using message='Order not found';end if;
  if ord.updated_at is distinct from (p_payload->>'expected_updated_at')::timestamptz then raise sqlstate 'PT409' using message='Order changed on another device';end if;oid:=ord.id;old_data:=to_jsonb(ord);
 end if;
 if p_action='record_payment' then
  if p_payload->>'kind' not in ('receipt','refund') then raise check_violation using message='Invalid payment kind';end if;
  amount:=private.money_value(p_payload->>'amount_twd');
  if amount<=0 or (p_payload->>'occurred_at')::timestamptz is null or nullif(btrim(p_payload->>'reference_private'),'') is null or length(p_payload->>'reference_private')>500 then raise check_violation using message='Actual amount, time and reference required';end if;
  if p_payload->>'kind'='receipt' then
   if ord.status not in ('awaiting_payment','paid_awaiting_purchase','ordered_from_supplier','arrived_for_check') then raise check_violation using message='This order cannot receive another payment';end if;
   if ord.received_amount_twd::bigint+amount>2147483647 then raise check_violation using message='Payment total overflow';end if;
   if ord.received_amount_twd::bigint-ord.refund_amount_twd+amount>ord.public_subtotal_twd::bigint+ord.private_adjustments_twd and not coalesce((p_payload->>'allow_overpayment')::boolean,false) then raise check_violation using message='Overpayment requires explicit confirmation';end if;
  else
   if ord.status not in ('refund_pending','refunded') then raise check_violation using message='Start the refund workflow first';end if;
   select * into receipt from public.order_payments where id=(p_payload->>'receipt_id')::uuid and order_id=oid and kind='receipt' and voided_at is null for update;
   if not found then raise check_violation using message='Select the actual original receipt';end if;
   if amount>receipt.amount_twd-coalesce((select sum(amount_twd) from public.order_payments where receipt_id=receipt.id and kind='refund' and voided_at is null),0) or amount>ord.received_amount_twd-ord.refund_amount_twd then raise check_violation using message='Refund exceeds the remaining actual receipt';end if;
   if jsonb_typeof(p_payload->'affects_revenue') is distinct from 'boolean' then raise check_violation using message='Confirm whether the refund reduces recognized revenue';end if;
   if (p_payload->>'affects_revenue')::boolean then
    if ord.fulfilled_at is null then raise check_violation using message='Unfulfilled deposits are not recognized sales';end if;
    select coalesce(sum(amount_twd),0) into rev_refunds from public.order_payments where order_id=oid and kind='refund' and affects_revenue and voided_at is null;
    if rev_refunds+amount>ord.public_subtotal_twd::bigint+ord.private_adjustments_twd then raise check_violation using message='Revenue refunds exceed recognized sales';end if;
   end if;
  end if;
  insert into public.order_payments(order_id,kind,amount_twd,occurred_at,reference_private,reason,receipt_id,affects_revenue,actor_user_id)
  values(oid,p_payload->>'kind',amount,(p_payload->>'occurred_at')::timestamptz,btrim(p_payload->>'reference_private'),reason,case when p_payload->>'kind'='refund' then receipt.id end,case when p_payload->>'kind'='refund' then (p_payload->>'affects_revenue')::boolean end,actor) returning * into payment;
  perform private.sync_order_money(oid);result:=jsonb_build_object('id',oid,'payment_id',payment.id);
 elsif p_action='void_payment' then
  select * into payment from public.order_payments where id=(p_payload->>'payment_id')::uuid and order_id=oid and voided_at is null for update;
  if not found then raise no_data_found using message='Payment already voided or missing';end if;
  if payment.kind='receipt' and (ord.status not in ('awaiting_payment','paid_awaiting_purchase') or exists(select 1 from public.order_payments where receipt_id=payment.id and voided_at is null)) then raise check_violation using message='Receipt is already used; use an explicit refund or correct related refunds first';end if;
  update public.order_payments set voided_at=clock_timestamp(),void_reason=reason where id=payment.id;
  perform private.sync_order_money(oid);
  if payment.kind='receipt' then update public.orders set status='awaiting_payment' where id=oid;elsif ord.status='refunded' then update public.orders set status='refund_pending' where id=oid;end if;
  result:=jsonb_build_object('id',oid,'voided_payment_id',payment.id);
 elsif p_action='transition_order' then
  target:=(p_payload->>'status')::public.order_status;
  if length(reason) not between 3 and 500 then raise check_violation using message='A reason of 3 to 500 characters is required';end if;
  if not ((ord.status='pending_review' and target in ('awaiting_payment','cancelled')) or(ord.status='awaiting_payment' and target in ('paid_awaiting_purchase','cancelled','refund_pending')) or(ord.status='paid_awaiting_purchase' and target in ('ordered_from_supplier','refund_pending')) or(ord.status='ordered_from_supplier' and target in ('arrived_for_check','refund_pending')) or(ord.status in ('arrived_for_check','completed') and target='refund_pending') or(ord.status='refund_pending' and target='refunded')) then raise check_violation using message='Invalid order status transition';end if;
  if target in ('awaiting_payment','paid_awaiting_purchase') and (not exists(select 1 from public.order_items where order_id=oid) or exists(select 1 from public.order_items where order_id=oid and (sale_unit_price_twd is null or unit_cost_snapshot_twd is null or is_inquiry_price))) then raise check_violation using message='Confirm all selling prices and cost snapshots first';end if;
  if target='cancelled' and ord.received_amount_twd>ord.refund_amount_twd then raise check_violation using message='Received funds require the refund workflow before cancellation';end if;
  if target='paid_awaiting_purchase' then
   -- Compatible with the previous UI, which recorded its first full receipt in this action.
   if ord.received_amount_twd=0 and p_payload->>'received_amount_twd' is not null then
    amount:=private.money_value(p_payload->>'received_amount_twd');
    if amount<=0 or (p_payload->>'received_at')::timestamptz is null or nullif(btrim(p_payload->>'payment_reference_private'),'') is null then raise check_violation using message='Actual receipt information required';end if;
    insert into public.order_payments(order_id,kind,amount_twd,occurred_at,reference_private,reason,actor_user_id) values(oid,'receipt',amount,(p_payload->>'received_at')::timestamptz,p_payload->>'payment_reference_private',reason,actor);
    perform private.sync_order_money(oid);select * into ord from public.orders where id=oid;
   end if;
   if ord.received_amount_twd-ord.refund_amount_twd<greatest(ord.public_subtotal_twd::bigint+ord.private_adjustments_twd,0) then raise check_violation using message='Full actual payment has not been recorded';end if;
  elsif target='ordered_from_supplier' then
   if nullif(btrim(p_payload->>'supplier_reference_private'),'') is null or length(p_payload->>'supplier_reference_private')>500 then raise check_violation using message='Supplier order reference required';end if;
   update public.orders set supplier_reference_private=p_payload->>'supplier_reference_private' where id=oid;
  elsif target='refunded' then
   if ord.refund_amount_twd=0 and p_payload->>'refund_amount_twd' is not null then
    amount:=private.money_value(p_payload->>'refund_amount_twd');
    if amount<=0 or amount>ord.received_amount_twd or (p_payload->>'refund_recorded_at')::timestamptz is null or nullif(btrim(p_payload->>'refund_reference_private'),'') is null then raise check_violation using message='Actual refund information required';end if;
    select * into receipt from public.order_payments where order_id=oid and kind='receipt' and voided_at is null order by created_at limit 1;
    if amount>receipt.amount_twd then raise check_violation using message='Record refunds against each actual receipt';end if;
    insert into public.order_payments(order_id,kind,amount_twd,occurred_at,reference_private,reason,receipt_id,affects_revenue,actor_user_id) values(oid,'refund',amount,(p_payload->>'refund_recorded_at')::timestamptz,p_payload->>'refund_reference_private',reason,receipt.id,ord.fulfilled_at is not null,actor);perform private.sync_order_money(oid);
   elsif ord.refund_amount_twd<=0 then raise check_violation using message='Record actual refund entries first';end if;
  end if;
  update public.orders set status=target,updated_at=clock_timestamp(),refund_resume_status=case when target='refund_pending' then ord.status else refund_resume_status end,cancelled_at=case when target='cancelled' then clock_timestamp() else cancelled_at end,cancellation_reason=case when target in ('cancelled','refund_pending') then reason else cancellation_reason end where id=oid;
  result:=jsonb_build_object('id',oid,'status',target);
 elsif p_action='cancel_refund' then
  if ord.status<>'refund_pending' or ord.refund_resume_status is null or ord.refund_amount_twd>0 then raise check_violation using message='Only a refund workflow without actual refunds can be withdrawn';end if;
  update public.orders set status=refund_resume_status,refund_resume_status=null,updated_at=clock_timestamp() where id=oid;result:=jsonb_build_object('id',oid);
 elsif p_action in ('edit_purchase','cancel_purchase') then
  select * into batch from public.purchase_batches where id=(p_payload->>'id')::uuid for update;
  if not found then raise no_data_found;end if;
  if batch.updated_at is distinct from (p_payload->>'expected_updated_at')::timestamptz then raise sqlstate 'PT409' using message='Purchase changed on another device';end if;
  if batch.received_at is not null or batch.cancelled_at is not null then raise check_violation using message='Only unreceived active purchases can be edited or cancelled';end if;
  old_data:=to_jsonb(batch);
  if p_action='cancel_purchase' then update public.purchase_batches set cancelled_at=clock_timestamp(),cancellation_reason=reason,updated_at=clock_timestamp() where id=batch.id;
  else
   if (p_payload->>'purchased_at')::date is null or (p_payload->>'quantity')::integer<=0 then raise check_violation;end if;
   if length(coalesce(p_payload->>'supplier_name',''))>120 or length(coalesce(p_payload->>'source_url',''))>1000 or length(coalesce(p_payload->>'notes_private',''))>2000 then raise check_violation;end if;
   update public.purchase_batches set purchased_at=(p_payload->>'purchased_at')::date,quantity=(p_payload->>'quantity')::integer,unit_cost_twd=private.money_value(p_payload->>'unit_cost_twd',9999999999.99,2),extra_cost_twd=private.money_value(p_payload->>'extra_cost_twd',9999999999.99,2),supplier_name=coalesce(p_payload->>'supplier_name',''),source_url=coalesce(p_payload->>'source_url',''),notes_private=coalesce(p_payload->>'notes_private',''),updated_at=clock_timestamp() where id=batch.id;
  end if;result:=jsonb_build_object('id',batch.id);
 elsif p_action='set_inventory_cost' then
  pid:=(p_payload->>'product_id')::uuid;perform 1 from public.inventory_balances where product_id=pid for update;
  unit_cost:=private.money_value(p_payload->>'unit_cost_twd',9999999999.99,2);select to_jsonb(v) into old_data from public.inventory_valuations v where product_id=pid for update;
  insert into public.inventory_valuations(product_id,unit_cost_twd) values(pid,unit_cost) on conflict(product_id) do update set unit_cost_twd=excluded.unit_cost_twd,updated_at=clock_timestamp();
  insert into public.valuation_events(product_id,unit_cost_twd,before_cost_twd,after_cost_twd,reason,actor_user_id) values(pid,unit_cost,(old_data->>'unit_cost_twd')::numeric,unit_cost,reason,actor);result:=jsonb_build_object('id',pid);
 elsif p_action='create_expense' then
  if (p_payload->>'spent_at')::date is null or length(btrim(coalesce(p_payload->>'category',''))) not between 1 and 60 or length(coalesce(p_payload->>'note_private',''))>2000 then raise check_violation using message='Actual expense date and category required';end if;
  insert into public.expenses(spent_at,category,amount_twd,channel,note_private,created_by) values((p_payload->>'spent_at')::date,btrim(p_payload->>'category'),private.money_value(p_payload->>'amount_twd',9999999999.99,2),nullif(p_payload->>'channel','')::public.sales_channel,coalesce(p_payload->>'note_private',''),actor) returning id into pid;result:=jsonb_build_object('id',pid);
 elsif p_action='void_expense' then
  select to_jsonb(e) into old_data from public.expenses e where id=(p_payload->>'id')::uuid and voided_at is null for update;if not found then raise no_data_found;end if;
  update public.expenses set voided_at=clock_timestamp(),void_reason=reason where id=(p_payload->>'id')::uuid;result:=jsonb_build_object('id',p_payload->>'id');
 elsif p_action='correct_order_costs' then
  update public.orders set fee_twd=private.money_value(p_payload->>'fee_twd'),other_cost_twd=private.money_value(p_payload->>'other_cost_twd'),updated_at=clock_timestamp() where id=oid;result:=jsonb_build_object('id',oid);
 else
  if p_action='save_order' then
   if oid is not null and ord.received_amount_twd>0 then raise check_violation using message='Paid orders cannot rewrite historical items';end if;
   for item in select * from jsonb_array_elements(p_payload->'items') loop
    if coalesce((item->>'use_weighted_cost')::boolean,false) then
     select v.unit_cost_twd into unit_cost from public.inventory_valuations v join public.inventory_balances b using(product_id) where v.product_id=(item->>'product_id')::uuid and b.quantity_on_hand>0;
     if unit_cost is null then raise check_violation using message='Weighted cost is unknown; confirm actual inventory cost first';end if;
     item:=jsonb_set(item,'{unit_cost_snapshot_twd}',to_jsonb(round(unit_cost,2)));
    end if;items:=items||jsonb_build_array(item);
   end loop;payload:=jsonb_set(payload,'{items}',items);
   select coalesce(sum((j->>'quantity')::bigint*coalesce((j->>'sale_unit_price_twd')::bigint,0)),0) into total from jsonb_array_elements(items) j;
   adjustment:=coalesce((p_payload->>'private_adjustments_twd')::bigint,0);if total+adjustment not between 0 and 2147483647 then raise check_violation using message='Invalid adjusted order total';end if;
   if p_payload->>'fee_mode'='auto' then fee:=private.fee_quote(p_payload->>'channel',(total+adjustment)::int);if (fee->>'version')::timestamptz is distinct from (p_payload->>'fee_rule_version')::timestamptz then raise sqlstate 'PT409' using message='Fee rule changed; recalculate';end if;payload:=jsonb_set(payload,'{fee_twd}',fee->'fee_twd');end if;
  elsif p_action='receive_purchase' then
   select * into batch from public.purchase_batches where id=(p_payload->>'id')::uuid for update;if batch.cancelled_at is not null then raise check_violation using message='Cancelled purchases cannot be received';end if;
  end if;
  result:=private.admin_store_operation_v1(p_action,payload,p_request_id);legacy_done:=true;
  if p_action='save_order' then update public.orders set private_adjustments_twd=adjustment where id=(result->>'id')::uuid;end if;
 end if;
 if legacy_done then update private.store_operation_requests set payload=p_payload,result=result where request_id=p_request_id;
 else
  insert into public.audit_logs(actor_user_id,entity_type,entity_id,action,reason,before_data,after_data) values(actor,case when p_action like '%purchase%' then 'purchase_batch' when p_action like '%expense%' then 'expense' when p_action='set_inventory_cost' then 'product_cost' else 'order' end,coalesce(oid::text,result->>'id'),p_action,reason,old_data,result);
  insert into private.store_operation_requests(request_id,actor_user_id,action,payload,result) values(p_request_id,actor,p_action,p_payload,result);
 end if;return result;
end $$;
revoke all on function private.admin_store_operation(text,jsonb,uuid) from public,anon;
grant execute on function private.admin_store_operation(text,jsonb,uuid) to authenticated;
