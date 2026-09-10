-- KN commission system — initial schema (spec §6)
-- Run via `supabase db push` or paste into the Supabase SQL editor.

-- ===================== MASTER =====================

create table if not exists departments (
  code          text primary key,        -- 'A7','B7','68','B3'
  label         text not null,           -- 'เบอร์รถ 60'
  min_liters    numeric not null,        -- 2000 / 1000
  fixed_freight numeric,                 -- null = use freight_tiers lookup, 0.10 = B3
  doc_prefixes  text[] not null default '{}', -- ['HDA','IDA'] used for upload validation
  created_at    timestamptz not null default now()
);

create table if not exists customers (
  code          text primary key,        -- 'KCL660019'
  name          text,
  area          text,
  distance_km   numeric,                 -- null = needs Review before this customer's rows can be costed
  salesperson   text,
  is_excluded   boolean not null default false, -- fuel-card / daily-refill customers (spec §4.1)
  branch        text not null default 'สามทอง/โลจิสติกส์',
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists freight_tiers (
  id      uuid primary key default gen_random_uuid(),
  min_km  numeric not null,
  max_km  numeric not null,
  rate    numeric not null
);

create table if not exists products (
  code    text primary key,
  name    text,
  is_fuel boolean not null default true
);

create table if not exists commission_config (
  key   text primary key,
  value jsonb not null
);

-- ===================== ROUND / PERIOD =====================

create table if not exists periods (
  id         uuid primary key default gen_random_uuid(),
  year       int not null,               -- Buddhist Era, e.g. 2569
  month      int not null check (month between 1 and 12),
  branch     text not null default 'สามทอง/โลจิสติกส์',
  status     text not null default 'draft' check (status in ('draft', 'review', 'closed')),
  closed_at  timestamptz,
  closed_by  text,
  created_at timestamptz not null default now(),
  unique (year, month, branch)
);

create table if not exists source_files (
  id               uuid primary key default gen_random_uuid(),
  period_id        uuid not null references periods(id) on delete cascade,
  kind             text not null check (kind in ('sales', 'ar', 'master')),
  department_code  text references departments(code),
  filename         text not null,
  storage_path     text not null,
  checksum_liters  numeric,
  checksum_value   numeric,
  checksum_ok      boolean,
  uploaded_at      timestamptz not null default now()
);

create table if not exists transactions (
  id                    uuid primary key default gen_random_uuid(),
  period_id             uuid not null references periods(id) on delete cascade,
  department_code       text not null references departments(code),
  doc_no                text not null,   -- normalized (normalizeDocNo)
  base_doc_no           text not null,   -- suffix stripped (baseDocNo), indexed for AR matching
  doc_date              date,
  customer_code         text,
  product_code          text not null,
  qty                   numeric not null,
  sale_value            numeric not null,
  cost                  numeric not null,
  -- computed (spec §4.3, cols L-R)
  distance_km           numeric,
  is_one_way            boolean not null default false,
  sale_type             text check (sale_type in ('cash', 'credit', 'overdue')),
  gross_profit          numeric,         -- L
  freight_rate          numeric,         -- M
  freight_total         numeric,         -- N
  total_cost            numeric,         -- O
  profit_after_freight  numeric,         -- P
  profit_per_liter      numeric,         -- Q
  commission            numeric,         -- R, full precision, never rounded at row level
  -- status
  is_eligible           boolean not null default false,
  blocked_reason        text,
  flags                 jsonb not null default '[]',
  outstanding_amount    numeric,         -- accounting-entered deduction, defaults to 0 never auto-computed (spec §4.5)
  created_at            timestamptz not null default now()
);

create index if not exists idx_transactions_period on transactions(period_id);
create index if not exists idx_transactions_base_doc_no on transactions(period_id, base_doc_no);
create index if not exists idx_transactions_customer on transactions(customer_code);

create table if not exists adjustments (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  field          text not null,
  old_value      text,
  new_value      text,
  reason         text,
  actor          text not null,
  created_at     timestamptz not null default now()
);

create table if not exists ar_outstanding (
  id            uuid primary key default gen_random_uuid(),
  period_id     uuid not null references periods(id) on delete cascade,
  base_doc_no   text not null,
  customer_code text,
  customer_name text,
  bill_amount   numeric not null default 0,
  paid_amount   numeric not null default 0,
  outstanding   numeric not null default 0,
  bill_date     date,     -- per-bill date, used for the "same month only" match rule (spec §5.3 rule 3)
  as_of_date    date,     -- the AR report's own "ณ วันที่" date (always next month)
  unique (period_id, base_doc_no)
);

create index if not exists idx_ar_outstanding_period on ar_outstanding(period_id, base_doc_no);

-- ===================== AUTH / RLS =====================
-- One row per Supabase auth user: which branch they belong to and whether
-- they can see every branch (manager) or only their own (branch accountant).

create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  branch     text,
  role       text not null default 'branch_accountant' check (role in ('branch_accountant', 'manager')),
  full_name  text,
  created_at timestamptz not null default now()
);

