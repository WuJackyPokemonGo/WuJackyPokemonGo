-- CRM 第一段：GPT 複驗修正（2026-11-21）。審核分支，驗收後、老闆同意才套用；可重複套用。
-- 需在 supabase/production/crm-threads.sql 與 supabase/review/crm-features.sql 之後套用。
--
-- 1. crm_order_links：網站訂單 → 客人的人工確認關聯（同名客人不自動歸戶）。
-- 2. 重新匯入會更新既有摘錄的遮蔽內容（詢問、待追蹤、案件、成交依據、待辦、等貨），
--    但保留人工標籤、案件人工狀態與備註、成交決定（接受／略過）、待追蹤與待辦的處理結果。
-- 3. 穩定識別：客人以 Threads 資料夾的數字 ID 對應（改暱稱不會變成新客人）；
--    識別鍵改成「數字 ID＋時間＋內容雜湊」，舊版（全串索引）鍵在第一次重匯時原地沿用，不重複新增。
-- 4. 自動標籤與自動建議以最新判斷為準：新判斷沒有的自動標籤刪除；沒有人工內容的自動案件、待確認成交建議刪除。

create table if not exists public.crm_order_links(
 order_id uuid primary key references public.orders(id) on delete cascade,
 customer_id uuid not null references public.customer_profiles(id) on delete cascade,
 confirmed_at timestamptz not null default now(),
 confirmed_by uuid default auth.uid()
);
create index if not exists crm_order_links_customer_idx on public.crm_order_links(customer_id);
alter table public.crm_order_links enable row level security;
revoke all on public.crm_order_links from anon,public;
grant select,insert,update,delete on public.crm_order_links to authenticated;
drop policy if exists "admins manage crm_order_links" on public.crm_order_links;
create policy "admins manage crm_order_links" on public.crm_order_links for all to authenticated using((select private.is_store_admin())) with check((select private.is_store_admin()));

-- 以穩定的數字 ID 找 Threads 身分：先比完整資料夾名稱，再比「…_數字」或純數字
create or replace function private.crm_thread_identity(p_external_key text,p_thread_id text)
returns table(identity_id uuid,customer_id uuid,stored_key text) language sql stable security definer set search_path='' as $$
 select i.id,i.customer_id,i.external_key from public.crm_identities i
 where i.platform='threads' and (i.external_key=p_external_key
  or (coalesce(p_thread_id,'')<>'' and (i.external_key=p_thread_id or right(i.external_key,length(p_thread_id)+1)='_'||p_thread_id)))
 order by (i.external_key=p_external_key) desc limit 1;
$$;
revoke all on function private.crm_thread_identity(text,text) from public,anon,authenticated;

-- 舊識別鍵前綴（threads:<資料夾名稱>:）換成新前綴（threads:t<數字ID>:）時使用
create or replace function private.crm_legacy_key(p_new_key text,p_stored text)
returns text language sql immutable set search_path='' as $$
 select regexp_replace(coalesce(p_new_key,''),'^threads:t[^:]+:','threads:'||coalesce(p_stored,'')||':');
$$;

