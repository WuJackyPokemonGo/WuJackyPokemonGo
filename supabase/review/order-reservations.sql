-- 接單保留庫存（帳號層級）＋試算表同步佇列。待審版本：只在測試環境套用，未經驗收不套用正式專案。
-- 原則：
-- 1. 帳號明細的「帳密」永遠不進資料庫；這裡只有帳號編號、商品、狀態與訂單，對應試算表「帳號明細」的商品編號／狀態／訂單編號欄位。
-- 2. 官網訂單與 LINE／Threads 手動訂單共用同一套觸發：訂單進入「待付款」以後（正式成立）自動保留，取消時釋放，完成交付時標已交付。
-- 3. 保留用 FOR UPDATE SKIP LOCKED 挑選「可出貨」帳號：兩張訂單同時搶最後一份，只會有一張拿到，另一張記為待叫貨。
-- 4. 重複執行（重送同一張訂單、觸發器重跑、同步重試）不會多保留或多寫：以「已綁定此訂單項目的帳號數」為準補差額。
-- 5. 庫存帳（inventory_balances）只在帳號新增／停用時調整；交付時沿用原本「完成訂單並扣庫存」扣一次，帳號改「已交付」不再扣，避免重複扣減。

create table if not exists public.account_units(
 id uuid primary key default gen_random_uuid(),
 seq bigint generated always as identity,-- 入庫順序：先入庫先出
 unit_code text not null unique check(length(btrim(unit_code)) between 1 and 80),
 product_id uuid not null references public.products(id) on delete restrict,
 status text not null default 'available' check(status in ('available','reserved','delivered','verifying','unavailable')),
 order_id uuid references public.orders(id) on delete restrict,
 order_item_id uuid references public.order_items(id) on delete set null,
 reserved_at timestamptz,
 delivered_at timestamptz,
 version bigint not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((status in ('reserved','delivered'))=(order_id is not null))
);
create index if not exists account_units_pick_idx on public.account_units(product_id,status,seq);
create index if not exists account_units_order_idx on public.account_units(order_id);

create table if not exists public.sheet_sync_queue(
 id bigint generated always as identity primary key,
 unit_id uuid not null references public.account_units(id) on delete cascade,
 unit_code text not null,
 version bigint not null,
 status_label text not null,
 order_number text not null default '',
 state text not null default 'pending' check(state in ('pending','done','failed','superseded')),
 attempts integer not null default 0,
 last_error text not null default '' check(length(last_error)<=500),
 created_at timestamptz not null default now(),
 done_at timestamptz,
 unique(unit_id,version)
);
create index if not exists sheet_sync_queue_open_idx on public.sheet_sync_queue(state,id) where state in ('pending','failed');

alter table public.account_units enable row level security;
alter table public.sheet_sync_queue enable row level security;
revoke all on public.account_units,public.sheet_sync_queue from anon,public;
grant select on public.account_units,public.sheet_sync_queue to authenticated;
drop policy if exists "admins read account units" on public.account_units;
create policy "admins read account units" on public.account_units for select to authenticated using((select private.is_store_admin()));
drop policy if exists "admins read sheet sync" on public.sheet_sync_queue;
create policy "admins read sheet sync" on public.sheet_sync_queue for select to authenticated using((select private.is_store_admin()));

create or replace function private.unit_status_label(p text) returns text language sql immutable set search_path='' as $$
 select case p when 'available' then '可出貨' when 'reserved' then '已保留' when 'delivered' then '已交付' when 'verifying' then '待驗證' else '停用' end$$;
create or replace function private.order_reserves(p public.order_status) returns boolean language sql immutable set search_path='' as $$
 select p in ('awaiting_payment','paid_awaiting_purchase','ordered_from_supplier','arrived_for_check')$$;

