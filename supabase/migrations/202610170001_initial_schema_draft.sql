-- Wu Jacky Pokemon GO store: initial data model draft
-- REVIEW BEFORE APPLYING. This file is not deployed to any database.
-- Security model: public catalog fields are separated from private operations/finance.
begin;

create extension if not exists pgcrypto;

create type public.product_publication_status as enum ('draft','published','archived');
create type public.product_supply_status as enum ('available','low_stock','sold_out','inquiry_only','coming_soon');
create type public.order_status as enum ('pending_review','awaiting_payment','paid_awaiting_purchase','ordered_from_supplier','arrived_for_check','completed','cancelled','refund_pending','refunded');
create type public.sales_channel as enum ('website','line','facebook','threads','marketplace_8591','other');

create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);
alter table public.admin_profiles enable row level security;
create policy "admins can read own profile" on public.admin_profiles
  for select to authenticated using (user_id = auth.uid());
-- Profile creation/role grants must be done by a trusted operator; never allow public self-promotion.

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name_zh text not null,
  name_en text not null default '',
  aliases text[] not null default '{}',
  pokedex_number integer,
  description_public text not null default '',
  publication_status public.product_publication_status not null default 'draft',
  supply_status public.product_supply_status not null default 'inquiry_only',
  public_price_twd integer check (public_price_twd is null or public_price_twd >= 0),
  price_is_inquiry boolean not null default false,
  show_exact_stock_publicly boolean not null default false,
  low_stock_threshold integer not null default 3 check (low_stock_threshold >= 0),
  manual_sort_order integer not null default 0,
  hot_rank integer,
  first_stocked_at timestamptz,
  coming_soon_at timestamptz,
  source_reference text,
  image_rights_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index products_publication_sort_idx on public.products(publication_status, manual_sort_order);
create index products_name_zh_idx on public.products using gin (to_tsvector('simple', name_zh));
create index products_aliases_idx on public.products using gin (aliases);

create table public.category_assignments (
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.product_categories(id) on delete restrict,
  sort_order integer not null default 0,
  primary key (product_id, category_id)
);
create index category_assignments_category_idx on public.category_assignments(category_id, sort_order);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  alt_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(product_id, storage_path)
);

-- Private inventory ledger. Public users must never receive exact on-hand quantity or unit cost.
create table public.inventory_balances (
  product_id uuid primary key references public.products(id) on delete restrict,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  updated_at timestamptz not null default now()
);
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in ('opening','purchase_received','sale','cancel_return','manual_adjustment','damage','loss')),
  quantity_delta integer not null check (quantity_delta <> 0),
  -- Request key and before/after snapshot make retried manual adjustments idempotent.
  idempotency_key uuid unique,
  quantity_before integer,
  quantity_after integer,
  reason text not null,
  check ((quantity_before is null and quantity_after is null) or
         (quantity_before is not null and quantity_after is not null and quantity_before >= 0 and quantity_after >= 0)),
  related_order_id uuid,
  actor_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index inventory_movements_product_date_idx on public.inventory_movements(product_id, created_at desc);

create table public.purchase_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  purchased_at date not null,
  quantity integer not null check (quantity > 0),
  unit_cost_twd numeric(12,2) not null check (unit_cost_twd >= 0),
  extra_cost_twd numeric(12,2) not null default 0 check (extra_cost_twd >= 0),
  supplier_name text not null default '',
  source_url text not null default '',
  notes_private text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  channel public.sales_channel not null default 'website',
  status public.order_status not null default 'pending_review',
  customer_alias text not null default '',
  customer_contact_private text not null default '',
  customer_note text not null default '',
  public_subtotal_twd integer not null default 0 check (public_subtotal_twd >= 0),
  private_adjustments_twd integer not null default 0,
  fee_twd integer not null default 0 check (fee_twd >= 0),
  other_cost_twd integer not null default 0 check (other_cost_twd >= 0),
  received_amount_twd integer not null default 0 check (received_amount_twd >= 0),
  refund_amount_twd integer not null default 0 check (refund_amount_twd >= 0),
  received_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  product_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  sale_unit_price_twd integer check (sale_unit_price_twd is null or sale_unit_price_twd >= 0),
  unit_cost_snapshot_twd numeric(12,2) check (unit_cost_snapshot_twd is null or unit_cost_snapshot_twd >= 0),
  is_inquiry_price boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  spent_at date not null,
  category text not null,
  amount_twd numeric(12,2) not null check (amount_twd >= 0),
  channel public.sales_channel,
  note_private text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  reason text not null default '',
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

create table public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- RLS is enabled everywhere. No public policies are granted in this initial migration.
-- Admin access is intentionally fail-closed until a reviewed admin authorization function
-- and policies are added. Do not use a client-supplied metadata field as an admin role.
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.category_assignments enable row level security;
alter table public.product_images enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.purchase_batches enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.expenses enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_settings enable row level security;

-- Public storefront should be served through a deliberately limited view or server endpoint,
-- exposing only published product fields, category labels, and non-exact stock labels.
-- Do not grant anon/authenticated SELECT on the base products/inventory/orders tables.
-- Admin policies, safe public views/RPCs, storage policies, and transaction-safe inventory
-- functions must be reviewed and added before connecting any frontend to this schema.

commit;
