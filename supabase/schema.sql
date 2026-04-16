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
  is_full_tank boolean default true,
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
-- Seed data — existing cars from Excel files
-- ============================================================

insert into cars (make, model, year, status, purchase_date, purchase_price, purchase_currency, factory_fuel_spec, operating_country)
values
  ('Mercedes', 'A150', 2005, 'active', '2026-03-04', 300, 'EUR', 6.8, 'Germany'),
  ('Nissan',   'Pixo', 2009, 'sold',   '2025-12-01', 400, 'EUR', null, 'Germany'),
  ('Toyota',   'Corolla', 2012, 'sold','2023-07-01', 7800, 'USD', null, 'Lebanon');

update cars set sell_date = '2026-03-01', sell_price = 100  where model = 'Pixo';
update cars set sell_date = '2024-09-01', sell_price = 6500 where model = 'Corolla';

-- Mercedes fuel entry (from Cars_v2.xlsx)
insert into fuel_logs (car_id, date, odometer_km, liters, total_cost, price_per_liter, currency)
select id, '2026-03-14', 178917, 25.96, 54.02, 2.082, 'EUR'
from cars where model = 'A150';

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
