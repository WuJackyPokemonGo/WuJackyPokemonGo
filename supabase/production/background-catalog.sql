-- Admin edits overlay the versioned research catalog. app_settings and audit_logs
-- already participate in the application's encrypted and scheduled backups.
begin;

create or replace function private.validate_background_record(p_id text,p_record jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare k text; v jsonb; p jsonb; d text;
allowed text[]:=array['name_zh','name_en','type','series','series_zh','region_en','region_zh','year','start_date','end_date','image_source','source','official_sources','catalog_sources','method_zh','method_en','notes','notes_en','pokemon','evolved_pokemon','related_product_ids','release_state','verification','date_status','date_conflict','verification_note_zh','verification_note_en','checked_on'];
begin
 if p_id !~ '^BG-([0-9]{4}|U-[0-9a-f-]{36})$' or jsonb_typeof(p_record) is distinct from 'object' or octet_length(p_record::text)>131072 then raise invalid_parameter_value using message='Invalid background record';end if;
 if exists(select 1 from jsonb_object_keys(p_record) key where key<>all(allowed)) then raise invalid_parameter_value using message='Unsupported background field';end if;
 if length(btrim(coalesce(p_record->>'name_zh',''))) not between 1 and 200 or length(btrim(coalesce(p_record->>'name_en',''))) not between 1 and 200 then raise invalid_parameter_value using message='Background names are required';end if;
 if p_record->>'type' not in ('location','special') or p_record->>'type' is null or p_record->>'release_state' not in ('released','upcoming','needs-verification') or p_record->>'release_state' is null or p_record->>'verification' not in ('official-event-confirmed','catalog-crosschecked','catalogued-needs-event-check','owner-confirmed') or p_record->>'verification' is null then raise invalid_parameter_value using message='Invalid background classification';end if;
 foreach k in array array['name_zh','name_en','type','series','series_zh','region_en','region_zh','year','start_date','end_date','image_source','source','method_zh','method_en','release_state','verification','date_status','verification_note_zh','verification_note_en','checked_on'] loop
  if p_record ? k and jsonb_typeof(p_record->k) not in ('string','null') then raise invalid_parameter_value using message='Background text field has invalid type';end if;
  if length(coalesce(p_record->>k,''))>5000 then raise invalid_parameter_value using message='Background text is too long';end if;
 end loop;
 if coalesce(p_record->>'year','')<>'' and p_record->>'year' !~ '^20[0-9]{2}$' then raise invalid_parameter_value using message='Invalid background year';end if;
 foreach k in array array['start_date','end_date','checked_on'] loop
  d:=nullif(p_record->>k,'');
  if d is not null and (d !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (d::date)::text<>d) then raise invalid_parameter_value using message='Invalid background date';end if;
 end loop;
 if nullif(p_record->>'start_date','') is not null and nullif(p_record->>'end_date','') is not null and (p_record->>'end_date')::date<(p_record->>'start_date')::date then raise invalid_parameter_value using message='Background end date precedes start date';end if;
 if coalesce(p_record->>'image_source','') !~* '^https://[^[:space:]#@]+\.(jpe?g|png|webp)(\?[^[:space:]#]*)?$' then raise invalid_parameter_value using message='Use a direct HTTPS JPG, PNG or WebP image URL';end if;
 foreach k in array array['official_sources','catalog_sources','notes','notes_en','related_product_ids','pokemon','evolved_pokemon'] loop
  if jsonb_typeof(p_record->k) is distinct from 'array' or jsonb_array_length(p_record->k)>500 then raise invalid_parameter_value using message='Invalid background list';end if;
  for v in select value from jsonb_array_elements(p_record->k) loop
   if k in ('pokemon','evolved_pokemon') then
    p:=v;
    if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'dex') is distinct from 'number' or (p->>'dex') !~ '^[0-9]+$' or (p->>'dex')::numeric not between 1 and 9999 or length(btrim(coalesce(p->>'name_zh',''))) not between 1 and 200 or length(btrim(coalesce(p->>'name_en',''))) not between 1 and 200 or exists(select 1 from jsonb_object_keys(p) key where key not in ('dex','name_zh','name_en','variant_id','start_date','method_zh','method_en')) then raise invalid_parameter_value using message='Invalid eligible Pokemon';end if;
    for d in select key from jsonb_object_keys(p) key where key<>'dex' loop
     if jsonb_typeof(p->d) is distinct from 'string' or length(p->>d)>5000 then raise invalid_parameter_value using message='Invalid Pokemon text';end if;
    end loop;
   else
    if jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}')>2000 then raise invalid_parameter_value using message='Invalid background list item';end if;
    if k in ('official_sources','catalog_sources') and v#>>'{}' !~ '^https://[^[:space:]]+$' then raise invalid_parameter_value using message='Sources must use HTTPS';end if;
    if k='related_product_ids' and v#>>'{}' !~ '^[0-9a-f-]{36}$' then raise invalid_parameter_value using message='Invalid related product ID';end if;
   end if;
  end loop;
 end loop;
 if coalesce(p_record->>'source','')<>'' and p_record->>'source' !~ '^https://[^[:space:]]+$' then raise invalid_parameter_value using message='Source must use HTTPS';end if;
 if p_record->>'verification'='official-event-confirmed' and jsonb_array_length(p_record->'official_sources')=0 then raise invalid_parameter_value using message='Official verification needs an official source';end if;
 if p_record->>'verification'='catalog-crosschecked' and (select count(distinct x) from jsonb_array_elements_text(p_record->'catalog_sources') x)<2 then raise invalid_parameter_value using message='Catalog cross-check needs two source URLs';end if;
 return p_record;
