begin;
do $qa$
declare actor uuid;v jsonb;one jsonb;pid uuid;version timestamptz;bad jsonb;doc jsonb;normalized jsonb;
begin
 select user_id into actor from public.admin_profiles order by created_at limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 v:=jsonb_build_object('sku',null,'name_zh','多編號回滾驗證','name_en','Multiple Dex QA','aliases','[]'::jsonb,'publication_status','published','supply_status','inquiry_only','is_live',true,'pokedex_numbers','[25,1,4,7,4]'::jsonb);
 one:=public.admin_save_catalog_product(null,null,v,'{}'::uuid[]);pid:=(one->>'id')::uuid;
 if (select pokedex_numbers from public.products where id=pid)<>array[1,4,7,25] then raise exception 'QA failed: canonical saved list';end if;
 if not exists(select 1 from public.storefront_catalog(0,100) r where r->>'id'=pid::text and r->'dex_numbers'='[1,4,7,25]'::jsonb) then raise exception 'QA failed: public list';end if;
 select updated_at into version from public.products where id=pid;
 perform public.admin_save_catalog_product(pid,version,(v-'pokedex_numbers')||jsonb_build_object('pokedex_number',1),'{}'::uuid[]);
 if (select pokedex_numbers from public.products where id=pid)<>array[1,4,7,25] then raise exception 'QA failed: cached legacy editor erased list';end if;
 foreach bad in array array['[0]'::jsonb,'[-1]'::jsonb,'[10000]'::jsonb,'[null]'::jsonb,'[1.5]'::jsonb,'["4"]'::jsonb] loop
  begin
   select updated_at into version from public.products where id=pid;
   perform public.admin_save_catalog_product(pid,version,v||jsonb_build_object('pokedex_numbers',bad),'{}'::uuid[]);
   raise exception 'QA failed: invalid list accepted';
  exception when check_violation then null;end;
 end loop;
 select updated_at into version from public.products where id=pid;
 perform public.admin_save_catalog_product(pid,version,v||jsonb_build_object('pokedex_numbers','[]'::jsonb),'{}'::uuid[]);
 if (select pokedex_numbers<>array[]::integer[] or pokedex_number is not null from public.products where id=pid) then raise exception 'QA failed: clear numbers';end if;
 doc:=private.app_backup_document();
 if private.normalize_backup(doc)<>doc then raise exception 'QA failed: new backup modified';end if;
 doc:=jsonb_set(doc,'{data,products}',(select jsonb_agg(p-'pokedex_numbers') from jsonb_array_elements(doc->'data'->'products') p));
 normalized:=private.normalize_backup(doc);
 if exists(select 1 from jsonb_array_elements(normalized->'data'->'products') p where not(p ? 'pokedex_numbers')) then raise exception 'QA failed: legacy backup columns';end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.admin_save_catalog_product(null,null,v,'{}'::uuid[]);raise exception 'QA failed: anonymous save allowed';exception when insufficient_privilege then null;end;
end $qa$;
select 'multiple-number saves, public feed, legacy editor compatibility, invalid values, clearing, old and new backups, and anonymous denial passed; test data rolled back' as result;
rollback;
