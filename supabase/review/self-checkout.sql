-- REVIEW ONLY. No production changes have been applied.
-- Apply once, in a transaction, after owner review. Existing orders/app_settings
-- carry the new data, so existing full backups and restore retain it.
begin;
insert into public.app_settings(key,value) values('self_checkout',jsonb_build_object(
 'enabled',false,'bank_name','','bank_code','','bank_account','','account_name','',
 'hold_minutes',30,'report_hold_hours',24,'max_units',20,'terms_version','review-1',
 'terms_zh','匯款後請回報，由 Wu Jacky 人工核對收款並聯絡交付。逾期請先聯絡，勿直接匯款。',
 'terms_en','Report your transfer after payment. Wu Jacky checks payment and arranges delivery manually. Contact us before paying an expired order.',
 'turnstile_site_key','')) on conflict(key) do nothing;
create index if not exists checkout_metadata_prefix on public.app_settings(key text_pattern_ops);

create function private.checkout_held(p_product uuid,p_except uuid default null) returns bigint
language sql stable security definer set search_path='' as $$
 select coalesce(sum(i.quantity),0) from public.order_items i
 join public.orders o on o.id=i.order_id
 join public.app_settings s on s.key='checkout_order:'||o.id::text
 where i.product_id=p_product and (p_except is null or o.id<>p_except)
 and coalesce((s.value->>'active')::boolean,false)
 and o.status not in('cancelled','completed','refunded')
 and (o.received_amount_twd>0 or (s.value->>'hold_until')::timestamptz>now());
$$;
revoke all on function private.checkout_held(uuid,uuid) from public,anon,authenticated;

create function private.checkout_snapshot(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',o.id,'number',o.order_number::text,'status',o.status,
 'total',o.public_subtotal_twd,'received',o.received_amount_twd,'refunded',o.refund_amount_twd,
 'hold_until',s.value->>'hold_until',
 'expired',o.received_amount_twd=0 and o.status not in('completed','cancelled','refunded') and (s.value->>'hold_until')::timestamptz<=now(),
 'payment_reported',s.value ? 'payment_report','bank',s.value->'bank','terms',s.value->'terms',
 'items',(select jsonb_agg(jsonb_build_object('name',i.product_name_snapshot,'quantity',i.quantity,'unit_price',i.sale_unit_price_twd) order by i.id) from public.order_items i where i.order_id=o.id))
 from public.orders o join public.app_settings s on s.key='checkout_order:'||o.id::text where o.id=p_id;
$$;
revoke all on function private.checkout_snapshot(uuid) from public,anon,authenticated;

-- Protect reservations from every existing stock deduction route, including manual adjustments.
create function private.checkout_balance_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.quantity_on_hand<private.checkout_held(new.product_id) then
  raise check_violation using message='Stock is reserved by checkout orders';
 end if;return new;
end $$;
revoke all on function private.checkout_balance_guard() from public,anon,authenticated;
create trigger checkout_balance_guard before update of quantity_on_hand on public.inventory_balances for each row execute function private.checkout_balance_guard();

-- Checkout line/price snapshots cannot be rewritten through the older draft editor.
create function private.checkout_item_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if current_setting('wj.restoring',true)='true' and private.is_store_admin() then return coalesce(new,old);end if;
 if exists(select 1 from public.app_settings where key='checkout_order:'||old.order_id::text or key='checkout_order:'||new.order_id::text) then
  if tg_op<>'UPDATE' then raise check_violation using message='Checkout items are immutable';end if;
  if (new.order_id,new.product_id,new.quantity,new.sale_unit_price_twd,new.product_name_snapshot,new.is_inquiry_price)
   is distinct from (old.order_id,old.product_id,old.quantity,old.sale_unit_price_twd,old.product_name_snapshot,old.is_inquiry_price) then
   raise check_violation using message='Checkout items are immutable';end if;
 end if;return coalesce(new,old);
end $$;
revoke all on function private.checkout_item_guard() from public,anon,authenticated;
create trigger checkout_item_guard before insert or update or delete on public.order_items for each row execute function private.checkout_item_guard();

