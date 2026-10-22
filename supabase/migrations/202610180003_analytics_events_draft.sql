-- Wu Jacky Pokemon GO: privacy-conscious analytics event ledger draft
-- REVIEW ONLY. Not applied to any database. Writes should be mediated by a validated server-side endpoint.
begin;

create table public.analytics_events_draft (
  id bigint generated always as identity primary key,
  event_key uuid not null unique default gen_random_uuid(),
  event_type text not null check (event_type in (
    'page_view', 'product_view', 'search', 'cart_add', 'cart_remove',
    'inquiry_submitted', 'admin_task_created', 'admin_task_resolved', 'system_alert'
  )),
  product_id uuid references public.products(id) on delete set null,
  occurred_at timestamptz not null default now(),
  session_hash text,
  result_count integer check (result_count is null or result_count >= 0),
  metadata jsonb not null default '{}'::jsonb check (pg_catalog.octet_length(metadata::text) <= 1024)
);

create index analytics_events_type_time_idx
  on public.analytics_events_draft (event_type, occurred_at desc);
create index analytics_events_product_time_idx
  on public.analytics_events_draft (product_id, occurred_at desc)
  where product_id is not null;

alter table public.analytics_events_draft enable row level security;
-- Fail closed: browser roles must not read or write this table directly.
revoke all on table public.analytics_events_draft from public, anon, authenticated;
-- A trusted server-side function/Edge Function may write using a server-only credential.
-- Never expose a service-role key or Discord webhook to the browser.

comment on table public.analytics_events_draft is
  'Draft aggregate event ledger. Not deployed. Do not store IPs, raw search text, customer contacts, cart contents, payment data, supplier data, or private finance fields.';
comment on column public.analytics_events_draft.event_key is
  'Client/server-generated idempotency key; duplicate submissions must not double-count.';
comment on column public.analytics_events_draft.session_hash is
  'Optional short-lived pseudonymous hash only; never store raw session token, full IP, or device fingerprint.';
comment on column public.analytics_events_draft.metadata is
  'Tiny allowlisted non-sensitive metadata only; validate keys and values server-side before insert.';

commit;
