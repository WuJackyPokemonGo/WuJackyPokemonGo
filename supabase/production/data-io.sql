-- Functions recovered from the deployed project on 2026-10-22, with request receipt lookup added.
-- Requires the existing production schema including private.app_io_requests and
-- private.app_saved_backups. This is not a database/schema bootstrap script.
-- Existing CREATE OR REPLACE calls preserve production ACLs.

CREATE OR REPLACE FUNCTION private.admin_io(p_action text, p_payload jsonb DEFAULT '{}'::jsonb, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();prior private.app_io_requests;hash text;result jsonb;document jsonb;plan jsonb;name text;schema_name text;backup_id uuid;row_value jsonb;pid uuid;expected jsonb;existing public.products;category_ids uuid[];category_name text;category_id uuid;values_json jsonb;inserted integer:=0;updated integer:=0;skipped integer:=0;count_changed integer;rows_count integer;sequence_name text;sequence_value bigint;maximum bigint;allowed text[]:=array['product_categories','products','category_assignments','product_images','purchase_batches','orders','order_items','inventory_balances','inventory_movements','expenses','app_settings','audit_logs','store_operation_requests','app_io_requests'];
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
  if exists(select 1 from jsonb_array_elements(p_payload->'rows') r group by r->'values'->>'sku' having count(*)>1) then raise unique_violation using message='Duplicate import SKU'; end if;
  -- Lock stable SKU order and verify the exact versions approved in the preview.
  for row_value in select * from jsonb_array_elements(p_payload->'rows') r order by r->'values'->>'sku' loop
   select * into existing from public.products where sku=row_value->'values'->>'sku' for update;
   if found then
    if existing.id is distinct from (row_value->'expected'->>'id')::uuid or existing.updated_at is distinct from (row_value->'expected'->>'updated_at')::timestamptz then raise sqlstate 'PT409' using message='Import preview is outdated; reload and preview again'; end if;
   elsif row_value->'expected'->>'id' is not null then raise sqlstate 'PT409' using message='Import product no longer exists'; end if;
  end loop;
  document:=private.app_backup_document();
  insert into private.app_saved_backups(actor_user_id,label,document) values(actor,'批次匯入前自動備份',document) returning id into backup_id;
  for row_value in select * from jsonb_array_elements(p_payload->'rows') r order by r->'values'->>'sku' loop
   values_json:=row_value->'values';select * into existing from public.products where sku=values_json->>'sku' for update;
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
  document:=p_payload->'document';plan:=private.app_restore_plan(document,true);
  if not (plan->>'can_restore')::boolean then raise sqlstate 'PT409' using message='Restore conflicts with existing data; nothing was overwritten'; end if;
  insert into private.app_saved_backups(actor_user_id,label,document) values(actor,'資料補回前自動備份',private.app_backup_document()) returning id into backup_id;
  foreach name in array allowed loop
   schema_name:=case when name in ('store_operation_requests','app_io_requests') then 'private' else 'public' end;
   execute format('insert into %I.%I overriding system value select * from jsonb_populate_recordset(null::%I.%I,$1) on conflict do nothing',schema_name,name,schema_name,name) using document->'data'->name;
   get diagnostics count_changed=row_count;inserted:=inserted+count_changed;
  end loop;
  plan:=private.app_restore_plan(document,true);
  if not (plan->>'can_restore')::boolean or (plan->>'missing')::integer<>0 then raise sqlstate 'PT409' using message='Restore changed concurrently or contains duplicate conflicting keys'; end if;
  if exists(select 1 from public.inventory_balances b left join lateral(select coalesce(sum(m.quantity_delta),0) qty from public.inventory_movements m where m.product_id=b.product_id) l on true where b.quantity_on_hand<>l.qty) then raise check_violation using message='Inventory ledger reconciliation failed; restore rolled back'; end if;
  if exists(select 1 from public.orders o where o.refund_amount_twd>o.received_amount_twd) then raise check_violation using message='Refund reconciliation failed'; end if;
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


CREATE OR REPLACE FUNCTION private.app_backup_data()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select jsonb_build_object(
'product_categories',coalesce((select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from public.product_categories t),'[]'::jsonb),
'products',coalesce((select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from public.products t),'[]'::jsonb),
'category_assignments',coalesce((select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from public.category_assignments t),'[]'::jsonb),
'product_images',coalesce((select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from public.product_images t),'[]'::jsonb),
'purchase_batches',coalesce((select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from public.purchase_batches t),'[]'::jsonb),
'orders',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('order_number',t.order_number::text) order by to_jsonb(t)::text) from public.orders t),'[]'::jsonb),
'order_items',coalesce((select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from public.order_items t),'[]'::jsonb),
'inventory_balances',coalesce((select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from public.inventory_balances t),'[]'::jsonb),
'inventory_movements',coalesce((select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from public.inventory_movements t),'[]'::jsonb),
'expenses',coalesce((select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from public.expenses t),'[]'::jsonb),
'app_settings',coalesce((select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from public.app_settings t),'[]'::jsonb),
'audit_logs',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('id',t.id::text) order by to_jsonb(t)::text) from public.audit_logs t),'[]'::jsonb),
'store_operation_requests',coalesce((select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from private.store_operation_requests t),'[]'::jsonb),
'app_io_requests',coalesce((select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from private.app_io_requests t),'[]'::jsonb));
$function$