create or replace function auth_is_manager()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'manager' from profiles where id = auth.uid()), false);
$$;

create or replace function auth_branch()
returns text
language sql stable
security definer
set search_path = public
as $$
  select branch from profiles where id = auth.uid();
$$;

-- ⚠️ LOGIN REMOVED FOR NOW (see project README) — RLS is intentionally left
-- OFF on every table below so the app works with just the anon key and no
-- Supabase Auth session. The `profiles` table and the auth_is_manager()/
-- auth_branch() helper functions above are kept in place (unused) so
-- branch-scoped access can be re-enabled later without a schema change —
-- when auth comes back, uncomment the block in
-- supabase/migrations/0002_enable_rls.sql (create that file with the
-- `alter table ... enable row level security` + `create policy ...`
-- statements this migration used to have here) rather than editing this
-- file, since it may already be applied to a live database by then.
--
-- Until then: anyone with the anon key can read/write every table. Don't
-- point this setup at a database with real customer/financial data without
-- putting the RLS policies back first.

-- ===================== SEED DATA =====================

insert into departments (code, label, min_liters, fixed_freight, doc_prefixes) values
  ('A7', 'เบอร์รถ 60', 2000, null, '{HDA,IDA}'),
  ('B7', 'เบอร์รถ 67', 2000, null, '{HDB,IDB}'),
  ('68', 'เทรลเลอร์เบอร์ 68', 2000, null, '{HD,ID}'),
  ('B3', 'กรอกหลังปั๊ม', 1000, 0.10, '{HSB,IVB,IV}')
on conflict (code) do nothing;

insert into freight_tiers (min_km, max_km, rate) values
  (0, 19, 0),
  (20, 59, 0.15),
  (60, 69, 0.17),
  (70, 79, 0.19),
  (80, 89, 0.20),
  (90, 99, 0.22),
  (100, 109, 0.24),
  (110, 129, 0.28),
  (130, 139, 0.30),
  (140, 159, 0.32),
  (160, 169, 0.34),
  (170, 179, 0.35),
  (180, 189, 0.36),
  (190, 199, 0.38),
  (200, 209, 0.39)
on conflict do nothing;

insert into products (code, name, is_fuel) values
  ('DS', 'ดีเซล-1', true),
  ('DS2', 'ดีเซล-2', true),
  ('DSB20', 'ดีเซลบี20', true),
  ('G91', 'แก๊สโซฮอล์ 91', true),
  ('G95', 'แก๊สโซฮอล์ 95', true)
on conflict (code) do nothing;

insert into commission_config (key, value) values
  ('thresholds', '{"cash": 0.20, "credit": 0.30, "overdue": 0.60}'),
  ('rate_per_liter', '0.03'),
  ('penalty_negative_q', '{"enabled": true}'),
  ('team_split', '{"manager": 0.10, "sales": 0.60, "admin": 0.20, "central": 0.10}')
on conflict (key) do nothing;
