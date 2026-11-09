-- StokCerdas retail database schema for Supabase/PostgreSQL.
-- Apply to a fresh Supabase project. Existing MVP schemas may need an explicit migration.
-- Run in Supabase SQL Editor. RLS policies scope data to the authenticated business owner.
create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  business_type text not null default 'Retail',
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null default 'Sembako',
  selling_price numeric(14,2) not null check (selling_price > 0),
  unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0),
  stock numeric(14,3) not null default 0 check (stock >= 0),
  min_stock numeric(14,3) not null default 0 check (min_stock >= 0),
  unit text not null default 'unit',
  emoji text not null default '📦',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sold_at timestamptz not null default now(),
  total numeric(14,2) not null default 0 check (total >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  line_total numeric(14,2) generated always as (quantity * unit_price) stored
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  spent_at timestamptz not null default now(),
  name text not null check (length(trim(name)) between 1 and 160),
  category text not null default 'Operasional',
  amount numeric(14,2) not null check (amount > 0),
  notes text
);

create table if not exists public.waste_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  ingredient_name text not null check (length(trim(ingredient_name)) between 1 and 160),
  quantity numeric(14,3),
  unit text,
  amount numeric(14,2) not null check (amount > 0),
  reason text not null
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  movement_type text not null check (movement_type in ('opening','purchase','sale','waste','adjustment','return')),
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists products_business_idx on public.products(business_id);
create index if not exists sales_business_sold_at_idx on public.sales(business_id, sold_at desc);
create index if not exists expenses_business_spent_at_idx on public.expenses(business_id, spent_at desc);
create index if not exists waste_business_recorded_at_idx on public.waste_records(business_id, recorded_at desc);
create index if not exists stock_movements_business_created_idx on public.stock_movements(business_id, created_at desc);


-- Retail purchasing and supplier records.
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 160),
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  purchased_at timestamptz not null default now(),
  total numeric(14,2) not null default 0 check (total >= 0),
  status text not null default 'received' check (status in ('draft','received','cancelled')),
  notes text
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  line_total numeric(14,2) generated always as (quantity * unit_cost) stored
);

create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  insight_type text not null,
  title text not null,
  explanation text not null,
  recommendation text not null,
  input_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Turn on Row Level Security on every tenant-owned table.
alter table public.businesses enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.expenses enable row level security;
alter table public.waste_records enable row level security;
alter table public.stock_movements enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.ai_insights enable row level security;

-- Policies are recreated safely if this script is run more than once.
drop policy if exists "business owner can read own business" on public.businesses;
create policy "business owner can read own business" on public.businesses for select to authenticated using (owner_id = auth.uid());
drop policy if exists "business owner can create own business" on public.businesses;
create policy "business owner can create own business" on public.businesses for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "business owner can update own business" on public.businesses;
create policy "business owner can update own business" on public.businesses for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "business owner can delete own business" on public.businesses;
create policy "business owner can delete own business" on public.businesses for delete to authenticated using (owner_id = auth.uid());

-- A row is visible/writable only when its business belongs to auth.uid().
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['products','sales','expenses','waste_records','stock_movements','suppliers','purchases','ai_insights'] LOOP
    EXECUTE format('drop policy if exists %I on public.%I', tbl || ' owner access', tbl);
    EXECUTE format(
      'create policy %I on public.%I for all to authenticated using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())) with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))',
      tbl || ' owner access', tbl
    );
  END LOOP;
END $$;

drop policy if exists "sale item access through sale" on public.sale_items;
create policy "sale item access through sale" on public.sale_items for all to authenticated
using (exists (select 1 from public.sales s join public.businesses b on b.id = s.business_id where s.id = sale_id and b.owner_id = auth.uid()))
with check (exists (select 1 from public.sales s join public.businesses b on b.id = s.business_id where s.id = sale_id and b.owner_id = auth.uid()));

-- Inventory deduction and sale creation are atomic PostgreSQL functions: see migrations/002_atomic_functions.sql
-- (create_sale, void_sale, receive_stock, adjust_stock). Never expose service-role keys in the browser.

-- Purchase items are accessible only through a purchase owned by the signed-in user.
drop policy if exists "purchase item access through purchase" on public.purchase_items;
create policy "purchase item access through purchase" on public.purchase_items for all to authenticated
using (exists (select 1 from public.purchases p join public.businesses b on b.id = p.business_id where p.id = purchase_id and b.owner_id = auth.uid()))
with check (exists (select 1 from public.purchases p join public.businesses b on b.id = p.business_id where p.id = purchase_id and b.owner_id = auth.uid()));

create index if not exists suppliers_business_idx on public.suppliers(business_id);
create index if not exists purchases_business_date_idx on public.purchases(business_id,purchased_at desc);
create index if not exists ai_insights_business_created_idx on public.ai_insights(business_id,created_at desc);

-- Apply migrations/002_atomic_functions.sql, then migrations/003_scale_indexes.sql, after this file.
-- Test all with: supabase/tests/run.sh (add scale test: supabase/tests/scale.sh)
