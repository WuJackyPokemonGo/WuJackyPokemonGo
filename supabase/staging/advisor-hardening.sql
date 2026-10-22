-- Follow-up after staging security/performance advisors. Staging only.
begin;
-- Platform event-trigger helper must not be exposed as a client RPC.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
alter policy "admins can read own profile" on public.admin_profiles using (user_id = (select auth.uid()));
create index app_settings_updated_by_idx on public.app_settings(updated_by);
create index audit_logs_actor_idx on public.audit_logs(actor_user_id);
create index expenses_created_by_idx on public.expenses(created_by);
create index inventory_movements_actor_idx on public.inventory_movements(actor_user_id);
create index orders_created_by_idx on public.orders(created_by);
create index orders_fulfilled_by_idx on public.orders(fulfilled_by);
create index purchase_batches_created_by_idx on public.purchase_batches(created_by);
create index purchase_batches_received_by_idx on public.purchase_batches(received_by);
commit;