create function private.checkout_order_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare i record;stock integer;
begin
 if not exists(select 1 from public.app_settings where key='checkout_order:'||old.id::text) then return new;end if;
 if (new.public_subtotal_twd,new.private_adjustments_twd,new.customer_alias,new.customer_contact_private,new.customer_note,new.channel)
 is distinct from (old.public_subtotal_twd,old.private_adjustments_twd,old.customer_alias,old.customer_contact_private,old.customer_note,old.channel) then
  raise check_violation using message='Checkout buyer and price snapshots are immutable';end if;
 -- Late/partial payments must reacquire stock atomically; never silently overbook.
 if new.received_amount_twd>old.received_amount_twd and new.status not in('completed','cancelled','refunded') then
  for i in select product_id,sum(quantity) qty from public.order_items where order_id=new.id group by product_id order by product_id loop
   select quantity_on_hand into stock from public.inventory_balances where product_id=i.product_id for update;
   if stock is null or stock-private.checkout_held(i.product_id,new.id)<i.qty then raise check_violation using message='Stock unavailable; resolve received payment manually';end if;
  end loop;
 end if;return new;
end $$;
revoke all on function private.checkout_order_guard() from public,anon,authenticated;
create trigger checkout_order_guard before update on public.orders for each row execute function private.checkout_order_guard();

