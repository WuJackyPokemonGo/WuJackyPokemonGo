-- Multiple Pokedex numbers; legacy scalar and old backups remain compatible.
begin;
alter table public.products add column if not exists pokedex_numbers integer[] not null default '{}';
alter table public.products add constraint products_pokedex_numbers_valid check(cardinality(pokedex_numbers)<=100 and array_position(pokedex_numbers,null) is null and 0<all(pokedex_numbers) and 9999>=all(pokedex_numbers) and coalesce(array_ndims(pokedex_numbers),1)=1);
with known(id,numbers) as (values ('d131d983-5a56-4590-89b0-167335cde607'::uuid,array[1,4,7,25]::integer[]),
('c2f8374e-4319-47f9-8b09-7079c93f1c64'::uuid,array[56,69,77,113,540,602,704,722,725,728,761]::integer[]),
('6e21261b-cc8b-4950-9849-d33632f80e68'::uuid,array[249,250,488,760,800,861]::integer[]),
('dbaa5a1c-19fb-4d40-86b8-5fbee8a9e937'::uuid,array[1,4,7,79,131,183,278]::integer[]),
('aa9b4b17-51c6-42f4-b1c3-4bd1098f88b9'::uuid,array[134,135,136,196,197,470,471,700]::integer[])),
originals as materialized (select p.id,p.pokedex_number,p.pokedex_numbers from public.products p for update),
targets as (select o.*,coalesce(k.numbers,case when o.pokedex_number is not null then array[o.pokedex_number] else '{}'::integer[] end) numbers from originals o left join known k on k.id=o.id),
changed as (update public.products p set pokedex_numbers=t.numbers,pokedex_number=t.numbers[1],updated_at=now() from targets t where p.id=t.id and (p.pokedex_numbers is distinct from t.numbers or p.pokedex_number is distinct from t.numbers[1]) returning p.id,p.pokedex_number,p.pokedex_numbers)
insert into public.audit_logs(entity_type,entity_id,action,reason,before_data,after_data)
select 'product',c.id::text,'pokedex_numbers_backfill','使用者要求一件商品支援多個圖鑑編號；依既有商品名單補入，不變更價格或庫存',to_jsonb(o),to_jsonb(c) from changed c join originals o on o.id=c.id;
CREATE OR REPLACE FUNCTION private.admin_save_catalog_product(p_id uuid, p_expected_updated_at timestamp with time zone, p_values jsonb, p_category_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_before jsonb; v_after public.products; v_aliases text[]; v_category uuid; v_price integer; v_dex integer[]; v_input jsonb; v_scalar integer;
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
 if p_values ? 'pokedex_numbers' then
  v_input:=p_values->'pokedex_numbers';
  if jsonb_typeof(v_input) is distinct from 'array' or jsonb_array_length(v_input)>100 then raise check_violation using message='Pokedex numbers must be an array of at most 100 integers'; end if;
  if exists(select 1 from jsonb_array_elements(v_input) a where case when jsonb_typeof(a)='number' and (a#>>'{}')~'^[0-9]+$' then (a#>>'{}')::numeric not between 1 and 9999 else true end) then raise check_violation using message='Invalid Pokedex number'; end if;
  select coalesce(array_agg(n order by n),'{}') into v_dex from (select distinct (a#>>'{}')::integer n from jsonb_array_elements(v_input) a) q;
 elsif p_values ? 'pokedex_number' then
  v_scalar:=nullif(btrim(p_values->>'pokedex_number'),'')::integer;
  if v_scalar is not null and v_scalar not between 1 and 9999 then raise check_violation using message='Invalid Pokedex number'; end if;
  -- A cached single-number editor must not erase an unchanged multiple-number list.
  select p.pokedex_numbers into v_dex from public.products p where p.id=p_id and p.pokedex_number is not distinct from v_scalar;
  if not found then v_dex:=case when v_scalar is null then '{}'::integer[] else array[v_scalar] end; end if;
 else
  select p.pokedex_numbers into v_dex from public.products p where p.id=p_id;
  v_dex:=coalesce(v_dex,'{}'::integer[]);
 end if;
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
 aliases=v_aliases,pokedex_number=v_dex[1],pokedex_numbers=v_dex,description_public=coalesce(p_values->>'description_public',''),
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
 'tags',coalesce((select jsonb_agg(c.name order by c.sort_order,c.id)from public.category_assignments a join public.product_categories c on c.id=a.category_id where a.product_id=p.id),'[]'::jsonb),
 'images',coalesce((select jsonb_agg(jsonb_build_object('path',i.public_path,'alt',i.alt_text)order by i.sort_order,i.id)from public.product_images i where i.product_id=p.id and i.is_approved and i.public_path is not null),'[]'::jsonb))
 from public.products p left join public.inventory_balances b on b.product_id=p.id
 where p.is_live and p.publication_status='published'
 order by p.manual_sort_order,p.id limit least(greatest(coalesce(p_limit,100),1),100)offset least(greatest(coalesce(p_offset,0),0),20000);
$function$
;
CREATE OR REPLACE FUNCTION private.normalize_backup(d jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 end if;
 if jsonb_typeof(d->'data'->'products')='array' then
  d:=jsonb_set(d,'{data,products}',coalesce((select jsonb_agg(case when j ? 'pokedex_numbers' then j else j||jsonb_build_object('pokedex_numbers',case when j->>'pokedex_number' is null then '[]'::jsonb else jsonb_build_array((j->>'pokedex_number')::integer) end) end) from jsonb_array_elements(d->'data'->'products') j),'[]'::jsonb));
 end if;
 return d;
end $function$
;
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
           FROM category_assignments a
             JOIN product_categories c ON c.id = a.category_id
          WHERE a.product_id = p.id), '[]'::jsonb) AS tags,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', i.id, 'path', COALESCE(i.thumbnail_path, i.storage_path), 'alt', i.alt_text) ORDER BY i.sort_order, i.id) AS jsonb_agg
           FROM product_images i
          WHERE i.product_id = p.id AND i.is_approved), '[]'::jsonb) AS images,
    p.pokedex_numbers
   FROM products p
  WHERE publication_status = 'published'::product_publication_status;
create or replace view public.public_catalog_draft with (security_barrier=true,security_invoker=true) as
SELECT id,
    sku,
    name_zh,
    name_en,
    aliases,
    pokedex_number,
    description_public,
    supply_status,
    public_price_twd,
    price_is_inquiry,
    manual_sort_order,
    hot_rank,
    first_stocked_at,
    coming_soon_at,
    updated_at,
    p.pokedex_numbers
   FROM products p
  WHERE publication_status = 'published'::product_publication_status;

commit;
