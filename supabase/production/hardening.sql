-- Keep privileged implementation in the unexposed schema. Public wrappers run
-- with caller privileges; only these specific private functions are granted.
create index if not exists order_payments_actor_idx on public.order_payments(actor_user_id);
create index if not exists valuation_events_actor_idx on public.valuation_events(actor_user_id);
create or replace function public.track_store_event(p_event text,p_session uuid,p_event_id uuid,p_product uuid default null) returns boolean language sql security invoker set search_path='' as $$select private.track_store_event(p_event,p_session,p_event_id,p_product);$$;
grant usage on schema private to anon;
grant execute on function private.track_store_event(text,uuid,uuid,uuid) to anon,authenticated;
create or replace function private.admin_analytics_report(p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if auth.uid() is null or not private.is_store_admin() then raise insufficient_privilege;end if;if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise invalid_parameter_value;end if;return private.analytics_report(p_from,p_to);end $$;
revoke all on function private.admin_analytics_report(date,date) from public,anon;
grant execute on function private.admin_analytics_report(date,date) to authenticated;
create or replace function public.admin_analytics_report(p_from date,p_to date) returns jsonb language sql stable security invoker set search_path='' as $$select private.admin_analytics_report(p_from,p_to);$$;
