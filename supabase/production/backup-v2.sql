alter table private.app_saved_backups alter column actor_user_id drop not null;
create or replace function private.normalize_backup(d jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare t text;o jsonb;payments jsonb:='[]';existing jsonb;begin
 if d->>'format'<>'wu-jacky-app-backup' or d->>'project'<>'wlrwlqchlxehlvkyesnj' or d->>'version' not in ('1','2') then raise invalid_parameter_value using message='Unsupported backup project or version';end if;
 if d->>'version'='1' then
  if (select count(*)from jsonb_object_keys(d->'data'))<>14 then raise invalid_parameter_value using message='Legacy backup table list mismatch';end if;
  foreach t in array array['order_payments','inventory_valuations','valuation_events']loop d:=jsonb_set(d,array['data',t],'[]');end loop;
  d:=jsonb_set(d,'{data,orders}',coalesce((select jsonb_agg(jsonb_build_object('refund_resume_status',null)||j)from jsonb_array_elements(d->'data'->'orders')j),'[]'));
  d:=jsonb_set(d,'{data,purchase_batches}',coalesce((select jsonb_agg(jsonb_build_object('updated_at',null,'cancelled_at',null,'cancellation_reason','')||j)from jsonb_array_elements(d->'data'->'purchase_batches')j),'[]'));
  d:=jsonb_set(d,'{data,expenses}',coalesce((select jsonb_agg(jsonb_build_object('voided_at',null,'void_reason','')||j)from jsonb_array_elements(d->'data'->'expenses')j),'[]'));
  -- Preserve existing detailed entries. For lost legacy orders, retain only the
  -- historical aggregate facts; never invent individual transfers or dates.
  for o in select * from jsonb_array_elements(d->'data'->'orders') loop
   select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at,p.id),'[]') into existing from public.order_payments p where p.order_id=(o->>'id')::uuid;
   if jsonb_array_length(existing)>0 then payments:=payments||existing;
   else
    if coalesce((o->>'received_amount_twd')::int,0)>0 then
     payments:=payments||jsonb_build_array(to_jsonb(jsonb_populate_record(null::public.order_payments,jsonb_build_object('id',md5('wj-legacy-receipt:'||(o->>'id'))::uuid,'order_id',o->>'id','kind','receipt','amount_twd',o->'received_amount_twd','occurred_at',o->'received_at','reference_private',coalesce(o->>'payment_reference_private',''),'reason','舊版備份收款彙總；未補填未知交易資訊','legacy',true,'void_reason','','actor_user_id',o->'created_by','created_at',o->'created_at'))));
    end if;
    if coalesce((o->>'refund_amount_twd')::int,0)>0 then
     payments:=payments||jsonb_build_array(to_jsonb(jsonb_populate_record(null::public.order_payments,jsonb_build_object('id',md5('wj-legacy-refund:'||(o->>'id'))::uuid,'order_id',o->>'id','kind','refund','amount_twd',o->'refund_amount_twd','occurred_at',o->'refund_recorded_at','reference_private',coalesce(o->>'refund_reference_private',''),'reason','舊版備份退款彙總；營收歸屬待確認','legacy',true,'void_reason','','actor_user_id',o->'created_by','created_at',o->'created_at'))));
    end if;
   end if;
  end loop;
  d:=jsonb_set(d,'{data,order_payments}',payments);
  d:=jsonb_set(d,'{version}','2');
 end if;return d;
end $$;
revoke all on function private.normalize_backup(jsonb)from public,anon,authenticated;
create or replace function private.backup_rows(p_schema text,p_table text)returns jsonb language plpgsql stable set search_path='' as $$
declare extras text;result jsonb;begin
 select string_agg(format('%L,t.%I::text',column_name,column_name),',')into extras from information_schema.columns where table_schema=p_schema and table_name=p_table and data_type in ('numeric','bigint');
 execute format('select coalesce(jsonb_agg(to_jsonb(t)%s order by to_jsonb(t)::text),''[]''::jsonb)from %I.%I t',case when extras is null then '' else '||jsonb_build_object('||extras||')'end,p_schema,p_table)into result;return result;
end $$;
create or replace function private.app_backup_data()returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb:='{}';t text;begin
 foreach t in array array['product_categories','products','category_assignments','product_images','purchase_batches','orders','order_items','inventory_balances','inventory_movements','expenses','app_settings','audit_logs','store_operation_requests','app_io_requests','order_payments','inventory_valuations','valuation_events']loop
  d:=d||jsonb_build_object(t,private.backup_rows(case when t in ('store_operation_requests','app_io_requests')then 'private'else 'public'end,t));
 end loop;return d;
end $$;
create or replace function private.backup_schema_description()returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',2,'tables',(select jsonb_agg(to_jsonb(c))from information_schema.columns c where c.table_schema in ('public','private')),'constraints',(select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid)))from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in ('public','private')),'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'definition',pg_get_functiondef(p.oid)))from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')and p.prokind='f'),'policies',(select jsonb_agg(to_jsonb(p))from pg_policies p where p.schemaname in ('public','private','storage')),'indexes',(select jsonb_agg(to_jsonb(i))from pg_indexes i where i.schemaname in ('public','private')),'triggers',(select jsonb_agg(pg_get_triggerdef(t.oid))from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')and not t.tgisinternal));
$$;
create or replace function private.system_backup_document()returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('format','wu-jacky-app-backup','version',2,'project','wlrwlqchlxehlvkyesnj','created_at',now(),'schema',private.backup_schema_description(),'data',private.app_backup_data());
$$;
create or replace function private.app_backup_document()returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if auth.uid() is null or not private.is_store_admin()then raise insufficient_privilege using message='Administrator required';end if;return private.system_backup_document();end $$;
revoke all on function private.backup_rows(text,text),private.app_backup_data(),private.backup_schema_description(),private.system_backup_document()from public,anon,authenticated;
