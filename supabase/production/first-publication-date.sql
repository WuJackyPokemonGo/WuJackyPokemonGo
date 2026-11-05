begin;
alter table public.products add column if not exists first_published_at timestamptz;

-- Only backfill dates supported by a recorded transition to public visibility.
with first_publication as (
  select entity_id, min(created_at) as published_at
  from public.audit_logs
  where entity_type = 'product'
    and after_data->>'is_live' = 'true'
    and after_data->>'publication_status' = 'published'
    and (
      (action = 'catalog_save' and (before_data is null or before_data = 'null'::jsonb))
      or (
        before_data ? 'is_live' and before_data ? 'publication_status'
        and (before_data->>'is_live' <> 'true' or before_data->>'publication_status' <> 'published')
      )
    )
  group by entity_id
)
update public.products p
set first_published_at = f.published_at
from first_publication f
where p.id::text = f.entity_id and p.first_published_at is null;

create or replace function private.record_first_product_publication()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' then
    new.first_published_at := old.first_published_at;
    if old.is_live and old.publication_status = 'published' then
      return new;
    end if;
  else
    new.first_published_at := null;
  end if;

  if new.is_live and new.publication_status = 'published' and new.first_published_at is null then
    new.first_published_at := statement_timestamp();
  end if;
  return new;
end;
$function$;

create or replace trigger record_first_product_publication
before insert or update of is_live, publication_status, first_published_at on public.products
for each row execute function private.record_first_product_publication();

CREATE OR REPLACE FUNCTION private.storefront_catalog(p_offset integer, p_limit integer)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
 'id',p.id,'sku',p.sku,'name',p.name_zh,'name_en',p.name_en,'aliases',p.aliases,'dex',p.pokedex_number,'dex_numbers',p.pokedex_numbers,
 'description',p.description_public,'price',case when p.price_is_inquiry then null else p.public_price_twd end,
 'status',case when p.supply_status in('available','low_stock')and b.quantity_on_hand=0 then 'sold_out' when p.supply_status in('available','low_stock')and b.quantity_on_hand>0 and(p.supply_status='low_stock'or b.quantity_on_hand<=p.low_stock_threshold)then 'low_stock'else p.supply_status::text end,
 'stock_quantity',case when p.supply_status in('available','low_stock','sold_out')then b.quantity_on_hand end,
 'is_low_stock',coalesce(p.supply_status in('available','low_stock')and b.quantity_on_hand>0 and(p.supply_status='low_stock'or b.quantity_on_hand<=p.low_stock_threshold),false),
 'first_stocked_at',p.first_stocked_at,
 'first_published_at',p.first_published_at,
 'tags',coalesce((select jsonb_agg(c.name order by c.sort_order,c.id)from public.category_assignments a join public.product_categories c on c.id=a.category_id where a.product_id=p.id),'[]'::jsonb),
 'images',coalesce((select jsonb_agg(jsonb_build_object('path',i.public_path,'alt',i.alt_text)order by i.sort_order,i.id)from public.product_images i where i.product_id=p.id and i.is_approved and i.public_path is not null),'[]'::jsonb))
 from public.products p left join public.inventory_balances b on b.product_id=p.id
 where p.is_live and p.publication_status='published'
 order by p.manual_sort_order,p.id limit least(greatest(coalesce(p_limit,100),1),100)offset least(greatest(coalesce(p_offset,0),0),20000);
$function$;

create or replace view public.catalog_preview with (security_invoker=true) as
 SELECT id,
    sku,
    name_zh,
    name_en,
    aliases,
    pokedex_number,
    description_public,
        CASE
            WHEN price_is_inquiry THEN NULL::integer
            ELSE public_price_twd
        END AS public_price_twd,
    price_is_inquiry,
    supply_status,
    manual_sort_order,
    first_stocked_at,
    COALESCE(( SELECT jsonb_agg(c.name ORDER BY c.sort_order, c.id) AS jsonb_agg
           FROM public.category_assignments a
             JOIN public.product_categories c ON c.id = a.category_id
          WHERE a.product_id = p.id), '[]'::jsonb) AS tags,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', i.id, 'path', COALESCE(i.thumbnail_path, i.storage_path), 'alt', i.alt_text) ORDER BY i.sort_order, i.id) AS jsonb_agg
           FROM public.product_images i
          WHERE i.product_id = p.id AND i.is_approved), '[]'::jsonb) AS images,
    pokedex_numbers,
    first_published_at
   FROM public.products p
  WHERE publication_status = 'published'::public.product_publication_status;
notify pgrst, 'reload schema';
commit;