create or replace function public.admin_crm_import_threads(p_batch uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;i jsonb;t jsonb;f jsonb;cid uuid;iid uuid;ext text;base text;v_alias text;n integer;v_ins boolean;lid uuid;legacy text;cnt integer;incoming text[];
 created integer:=0;matched integer:=0;inq_new integer:=0;inq_upd integer:=0;inq_skip integer:=0;inq_adopt integer:=0;tags_new integer:=0;tags_removed integer:=0;fu_new integer:=0;fu_upd integer:=0;fu_adopt integer:=0;
begin
 if auth.uid() is null or not private.is_store_admin() then raise insufficient_privilege;end if;
 if p_batch is null or not exists(select 1 from public.crm_import_batches where id=p_batch) then raise invalid_parameter_value using message='unknown batch';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>100 then raise invalid_parameter_value using message='rows must be an array of at most 100';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if coalesce(r->>'external_key','')='' then raise invalid_parameter_value using message='external_key required';end if;
  select x.identity_id,x.customer_id,x.stored_key into iid,cid,ext from private.crm_thread_identity(r->>'external_key',r->>'thread_id') x;
  if cid is null then
   base:=left(coalesce(nullif(btrim(r->>'display_name'),''),'Threads 客人'),100);n:=0;
   while exists(select 1 from public.customer_profiles cp where lower(btrim(cp.alias))=lower(btrim(base||case when n=0 then '' else ' #'||right(r->>'external_key',4)||case when n>1 then '-'||n else '' end end))) loop n:=n+1;end loop;
   v_alias:=base||case when n=0 then '' else ' #'||right(r->>'external_key',4)||case when n>1 then '-'||n else '' end end;
   insert into public.customer_profiles(alias,contacts) values(v_alias,jsonb_build_array(jsonb_build_object('platform','Threads','handle',left(coalesce(nullif(btrim(r->>'display_name'),''),r->>'external_key'),200)))) returning id into cid;
   insert into public.crm_identities(customer_id,platform,external_key,display_name,folder) values(cid,'threads',r->>'external_key',left(coalesce(r->>'display_name',''),120),left(coalesce(r->>'folder',''),240)) returning id into iid;
   ext:=r->>'external_key';created:=created+1;
  else matched:=matched+1;end if;
  update public.crm_identities set display_name=left(coalesce(r->>'display_name',display_name),120),folder=left(coalesce(r->>'folder',folder),240),
   first_seen_at=least(coalesce(first_seen_at,to_timestamp((r->>'first_at')::bigint/1000.0)),to_timestamp((r->>'first_at')::bigint/1000.0)),
   last_seen_at=greatest(coalesce(last_seen_at,to_timestamp((r->>'last_at')::bigint/1000.0)),to_timestamp((r->>'last_at')::bigint/1000.0)),
   message_count=greatest(message_count,coalesce((r->>'message_count')::int,0)),customer_message_count=greatest(customer_message_count,coalesce((r->>'customer_message_count')::int,0)),
   last_sender=coalesce(nullif(r->>'last_sender',''),last_sender),summary=left(coalesce(r->>'summary',summary),200),last_batch=p_batch,updated_at=now() where id=iid;
  for i in select value from jsonb_array_elements(coalesce(r->'inquiries','[]')) loop
   -- 舊版識別鍵（全串索引）沿用：同一位客人、同一時間、同一類型、舊格式的那一筆；有多筆時以舊鍵本身判斷
   if not exists(select 1 from public.crm_inquiries where source_key=i->>'source_key') then
    legacy:=regexp_replace(coalesce(i->>'legacy_source_key',''),'^threads:[^:]+:','threads:'||ext||':');
    select count(*) into cnt from public.crm_inquiries q where q.identity_id=iid and q.occurred_at=to_timestamp((i->>'occurred_at')::bigint/1000.0) and q.category=i->>'category' and q.source_key !~ ':m:';
    lid:=null;
    if cnt=1 then select q.id into lid from public.crm_inquiries q where q.identity_id=iid and q.occurred_at=to_timestamp((i->>'occurred_at')::bigint/1000.0) and q.category=i->>'category' and q.source_key !~ ':m:';
    elsif cnt>1 then select q.id into lid from public.crm_inquiries q where q.source_key=legacy and q.identity_id=iid;end if;
    if lid is not null then update public.crm_inquiries set source_key=i->>'source_key' where id=lid;inq_adopt:=inq_adopt+1;end if;
   end if;
   insert into public.crm_inquiries(customer_id,identity_id,occurred_at,category,terms,product_ids,excerpt,evidence,source_key,batch_id)
   values(cid,iid,to_timestamp((i->>'occurred_at')::bigint/1000.0),i->>'category',
    coalesce((select array_agg(left(x,40)) from jsonb_array_elements_text(i->'terms') x),'{}'),
    coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(i->'product_ids') x where x ~ '^[0-9a-f-]{36}$'),'{}'),
    left(coalesce(i->>'excerpt',''),120),coalesce(i->'evidence','{}'),i->>'source_key',p_batch)
   on conflict(source_key) do update set terms=excluded.terms,product_ids=excluded.product_ids,evidence=excluded.evidence,excerpt=excluded.excerpt
    where (public.crm_inquiries.terms,public.crm_inquiries.product_ids,public.crm_inquiries.evidence,public.crm_inquiries.excerpt) is distinct from (excluded.terms,excluded.product_ids,excluded.evidence,excluded.excerpt)
   returning (xmax=0) into v_ins;
   if not found then inq_skip:=inq_skip+1;elsif v_ins then inq_new:=inq_new+1;else inq_upd:=inq_upd+1;end if;
  end loop;
  -- 自動標籤以這次判斷為準（例如只有圖片不再算疑似付款、只是逾期不再算棄單）；手動標籤不動
  if r ? 'tags' then
   incoming:=coalesce((select array_agg(x->>'tag') from jsonb_array_elements(r->'tags') x),'{}');
   delete from public.crm_tags where customer_id=cid and source='auto' and not (tag=any(incoming));
   get diagnostics n=row_count;tags_removed:=tags_removed+n;
  end if;
  for t in select value from jsonb_array_elements(coalesce(r->'tags','[]')) loop
   insert into public.crm_tags(customer_id,tag,source,evidence) values(cid,t->>'tag','auto',coalesce(t->'evidence','{}'))
   on conflict(customer_id,tag) do update set evidence=excluded.evidence where public.crm_tags.source='auto';
   if found then tags_new:=tags_new+1;end if;
  end loop;
  for f in select value from jsonb_array_elements(coalesce(r->'followups','[]')) loop
   if not exists(select 1 from public.crm_followups where source_key=f->>'source_key') then
    legacy:=regexp_replace(coalesce(f->>'legacy_source_key',''),'^threads:[^:]+:','threads:'||ext||':');
    update public.crm_followups set source_key=f->>'source_key' where source_key=legacy and customer_id=cid;
    if found then fu_adopt:=fu_adopt+1;end if;
   end if;
   -- 只更新遮蔽摘錄；處理結果（已處理／略過）保留
   insert into public.crm_followups(customer_id,reason,excerpt,due_on,source_key) values(cid,left(f->>'reason',300),left(coalesce(f->>'excerpt',''),120),(f->>'due_on')::date,f->>'source_key')
   on conflict(source_key) do update set excerpt=excluded.excerpt where public.crm_followups.excerpt is distinct from excluded.excerpt
   returning (xmax=0) into v_ins;
   if found then if v_ins then fu_new:=fu_new+1;else fu_upd:=fu_upd+1;end if;end if;
  end loop;
  cid:=null;iid:=null;ext:=null;
 end loop;
 return jsonb_build_object('customers_created',created,'customers_matched',matched,'inquiries_new',inq_new,'inquiries_updated',inq_upd,'inquiries_skipped',inq_skip,'inquiries_key_adopted',inq_adopt,
  'tags_upserted',tags_new,'tags_removed',tags_removed,'followups_new',fu_new,'followups_updated',fu_upd,'followups_key_adopted',fu_adopt);
