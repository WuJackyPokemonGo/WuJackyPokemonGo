-- CRM v1：Threads 客人身分、詢問紀錄、標籤、待追蹤與匯入批次。
-- 沿用 customer_profiles（客人名單），不另建客戶系統。只有管理員可讀寫；公開網站與 anon 一律無權限。
-- 不存私訊原文：只有遮蔽後 60 字內摘錄與證據位置（資料夾＋時間戳），原始匯出檔留在擁有人手上。
-- 可重複套用；匯入以 source_key／(platform, external_key) 防重複，重跑不會新增重複資料。

create table if not exists public.crm_import_batches(
 id uuid primary key default gen_random_uuid(),
 source text not null check(source in ('threads','line','manual')),
 file_sha256 text not null default '' check(file_sha256='' or file_sha256 ~ '^[0-9a-f]{64}$'),
 stats jsonb not null default '{}'::jsonb,
 result jsonb not null default '{}'::jsonb,
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 created_by uuid default auth.uid()
);
create table if not exists public.crm_identities(
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customer_profiles(id) on delete cascade,
 platform text not null check(platform in ('threads','line','instagram','other')),
 external_key text not null check(length(external_key) between 1 and 200),
 display_name text not null default '' check(length(display_name)<=120),
 folder text not null default '' check(length(folder)<=240),
 first_seen_at timestamptz,
 last_seen_at timestamptz,
 message_count integer not null default 0 check(message_count>=0),
 customer_message_count integer not null default 0 check(customer_message_count>=0),
 last_sender text not null default '' check(last_sender in ('','customer','owner')),
 last_batch uuid references public.crm_import_batches(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(platform,external_key)
);
create index if not exists crm_identities_customer_idx on public.crm_identities(customer_id);
create table if not exists public.crm_inquiries(
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customer_profiles(id) on delete cascade,
 identity_id uuid references public.crm_identities(id) on delete cascade,
 occurred_at timestamptz not null,
 category text not null check(category in ('price','stock','buy','payment','delivery')),
 terms text[] not null default '{}' check(cardinality(terms)<=5),
 product_ids uuid[] not null default '{}' check(cardinality(product_ids)<=10),
 excerpt text not null default '' check(length(excerpt)<=120),
 evidence jsonb not null default '{}'::jsonb,
 source_key text not null unique check(length(source_key) between 8 and 300),
 batch_id uuid references public.crm_import_batches(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists crm_inquiries_customer_idx on public.crm_inquiries(customer_id,occurred_at desc);
create index if not exists crm_inquiries_terms_idx on public.crm_inquiries using gin(terms);
create table if not exists public.crm_tags(
 customer_id uuid not null references public.customer_profiles(id) on delete cascade,
 tag text not null check(tag ~ '^[a-z_]{2,40}$' or length(btrim(tag)) between 1 and 30),
 source text not null default 'manual' check(source in ('auto','manual')),
 evidence jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 primary key(customer_id,tag)
);
create table if not exists public.crm_followups(
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customer_profiles(id) on delete cascade,
 reason text not null check(length(btrim(reason)) between 1 and 300),
 excerpt text not null default '' check(length(excerpt)<=120),
 status text not null default 'open' check(status in ('open','done','dismissed')),
 due_on date,
 note text not null default '' check(length(note)<=1000),
 source_key text unique check(source_key is null or length(source_key) between 8 and 300),
 created_at timestamptz not null default now(),
 resolved_at timestamptz
);
create index if not exists crm_followups_open_idx on public.crm_followups(status,due_on);

alter table public.crm_import_batches enable row level security;
alter table public.crm_identities enable row level security;
alter table public.crm_inquiries enable row level security;
alter table public.crm_tags enable row level security;
alter table public.crm_followups enable row level security;
revoke all on public.crm_import_batches,public.crm_identities,public.crm_inquiries,public.crm_tags,public.crm_followups from anon,public;
grant select,insert,update,delete on public.crm_import_batches,public.crm_identities,public.crm_inquiries,public.crm_tags,public.crm_followups to authenticated;
do $$declare t text;begin
 foreach t in array array['crm_import_batches','crm_identities','crm_inquiries','crm_tags','crm_followups'] loop
  execute format('drop policy if exists "admins manage %1$s" on public.%1$I',t);
  execute format('create policy "admins manage %1$s" on public.%1$I for all to authenticated using((select private.is_store_admin())) with check((select private.is_store_admin()))',t);
 end loop;
end$$;

-- 匯入一批（最多 100 位客人）。管理員才能呼叫；客人以 (threads, external_key) 對應，絕不以暱稱自動合併。
create or replace function public.admin_crm_import_threads(p_batch uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;i jsonb;t jsonb;f jsonb;cid uuid;iid uuid;base text;v_alias text;n integer;v_ins boolean;
 created integer:=0;matched integer:=0;inq_new integer:=0;inq_upd integer:=0;inq_skip integer:=0;tags_new integer:=0;fu_new integer:=0;
begin
 if auth.uid() is null or not private.is_store_admin() then raise insufficient_privilege;end if;
 if p_batch is null or not exists(select 1 from public.crm_import_batches where id=p_batch) then raise invalid_parameter_value using message='unknown batch';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>100 then raise invalid_parameter_value using message='rows must be an array of at most 100';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if coalesce(r->>'external_key','')='' then raise invalid_parameter_value using message='external_key required';end if;
  select id,customer_id into iid,cid from public.crm_identities where platform='threads' and external_key=r->>'external_key';
  if cid is null then
   base:=left(coalesce(nullif(btrim(r->>'display_name'),''),'Threads 客人'),100);n:=0;
   while exists(select 1 from public.customer_profiles cp where lower(btrim(cp.alias))=lower(btrim(base||case when n=0 then '' else ' #'||right(r->>'external_key',4)||case when n>1 then '-'||n else '' end end))) loop n:=n+1;end loop;
   v_alias:=base||case when n=0 then '' else ' #'||right(r->>'external_key',4)||case when n>1 then '-'||n else '' end end;
   insert into public.customer_profiles(alias,contacts) values(v_alias,jsonb_build_array(jsonb_build_object('platform','Threads','handle',left(coalesce(nullif(btrim(r->>'display_name'),''),r->>'external_key'),200)))) returning id into cid;
   insert into public.crm_identities(customer_id,platform,external_key,display_name,folder) values(cid,'threads',r->>'external_key',left(coalesce(r->>'display_name',''),120),left(coalesce(r->>'folder',''),240)) returning id into iid;
   created:=created+1;
  else matched:=matched+1;end if;
  update public.crm_identities set display_name=left(coalesce(r->>'display_name',display_name),120),folder=left(coalesce(r->>'folder',folder),240),
   first_seen_at=least(coalesce(first_seen_at,to_timestamp((r->>'first_at')::bigint/1000.0)),to_timestamp((r->>'first_at')::bigint/1000.0)),
   last_seen_at=greatest(coalesce(last_seen_at,to_timestamp((r->>'last_at')::bigint/1000.0)),to_timestamp((r->>'last_at')::bigint/1000.0)),
   message_count=greatest(message_count,coalesce((r->>'message_count')::int,0)),customer_message_count=greatest(customer_message_count,coalesce((r->>'customer_message_count')::int,0)),
   last_sender=coalesce(nullif(r->>'last_sender',''),last_sender),last_batch=p_batch,updated_at=now() where id=iid;
  for i in select value from jsonb_array_elements(coalesce(r->'inquiries','[]')) loop
   insert into public.crm_inquiries(customer_id,identity_id,occurred_at,category,terms,product_ids,excerpt,evidence,source_key,batch_id)
   values(cid,iid,to_timestamp((i->>'occurred_at')::bigint/1000.0),i->>'category',
    coalesce((select array_agg(left(x,40)) from jsonb_array_elements_text(i->'terms') x),'{}'),
    coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(i->'product_ids') x where x ~ '^[0-9a-f-]{36}$'),'{}'),
    left(coalesce(i->>'excerpt',''),120),coalesce(i->'evidence','{}'),i->>'source_key',p_batch)
   on conflict(source_key) do update set terms=excluded.terms,product_ids=excluded.product_ids,evidence=excluded.evidence
    where (public.crm_inquiries.terms,public.crm_inquiries.product_ids,public.crm_inquiries.evidence) is distinct from (excluded.terms,excluded.product_ids,excluded.evidence)
   returning (xmax=0) into v_ins;
   -- 重新匯入時，辨識規則更新（例如暱稱清單）會刷新品項欄位；內容相同則略過
   if not found then inq_skip:=inq_skip+1;elsif v_ins then inq_new:=inq_new+1;else inq_upd:=inq_upd+1;end if;
  end loop;
  for t in select value from jsonb_array_elements(coalesce(r->'tags','[]')) loop
   insert into public.crm_tags(customer_id,tag,source,evidence) values(cid,t->>'tag','auto',coalesce(t->'evidence','{}'))
   on conflict(customer_id,tag) do update set evidence=excluded.evidence where public.crm_tags.source='auto';
   if found then tags_new:=tags_new+1;end if;
  end loop;
  for f in select value from jsonb_array_elements(coalesce(r->'followups','[]')) loop
   insert into public.crm_followups(customer_id,reason,excerpt,due_on,source_key) values(cid,left(f->>'reason',300),left(coalesce(f->>'excerpt',''),120),(f->>'due_on')::date,f->>'source_key')
   on conflict(source_key) do nothing;
   if found then fu_new:=fu_new+1;end if;
  end loop;
  cid:=null;iid:=null;
 end loop;
 return jsonb_build_object('customers_created',created,'customers_matched',matched,'inquiries_new',inq_new,'inquiries_updated',inq_upd,'inquiries_skipped',inq_skip,'tags_upserted',tags_new,'followups_new',fu_new);
end$$;
revoke all on function public.admin_crm_import_threads(uuid,jsonb) from public,anon;
grant execute on function public.admin_crm_import_threads(uuid,jsonb) to authenticated;
