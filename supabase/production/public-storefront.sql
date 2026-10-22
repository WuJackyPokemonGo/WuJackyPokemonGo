begin;
alter table public.products add column is_live boolean not null default false;
alter table public.product_images add column public_path text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('storefront-thumbnails','storefront-thumbnails',true,2097152,array['image/webp']);
create policy "admins publish storefront thumbnails" on storage.objects for insert to authenticated
with check(bucket_id='storefront-thumbnails' and (select private.is_store_admin()) and name like '%-thumb.webp' and exists(select 1 from public.products p where p.id::text=(storage.foldername(name))[1]));
create policy "admins inspect storefront thumbnails" on storage.objects for select to authenticated
using(bucket_id='storefront-thumbnails' and (select private.is_store_admin()));
-- Keep the original media bucket private. Only explicitly published thumbnails are copied.
do $patch$
declare definition text;
begin
 select pg_get_functiondef('private.admin_save_catalog_product(uuid,timestamptz,jsonb,uuid[])'::regprocedure) into definition;
 definition:=replace(definition,'low_stock_threshold=coalesce(', 'is_live=case when p_values ? ''is_live'' then (p_values->>''is_live'')::boolean else is_live end, low_stock_threshold=coalesce(');
 execute definition;
end; $patch$;

create function private.storefront_catalog(p_offset integer,p_limit integer)
returns setof jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'id',p.id,'sku',p.sku,'name',p.name_zh,'name_en',p.name_en,'aliases',p.aliases,'dex',p.pokedex_number,
 'description',p.description_public,'price',case when p.price_is_inquiry then null else p.public_price_twd end,
 'status',p.supply_status,'first_stocked_at',p.first_stocked_at,
 'tags',coalesce((select jsonb_agg(c.name order by c.sort_order,c.id) from public.category_assignments a join public.product_categories c on c.id=a.category_id where a.product_id=p.id),'[]'::jsonb),
 'images',coalesce((select jsonb_agg(jsonb_build_object('path',i.public_path,'alt',i.alt_text) order by i.sort_order,i.id) from public.product_images i where i.product_id=p.id and i.is_approved and i.public_path is not null),'[]'::jsonb))
 from public.products p where p.is_live and p.publication_status='published'
 order by p.manual_sort_order,p.id limit least(greatest(coalesce(p_limit,100),1),100) offset least(greatest(coalesce(p_offset,0),0),20000);
$$;
revoke all on function private.storefront_catalog(integer,integer) from public,anon,authenticated;
grant usage on schema private to anon;
grant execute on function private.storefront_catalog(integer,integer) to anon,authenticated;
create function public.storefront_catalog(p_offset integer default 0,p_limit integer default 100)
returns setof jsonb language sql stable security invoker set search_path='' as $$select * from private.storefront_catalog(p_offset,p_limit);$$;
revoke all on function public.storefront_catalog(integer,integer) from public,anon,authenticated;
grant execute on function public.storefront_catalog(integer,integer) to anon,authenticated;
comment on function public.storefront_catalog(integer,integer) is 'Public storefront allowlist. Requires is_live + published. Never returns exact inventory, source, cost, admin, customer, orders, or private notes.';
commit;
