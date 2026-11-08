-- 客人名單（熟客統計）
-- 只有管理員可讀寫。客人名稱、聯絡資料、歷史購買都存在這兩張表，不放進公開 repo 的任何資料檔。
-- 歷史購買獨立於 orders：不扣庫存、不進營收報表，只供客人名單統計。

create table if not exists public.customer_profiles(
 id uuid primary key default gen_random_uuid(),
 alias text not null check(length(btrim(alias)) between 1 and 120),
 other_aliases text[] not null default '{}' check(cardinality(other_aliases)<=20),
 contact_private text not null default '' check(length(contact_private)<=500),
 do_not_market boolean not null default false,
 note_private text not null default '' check(length(note_private)<=2000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists customer_profiles_alias_key on public.customer_profiles(lower(btrim(alias)));

create table if not exists public.customer_history_purchases(
 id uuid primary key default gen_random_uuid(),
 customer_alias text not null check(length(btrim(customer_alias)) between 1 and 120),
 purchased_on date not null check(purchased_on between date '2020-01-01' and date '2100-12-31'),
 purchased_time text not null default '' check(purchased_time='' or purchased_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 item_text text not null check(length(btrim(item_text)) between 1 and 500),
 amount_twd integer not null check(amount_twd between 0 and 100000000),
 channel text not null default '' check(length(channel)<=60),
 note_private text not null default '' check(length(note_private)<=1000),
 import_key text not null unique check(length(import_key) between 8 and 200),
 import_batch text not null default '' check(length(import_batch)<=120),
 created_at timestamptz not null default now()
);
create index if not exists customer_history_alias_idx on public.customer_history_purchases(lower(btrim(customer_alias)));

alter table public.customer_profiles enable row level security;
alter table public.customer_history_purchases enable row level security;
revoke all on public.customer_profiles,public.customer_history_purchases from anon,public;
grant select,insert,update,delete on public.customer_profiles,public.customer_history_purchases to authenticated;

drop policy if exists "admins manage customer profiles" on public.customer_profiles;
create policy "admins manage customer profiles" on public.customer_profiles for all to authenticated
 using((select private.is_store_admin())) with check((select private.is_store_admin()));
drop policy if exists "admins manage customer history" on public.customer_history_purchases;
create policy "admins manage customer history" on public.customer_history_purchases for all to authenticated
 using((select private.is_store_admin())) with check((select private.is_store_admin()));

create or replace function private.touch_customer_profile() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at:=now();return new;end$$;
drop trigger if exists customer_profiles_touch on public.customer_profiles;
create trigger customer_profiles_touch before update on public.customer_profiles for each row execute function private.touch_customer_profile();
