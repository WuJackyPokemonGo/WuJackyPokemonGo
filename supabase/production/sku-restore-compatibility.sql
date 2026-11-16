-- Based on the *live* private.admin_io function as of 2026-11-16, not an older repo snapshot.
-- Apply after sku-auto-number.sql. Live already supports multiple new CSV rows and
-- duplicate expected product IDs; preserve those fixes. Restore missing older rows
-- with auto-assigned SKUs, advancing past historic restored numbers.
CREATE OR REPLACE FUNCTION private.admin_io(p_action text, p_payload jsonb DEFAULT '{}'::jsonb, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();prior private.app_io_requests;hash text;result jsonb;document jsonb;plan jsonb;name text;schema_name text;backup_id uuid;row_value jsonb;pid uuid;expected jsonb;existing public.products;category_ids uuid[];category_name text;category_id uuid;values_json jsonb;inserted integer:=0;updated integer:=0;skipped integer:=0;count_changed integer;rows_count integer;sequence_name text;sequence_value bigint;maximum bigint;allowed text[]:=array['product_categories','products','category_assignments','product_images','purchase_batches','orders','order_items','inventory_balances','inventory_movements','expenses','app_settings','audit_logs','store_operation_requests','app_io_requests','order_payments','inventory_valuations','valuation_events'];
begin
 if actor is null or not private.is_store_admin() then raise insufficient_privilege using message='Administrator required'; end if;
 if p_action='request_status' then
  select r.result into result from private.app_io_requests r where r.id=(p_payload->>'id')::uuid and r.actor_user_id=actor;
  return jsonb_build_object('applied',found,'result',result);
 elsif p_action='backup_list' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'label',b.label,'created_at',b.created_at) order by b.created_at desc) from (select id,label,created_at from private.app_saved_backups order by created_at desc limit 30) b),'[]'::jsonb);
 elsif p_action='backup_get' then
  select b.document into result from private.app_saved_backups b where b.id=(p_payload->>'id')::uuid;
  if not found then raise no_data_found using message='Backup not found'; end if;return result;
 elsif p_action='restore_preview' then return private.app_restore_plan(p_payload->'document');
 end if;
 if p_action not in ('import_products','restore_missing') or p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' then raise invalid_parameter_value using message='Invalid IO action'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 hash:=md5(p_payload::text);
 select * into prior from private.app_io_requests where id=p_request_id;
 if found then
  if prior.actor_user_id<>actor or prior.kind<>p_action or prior.payload_hash<>hash then raise unique_violation using message='IO request key reused'; end if;
  return prior.result;
 end if;
 if p_action='import_products' then
  if jsonb_typeof(p_payload->'rows') is distinct from 'array' or jsonb_array_length(p_payload->'rows') not between 1 and 1000 or octet_length(p_payload::text)>2097152 then raise invalid_parameter_value using message='Import requires 1 to 1000 rows, maximum 2 MB'; end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'rows') r where nullif(btrim(r->'values'->>'sku'),'') is not null group by btrim(r->'values'->>'sku') having count(*)>1) then raise unique_violation using message='Duplicate import SKU'; end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'rows') r where nullif(r->'expected'->>'id','') is not null group by r->'expected'->>'id' having count(*)>1) then raise unique_violation using message='Duplicate import product ID'; end if;
  -- Lock stable SKU order and verify the exact versions approved in the preview.
  for row_value in select * from jsonb_array_elements(p_payload->'rows') r order by coalesce(r->'expected'->>'id',r->'values'->>'sku','') loop
   select p.* into existing from public.products p where case when nullif(row_value->'expected'->>'id','') is not null then p.id=(row_value->'expected'->>'id')::uuid else p.sku=nullif(btrim(row_value->'values'->>'sku'),'') end for update;
   if found then
    if existing.id is distinct from (row_value->'expected'->>'id')::uuid or existing.updated_at is distinct from (row_value->'expected'->>'updated_at')::timestamptz then raise sqlstate 'PT409' using message='Import preview is outdated; reload and preview again'; end if;
   elsif row_value->'expected'->>'id' is not null then raise sqlstate 'PT409' using message='Import product no longer exists'; end if;
  end loop;
  document:=private.app_backup_document();
  insert into private.app_saved_backups(actor_user_id,label,document) values(actor,'批次匯入前自動備份',document) returning id into backup_id;
  for row_value in select * from jsonb_array_elements(p_payload->'rows') r order by coalesce(r->'expected'->>'id',r->'values'->>'sku','') loop
   values_json:=row_value->'values';select p.* into existing from public.products p where case when nullif(row_value->'expected'->>'id','') is not null then p.id=(row_value->'expected'->>'id')::uuid else p.sku=nullif(btrim(values_json->>'sku'),'') end for update;
   pid:=case when found then existing.id else null end;
   if existing.is_live and not coalesce((p_payload->>'allow_live_updates')::boolean,false) then raise check_violation using message='Published product changes require explicit confirmation'; end if;
   if jsonb_typeof(row_value->'categories') is distinct from 'array' or jsonb_array_length(row_value->'categories')>30 then raise check_violation using message='Invalid import categories'; end if;
   category_ids:='{}';
   for category_name in select distinct btrim(value) from jsonb_array_elements_text(row_value->'categories') loop
    if category_name='' or length(category_name)>60 then raise check_violation using message='Invalid category name'; end if;
    insert into public.product_categories(name) values(category_name) on conflict(name) do nothing;
    select c.id into category_id from public.product_categories c where c.name=category_name;category_ids:=array_append(category_ids,category_id);
   end loop;
   -- Imports never change the live flag or inventory; new rows start non-public.
   values_json:=values_json-'is_live';
   perform private.admin_save_catalog_product(pid,case when pid is not null then existing.updated_at else null end,values_json,category_ids);
   if pid is null then inserted:=inserted+1;else updated:=updated+1;end if;
  end loop;
  result:=jsonb_build_object('inserted',inserted,'updated',updated,'backup_id',backup_id);
 elsif p_action='restore_missing' then
  document:=private.normalize_backup(p_payload->'document');plan:=private.app_restore_plan(document,true);
  if not (plan->>'can_restore')::boolean then raise sqlstate 'PT409' using message='Restore conflicts with existing data; nothing was overwritten'; end if;
  insert into private.app_saved_backups(actor_user_id,label,document) values(actor,'資料補回前自動備份',private.app_backup_document()) returning id into backup_id;
  perform set_config('wj.restoring','true',true);
  foreach name in array allowed loop
   schema_name:=case when name in ('store_operation_requests','app_io_requests') then 'private' else 'public' end;
   execute format('insert into %I.%I overriding system value select * from jsonb_populate_recordset(null::%I.%I,$1) on conflict do nothing',schema_name,name,schema_name,name) using document->'data'->name;
   get diagnostics count_changed=row_count;inserted:=inserted+count_changed;
  end loop;
  perform set_config('wj.restoring','false',true);
  plan:=private.app_restore_plan(document,true);
  if not (plan->>'can_restore')::boolean or (plan->>'missing')::integer<>0 then raise sqlstate 'PT409' using message='Restore changed concurrently or contains duplicate conflicting keys'; end if;
  -- Validate backup rows before enrichment; old snapshots can have null SKUs.
  if exists(select 1 from public.products where sku is not null and sku !~ '^WJ-[0-9]{4,15}
  if exists(select 1 from public.inventory_balances b left join lateral(select coalesce(sum(m.quantity_delta),0) qty from public.inventory_movements m where m.product_id=b.product_id) l on true where b.quantity_on_hand<>l.qty) then raise check_violation using message='Inventory ledger reconciliation failed; restore rolled back'; end if;
  if exists(select 1 from public.orders o where o.refund_amount_twd>o.received_amount_twd) then raise check_violation using message='Refund reconciliation failed'; end if;
  if exists(select 1 from public.orders o where o.received_amount_twd<>(select coalesce(sum(p.amount_twd),0) from public.order_payments p where p.order_id=o.id and p.kind='receipt' and p.voided_at is null) or o.refund_amount_twd<>(select coalesce(sum(p.amount_twd),0) from public.order_payments p where p.order_id=o.id and p.kind='refund' and p.voided_at is null)) then raise check_violation using message='Payment ledger reconciliation failed; restore rolled back';end if;
  -- Never reuse historical order/audit numbers; advance, never decrease, sequences.
  foreach name in array array['orders','audit_logs'] loop
   sequence_name:=pg_get_serial_sequence('public.'||name,case when name='orders' then 'order_number' else 'id' end);
   execute format('select last_value from %s',sequence_name) into sequence_value;
   execute format('select coalesce(max(%I),0) from public.%I',case when name='orders' then 'order_number' else 'id' end,name) into maximum;
   if maximum>sequence_value then perform setval(sequence_name::regclass,maximum,true);end if;
  end loop;
  result:=jsonb_build_object('inserted',inserted,'backup_id',backup_id,'mode','missing_only');
 end if;
 insert into public.audit_logs(actor_user_id,entity_type,entity_id,action,reason,after_data) values(actor,'data_io',p_request_id::text,p_action,'管理員確認資料預覽後執行',result);
 insert into private.app_io_requests(id,actor_user_id,kind,payload_hash,result) values(p_request_id,actor,p_action,hash,result);
 return result;
end; $function$
) then
    raise check_violation using message='Restore contains unsupported legacy product SKU';
  end if;
  -- Advance before filling old null SKUs so restored historic numbers are not reused.
  select coalesce(max(substring(sku from 4)::bigint),0) into maximum
    from public.products where sku ~ '^WJ-[0-9]{4,15}
  if exists(select 1 from public.inventory_balances b left join lateral(select coalesce(sum(m.quantity_delta),0) qty from public.inventory_movements m where m.product_id=b.product_id) l on true where b.quantity_on_hand<>l.qty) then raise check_violation using message='Inventory ledger reconciliation failed; restore rolled back'; end if;
  if exists(select 1 from public.orders o where o.refund_amount_twd>o.received_amount_twd) then raise check_violation using message='Refund reconciliation failed'; end if;
  if exists(select 1 from public.orders o where o.received_amount_twd<>(select coalesce(sum(p.amount_twd),0) from public.order_payments p where p.order_id=o.id and p.kind='receipt' and p.voided_at is null) or o.refund_amount_twd<>(select coalesce(sum(p.amount_twd),0) from public.order_payments p where p.order_id=o.id and p.kind='refund' and p.voided_at is null)) then raise check_violation using message='Payment ledger reconciliation failed; restore rolled back';end if;
  -- Never reuse historical order/audit numbers; advance, never decrease, sequences.
  foreach name in array array['orders','audit_logs'] loop
   sequence_name:=pg_get_serial_sequence('public.'||name,case when name='orders' then 'order_number' else 'id' end);
   execute format('select last_value from %s',sequence_name) into sequence_value;
   execute format('select coalesce(max(%I),0) from public.%I',case when name='orders' then 'order_number' else 'id' end,name) into maximum;
   if maximum>sequence_value then perform setval(sequence_name::regclass,maximum,true);end if;
  end loop;
  result:=jsonb_build_object('inserted',inserted,'backup_id',backup_id,'mode','missing_only');
 end if;
 insert into public.audit_logs(actor_user_id,entity_type,entity_id,action,reason,after_data) values(actor,'data_io',p_request_id::text,p_action,'管理員確認資料預覽後執行',result);
 insert into private.app_io_requests(id,actor_user_id,kind,payload_hash,result) values(p_request_id,actor,p_action,hash,result);
 return result;