-- 每次帳號狀態或綁定訂單改變：版本＋1，排一筆同步（舊的未完成同步標為 superseded，只寫最新結果）
create or replace function private.queue_unit_sync() returns trigger language plpgsql security definer set search_path='' as $$
declare num text:='';begin
 if tg_op='UPDATE' and new.status is not distinct from old.status and new.order_id is not distinct from old.order_id then return new;end if;
 if tg_op='UPDATE' then new.version:=old.version+1;new.updated_at:=now();end if;
 select coalesce(o.order_number::text,'') into num from public.orders o where o.id=new.order_id;
 update public.sheet_sync_queue set state='superseded' where unit_id=new.id and state in ('pending','failed');
 if tg_op='INSERT' then return new;end if;-- 新帳號來自試算表本身，不需回寫
 insert into public.sheet_sync_queue(unit_id,unit_code,version,status_label,order_number) values(new.id,new.unit_code,new.version,private.unit_status_label(new.status),coalesce(num,''))
 on conflict(unit_id,version) do nothing;
 return new;end$$;
drop trigger if exists account_units_sync on public.account_units;
create trigger account_units_sync before insert or update on public.account_units for each row execute function private.queue_unit_sync();

-- 保留：逐項補到「訂購數」為止；不足的份數就是待叫貨。數量減少時先釋放最晚保留的帳號。
create or replace function private.reserve_order_units(p_order uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders;it record;have integer;need integer;picked integer;res jsonb:='[]'::jsonb;begin
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'order not found' using errcode='P0002';end if;
 if private.order_reserves(o.status) then
  for it in select i.id,i.product_id,i.quantity from public.order_items i where i.order_id=p_order and i.product_id is not null order by i.created_at,i.id loop
   select count(*) into have from public.account_units u where u.order_item_id=it.id and u.status in ('reserved','delivered');
   need:=coalesce(it.quantity,0)-have;
   if need>0 then
    with pick as(select u.id from public.account_units u where u.product_id=it.product_id and u.status='available' order by u.seq limit need for update skip locked)
    update public.account_units u set status='reserved',order_id=p_order,order_item_id=it.id,reserved_at=now() from pick where u.id=pick.id;
    get diagnostics picked=row_count;
   elsif need<0 then
    with drop_ as(select u.id from public.account_units u where u.order_item_id=it.id and u.status='reserved' order by u.seq desc limit -need for update)
    update public.account_units u set status='available',order_id=null,order_item_id=null,reserved_at=null from drop_ where u.id=drop_.id;
   end if;
  end loop;
 end if;
 return private.order_allocation(p_order);
end$$;

create or replace function private.order_allocation(p_order uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('order_item_id',i.id,'product_id',i.product_id,'product',i.product_name_snapshot,'ordered',i.quantity,
  'reserved',(select count(*) from public.account_units u where u.order_item_id=i.id and u.status='reserved'),
  'delivered',(select count(*) from public.account_units u where u.order_item_id=i.id and u.status='delivered'),
  'backorder',greatest(0,i.quantity-(select count(*) from public.account_units u where u.order_item_id=i.id and u.status in ('reserved','delivered')))) order by i.created_at,i.id),'[]'::jsonb)
 from public.order_items i where i.order_id=p_order$$;

create or replace function private.release_order_units(p_order uuid) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;begin
 update public.account_units set status='available',order_id=null,order_item_id=null,reserved_at=null where order_id=p_order and status='reserved';
 get diagnostics n=row_count;return n;end$$;

-- 訂單狀態觸發：進入待付款以後保留；取消（或交付前退款）釋放；完成交付時把已保留帳號標已交付（不動庫存帳，原函式已扣過）。
create or replace function private.order_units_after_status() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if private.order_reserves(new.status) and (tg_op='INSERT' or old.status is distinct from new.status) then perform private.reserve_order_units(new.id);
 elsif new.status='cancelled' or (new.status in ('refund_pending','refunded') and new.fulfilled_at is null) then perform private.release_order_units(new.id);
 elsif new.status='completed' and tg_op='UPDATE' and old.status is distinct from 'completed' then
  update public.account_units set status='delivered',delivered_at=now() where order_id=new.id and status='reserved';
 end if;
 return new;end$$;
drop trigger if exists orders_reserve_units on public.orders;
create trigger orders_reserve_units after insert or update of status on public.orders for each row execute function private.order_units_after_status();

