-- Owner-requested public stock display. Expose only the approved quantity and
-- low-stock flag; base inventory tables, movements and costs stay private.
create or replace function private.storefront_catalog(p_offset integer,p_limit integer)
returns setof jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'id',p.id,'sku',p.sku,'name',p.name_zh,'name_en',p.name_en,'aliases',p.aliases,'dex',p.pokedex_number,
 'description',p.description_public,'price',case when p.price_is_inquiry then null else p.public_price_twd end,
 'status',case when p.supply_status in('available','low_stock')and b.quantity_on_hand=0 then 'sold_out' when p.supply_status in('available','low_stock')and b.quantity_on_hand>0 and(p.supply_status='low_stock'or b.quantity_on_hand<=p.low_stock_threshold)then 'low_stock'else p.supply_status::text end,
 'stock_quantity',case when p.supply_status in('available','low_stock','sold_out')then b.quantity_on_hand end,
 'is_low_stock',coalesce(p.supply_status in('available','low_stock')and b.quantity_on_hand>0 and(p.supply_status='low_stock'or b.quantity_on_hand<=p.low_stock_threshold),false),
 'first_stocked_at',p.first_stocked_at,
 'tags',coalesce((select jsonb_agg(c.name order by c.sort_order,c.id)from public.category_assignments a join public.product_categories c on c.id=a.category_id where a.product_id=p.id),'[]'::jsonb),
 'images',coalesce((select jsonb_agg(jsonb_build_object('path',i.public_path,'alt',i.alt_text)order by i.sort_order,i.id)from public.product_images i where i.product_id=p.id and i.is_approved and i.public_path is not null),'[]'::jsonb))
 from public.products p left join public.inventory_balances b on b.product_id=p.id
 where p.is_live and p.publication_status='published'
 order by p.manual_sort_order,p.id limit least(greatest(coalesce(p_limit,100),1),100)offset least(greatest(coalesce(p_offset,0),0),20000);
$$;
comment on function public.storefront_catalog(integer,integer)is 'Public product allowlist includes owner-authorized stock_quantity and is_low_stock. Inventory ledgers, costs, sources, customers and orders remain private. Product order is unchanged.';
