-- 客人可填多個平台聯絡方式：contacts = [{"platform":"官方LINE","handle":"..."}]
-- 舊的 contact_private 內容搬成一列「其他」，不刪除任何資料。
alter table public.customer_profiles add column if not exists contacts jsonb not null default '[]'::jsonb;

update public.customer_profiles
 set contacts=jsonb_build_array(jsonb_build_object('platform','其他','handle',btrim(contact_private))),contact_private=''
 where btrim(contact_private)<>'' and contacts='[]'::jsonb;

create or replace function private.check_customer_profile() returns trigger language plpgsql set search_path='' as $$
declare e jsonb;
begin
 if jsonb_typeof(new.contacts) is distinct from 'array' or jsonb_array_length(new.contacts)>20 then
  raise check_violation using message='contacts must be an array of at most 20 entries';
 end if;
 for e in select value from jsonb_array_elements(new.contacts) loop
  if jsonb_typeof(e) is distinct from 'object' or (select count(*) from jsonb_object_keys(e))<>2
   or jsonb_typeof(e->'platform') is distinct from 'string' or jsonb_typeof(e->'handle') is distinct from 'string'
   or length(btrim(e->>'platform')) not between 1 and 30 or length(btrim(e->>'handle')) not between 1 and 200 then
   raise check_violation using message='each contact needs platform (1-30) and handle (1-200)';
  end if;
 end loop;
 if tg_op='UPDATE' then new.updated_at:=now(); end if;
 return new;
end$$;
drop trigger if exists customer_profiles_touch on public.customer_profiles;
drop trigger if exists customer_profiles_check on public.customer_profiles;
create trigger customer_profiles_check before insert or update on public.customer_profiles for each row execute function private.check_customer_profile();
drop function if exists private.touch_customer_profile();