-- 完成前檢查：使用帳號管理的商品，必須每一份都已保留到帳號，否則不能完成（避免把別張訂單保留的帳號賣出去）。
create or replace function private.order_units_guard_completion() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='completed' and old.status is distinct from 'completed' and exists(
  select 1 from public.order_items i where i.order_id=new.id and exists(select 1 from public.account_units x where x.product_id=i.product_id)
   and i.quantity>(select count(*) from public.account_units u where u.order_item_id=i.id and u.status='reserved')) then
  raise exception '訂單仍有待叫貨的帳號，請補保留後再完成交付' using errcode='23514';
 end if;
 return new;end$$;
drop trigger if exists orders_guard_units on public.orders;
create trigger orders_guard_units before update of status on public.orders for each row execute function private.order_units_guard_completion();

create or replace function private.order_items_resync() returns trigger language plpgsql security definer set search_path='' as $$
declare oid uuid:=coalesce(new.order_id,old.order_id);begin
 if tg_op='DELETE' then update public.account_units set status='available',order_id=null,order_item_id=null,reserved_at=null where order_item_id=old.id and status='reserved';return old;end if;
 if exists(select 1 from public.orders o where o.id=oid and private.order_reserves(o.status)) then perform private.reserve_order_units(oid);end if;
 return new;end$$;
drop trigger if exists order_items_units on public.order_items;
create trigger order_items_units after insert or update of quantity,product_id on public.order_items for each row execute function private.order_items_resync();
drop trigger if exists order_items_units_delete on public.order_items;
create trigger order_items_units_delete before delete on public.order_items for each row execute function private.order_items_resync();

