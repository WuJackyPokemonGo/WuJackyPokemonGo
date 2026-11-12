-- CRM 第一段：案件狀態、歷史成交補登、到貨等候、經營特徵設定。（審核分支，驗收後才套用到正式站）
-- 原則：聊天判斷一律是「建議」。成交要管理員接受才算；已人工確認／修改的內容，重新匯入不覆蓋。
-- 只有管理員可讀寫；公開網站與 anon 一律無權限。可重複套用。

-- 案件：同一位客人的每段詢價／交易各自一筆，各有自己的狀態
create table if not exists public.crm_cases(
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customer_profiles(id) on delete cascade,
 identity_id uuid references public.crm_identities(id) on delete cascade,
 opened_at timestamptz not null,
 last_at timestamptz not null,
 status text not null check(status in ('owner_to_reply','payment_to_verify','to_deliver','awaiting_payment','waiting_stock','quoted','quote_lapsed','abandoned','done','closed')),
 status_source text not null default 'auto' check(status_source in ('auto','manual')),
 suggested_status text not null default '' check(suggested_status='' or suggested_status in ('owner_to_reply','payment_to_verify','to_deliver','awaiting_payment','waiting_stock','quoted','quote_lapsed','abandoned','done','closed')),
 items text[] not null default '{}' check(cardinality(items)<=8),
 product_ids uuid[] not null default '{}' check(cardinality(product_ids)<=10),
 excerpt text not null default '' check(length(excerpt)<=120),
 evidence jsonb not null default '{}'::jsonb,
 note text not null default '' check(length(note)<=1000),
 source_key text not null unique check(length(source_key) between 8 and 300),
 batch_id uuid references public.crm_import_batches(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists crm_cases_customer_idx on public.crm_cases(customer_id,last_at desc);
create index if not exists crm_cases_status_idx on public.crm_cases(status);

-- 歷史成交（Threads 補登）：一次付款＝一筆，同一筆買多隻仍算 1 筆。接受後才計入熟客、成交額。
-- 不寫進 orders，避免動到庫存、營收與訂單流程；日後網站訂單以客人名稱對應一起計算。
create table if not exists public.crm_deals(
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customer_profiles(id) on delete cascade,
 identity_id uuid references public.crm_identities(id) on delete cascade,
 case_source_key text not null default '' check(length(case_source_key)<=300),
 occurred_at timestamptz not null,
 items jsonb not null default '[]'::jsonb check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=20),
 product_ids uuid[] not null default '{}' check(cardinality(product_ids)<=10),
 qty integer not null default 1 check(qty between 1 and 200),
 amount_twd integer check(amount_twd is null or amount_twd between 0 and 10000000),
 refund_twd integer not null default 0 check(refund_twd>=0),
 status text not null default 'suggested' check(status in ('suggested','accepted','rejected')),
 source text not null default 'threads' check(source in ('threads','manual')),
 evidence jsonb not null default '{}'::jsonb,
 note text not null default '' check(length(note)<=1000),
 source_key text not null unique check(length(source_key) between 8 and 300),
 decided_at timestamptz,
 decided_by uuid,
 batch_id uuid references public.crm_import_batches(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(status<>'accepted' or amount_twd is not null),
 check(amount_twd is null or refund_twd<=amount_twd)
);
create index if not exists crm_deals_customer_idx on public.crm_deals(customer_id,occurred_at desc);

-- 到貨等候：客人等哪個商品，有貨時由老闆決定何時通知
create table if not exists public.crm_stock_waits(
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customer_profiles(id) on delete cascade,
 item_text text not null default '' check(length(item_text)<=120),
 product_ids uuid[] not null default '{}' check(cardinality(product_ids)<=10),
 channel text not null default '' check(length(channel)<=40),
 follow_on date,
 status text not null default 'waiting' check(status in ('waiting','notified','closed')),
 source text not null default 'auto' check(source in ('auto','manual')),
 excerpt text not null default '' check(length(excerpt)<=120),
 evidence jsonb not null default '{}'::jsonb,
 note text not null default '' check(length(note)<=1000),
 source_key text unique check(source_key is null or length(source_key) between 8 and 300),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists crm_stock_waits_open_idx on public.crm_stock_waits(status,follow_on);

-- 設定（例如高單價門檻、回購客久未成交天數）
create table if not exists public.crm_settings(
 key text primary key check(key ~ '^[a-z_]{2,40}$'),
 value jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
insert into public.crm_settings(key,value) values('features','{"high_value_twd":1000,"lapsed_days":90}') on conflict(key) do nothing;

alter table public.crm_cases enable row level security;
alter table public.crm_deals enable row level security;
alter table public.crm_stock_waits enable row level security;
alter table public.crm_settings enable row level security;
revoke all on public.crm_cases,public.crm_deals,public.crm_stock_waits,public.crm_settings from anon,public;
grant select,insert,update,delete on public.crm_cases,public.crm_deals,public.crm_stock_waits,public.crm_settings to authenticated;
do $$declare t text;begin
 foreach t in array array['crm_cases','crm_deals','crm_stock_waits','crm_settings'] loop
  execute format('drop policy if exists "admins manage %1$s" on public.%1$I',t);
  execute format('create policy "admins manage %1$s" on public.%1$I for all to authenticated using((select private.is_store_admin())) with check((select private.is_store_admin()))',t);
 end loop;
end$$;

-- 匯入建議（在 admin_crm_import_threads 之後、同一批客人呼叫）。客人以 (threads, external_key) 找，找不到就略過。
-- 重跑規則：案件只在 status_source='auto' 時更新狀態；人工改過的保留，新的判斷記在 suggested_status。
-- 成交只在仍是「建議」時更新；已接受或略過的不動。到貨等候只新增不覆蓋。
create or replace function public.admin_crm_import_suggestions(p_batch uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;x jsonb;cid uuid;iid uuid;v_ins boolean;
 c_new integer:=0;c_upd integer:=0;c_keep integer:=0;d_new integer:=0;d_upd integer:=0;d_keep integer:=0;w_new integer:=0;missing integer:=0;
begin
 if auth.uid() is null or not private.is_store_admin() then raise insufficient_privilege;end if;
 if p_batch is null or not exists(select 1 from public.crm_import_batches where id=p_batch) then raise invalid_parameter_value using message='unknown batch';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>100 then raise invalid_parameter_value using message='rows must be an array of at most 100';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  select id,customer_id into iid,cid from public.crm_identities where platform='threads' and external_key=r->>'external_key';
  if cid is null then missing:=missing+1;continue;end if;
  for x in select value from jsonb_array_elements(coalesce(r->'cases','[]')) loop
   insert into public.crm_cases(customer_id,identity_id,opened_at,last_at,status,suggested_status,items,product_ids,excerpt,evidence,source_key,batch_id)
   values(cid,iid,to_timestamp((x->>'opened_at')::bigint/1000.0),to_timestamp((x->>'last_at')::bigint/1000.0),x->>'status',x->>'status',
    coalesce((select array_agg(left(v,60)) from jsonb_array_elements_text(x->'items') v),'{}'),
    coalesce((select array_agg(v::uuid) from jsonb_array_elements_text(x->'product_ids') v where v ~ '^[0-9a-f-]{36}$'),'{}'),
    left(coalesce(x->>'excerpt',''),120),coalesce(x->'evidence','{}'),x->>'source_key',p_batch)
   on conflict(source_key) do update set
    last_at=excluded.last_at,items=excluded.items,product_ids=excluded.product_ids,evidence=excluded.evidence,suggested_status=excluded.suggested_status,
    status=case when public.crm_cases.status_source='manual' then public.crm_cases.status else excluded.status end,
    excerpt=case when public.crm_cases.status_source='manual' then public.crm_cases.excerpt else excluded.excerpt end,updated_at=now()
    where (public.crm_cases.last_at,public.crm_cases.items,public.crm_cases.product_ids,public.crm_cases.evidence,public.crm_cases.suggested_status,public.crm_cases.status)
     is distinct from (excluded.last_at,excluded.items,excluded.product_ids,excluded.evidence,excluded.suggested_status,case when public.crm_cases.status_source='manual' then public.crm_cases.status else excluded.status end)
   returning (xmax=0) into v_ins;
   if not found then c_keep:=c_keep+1;elsif v_ins then c_new:=c_new+1;else c_upd:=c_upd+1;end if;
  end loop;
  for x in select value from jsonb_array_elements(coalesce(r->'deals','[]')) loop
   insert into public.crm_deals(customer_id,identity_id,case_source_key,occurred_at,items,product_ids,qty,amount_twd,evidence,source_key,batch_id)
   values(cid,iid,left(coalesce(x->>'case_source_key',''),300),to_timestamp((x->>'occurred_at')::bigint/1000.0),coalesce(x->'items','[]'),
    coalesce((select array_agg(v::uuid) from jsonb_array_elements_text(x->'product_ids') v where v ~ '^[0-9a-f-]{36}$'),'{}'),
    greatest(1,least(200,coalesce((x->>'qty')::int,1))),nullif(x->>'amount_twd','')::int,coalesce(x->'evidence','{}'),x->>'source_key',p_batch)
   on conflict(source_key) do update set items=excluded.items,product_ids=excluded.product_ids,qty=excluded.qty,amount_twd=excluded.amount_twd,evidence=excluded.evidence,updated_at=now()
    where public.crm_deals.status='suggested'
     and (public.crm_deals.items,public.crm_deals.product_ids,public.crm_deals.qty,public.crm_deals.amount_twd,public.crm_deals.evidence) is distinct from (excluded.items,excluded.product_ids,excluded.qty,excluded.amount_twd,excluded.evidence)
   returning (xmax=0) into v_ins;
   if not found then d_keep:=d_keep+1;elsif v_ins then d_new:=d_new+1;else d_upd:=d_upd+1;end if;
  end loop;
  for x in select value from jsonb_array_elements(coalesce(r->'waits','[]')) loop
   insert into public.crm_stock_waits(customer_id,item_text,product_ids,channel,excerpt,evidence,source_key)
   values(cid,left(coalesce(x->>'item_text',''),120),coalesce((select array_agg(v::uuid) from jsonb_array_elements_text(x->'product_ids') v where v ~ '^[0-9a-f-]{36}$'),'{}'),
    left(coalesce(x->>'channel',''),40),left(coalesce(x->>'excerpt',''),120),coalesce(x->'evidence','{}'),x->>'source_key')
   on conflict(source_key) do nothing;
   if found then w_new:=w_new+1;end if;
  end loop;
  cid:=null;iid:=null;
 end loop;
 return jsonb_build_object('cases_new',c_new,'cases_updated',c_upd,'cases_unchanged',c_keep,'deals_new',d_new,'deals_updated',d_upd,'deals_unchanged',d_keep,'waits_new',w_new,'customers_missing',missing);
end$$;
revoke all on function public.admin_crm_import_suggestions(uuid,jsonb) from public,anon;
grant execute on function public.admin_crm_import_suggestions(uuid,jsonb) to authenticated;

-- ── 第一段補齊：客人資料（聯絡管道、介紹來源、聯絡人類型、語言地區、付款方式）與教學／售後待辦 ──
-- 只記客人明確提供或老闆確認的資料；跨平台（例如轉 LINE）以 crm_identities 新增一筆 platform='line' 指向同一位客人，確認後才關聯。
create table if not exists public.crm_customer_meta(
 customer_id uuid primary key references public.customer_profiles(id) on delete cascade,
 first_channel text not null default '' check(length(first_channel)<=40),
 current_channel text not null default '' check(length(current_channel)<=40),
 referral_source text not null default '' check(length(referral_source)<=120),
 contact_types text[] not null default '{customer}' check(contact_types <@ array['customer','friend','supplier','lottery']::text[]),
 language text not null default '' check(length(language)<=40),
 region text not null default '' check(length(region)<=60),
 payment_preferred text not null default '' check(length(payment_preferred)<=40),
 payment_last text not null default '' check(length(payment_last)<=40),
 note text not null default '' check(length(note)<=1000),
 updated_at timestamptz not null default now()
);
-- 教學與售後：掛在案件或成交上的具體待辦，處理完關閉但保留紀錄
create table if not exists public.crm_tasks(
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customer_profiles(id) on delete cascade,
 case_source_key text not null default '' check(length(case_source_key)<=300),
 kind text not null check(kind in ('rebind_tutorial','rebind_failed','delivery_chase','other')),
 title text not null default '' check(length(title)<=200),
 status text not null default 'open' check(status in ('open','done','dismissed')),
 source text not null default 'auto' check(source in ('auto','manual')),
 excerpt text not null default '' check(length(excerpt)<=120),
 evidence jsonb not null default '{}'::jsonb,
 source_key text unique check(source_key is null or length(source_key) between 8 and 300),
 created_at timestamptz not null default now(),
 resolved_at timestamptz
);
create index if not exists crm_tasks_open_idx on public.crm_tasks(status,customer_id);
alter table public.crm_customer_meta enable row level security;
alter table public.crm_tasks enable row level security;
revoke all on public.crm_customer_meta,public.crm_tasks from anon,public;
grant select,insert,update,delete on public.crm_customer_meta,public.crm_tasks to authenticated;
do $$declare t text;begin
 foreach t in array array['crm_customer_meta','crm_tasks'] loop
  execute format('drop policy if exists "admins manage %1$s" on public.%1$I',t);
  execute format('create policy "admins manage %1$s" on public.%1$I for all to authenticated using((select private.is_store_admin())) with check((select private.is_store_admin()))',t);
 end loop;
end$$;
insert into public.crm_settings(key,value) values('display','{"top":["regular","high_value","waiting"],"hidden":[]}') on conflict(key) do nothing;

-- 待辦匯入：只新增不覆蓋（已處理／略過的不會被打開）
create or replace function public.admin_crm_import_tasks(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;x jsonb;cid uuid;n integer:=0;
begin
 if auth.uid() is null or not private.is_store_admin() then raise insufficient_privilege;end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>100 then raise invalid_parameter_value using message='rows must be an array of at most 100';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  select customer_id into cid from public.crm_identities where platform='threads' and external_key=r->>'external_key';
  if cid is null then continue;end if;
  for x in select value from jsonb_array_elements(coalesce(r->'tasks','[]')) loop
   insert into public.crm_tasks(customer_id,case_source_key,kind,title,status,excerpt,evidence,source_key,resolved_at)
   values(cid,left(coalesce(x->>'case_source_key',''),300),x->>'kind',left(coalesce(x->>'title',''),200),coalesce(x->>'status','open'),left(coalesce(x->>'excerpt',''),120),coalesce(x->'evidence','{}'),x->>'source_key',
    case when x->>'status' in ('done','dismissed') then now() end)
   on conflict(source_key) do nothing;
   if found then n:=n+1;end if;
  end loop;
  cid:=null;
 end loop;
 return jsonb_build_object('tasks_new',n);
end$$;
revoke all on function public.admin_crm_import_tasks(jsonb) from public,anon;
grant execute on function public.admin_crm_import_tasks(jsonb) to authenticated;
