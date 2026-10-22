begin;
do $$
declare n text;rejected boolean;begin
 foreach n in array array['order_payments','inventory_valuations','valuation_events','orders','expenses','purchase_batches']loop
  if has_table_privilege('anon','public.'||n,'select')then raise exception 'Anonymous private table access: %',n;end if;
 end loop;
 if has_function_privilege('anon','public.admin_business_query(text,jsonb)','execute')or has_function_privilege('anon','public.admin_job_control(text,jsonb)','execute')or has_function_privilege('authenticated','public.maintenance_work(text,text,jsonb)','execute')then raise exception'Private RPC privilege leak';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.prosecdef and p.proname in ('track_store_event','admin_analytics_report'))then raise exception'Public analytics wrappers bypass caller privileges';end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 rejected:=false;begin perform public.admin_business_query('settings','{}');exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception'Non-admin business access';end if;
 rejected:=false;begin perform public.admin_job_control('status','{}');exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception'Non-admin backup access';end if;
 rejected:=false;begin perform public.admin_analytics_report(current_date,current_date);exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception'Non-admin analytics access';end if;
end $$;
set local role anon;
select public.track_store_event('not_permitted',gen_random_uuid(),gen_random_uuid(),null);
reset role;
rollback;