create function private.self_checkout(p_action text,p_payload jsonb,p_secret text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg jsonb;meta jsonb;ord public.orders;pid uuid;oid uuid;item jsonb;p public.products;
 subtotal bigint:=0;qty integer;stock integer;units integer:=0;hashed text;fingerprint text;request_uuid uuid;
 pending_count integer;until_at timestamptz;new_hold timestamptz; bank jsonb;
begin
 if p_action='throttle' then
  if coalesce(p_payload->>'fingerprint','')!~'^[a-f0-9]{64}$' then raise invalid_parameter_value;end if;
  perform pg_advisory_xact_lock(68427143);
  delete from public.app_settings where key like 'checkout_rate:%' and updated_at<now()-interval '2 minutes';
  for hashed in select unnest(array['global',p_payload->>'fingerprint']) loop
   hashed:='checkout_rate:'||hashed||':'||to_char(now(),'YYYYMMDDHH24MI');
   insert into public.app_settings(key,value) values(hashed,'{"count":1}')
   on conflict(key) do update set value=jsonb_build_object('count',(app_settings.value->>'count')::int+1),updated_at=now()
   returning (value->>'count')::int into pending_count;
   if pending_count>(case when hashed like 'checkout_rate:global:%' then 600 else 120 end) then raise sqlstate 'PT429' using message='Rate limit';end if;
  end loop;return 'true'::jsonb;
 end if;
 if p_action='config' then
  select value into cfg from public.app_settings where key='self_checkout';
  return jsonb_build_object('enabled',coalesce((cfg->>'enabled')::boolean,false),'terms_version',cfg->>'terms_version','terms_zh',cfg->>'terms_zh','terms_en',cfg->>'terms_en','turnstile_site_key',cfg->>'turnstile_site_key');
 end if;
 if p_secret is null or p_secret!~'^[a-f0-9]{64}$' then raise invalid_parameter_value using message='Invalid lookup secret';end if;
 hashed:=encode(sha256(convert_to(p_secret,'UTF8')),'hex');
 if p_action='create' then
  request_uuid:=(p_payload->>'request_id')::uuid;
  if request_uuid is null then raise invalid_parameter_value;end if;
  -- Request UUID is also the order UUID: replay requires both the same secret and payload.
  perform pg_advisory_xact_lock(hashtextextended(request_uuid::text,41));
  select value into meta from public.app_settings where key='checkout_order:'||request_uuid::text;
  fingerprint:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
  if found then
   if meta->>'secret_hash'<>hashed or meta->>'payload_hash'<>fingerprint then raise unique_violation using message='Request key conflict';end if;
   return private.checkout_snapshot(request_uuid);
  end if;
  select value into cfg from public.app_settings where key='self_checkout' for share;
  if not coalesce((cfg->>'enabled')::boolean,false) then raise sqlstate 'PT503' using message='Checkout is closed';end if;
  if p_payload->>'terms_version' is distinct from cfg->>'terms_version' or p_payload->'accepted_terms' is distinct from 'true'::jsonb then raise check_violation using message='Review the current terms';end if;
  if length(btrim(coalesce(p_payload->>'name',''))) not between 1 and 120
   or length(btrim(coalesce(p_payload->>'contact',''))) not between 3 and 500
   or length(coalesce(p_payload->>'note',''))>2000
   or coalesce(p_payload->>'contact_channel','') not in('line','email','facebook','instagram','other') then raise check_violation using message='Invalid buyer details';end if;
  if jsonb_typeof(p_payload->'items') is distinct from 'array' then raise check_violation using message='Invalid items';end if;
  if jsonb_array_length(p_payload->'items') not between 1 and 20 then raise check_violation using message='Invalid items';end if;
  -- Same-contact limit is serialized, in addition to edge-side CAPTCHA and IP rate limits.
  perform pg_advisory_xact_lock(hashtextextended(lower(btrim(p_payload->>'contact')),42));
  select count(*) into pending_count from public.orders o where o.customer_contact_private=(p_payload->>'contact_channel')||': '||btrim(p_payload->>'contact') and o.created_at>now()-interval '15 minutes';
  if pending_count>=3 then raise sqlstate 'PT429' using message='Too many orders';end if;
  if (select count(*) from jsonb_array_elements(p_payload->'items'))<>(select count(distinct x->>'id') from jsonb_array_elements(p_payload->'items') x) then raise check_violation using message='Duplicate product';end if;
  -- Lock balances in stable order. All deductions use these same row locks.
  for item in select x from jsonb_array_elements(p_payload->'items') x order by x->>'id' loop
   pid:=(item->>'id')::uuid;qty:=(item->>'qty')::integer;
   if qty is null or qty not between 1 and 99 or item->>'qty' !~ '^[0-9]+$' then raise check_violation using message='Invalid quantity';end if;
   select * into p from public.products where id=pid for share;
   if not found or not p.is_live or p.publication_status<>'published' or p.supply_status not in('available','low_stock') or p.price_is_inquiry or p.public_price_twd is null or p.public_price_twd<=0 then raise check_violation using message='Product unavailable for checkout';end if;
   if (item->>'expected_price')::integer is distinct from p.public_price_twd then raise sqlstate 'PT409' using message='Price changed; refresh the cart';end if;
   select quantity_on_hand into stock from public.inventory_balances where product_id=pid for update;
   if stock is null or stock-private.checkout_held(pid)<qty then raise check_violation using message='Insufficient available stock';end if;
   subtotal:=subtotal+qty::bigint*p.public_price_twd;units:=units+qty;
  end loop;
  if subtotal>2147483647 or units>(cfg->>'max_units')::int then raise check_violation using message='Order exceeds limit';end if;
  insert into public.orders(id,channel,status,customer_alias,customer_contact_private,customer_note,public_subtotal_twd)
  values(request_uuid,'website','pending_review',btrim(p_payload->>'name'),(p_payload->>'contact_channel')||': '||btrim(p_payload->>'contact'),coalesce(p_payload->>'note',''),subtotal) returning * into ord;
  for item in select * from jsonb_array_elements(p_payload->'items') loop
   select * into p from public.products where id=(item->>'id')::uuid;
   insert into public.order_items(order_id,product_id,product_name_snapshot,quantity,sale_unit_price_twd,unit_cost_snapshot_twd,is_inquiry_price)
   values(request_uuid,p.id,p.name_zh,(item->>'qty')::integer,p.public_price_twd,(select round(unit_cost_twd,2) from public.inventory_valuations where product_id=p.id),false);
  end loop;
  bank:=jsonb_build_object('name',cfg->>'bank_name','code',cfg->>'bank_code','account',cfg->>'bank_account','account_name',cfg->>'account_name');
  until_at:=now()+make_interval(mins=>(cfg->>'hold_minutes')::int);
  insert into public.app_settings(key,value) values('checkout_order:'||request_uuid::text,jsonb_build_object('active',true,'secret_hash',hashed,'payload_hash',fingerprint,'hold_until',until_at,'bank',bank,'terms',cfg->>'terms_version','report_hold_hours',(cfg->>'report_hold_hours')::int));
  insert into public.audit_logs(entity_type,entity_id,action,reason) values('order',request_uuid::text,'checkout_created','Buyer placed a self checkout order');
  return private.checkout_snapshot(request_uuid);
 end if;
 oid:=(p_payload->>'id')::uuid;
 select * into ord from public.orders where id=oid for update;
 select value into meta from public.app_settings where key='checkout_order:'||oid::text;
 if ord.id is null or meta is null or meta->>'secret_hash'<>hashed then raise sqlstate 'PT404' using message='Order not found';end if;
 if p_action='lookup' then return private.checkout_snapshot(oid);end if;
 if p_action='report' then
  if meta ? 'payment_report' then
   if meta->'payment_report' is distinct from p_payload->'report' then raise unique_violation using message='Report already submitted; contact seller for corrections';end if;
   return private.checkout_snapshot(oid);
  end if;
  if ord.status not in('pending_review','awaiting_payment') or (meta->>'hold_until')::timestamptz<=now() then raise check_violation using message='Order expired or closed; contact seller before payment';end if;
  if jsonb_typeof(p_payload->'report') is distinct from 'object' or coalesce(p_payload->'report'->>'last_five','')!~'^[0-9]{5}$'
   or coalesce(p_payload->'report'->>'amount','')!~'^[1-9][0-9]{0,9}$'
   or (p_payload->'report'->>'amount')::bigint>2147483647
   or (p_payload->'report'->>'paid_at')::timestamptz is null
   or (p_payload->'report'->>'paid_at')::timestamptz>now()+interval '5 minutes'
   or (p_payload->'report'->>'paid_at')::timestamptz<ord.created_at-interval '5 minutes' then raise check_violation using message='Invalid transfer report';end if;
  new_hold:=greatest((meta->>'hold_until')::timestamptz,now()+make_interval(hours=>(meta->>'report_hold_hours')::int));
  update public.app_settings set value=value||jsonb_build_object('payment_report',p_payload->'report','reported_at',now(),'hold_until',new_hold),updated_at=now() where key='checkout_order:'||oid::text;
  insert into public.audit_logs(entity_type,entity_id,action,reason) values('order',oid::text,'checkout_payment_reported','Buyer report only; payment has not been verified');
 elsif p_action='cancel' then
  if ord.status='cancelled' then return private.checkout_snapshot(oid);end if;
  if ord.received_amount_twd>0 or meta ? 'payment_report' or ord.status not in('pending_review','awaiting_payment') then raise check_violation using message='Contact seller to cancel after payment or payment report';end if;
  update public.orders set status='cancelled',cancelled_at=now(),cancellation_reason='Buyer cancelled before payment',updated_at=clock_timestamp() where id=oid;
  insert into public.audit_logs(entity_type,entity_id,action,reason) values('order',oid::text,'checkout_cancelled','Buyer cancelled before payment');
 else raise invalid_parameter_value using message='Unknown checkout action';end if;
 return private.checkout_snapshot(oid);
end $$;
revoke all on function private.self_checkout(text,jsonb,text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.self_checkout(text,jsonb,text) to service_role;
create function public.self_checkout(p_action text,p_payload jsonb,p_secret text) returns jsonb language sql security invoker set search_path='' as $$select private.self_checkout(p_action,p_payload,p_secret);$$;
revoke all on function public.self_checkout(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.self_checkout(text,jsonb,text) to service_role;

create function private.admin_checkout(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg jsonb;s public.app_settings;ord public.orders;i record;cost numeric;
begin
 if auth.uid() is null or not private.is_store_admin() then raise insufficient_privilege;end if;
 if p_action in('settings','save_settings') then
  select * into s from public.app_settings where key='self_checkout' for update;
  if p_action='settings' then return jsonb_build_object('config',s.value,'version',s.updated_at);end if;
  if (p_payload->>'version')::timestamptz is distinct from s.updated_at then raise sqlstate 'PT409' using message='Settings changed';end if;
  cfg:=p_payload->'config';
  if jsonb_typeof(cfg) is distinct from 'object' or jsonb_typeof(cfg->'enabled') is distinct from 'boolean' or (cfg->>'hold_minutes')::int not between 10 and 1440 or (cfg->>'report_hold_hours')::int not between 1 and 72 or (cfg->>'max_units')::int not between 1 and 99
   or nullif(cfg->>'hold_minutes','') is null or nullif(cfg->>'report_hold_hours','') is null or nullif(cfg->>'max_units','') is null
   or length(coalesce(cfg->>'terms_version','')) not between 1 and 80 or length(coalesce(cfg->>'terms_zh','')) not between 1 and 2000 or length(coalesce(cfg->>'terms_en','')) not between 1 and 2000 then raise check_violation using message='Invalid checkout settings';end if;
  if (cfg->>'enabled')::boolean and (length(btrim(coalesce(cfg->>'bank_name',''))) not between 1 and 100 or coalesce(cfg->>'bank_code','')!~'^[0-9]{3}$' or coalesce(cfg->>'bank_account','')!~'^[0-9]{5,20}$' or length(btrim(coalesce(cfg->>'account_name',''))) not between 1 and 100 or length(coalesce(cfg->>'turnstile_site_key','')) not between 10 and 100) then raise check_violation using message='Complete confirmed bank and CAPTCHA settings first';end if;
  update public.app_settings set value=cfg,updated_by=auth.uid(),updated_at=clock_timestamp() where key='self_checkout' returning * into s;
  insert into public.audit_logs(actor_user_id,entity_type,entity_id,action,reason) values(auth.uid(),'app_setting','self_checkout','checkout_settings_saved','Owner reviewed checkout settings');
  return jsonb_build_object('config',s.value,'version',s.updated_at);
 end if;
 select * into ord from public.orders where id=(p_payload->>'id')::uuid for update;
 select * into s from public.app_settings where key='checkout_order:'||ord.id::text;
 if ord.id is null or s.key is null then raise no_data_found;end if;
 if p_action='detail' then return jsonb_build_object('snapshot',private.checkout_snapshot(ord.id),'report',s.value->'payment_report','reported_at',s.value->>'reported_at');end if;
 if p_action<>'ready' then raise invalid_parameter_value;end if;
 if ord.status='arrived_for_check' then return private.checkout_snapshot(ord.id);end if;
 if ord.updated_at is distinct from (p_payload->>'version')::timestamptz then raise sqlstate 'PT409' using message='Order changed';end if;
 if ord.status in('cancelled','completed','refunded','refund_pending') or ord.received_amount_twd<>ord.public_subtotal_twd or ord.refund_amount_twd<>0 then raise check_violation using message='Confirm full actual payment first';end if;
 -- Unknown costs must be explicitly supplied by the owner; never invented as zero.
 for i in select * from public.order_items where order_id=ord.id order by product_id loop
  cost:=coalesce((p_payload->'costs'->>i.id::text)::numeric,i.unit_cost_snapshot_twd);
  if cost is null or cost<0 or cost>9999999999.99 or cost<>round(cost,2) then raise check_violation using message='Confirm all actual unit costs';end if;
  update public.order_items set unit_cost_snapshot_twd=cost where id=i.id;
 end loop;
 update public.orders set status='arrived_for_check',updated_at=clock_timestamp() where id=ord.id;
 insert into public.audit_logs(actor_user_id,entity_type,entity_id,action,reason) values(auth.uid(),'order',ord.id::text,'checkout_ready','Actual payment and costs verified; ready for manual delivery');
 return private.checkout_snapshot(ord.id);
end $$;
revoke all on function private.admin_checkout(text,jsonb) from public,anon;
grant execute on function private.admin_checkout(text,jsonb) to authenticated;
create function public.admin_checkout(p_action text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.admin_checkout(p_action,p_payload);$$;
revoke all on function public.admin_checkout(text,jsonb) from public,anon;
grant execute on function public.admin_checkout(text,jsonb) to authenticated;

-- Wrap the existing fulfillment implementation without replacing its ledger logic.
alter function private.admin_complete_order_and_deduct_stock(uuid,uuid) rename to complete_order_before_checkout;
create function private.admin_complete_order_and_deduct_stock(p_order_id uuid,p_idempotency_key uuid)
returns table(completed_order_id uuid,resulting_status public.order_status,movements_created integer)
language plpgsql security definer set search_path='' as $$
declare ord public.orders;i record;
begin
 if auth.uid() is null or not private.is_store_admin() then raise insufficient_privilege;end if;
 select * into ord from public.orders where id=p_order_id for update;
 if exists(select 1 from public.app_settings where key='checkout_order:'||p_order_id::text) then
  if ord.received_amount_twd<>ord.public_subtotal_twd or ord.refund_amount_twd<>0 then raise check_violation using message='Confirm full actual payment first';end if;
  perform 1 from public.inventory_balances where product_id in(select product_id from public.order_items where order_id=p_order_id) order by product_id for update;
  update public.app_settings set value=jsonb_set(value,'{active}','false'),updated_at=now() where key='checkout_order:'||p_order_id::text;
 end if;
 return query select * from private.complete_order_before_checkout(p_order_id,p_idempotency_key);
end $$;
revoke all on function private.admin_complete_order_and_deduct_stock(uuid,uuid) from public,anon;
grant execute on function private.admin_complete_order_and_deduct_stock(uuid,uuid) to authenticated;
-- Existing public SQL wrapper dependencies may stay bound to the renamed OID. Rebind explicitly.
create or replace function public.admin_complete_order_and_deduct_stock(p_order_id uuid,p_idempotency_key uuid)
returns table(completed_order_id uuid,resulting_status public.order_status,movements_created integer)
language sql security invoker set search_path='' as $$select * from private.admin_complete_order_and_deduct_stock(p_order_id,p_idempotency_key);$$;
revoke all on function private.complete_order_before_checkout(uuid,uuid) from public,anon,authenticated;
create or replace function private.storefront_catalog(p_offset integer,p_limit integer)
returns setof jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'id',p.id,'sku',p.sku,'name',p.name_zh,'name_en',p.name_en,'aliases',p.aliases,'dex',p.pokedex_number,
 'description',p.description_public,'price',case when p.price_is_inquiry then null else p.public_price_twd end,
 'status',case when p.supply_status in('available','low_stock')and b.quantity_on_hand=0 then 'sold_out' when p.supply_status in('available','low_stock')and b.quantity_on_hand>0 and(p.supply_status='low_stock'or b.quantity_on_hand<=p.low_stock_threshold)then 'low_stock'else p.supply_status::text end,
 'stock_quantity',case when p.supply_status in('available','low_stock','sold_out')then b.quantity_on_hand end,
 'is_low_stock',coalesce(p.supply_status in('available','low_stock')and b.quantity_on_hand>0 and(p.supply_status='low_stock'or b.quantity_on_hand<=p.low_stock_threshold),false),
 'first_stocked_at',p.first_stocked_at,
 'tags',coalesce((select jsonb_agg(c.name order by c.sort_order,c.id)from public.category_assignments a join public.product_categories c on c.id=a.category_id where a.product_id=p.id),'[]'::jsonb),
 'images',coalesce((select jsonb_agg(jsonb_build_object('path',i.public_path,'alt',i.alt_text)order by i.sort_order,i.id)from public.product_images i where i.product_id=p.id and i.is_approved and i.public_path is not null),'[]'::jsonb))
 from public.products p left join public.inventory_balances raw_balance on raw_balance.product_id=p.id left join lateral(select greatest(raw_balance.quantity_on_hand-private.checkout_held(p.id),0)::int quantity_on_hand)b on true
 where p.is_live and p.publication_status='published'
 order by p.manual_sort_order,p.id limit least(greatest(coalesce(p_limit,100),1),100)offset least(greatest(coalesce(p_offset,0),0),20000);
$$;

commit;
