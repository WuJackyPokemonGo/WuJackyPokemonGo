-- Rollback-only verification; safe to run against the promoted project.
begin;
set local plpgsql.check_asserts=on;
do $$
declare a uuid:=gen_random_uuid();p uuid:=gen_random_uuid();r jsonb;v timestamptz;payload jsonb;
begin
 insert into auth.users(id,aud,role,raw_user_meta_data,raw_app_meta_data) values(a,'authenticated','authenticated','{}','{}');
 insert into public.admin_profiles(user_id) values(a);
 insert into public.products(id,sku,name_zh,publication_status,source_reference,description_public) values(p,'LIVE-VERIFY-'||p,'回滾公開驗收','published','DO NOT EXPOSE','公開說明');
 perform set_config('request.jwt.claims','{}',true);execute 'set local role anon';
 assert not exists(select 1 from public.storefront_catalog(0,100) x where x->>'id'=p::text),'test product leaked before is_live';
 begin perform 1 from public.products;raise exception 'base table exposed';exception when insufficient_privilege then null;end;
 begin perform private.is_store_admin();raise exception 'private admin helper exposed';exception when insufficient_privilege then null;end;
 begin perform 1 from public.orders;raise exception 'orders exposed';exception when insufficient_privilege then null;end;
 begin perform public.admin_store_operation('save_order','{}',gen_random_uuid());raise exception 'admin write exposed';exception when insufficient_privilege then null;end;
 execute 'reset role';
 select updated_at into v from public.products where id=p;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);execute 'set local role authenticated';
 payload:=jsonb_build_object('sku','LIVE-VERIFY-'||p,'name_zh','回滾公開驗收','aliases','[]'::jsonb,'publication_status','published','supply_status','available','public_price_twd',100,'is_live',true);
 perform public.admin_save_catalog_product(p,v,payload,array[]::uuid[]);
 assert(select is_live from public.products where id=p),'admin save did not persist live flag';
 execute 'reset role';execute 'set local role anon';
 select x into r from public.storefront_catalog(0,100) x where x->>'id'=p::text;
 assert r is not null and r->>'price'='100';
 assert not(r ? 'source_reference') and not(r ? 'quantity_on_hand') and not(r ? 'low_stock_threshold') and not(r ? 'is_live') and not(r ? 'created_by'),'private field leaked';
 execute 'reset role';
 update public.products set publication_status='draft' where id=p;
 execute 'set local role anon';assert not exists(select 1 from public.storefront_catalog(0,100) x where x->>'id'=p::text),'live draft exposed';execute 'reset role';
 assert(select not public from storage.buckets where id='product-images'),'original media became public';
end; $$;
select 'passed' as public_storefront_acceptance;
rollback;
