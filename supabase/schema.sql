-- ============================================================
-- Cars Management App — Supabase Schema + Seed
-- Run this once in the Supabase SQL Editor
-- ============================================================

-- Cars
create table if not exists cars (
  id bigint primary key generated always as identity,
  make text not null,
  model text not null,
  year int not null,
  status text default 'active',         -- active | sold | stored
  purchase_date date,
  purchase_price numeric,
  purchase_currency text default 'EUR',
  sell_date date,
  sell_price numeric,
  current_market_value numeric,
  factory_fuel_spec numeric,            -- L/100km combined
  operating_country text,
  notes text,
  created_at timestamptz default now()
);

-- Fuel logs
create table if not exists fuel_logs (
  id bigint primary key generated always as identity,
  car_id bigint references cars(id) on delete cascade not null,
  date date not null,
  odometer_km numeric not null,
  liters numeric not null,
  total_cost numeric not null,
  price_per_liter numeric,
  -- true  = tank filled to full (closes a measurement period; L/100km is computed)
  -- false = partial fill (recorded, but fuel is rolled into the next full tank)
  is_full_tank boolean not null default true,
  currency text default 'EUR',
  notes text,
  created_at timestamptz default now()
);

-- Maintenance event log (actual repairs/services done)
create table if not exists maintenance_logs (
  id bigint primary key generated always as identity,
  car_id bigint references cars(id) on delete cascade not null,
  date date not null,
  odometer_km numeric,
  category text,
  description text,
  cost numeric default 0,
  currency text default 'EUR',
  next_due_km numeric,
  next_due_date date,
  notes text,
  created_at timestamptz default now()
);

-- Maintenance schedule (recurring service items)
create table if not exists maintenance_schedules (
  id bigint primary key generated always as identity,
  car_id bigint references cars(id) on delete cascade not null,
  item_name text not null,
  interval_km numeric,
  interval_months int,
  last_done_date date,
  last_done_km numeric,
  notes text
);

-- Supplies & consumables
create table if not exists supplies (
  id bigint primary key generated always as identity,
  car_id bigint references cars(id) on delete cascade not null,
  date date not null,
  item text,
  cost numeric default 0,
  currency text default 'EUR',
  notes text,
  created_at timestamptz default now()
);

-- Insurance records
create table if not exists insurance_records (
  id bigint primary key generated always as identity,
  car_id bigint references cars(id) on delete cascade not null,
  start_date date,
  end_date date,
  provider text,
  coverage_type text,
  cost numeric default 0,
  currency text default 'EUR',
  notes text,
  created_at timestamptz default now()
);

-- Registration & tax
create table if not exists registrations (
  id bigint primary key generated always as identity,
  car_id bigint references cars(id) on delete cascade not null,
  date date not null,
  description text,
  cost numeric default 0,
  currency text default 'EUR',
  valid_until date,
  notes text,
  created_at timestamptz default now()
);

-- Other costs
create table if not exists other_costs (
  id bigint primary key generated always as identity,
  car_id bigint references cars(id) on delete cascade not null,
  date date not null,
  description text,
  category text,
  cost numeric default 0,
  currency text default 'EUR',
  notes text,
  created_at timestamptz default now()
);

-- ============================================================
-- Migrations — safe to re-run on an existing database
-- ============================================================

-- Ensure the full-tank flag exists on databases created before it was added.
alter table fuel_logs add column if not exists is_full_tank boolean not null default true;

-- 2026-07 refactor (see supabase/migrations/001_refactor_2026-07.sql)
create index if not exists idx_fuel_logs_car_date  on fuel_logs (car_id, date, id);
create index if not exists idx_maint_logs_car_date on maintenance_logs (car_id, date);
create index if not exists idx_supplies_car_date   on supplies (car_id, date);
create index if not exists idx_insurance_car_start on insurance_records (car_id, start_date);
create index if not exists idx_registrations_car   on registrations (car_id, date);
create index if not exists idx_other_costs_car     on other_costs (car_id, date);
alter table cars add column if not exists tank_capacity_l numeric;
update fuel_logs set is_full_tank = true where is_full_tank is null;

-- ============================================================
-- Seed data — existing cars from Excel files
-- ============================================================

insert into cars (make, model, year, status, purchase_date, purchase_price, purchase_currency, factory_fuel_spec, operating_country)
values
  ('Mercedes', 'A150', 2005, 'active', '2026-03-04', 300, 'EUR', 6.8, 'Germany'),
  ('Nissan',   'Pixo', 2009, 'sold',   '2025-12-01', 400, 'EUR', null, 'Germany'),
  ('Toyota',   'Corolla', 2012, 'sold','2023-07-01', 7800, 'USD', null, 'Lebanon');

update cars set sell_date = '2026-03-01', sell_price = 100  where model = 'Pixo';
update cars set sell_date = '2024-09-01', sell_price = 6500 where model = 'Corolla';