end $$;

create or replace function private.background_catalog_public()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('background_id',e.key,'is_visible',coalesce((e.value->>'is_visible')::boolean,false),'record',case when e.value->>'is_visible'='true' then e.value->'record' else null end) order by e.key),'[]'::jsonb)
 from public.app_settings s cross join lateral jsonb_each(s.value->'entries') e
 where s.key='background_catalog_overrides';
$$;

create or replace function public.background_catalog_overrides()
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.background_catalog_public();
$$;

create or replace function private.admin_background_catalog(p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();document jsonb;entries jsonb;receipts jsonb;old_entry jsonb;new_entry jsonb;receipt jsonb;fingerprint text;bid text;expected bigint;current_version bigint;entry_count integer;
begin
 if actor is null or not private.is_store_admin() then raise insufficient_privilege using message='Administrator required';end if;
 if p_action='list' then
  return coalesce((select value->'entries' from public.app_settings where key='background_catalog_overrides'),'{}'::jsonb);
 end if;
 if p_action<>'save' or p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' then raise invalid_parameter_value using message='Invalid background action';end if;
 bid:=p_payload->>'background_id';
 if bid is null or bid !~ '^BG-([0-9]{4}|U-[0-9a-f-]{36})$' or jsonb_typeof(p_payload->'expected_version') is distinct from 'number' or (p_payload->>'expected_version') !~ '^[0-9]+$' or jsonb_typeof(p_payload->'is_visible') is distinct from 'boolean' then raise invalid_parameter_value using message='Invalid background save request';end if;
 expected:=(p_payload->>'expected_version')::bigint;
 perform private.validate_background_record(bid,p_payload->'record');
 fingerprint:=md5(p_payload::text);
 insert into public.app_settings(key,value,updated_by) values('background_catalog_overrides','{"entries":{},"receipts":{}}'::jsonb,actor) on conflict(key) do nothing;
 select value into document from public.app_settings where key='background_catalog_overrides' for update;
 entries:=coalesce(document->'entries','{}');receipts:=coalesce(document->'receipts','{}');receipt:=receipts->p_request_id::text;
 if receipt is not null then
  if receipt->>'actor'<>actor::text or receipt->>'fingerprint'<>fingerprint then raise sqlstate 'PT409' using message='Background request key already used for another change';end if;
  return receipt->'result';
 end if;
 old_entry:=entries->bid;current_version:=coalesce((old_entry->>'version')::bigint,0);
 if current_version<>expected then raise sqlstate 'PT409' using message='Background changed on another device. Reload before editing.';end if;
 if old_entry is null then
  select count(*) into entry_count from jsonb_object_keys(entries);
  if entry_count>=2000 then raise check_violation using message='Background override limit reached';end if;
 end if;
 new_entry:=jsonb_build_object('background_id',bid,'record',p_payload->'record','is_visible',p_payload->'is_visible','version',current_version+1,'updated_at',clock_timestamp());
 entries:=jsonb_set(entries,array[bid],new_entry,true);
 receipts:=jsonb_set(receipts,array[p_request_id::text],jsonb_build_object('actor',actor,'fingerprint',fingerprint,'result',new_entry,'at',clock_timestamp()),true);
 select coalesce(jsonb_object_agg(key,value),'{}') into receipts from (select key,value from jsonb_each(receipts) order by value->>'at' desc,key limit 100) recent;
 document:=jsonb_build_object('entries',entries,'receipts',receipts);
 if octet_length(document::text)>8388608 then raise check_violation using message='Background catalog edit storage exceeds limit';end if;
 update public.app_settings set value=document,updated_by=actor,updated_at=clock_timestamp() where key='background_catalog_overrides';
 insert into public.audit_logs(actor_user_id,entity_type,entity_id,action,reason,before_data,after_data) values(actor,'background',bid,'background_saved','背板圖鑑管理',old_entry,new_entry);
 return new_entry;
end $$;

create or replace function public.admin_background_catalog(p_action text,p_payload jsonb default '{}'::jsonb,p_request_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
 select private.admin_background_catalog(p_action,p_payload,p_request_id);
$$;

revoke all on function private.validate_background_record(text,jsonb) from public,anon,authenticated;
revoke all on function private.background_catalog_public(),public.background_catalog_overrides() from public;
grant execute on function private.background_catalog_public(),public.background_catalog_overrides() to anon,authenticated;
revoke all on function private.admin_background_catalog(text,jsonb,uuid),public.admin_background_catalog(text,jsonb,uuid) from public,anon;
grant execute on function private.admin_background_catalog(text,jsonb,uuid),public.admin_background_catalog(text,jsonb,uuid) to authenticated;
comment on function public.background_catalog_overrides() is 'Public background content only. Does not expose settings, request receipts, actors, audit logs or hidden record contents.';
comment on function public.admin_background_catalog(text,jsonb,uuid) is 'Existing store administrators only; optimistic per-background versions and idempotent retry receipts. Included in app_settings/audit_logs backups.';
commit;