-- 試算表帳號 → 資料庫（只帶帳號編號、商品編號、狀態；不帶帳密）。資料庫是保留結果的唯一寫入者：
-- 已保留／已交付的帳號不會被試算表狀態覆蓋；新帳號與停用會調整庫存帳，讓「完成交付」有足夠庫存可扣。
create or replace function public.admin_upsert_account_units(p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;pid uuid;st text;u public.account_units;ins integer:=0;upd integer:=0;keep integer:=0;unknown jsonb:='[]';target integer;b integer;
 deltas jsonb:='{}';k text;begin
 if auth.uid() is null or not private.is_store_admin() then raise insufficient_privilege;end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>500 then raise invalid_parameter_value using message='rows must be an array of at most 500';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  select id into pid from public.products where btrim(sku)<>'' and lower(btrim(sku))=lower(btrim(r->>'sku'));
  if pid is null then unknown:=unknown||jsonb_build_array(jsonb_build_object('unit_code',r->>'unit_code','sku',r->>'sku'));continue;end if;
  st:=case btrim(coalesce(r->>'status','')) when '可出貨' then 'available' when '待驗證' then 'verifying' when '停用' then 'unavailable' when '已交付' then 'delivered' when '已保留' then 'reserved' else 'verifying' end;
  select * into u from public.account_units where unit_code=btrim(r->>'unit_code') for update;
  if not found then
   if st in ('reserved','delivered') then st:='verifying';end if;-- 未經網站保留的「已保留／已交付」不信任，先列待驗證
   insert into public.account_units(unit_code,product_id,status) values(btrim(r->>'unit_code'),pid,st);ins:=ins+1;
   deltas:=jsonb_set(deltas,array[pid::text],'true');
  elsif u.status in ('reserved','delivered') then keep:=keep+1;
  elsif u.status<>st and st in ('available','verifying','unavailable') then
   update public.account_units set status=st where id=u.id;upd:=upd+1;
   deltas:=jsonb_set(deltas,array[pid::text],'true');
  end if;
  pid:=null;
 end loop;
 -- 庫存帳對齊：帳號管理的商品，現有庫存＝可出貨＋已保留＋待驗證的帳號數（已交付的已由完成交付扣過；停用不算）。
 -- 用「對齊」而非「累加」，第一次匯入不會和既有期初庫存重複，重複同步也不會一直加。
 for k in select jsonb_object_keys(deltas) loop
  target:=(select count(*) from public.account_units where product_id=k::uuid and status in ('available','reserved','verifying'));
  insert into public.inventory_balances(product_id,quantity_on_hand) values(k::uuid,0) on conflict(product_id) do nothing;
  select quantity_on_hand into b from public.inventory_balances where product_id=k::uuid for update;
  if target<>b then
   update public.inventory_balances set quantity_on_hand=target,updated_at=now() where product_id=k::uuid;
   insert into public.inventory_movements(product_id,movement_type,quantity_delta,quantity_before,quantity_after,reason,actor_user_id)
    values(k::uuid,'manual_adjustment',target-b,b,target,'帳號明細同步：庫存對齊帳號數',auth.uid());
  end if;
 end loop;
 return jsonb_build_object('inserted',ins,'updated',upd,'kept_reserved',keep,'unknown_sku',unknown);
end$$;

create or replace function public.admin_order_allocation(p_order uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null or not private.is_store_admin() then raise insufficient_privilege;end if;return private.order_allocation(p_order);end$$;
create or replace function public.admin_reserve_order(p_order uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null or not private.is_store_admin() then raise insufficient_privilege;end if;return private.reserve_order_units(p_order);end$$;
-- 補貨後依成立時間補保留所有有待叫貨的訂單
create or replace function public.admin_fill_backorders() returns integer language plpgsql security definer set search_path='' as $$
declare o record;n integer:=0;begin
 if auth.uid() is null or not private.is_store_admin() then raise insufficient_privilege;end if;
 for o in select id from public.orders where private.order_reserves(status) order by created_at,id loop perform private.reserve_order_units(o.id);n:=n+1;end loop;return n;end$$;
create or replace function public.admin_sheet_sync_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if auth.uid() is null or not private.is_store_admin() then raise insufficient_privilege;end if;
 return jsonb_build_object('pending',(select count(*) from public.sheet_sync_queue where state='pending'),'failed',(select count(*) from public.sheet_sync_queue where state='failed'),
  'last_error',(select last_error from public.sheet_sync_queue where state='failed' order by id desc limit 1),'last_done_at',(select max(done_at) from public.sheet_sync_queue));end$$;
create or replace function public.admin_retry_sheet_sync() returns integer language plpgsql security definer set search_path='' as $$
declare n integer;begin if auth.uid() is null or not private.is_store_admin() then raise insufficient_privilege;end if;
 update public.sheet_sync_queue set state='pending' where state='failed';get diagnostics n=row_count;return n;end$$;

-- 同步程式（Edge Function，service_role）用：取出待寫、回報完成或失敗。失敗的保留不受影響。
create or replace function public.sheet_sync_claim(p_limit integer default 200) returns setof public.sheet_sync_queue language sql security definer set search_path='' as $$
 select * from public.sheet_sync_queue where state='pending' order by id limit greatest(1,least(p_limit,500))$$;
create or replace function public.sheet_sync_finish(p_done bigint[],p_failed jsonb) returns void language plpgsql security definer set search_path='' as $$
declare f jsonb;begin
 update public.sheet_sync_queue set state='done',done_at=now(),attempts=attempts+1,last_error='' where id=any(p_done) and state='pending';
 for f in select value from jsonb_array_elements(coalesce(p_failed,'[]')) loop
  update public.sheet_sync_queue set state='failed',attempts=attempts+1,last_error=left(coalesce(f->>'error','unknown'),500) where id=(f->>'id')::bigint and state='pending';
 end loop;end$$;
revoke all on function public.sheet_sync_claim(integer),public.sheet_sync_finish(bigint[],jsonb) from public,anon,authenticated;
grant execute on function public.sheet_sync_claim(integer),public.sheet_sync_finish(bigint[],jsonb) to service_role;
revoke all on function public.admin_upsert_account_units(jsonb),public.admin_order_allocation(uuid),public.admin_reserve_order(uuid),public.admin_fill_backorders(),public.admin_sheet_sync_status(),public.admin_retry_sheet_sync() from public,anon;
grant execute on function public.admin_upsert_account_units(jsonb),public.admin_order_allocation(uuid),public.admin_reserve_order(uuid),public.admin_fill_backorders(),public.admin_sheet_sync_status(),public.admin_retry_sheet_sync() to authenticated;
