create table if not exists private.analytics_secret(id boolean primary key default true check(id),value text not null default gen_random_uuid()::text);
insert into private.analytics_secret(id)values(true)on conflict do nothing;
create table if not exists private.analytics_event_keys(id uuid primary key,created_at timestamptz not null default now());
create table if not exists private.analytics_visitors(day date not null,visitor_hash text not null,primary key(day,visitor_hash));
create table if not exists private.analytics_limits(key text primary key,count integer not null,expires_at timestamptz not null);
create table if not exists private.analytics_counts(day date not null,event text not null,product_key text not null default '',count integer not null default 0,primary key(day,event,product_key));
alter table private.analytics_secret enable row level security;alter table private.analytics_event_keys enable row level security;alter table private.analytics_visitors enable row level security;alter table private.analytics_limits enable row level security;alter table private.analytics_counts enable row level security;
revoke all on private.analytics_secret,private.analytics_event_keys,private.analytics_visitors,private.analytics_limits,private.analytics_counts from public,anon,authenticated;

create or replace function private.track_store_event(p_event text,p_session uuid,p_event_id uuid,p_product uuid default null)returns boolean language plpgsql security definer set search_path='' as $$
declare d date:=(now()at time zone'Asia/Taipei')::date;visitor text;ip_hash text;secret text;key_value text;count_value integer;key_limit integer;expiry timestamptz;headers jsonb;begin
 if p_event not in ('page_view','product_view','cart_add','cart_remove','search_results','search_empty','inquiry_copy')or p_event is null or p_session is null or p_event_id is null then return false;end if;
 if coalesce((select(value->>'analytics_enabled')::boolean from public.app_settings where key='jobs'),true)=false then return false;end if;
 if p_event in ('product_view','cart_add','cart_remove')and p_product is null then return false;end if;
 if p_product is not null and not exists(select 1 from public.products where id=p_product and is_live and publication_status='published')then return false;end if;
 if exists(select 1 from private.analytics_event_keys where id=p_event_id)then return false;end if;
 select value into secret from private.analytics_secret where id=true;
 visitor:=encode(sha256(convert_to(secret||d::text||p_session::text,'UTF8')),'hex');headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 ip_hash:=encode(sha256(convert_to(secret||d::text||left(coalesce(headers->>'x-forwarded-for','unknown'),128),'UTF8')),'hex');
 for key_value,key_limit,expiry in select *from(values('day:'||d::text,20000,now()+interval'2 days'),('session:'||visitor,500,now()+interval'2 days'),('rate:'||ip_hash||date_trunc('minute',now())::text,60,now()+interval'2 hours'))v(k,n,e)loop
  insert into private.analytics_limits(key,count,expires_at)values(key_value,1,expiry)on conflict(key)do update set count=private.analytics_limits.count+1 returning count into count_value;
  if count_value>key_limit then return false;end if;
 end loop;
 insert into private.analytics_event_keys(id)values(p_event_id)on conflict do nothing;if not found then return false;end if;
 insert into private.analytics_visitors(day,visitor_hash)values(d,visitor)on conflict do nothing;
 insert into private.analytics_counts(day,event,product_key,count)values(d,p_event,coalesce(p_product::text,''),1)on conflict(day,event,product_key)do update set count=private.analytics_counts.count+1;return true;
end $$;
create or replace function public.track_store_event(p_event text,p_session uuid,p_event_id uuid,p_product uuid default null)returns boolean language sql security definer set search_path='' as $$select private.track_store_event(p_event,p_session,p_event_id,p_product);$$;
revoke all on function private.track_store_event(text,uuid,uuid,uuid),public.track_store_event(text,uuid,uuid,uuid)from public;
revoke all on function private.track_store_event(text,uuid,uuid,uuid)from anon,authenticated;
grant execute on function public.track_store_event(text,uuid,uuid,uuid)to anon,authenticated;

create or replace function private.analytics_report(p_from date,p_to date)returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('from',p_from,'to',p_to,'timezone','Asia/Taipei','sessions',(select count(*)from private.analytics_visitors where day between p_from and p_to),'events',(select coalesce(jsonb_object_agg(event,count),'{}')from(select event,sum(count)count from private.analytics_counts where day between p_from and p_to group by event)c),'daily',(select coalesce(jsonb_agg(to_jsonb(x)order by x.day),'[]')from(select c.day,sum(c.count)filter(where event='page_view')page_views,sum(c.count)filter(where event='search_empty')search_empty,sum(c.count)filter(where event='inquiry_copy')inquiry_copies from private.analytics_counts c where c.day between p_from and p_to group by c.day)x),'popular',(select coalesce(jsonb_agg(to_jsonb(x)order by x.views desc),'[]')from(select c.product_key,min(p.name_zh)name,sum(c.count)views from private.analytics_counts c left join public.products p on p.id::text=c.product_key where c.event='product_view'and c.day between p_from and p_to group by c.product_key order by sum(c.count)desc limit 10)x),'daily_cap_reached',exists(select 1 from private.analytics_limits where key like'day:%'and count>20000 and expires_at>now()));
$$;
create or replace function public.admin_analytics_report(p_from date,p_to date)returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not private.is_store_admin()or auth.uid()is null then raise insufficient_privilege;end if;if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise invalid_parameter_value;end if;return private.analytics_report(p_from,p_to);end $$;
revoke all on function private.analytics_report(date,date),public.admin_analytics_report(date,date)from public,anon;
grant execute on function public.admin_analytics_report(date,date)to authenticated;