end$$;
revoke all on function public.admin_crm_import_threads(uuid,jsonb) from public,anon;
grant execute on function public.admin_crm_import_threads(uuid,jsonb) to authenticated;

create or replace function public.admin_crm_import_suggestions(p_batch uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;x jsonb;cid uuid;iid uuid;ext text;v_ins boolean;keys text[];n integer;
 c_new integer:=0;c_upd integer:=0;c_keep integer:=0;c_rm integer:=0;d_new integer:=0;d_upd integer:=0;d_keep integer:=0;d_rm integer:=0;w_new integer:=0;w_upd integer:=0;adopt integer:=0;missing integer:=0;
begin
 if auth.uid() is null or not private.is_store_admin() then raise insufficient_privilege;end if;
 if p_batch is null or not exists(select 1 from public.crm_import_batches where id=p_batch) then raise invalid_parameter_value using message='unknown batch';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>100 then raise invalid_parameter_value using message='rows must be an array of at most 100';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  select y.identity_id,y.customer_id,y.stored_key into iid,cid,ext from private.crm_thread_identity(r->>'external_key',r->>'thread_id') y;
  if cid is null then missing:=missing+1;continue;end if;
  -- 舊前綴的鍵原地換成新鍵（不重複新增）
  for x in select value from jsonb_array_elements(coalesce(r->'cases','[]')) loop
   update public.crm_cases set source_key=x->>'source_key' where source_key=private.crm_legacy_key(x->>'source_key',ext) and not exists(select 1 from public.crm_cases where source_key=x->>'source_key');
   if found then adopt:=adopt+1;end if;
   update public.crm_deals set case_source_key=x->>'source_key' where customer_id=cid and case_source_key=private.crm_legacy_key(x->>'source_key',ext);
   update public.crm_tasks set case_source_key=x->>'source_key' where customer_id=cid and case_source_key=private.crm_legacy_key(x->>'source_key',ext);
  end loop;
  for x in select value from jsonb_array_elements(coalesce(r->'deals','[]')) loop
   update public.crm_deals set source_key=x->>'source_key' where source_key=private.crm_legacy_key(x->>'source_key',ext) and not exists(select 1 from public.crm_deals where source_key=x->>'source_key');
   if found then adopt:=adopt+1;end if;
  end loop;
  for x in select value from jsonb_array_elements(coalesce(r->'waits','[]')) loop
   update public.crm_stock_waits set source_key=x->>'source_key' where source_key=private.crm_legacy_key(x->>'source_key',ext) and not exists(select 1 from public.crm_stock_waits where source_key=x->>'source_key');
   if found then adopt:=adopt+1;end if;
  end loop;
  for x in select value from jsonb_array_elements(coalesce(r->'cases','[]')) loop
   insert into public.crm_cases(customer_id,identity_id,opened_at,last_at,status,suggested_status,items,product_ids,excerpt,evidence,source_key,batch_id)
   values(cid,iid,to_timestamp((x->>'opened_at')::bigint/1000.0),to_timestamp((x->>'last_at')::bigint/1000.0),x->>'status',x->>'status',
    coalesce((select array_agg(left(v,60)) from jsonb_array_elements_text(x->'items') v),'{}'),
    coalesce((select array_agg(v::uuid) from jsonb_array_elements_text(x->'product_ids') v where v ~ '^[0-9a-f-]{36}$'),'{}'),
    left(coalesce(x->>'excerpt',''),120),coalesce(x->'evidence','{}'),x->>'source_key',p_batch)
   -- 人工改過的狀態保留，新判斷記在 suggested_status；摘錄一律更新為最新遮蔽版本
   on conflict(source_key) do update set
    last_at=excluded.last_at,items=excluded.items,product_ids=excluded.product_ids,evidence=excluded.evidence,suggested_status=excluded.suggested_status,excerpt=excluded.excerpt,
    status=case when public.crm_cases.status_source='manual' then public.crm_cases.status else excluded.status end,updated_at=now()
    where (public.crm_cases.last_at,public.crm_cases.items,public.crm_cases.product_ids,public.crm_cases.evidence,public.crm_cases.suggested_status,public.crm_cases.excerpt,public.crm_cases.status)
     is distinct from (excluded.last_at,excluded.items,excluded.product_ids,excluded.evidence,excluded.suggested_status,excluded.excerpt,case when public.crm_cases.status_source='manual' then public.crm_cases.status else excluded.status end)
   returning (xmax=0) into v_ins;
   if not found then c_keep:=c_keep+1;elsif v_ins then c_new:=c_new+1;else c_upd:=c_upd+1;end if;
  end loop;
  for x in select value from jsonb_array_elements(coalesce(r->'deals','[]')) loop
   insert into public.crm_deals(customer_id,identity_id,case_source_key,occurred_at,items,product_ids,qty,amount_twd,evidence,source_key,batch_id)
   values(cid,iid,left(coalesce(x->>'case_source_key',''),300),to_timestamp((x->>'occurred_at')::bigint/1000.0),coalesce(x->'items','[]'),
    coalesce((select array_agg(v::uuid) from jsonb_array_elements_text(x->'product_ids') v where v ~ '^[0-9a-f-]{36}$'),'{}'),
    greatest(1,least(200,coalesce((x->>'qty')::int,1))),nullif(x->>'amount_twd','')::int,coalesce(x->'evidence','{}'),x->>'source_key',p_batch)
   -- 待確認的建議：整筆更新。已接受／略過：決定、金額、退款不動，只更新遮蔽後的依據摘錄
   on conflict(source_key) do update set
    items=case when public.crm_deals.status='suggested' then excluded.items else public.crm_deals.items end,
    product_ids=case when public.crm_deals.status='suggested' then excluded.product_ids else public.crm_deals.product_ids end,
    qty=case when public.crm_deals.status='suggested' then excluded.qty else public.crm_deals.qty end,
    amount_twd=case when public.crm_deals.status='suggested' then excluded.amount_twd else public.crm_deals.amount_twd end,
    case_source_key=excluded.case_source_key,
    evidence=case when public.crm_deals.status='suggested' then excluded.evidence else public.crm_deals.evidence||jsonb_build_object('amount_excerpt',coalesce(excluded.evidence->>'amount_excerpt','')) end,
    updated_at=now()
    where (public.crm_deals.items,public.crm_deals.product_ids,public.crm_deals.qty,public.crm_deals.amount_twd,public.crm_deals.evidence,public.crm_deals.case_source_key) is distinct from
     (case when public.crm_deals.status='suggested' then excluded.items else public.crm_deals.items end,case when public.crm_deals.status='suggested' then excluded.product_ids else public.crm_deals.product_ids end,
      case when public.crm_deals.status='suggested' then excluded.qty else public.crm_deals.qty end,case when public.crm_deals.status='suggested' then excluded.amount_twd else public.crm_deals.amount_twd end,
      case when public.crm_deals.status='suggested' then excluded.evidence else public.crm_deals.evidence||jsonb_build_object('amount_excerpt',coalesce(excluded.evidence->>'amount_excerpt','')) end,excluded.case_source_key)
   returning (xmax=0) into v_ins;
   if not found then d_keep:=d_keep+1;elsif v_ins then d_new:=d_new+1;else d_upd:=d_upd+1;end if;
  end loop;
  for x in select value from jsonb_array_elements(coalesce(r->'waits','[]')) loop
   insert into public.crm_stock_waits(customer_id,item_text,product_ids,channel,excerpt,evidence,source_key)
   values(cid,left(coalesce(x->>'item_text',''),120),coalesce((select array_agg(v::uuid) from jsonb_array_elements_text(x->'product_ids') v where v ~ '^[0-9a-f-]{36}$'),'{}'),
    left(coalesce(x->>'channel',''),40),left(coalesce(x->>'excerpt',''),120),coalesce(x->'evidence','{}'),x->>'source_key')
   on conflict(source_key) do update set excerpt=excluded.excerpt where public.crm_stock_waits.excerpt is distinct from excluded.excerpt
   returning (xmax=0) into v_ins;
   if found then if v_ins then w_new:=w_new+1;else w_upd:=w_upd+1;end if;end if;
  end loop;
  -- 這次判斷已不存在的自動建議：沒有人工內容的自動案件、待確認且沒有備註的成交建議刪除；人工改過或已決定的保留
  if r ? 'cases' then
   keys:=coalesce((select array_agg(v->>'source_key') from jsonb_array_elements(r->'cases') v),'{}');
   delete from public.crm_cases c where c.customer_id=cid and c.identity_id is not distinct from iid and c.status_source='auto' and c.note='' and not (c.source_key=any(keys))
    and not exists(select 1 from public.crm_deals d where d.case_source_key=c.source_key and d.status<>'suggested')
    and not exists(select 1 from public.crm_tasks t where t.case_source_key=c.source_key and (t.source='manual' or t.status<>'open'));
   get diagnostics n=row_count;c_rm:=c_rm+n;
  end if;
  if r ? 'deals' then
   keys:=coalesce((select array_agg(v->>'source_key') from jsonb_array_elements(r->'deals') v),'{}');
   delete from public.crm_deals d where d.customer_id=cid and d.identity_id is not distinct from iid and d.status='suggested' and d.source='threads' and d.note='' and not (d.source_key=any(keys));
   get diagnostics n=row_count;d_rm:=d_rm+n;
  end if;
  cid:=null;iid:=null;ext:=null;
 end loop;
 return jsonb_build_object('cases_new',c_new,'cases_updated',c_upd,'cases_unchanged',c_keep,'cases_removed',c_rm,'deals_new',d_new,'deals_updated',d_upd,'deals_unchanged',d_keep,'deals_removed',d_rm,
  'waits_new',w_new,'waits_updated',w_upd,'suggestion_keys_adopted',adopt,'customers_missing',missing);
end$$;
revoke all on function public.admin_crm_import_suggestions(uuid,jsonb) from public,anon;
grant execute on function public.admin_crm_import_suggestions(uuid,jsonb) to authenticated;

-- 待辦匯入：新增；已存在的只更新遮蔽摘錄，處理結果（已處理／略過）不動
create or replace function public.admin_crm_import_tasks(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;x jsonb;cid uuid;iid uuid;ext text;n integer:=0;u integer:=0;v_ins boolean;
begin
 if auth.uid() is null or not private.is_store_admin() then raise insufficient_privilege;end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>100 then raise invalid_parameter_value using message='rows must be an array of at most 100';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  select y.identity_id,y.customer_id,y.stored_key into iid,cid,ext from private.crm_thread_identity(r->>'external_key',r->>'thread_id') y;
  if cid is null then continue;end if;
  for x in select value from jsonb_array_elements(coalesce(r->'tasks','[]')) loop
   update public.crm_tasks set source_key=x->>'source_key' where source_key=private.crm_legacy_key(x->>'source_key',ext) and not exists(select 1 from public.crm_tasks where source_key=x->>'source_key');
   insert into public.crm_tasks(customer_id,case_source_key,kind,title,status,excerpt,evidence,source_key,resolved_at)
   values(cid,left(coalesce(x->>'case_source_key',''),300),x->>'kind',left(coalesce(x->>'title',''),200),coalesce(x->>'status','open'),left(coalesce(x->>'excerpt',''),120),coalesce(x->'evidence','{}'),x->>'source_key',
    case when x->>'status' in ('done','dismissed') then now() end)
   on conflict(source_key) do update set excerpt=excluded.excerpt where public.crm_tasks.excerpt is distinct from excluded.excerpt
   returning (xmax=0) into v_ins;
   if found then if v_ins then n:=n+1;else u:=u+1;end if;end if;
  end loop;
  cid:=null;iid:=null;ext:=null;
 end loop;
 return jsonb_build_object('tasks_new',n,'tasks_updated',u);
end$$;
revoke all on function public.admin_crm_import_tasks(jsonb) from public,anon;
grant execute on function public.admin_crm_import_tasks(jsonb) to authenticated;