-- Mercedes A150 fuel history (from Cars.xlsx "Germany" sheet).
-- Full-tank fills close a measurement period and get an L/100km; partial fills
-- (is_full_tank = false) are recorded but roll into the next full tank.
-- 30.05 & 22.06 odometers and the 13.06 liters/price are estimated (see notes).
insert into fuel_logs (car_id, date, odometer_km, liters, total_cost, price_per_liter, is_full_tank, notes, currency)
select c.id, f.d::date, f.odo, f.lit, f.cost, f.ppl, f.ft, f.note, 'EUR'
from cars c
cross join (values
  ('2026-03-04', 178697, 52.19, 108.56, 2.080, true,  'Initial top-up (start)'),
  ('2026-03-27', 179288, 48.64, 102.58, 2.109, true,  null),
  ('2026-05-30', 179939, 16.59,  30.00, 1.808, false, 'Partial fill; odometer estimated'),
  ('2026-06-13', 180081, 20.46,  38.00, 1.857, false, 'Liters & price estimated from EUR 38; partial fill'),
  ('2026-06-22', 180173, 47.66,  90.00, 1.888, true,  'Near-full fill; odometer estimated')
) as f(d, odo, lit, cost, ppl, ft, note)
where c.model = 'A150';

-- Mercedes maintenance schedule (10 items, all last_done = null = "never done")
insert into maintenance_schedules (car_id, item_name, interval_km, interval_months)
select c.id, s.item, s.km, s.months
from cars c
cross join (values
  ('Oil Change',      10000, 12),
  ('Oil Filter',      10000, 12),
  ('Air Filter',      30000, 24),
  ('Brake Pads',      40000, null),
  ('Spark Plugs',     30000, 36),
  ('Coolant Flush',   null,  24),
  ('Brake Fluid',     null,  24),
  ('TUV Inspection',  null,  24),
  ('Tire Rotation',   10000, null),
  ('Gearbox Check',   60000, null)
) as s(item, km, months)
where c.model = 'A150';

-- Toyota Corolla costs (from Cars.xlsx)
insert into maintenance_logs (car_id, date, description, cost, currency)
select c.id, e.d::date, e."desc", e.cost, 'USD'
from cars c
cross join (values
  ('2023-10-01', 'Oil Change', 36),
  ('2024-09-01', 'Oil Change', 28),
  ('2023-09-01', 'Repairs',    82),
  ('2023-09-01', 'Wheel work', 13)
) as e(d, "desc", cost)
where c.model = 'Corolla';

insert into supplies (car_id, date, item, cost, currency)
select c.id, '2023-09-01'::date, s.item, s.cost, 'USD'
from cars c
cross join (values
  ('Radiator coolant', 12),
  ('Air freshener',     2),
  ('Brake oil',         7)
) as s(item, cost)
where c.model = 'Corolla';

-- Nissan Pixo costs (from Cars.xlsx Germany sheet)
insert into fuel_logs (car_id, date, odometer_km, liters, total_cost, currency)
select c.id, f.d::date, f.odo, f.lit, f.cost, 'EUR'
from cars c
cross join (values
  ('2025-12-15', 1000,  28.5,  40.00),
  ('2026-01-20', 1380,  25.2,  35.00),
  ('2026-02-18', 1760,  24.8,  34.50)
) as f(d, odo, lit, cost)
where c.model = 'Pixo';

-- ============================================================
-- Security — per-user row-level security
-- (standalone + setup steps: supabase/migrations/002_enable_rls.sql)
-- ============================================================

-- Ownership lives only on cars; every other table reaches it through car_id.
-- `default auth.uid()` stamps the inserting account, so the app never sets it.
alter table cars add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table cars alter column user_id set default auth.uid();
create index if not exists idx_cars_user on cars (user_id);

-- security definer so the check reads `cars` directly instead of recursing
-- through the policy being evaluated.
create or replace function public.owns_car(cid bigint)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public
as $$
  select exists (select 1 from cars where id = cid and user_id = auth.uid());
$$;

revoke execute on function public.owns_car(bigint) from anon;
grant  execute on function public.owns_car(bigint) to authenticated;

alter table cars enable row level security;
drop policy if exists "own cars" on cars;
create policy "own cars" on cars
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
revoke all on cars from anon;

do $$
declare
  t text;
  tables text[] := array[
    'fuel_logs', 'maintenance_logs', 'maintenance_schedules',
    'supplies', 'insurance_records', 'registrations', 'other_costs'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own car rows" on public.%I', t);
    execute format(
      'create policy "own car rows" on public.%I for all to authenticated '
      || 'using (public.owns_car(car_id)) with check (public.owns_car(car_id))',
      t
    );
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- The seed cars above were inserted without an owner (auth.uid() is null in the
-- SQL editor), and a null owner matches nobody. Attach them to your account:
--   update cars set user_id = (select id from auth.users where email = 'you@example.com')
--   where user_id is null;
