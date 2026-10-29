-- User-requested optional product SKU. Existing values and uniqueness are retained.
-- UUID product IDs continue to identify links, stock and CSV updates.
begin;
alter table public.products alter column sku drop not null;
CREATE OR REPLACE FUNCTION private.admin_save_catalog_product(p_id uuid, p_expected_updated_at timestamp with time zone, p_values jsonb, p_category_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_before jsonb; v_after public.products; v_aliases text[]; v_category uuid; v_price integer;
begin
 if not private.is_store_admin() then raise insufficient_privilege using message='Administrator required'; end if;
 if jsonb_typeof(p_values) is distinct from 'object' or nullif(btrim(p_values->>'name_zh'),'') is null then raise check_violation using message='Product name required'; end if;
 if length(p_values->>'sku')>80 or length(p_values->>'name_zh')>100 or length(coalesce(p_values->>'name_en',''))>100 or length(coalesce(p_values->>'description_public',''))>1000 then raise check_violation using message='Product text too long'; end if;
 if p_category_ids is null or cardinality(p_category_ids)>30 then raise check_violation using message='Invalid categories'; end if;
 if jsonb_typeof(p_values->'aliases') is distinct from 'array' or jsonb_array_length(p_values->'aliases')>30 then raise check_violation using message='Invalid aliases'; end if;
 if exists(select 1 from jsonb_array_elements(p_values->'aliases') a where jsonb_typeof(a) <> 'string' or length(a#>>'{}')>100) then raise check_violation using message='Invalid alias'; end if;
 select coalesce(array_agg(distinct btrim(value)) filter(where btrim(value)<>''),'{}') into v_aliases from jsonb_array_elements_text(p_values->'aliases');
 v_price:=(p_values->>'public_price_twd')::integer;
 if v_price<0 or (p_values->>'manual_sort_order')::integer<0 or (p_values->>'low_stock_threshold')::integer<0 or (p_values->>'pokedex_number')::integer<1 then raise check_violation using message='Invalid numeric value'; end if;
 -- Lock categories before checking them, preventing concurrent deletion from losing assignments.
 foreach v_category in array p_category_ids loop
  perform 1 from public.product_categories where id=v_category for key share;
  if not found then raise foreign_key_violation using message='Unknown category'; end if;
 end loop;
 if p_id is null then
  insert into public.products(sku,name_zh) values(nullif(btrim(p_values->>'sku'),''),btrim(p_values->>'name_zh')) returning id into v_id;
 else
  select to_jsonb(p) into v_before from public.products p where id=p_id for update;
  if not found or (v_before->>'updated_at')::timestamptz is distinct from p_expected_updated_at then raise sqlstate 'PT409' using message='Product modified on another device'; end if;
  v_id:=p_id;
 end if;
 update public.products set sku=nullif(btrim(p_values->>'sku'),''), name_zh=btrim(p_values->>'name_zh'),name_en=coalesce(p_values->>'name_en',''),
 aliases=v_aliases,pokedex_number=(p_values->>'pokedex_number')::integer,description_public=coalesce(p_values->>'description_public',''),
 public_price_twd=v_price,price_is_inquiry=(v_price is null),publication_status=(p_values->>'publication_status')::public.product_publication_status,
 supply_status=(p_values->>'supply_status')::public.product_supply_status,manual_sort_order=coalesce((p_values->>'manual_sort_order')::integer,0),
 is_live=case when p_values ? 'is_live' then (p_values->>'is_live')::boolean else is_live end, low_stock_threshold=coalesce((p_values->>'low_stock_threshold')::integer,3), first_stocked_at=(p_values->>'first_stocked_at')::timestamptz
 where id=v_id returning * into v_after;
 delete from public.category_assignments where product_id=v_id;
 insert into public.category_assignments(product_id,category_id) select v_id,id from (select distinct unnest(p_category_ids) id) q;
 insert into public.audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data)
 values(auth.uid(),'product',v_id::text,'catalog_save',v_before,to_jsonb(v_after)||jsonb_build_object('category_ids',p_category_ids));
 return jsonb_build_object('id',v_id,'updated_at',v_after.updated_at);
end; $function$
;
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
commit;

