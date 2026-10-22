-- Isolated staging extension: atomic product editing and private media.
begin;
alter table public.product_images add column thumbnail_path text;
alter table public.product_images add column is_approved boolean not null default false;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy "store admins read product media" on storage.objects for select to authenticated
using(bucket_id='product-images' and (select private.is_store_admin()));
create policy "store admins upload product media" on storage.objects for insert to authenticated
with check(bucket_id='product-images' and (select private.is_store_admin()) and exists(
 select 1 from public.products p where p.id::text=(storage.foldername(name))[1]));
-- No overwrite/delete permission: originals are retained for recovery.

create or replace function private.admin_save_catalog_product(p_id uuid,p_expected_updated_at timestamptz,p_values jsonb,p_category_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_before jsonb; v_after public.products; v_aliases text[]; v_category uuid; v_price integer;
begin
 if not private.is_store_admin() then raise insufficient_privilege using message='Administrator required'; end if;
 if jsonb_typeof(p_values) is distinct from 'object' or nullif(btrim(p_values->>'sku'),'') is null or nullif(btrim(p_values->>'name_zh'),'') is null then raise check_violation using message='SKU and name required'; end if;
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
  insert into public.products(sku,name_zh) values(btrim(p_values->>'sku'),btrim(p_values->>'name_zh')) returning id into v_id;
 else
  select to_jsonb(p) into v_before from public.products p where id=p_id for update;
  if not found or (v_before->>'updated_at')::timestamptz is distinct from p_expected_updated_at then raise sqlstate 'PT409' using message='Product modified on another device'; end if;
  v_id:=p_id;
 end if;
 update public.products set sku=btrim(p_values->>'sku'), name_zh=btrim(p_values->>'name_zh'),name_en=coalesce(p_values->>'name_en',''),
 aliases=v_aliases,pokedex_number=(p_values->>'pokedex_number')::integer,description_public=coalesce(p_values->>'description_public',''),
 public_price_twd=v_price,price_is_inquiry=(v_price is null),publication_status=(p_values->>'publication_status')::public.product_publication_status,
 supply_status=(p_values->>'supply_status')::public.product_supply_status,manual_sort_order=coalesce((p_values->>'manual_sort_order')::integer,0),
 low_stock_threshold=coalesce((p_values->>'low_stock_threshold')::integer,3), first_stocked_at=(p_values->>'first_stocked_at')::timestamptz
 where id=v_id returning * into v_after;
 delete from public.category_assignments where product_id=v_id;
 insert into public.category_assignments(product_id,category_id) select v_id,id from (select distinct unnest(p_category_ids) id) q;
 insert into public.audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data)
 values(auth.uid(),'product',v_id::text,'catalog_save',v_before,to_jsonb(v_after)||jsonb_build_object('category_ids',p_category_ids));
 return jsonb_build_object('id',v_id,'updated_at',v_after.updated_at);
end; $$;
revoke all on function private.admin_save_catalog_product(uuid,timestamptz,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function private.admin_save_catalog_product(uuid,timestamptz,jsonb,uuid[]) to authenticated;
create function public.admin_save_catalog_product(p_id uuid,p_expected_updated_at timestamptz,p_values jsonb,p_category_ids uuid[])
returns jsonb language sql security invoker set search_path='' as $$ select private.admin_save_catalog_product(p_id,p_expected_updated_at,p_values,p_category_ids); $$;
revoke all on function public.admin_save_catalog_product(uuid,timestamptz,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.admin_save_catalog_product(uuid,timestamptz,jsonb,uuid[]) to authenticated;

-- Invoker view: only administrators have underlying SELECT grants/policies.
-- No anonymous publication is enabled by this staging extension.
create view public.catalog_preview with(security_invoker=true) as
select p.id,p.sku,p.name_zh,p.name_en,p.aliases,p.pokedex_number,p.description_public,
 case when p.price_is_inquiry then null else p.public_price_twd end public_price_twd,
 p.price_is_inquiry,p.supply_status,p.manual_sort_order,p.first_stocked_at,
 coalesce((select jsonb_agg(c.name order by c.sort_order,c.id) from public.category_assignments a join public.product_categories c on c.id=a.category_id where a.product_id=p.id),'[]'::jsonb) tags,
 coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'path',coalesce(i.thumbnail_path,i.storage_path),'alt',i.alt_text) order by i.sort_order,i.id) from public.product_images i where i.product_id=p.id and i.is_approved),'[]'::jsonb) images
from public.products p where p.publication_status='published';
revoke all on public.catalog_preview from public,anon,authenticated;
grant select on public.catalog_preview to authenticated;
comment on view public.catalog_preview is 'Admin-only staging projection of storefront fields; no exact stock, internal notes or finance.';
commit;