CREATE OR REPLACE FUNCTION private.app_backup_document()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not private.is_store_admin() then raise insufficient_privilege using message='Administrator required'; end if;
 return jsonb_build_object('format','wu-jacky-app-backup','version',1,'project','wlrwlqchlxehlvkyesnj','created_at',now(),'data',private.app_backup_data());
end; $function$


CREATE OR REPLACE FUNCTION private.app_restore_plan(p_document jsonb, p_lock boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare name text;schema_name text;row_value jsonb;normalized jsonb;existing jsonb;predicate text;columns_count integer;key_count integer;total integer:=0;missing integer:=0;same_count integer:=0;conflicts jsonb:='[]';summary jsonb:='{}';table_missing integer;table_same integer;table_conflict integer;
allowed text[]:=array['product_categories','products','category_assignments','product_images','purchase_batches','orders','order_items','inventory_balances','inventory_movements','expenses','app_settings','audit_logs','store_operation_requests','app_io_requests'];
begin
 if p_document->>'format' is distinct from 'wu-jacky-app-backup' or p_document->>'version' is distinct from '1' or p_document->>'project' is distinct from 'wlrwlqchlxehlvkyesnj' or jsonb_typeof(p_document->'data') is distinct from 'object' or octet_length(p_document::text)>16777216 then raise invalid_parameter_value using message='Unsupported backup format, project, version or size'; end if;
 if (select count(*) from jsonb_object_keys(p_document->'data'))<>cardinality(allowed) or exists(select 1 from jsonb_object_keys(p_document->'data') k where k<>all(allowed)) then raise invalid_parameter_value using message='Backup table list does not match this version'; end if;
 foreach name in array allowed loop
  schema_name:=case when name in ('store_operation_requests','app_io_requests') then 'private' else 'public' end;
  if jsonb_typeof(p_document->'data'->name) is distinct from 'array' then raise invalid_parameter_value using message='Backup table is not an array'; end if;
  select count(*) into columns_count from information_schema.columns where table_schema=schema_name and table_name=name;
  select string_agg(format('(to_jsonb(t)->>%L) = ($1->>%L)',a.attname,a.attname),' and ' order by k.ord),count(*) into predicate,key_count
  from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace
  cross join lateral unnest(i.indkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=c.oid and a.attnum=k.num
  where i.indisprimary and n.nspname=schema_name and c.relname=name;
  if predicate is null then raise invalid_parameter_value using message='Missing backup primary key'; end if;
  table_missing:=0;table_same:=0;table_conflict:=0;
  for row_value in select * from jsonb_array_elements(p_document->'data'->name) loop
   total:=total+1;if total>50000 then raise invalid_parameter_value using message='Backup exceeds 50000 records'; end if;
   if jsonb_typeof(row_value) is distinct from 'object' or (select count(*) from jsonb_object_keys(row_value))<>columns_count or exists(select 1 from jsonb_object_keys(row_value) k where not exists(select 1 from information_schema.columns c where c.table_schema=schema_name and c.table_name=name and c.column_name=k)) then raise invalid_parameter_value using message='Backup columns do not match current schema'; end if;
   execute format('select to_jsonb(jsonb_populate_record(null::%I.%I,$1))',schema_name,name) into normalized using row_value;
   execute format('select to_jsonb(t) from %I.%I t where %s%s',schema_name,name,predicate,case when p_lock then ' for share' else '' end) into existing using normalized;
   if existing is null then table_missing:=table_missing+1;
   elsif existing=normalized then table_same:=table_same+1;
   else table_conflict:=table_conflict+1;if jsonb_array_length(conflicts)<100 then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('table',name,'id',coalesce(row_value->>'id',row_value->>'product_id',row_value->>'key'),'reason','Existing record differs'));end if;
   end if;
  end loop;
  summary:=summary||jsonb_build_object(name,jsonb_build_object('missing',table_missing,'same',table_same,'conflicts',table_conflict));missing:=missing+table_missing;same_count:=same_count+table_same;
 end loop;
 return jsonb_build_object('tables',summary,'missing',missing,'same',same_count,'conflicts',conflicts,'can_restore',not exists(select 1 from jsonb_each(summary) e where (e.value->>'conflicts')::integer>0));
end; $function$


CREATE OR REPLACE FUNCTION public.admin_backup_document()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$select private.app_backup_document();$function$


CREATE OR REPLACE FUNCTION public.admin_data_io(p_action text, p_payload jsonb DEFAULT '{}'::jsonb, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.admin_io(p_action,p_payload,p_request_id);$function$


-- Explicit privileges for reconstructing these function definitions on the existing schema.
revoke all on function private.app_backup_data() from public, anon, authenticated;
revoke all on function private.app_restore_plan(jsonb,boolean) from public, anon, authenticated;
revoke all on function private.app_backup_document() from public, anon;
revoke all on function private.admin_io(text,jsonb,uuid) from public, anon;
revoke all on function public.admin_backup_document() from public, anon;
revoke all on function public.admin_data_io(text,jsonb,uuid) from public, anon;
grant execute on function private.app_backup_document(), private.admin_io(text,jsonb,uuid), public.admin_backup_document(), public.admin_data_io(text,jsonb,uuid) to authenticated;