end; $function$
;
  select last_value into sequence_value from private.product_sku_seq;
  if maximum>=sequence_value then
    perform setval('private.product_sku_seq'::regclass,maximum+1,false);
  end if;
  update public.products set sku=null where sku is null;
  if exists(select 1 from public.products where sku is null) then
    raise check_violation using message='Restored product SKU backfill incomplete';
  end if;
  if exists(select 1 from public.inventory_balances b left join lateral(select coalesce(sum(m.quantity_delta),0) qty from public.inventory_movements m where m.product_id=b.product_id) l on true where b.quantity_on_hand<>l.qty) then raise check_violation using message='Inventory ledger reconciliation failed; restore rolled back'; end if;
  if exists(select 1 from public.orders o where o.refund_amount_twd>o.received_amount_twd) then raise check_violation using message='Refund reconciliation failed'; end if;
  if exists(select 1 from public.orders o where o.received_amount_twd<>(select coalesce(sum(p.amount_twd),0) from public.order_payments p where p.order_id=o.id and p.kind='receipt' and p.voided_at is null) or o.refund_amount_twd<>(select coalesce(sum(p.amount_twd),0) from public.order_payments p where p.order_id=o.id and p.kind='refund' and p.voided_at is null)) then raise check_violation using message='Payment ledger reconciliation failed; restore rolled back';end if;
  -- Never reuse historical order/audit numbers; advance, never decrease, sequences.
  foreach name in array array['orders','audit_logs'] loop
   sequence_name:=pg_get_serial_sequence('public.'||name,case when name='orders' then 'order_number' else 'id' end);
   execute format('select last_value from %s',sequence_name) into sequence_value;
   execute format('select coalesce(max(%I),0) from public.%I',case when name='orders' then 'order_number' else 'id' end,name) into maximum;
   if maximum>sequence_value then perform setval(sequence_name::regclass,maximum,true);end if;
  end loop;
  result:=jsonb_build_object('inserted',inserted,'backup_id',backup_id,'mode','missing_only');
 end if;
 insert into public.audit_logs(actor_user_id,entity_type,entity_id,action,reason,after_data) values(actor,'data_io',p_request_id::text,p_action,'管理員確認資料預覽後執行',result);
 insert into private.app_io_requests(id,actor_user_id,kind,payload_hash,result) values(p_request_id,actor,p_action,hash,result);
 return result;
end; $function$

