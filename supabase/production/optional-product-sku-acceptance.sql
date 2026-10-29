begin;
do $qa$
declare actor uuid;v jsonb;one jsonb;two jsonb;pid uuid;version timestamptz;payload jsonb;result jsonb;request uuid:=gen_random_uuid();marker text:='OPTIONAL-SKU-QA-'||gen_random_uuid()::text;
begin
 perform set_config('request.jwt.claim.sub','',true);
 v:=jsonb_build_object('sku',null,'name_zh',marker,'name_en','','aliases','[]'::jsonb,'publication_status','draft','supply_status','inquiry_only','is_live',false);
 begin
  perform public.admin_save_catalog_product(null,null,v,'{}'::uuid[]);
  raise exception 'QA failed: anonymous save allowed';
 exception when insufficient_privilege then null; end;
 select user_id into actor from public.admin_profiles order by created_at limit 1;
 if actor is null then raise exception 'QA requires an existing owner profile'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 one:=public.admin_save_catalog_product(null,null,v,'{}'::uuid[]);
 two:=public.admin_save_catalog_product(null,null,v||jsonb_build_object('sku','  ','name_zh',marker||'2'),'{}'::uuid[]);
 if (select count(*) from public.products where id in ((one->>'id')::uuid,(two->>'id')::uuid) and sku is null)<>2 then raise exception 'QA failed: two null SKUs'; end if;
 pid:=(one->>'id')::uuid;select updated_at into version from public.products where id=pid;
 one:=public.admin_save_catalog_product(pid,version,v||jsonb_build_object('sku',marker),'{}'::uuid[]);
 begin
  select updated_at into version from public.products where id=(two->>'id')::uuid;
  perform public.admin_save_catalog_product((two->>'id')::uuid,version,v||jsonb_build_object('sku',marker),'{}'::uuid[]);
  raise exception 'QA failed: duplicate nonblank SKU allowed';
 exception when unique_violation then null; end;
 select updated_at into version from public.products where id=pid;
 perform public.admin_save_catalog_product(pid,version,v||jsonb_build_object('sku',''),'{}'::uuid[]);
 if (select sku is not null from public.products where id=pid) then raise exception 'QA failed: clear SKU'; end if;
 payload:=jsonb_build_object('rows',jsonb_build_array(
 jsonb_build_object('values',v||jsonb_build_object('name_zh',marker||'3'),'categories','[]'::jsonb,'expected',null),
 jsonb_build_object('values',v||jsonb_build_object('name_zh',marker||'4'),'categories','[]'::jsonb,'expected',null)),'allow_live_updates',false);
 result:=public.admin_data_io('import_products',payload,request);
 if (result->>'inserted')::int<>2 then raise exception 'QA failed: CSV creates without SKU'; end if;
 if public.admin_data_io('import_products',payload,request)<>result then raise exception 'QA failed: import idempotency'; end if;
 select updated_at into version from public.products where id=pid;
 payload:=jsonb_build_object('rows',jsonb_build_array(jsonb_build_object('values',v||jsonb_build_object('name_zh',marker||'EDIT'),'categories','[]'::jsonb,'expected',jsonb_build_object('id',pid,'updated_at',version))),'allow_live_updates',false);
 result:=public.admin_data_io('import_products',payload,gen_random_uuid());
 if (result->>'updated')::int<>1 or (result->>'inserted')::int<>0 or (select name_zh from public.products where id=pid)<>marker||'EDIT' then raise exception 'QA failed: UUID update without SKU'; end if;
end $qa$;
select 'optional SKU saves, unique filled SKUs, clears, CSV inserts, UUID updates, retry safety and anonymous denial passed; test data rolled back' as result;
rollback;
