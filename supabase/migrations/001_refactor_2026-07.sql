-- Migration 001 — 2026-07 refactor. Idempotent: safe to run more than once.
-- Run in the Supabase SQL editor. No destructive changes; data is preserved.

-- Perf: every query filters by car_id and orders by the date column.
create index if not exists idx_fuel_logs_car_date  on fuel_logs (car_id, date, id);
create index if not exists idx_maint_logs_car_date on maintenance_logs (car_id, date);
create index if not exists idx_supplies_car_date   on supplies (car_id, date);
create index if not exists idx_insurance_car_start on insurance_records (car_id, start_date);
create index if not exists idx_registrations_car   on registrations (car_id, date);
create index if not exists idx_other_costs_car     on other_costs (car_id, date);

-- Tank capacity lets the UI sanity-check consumption estimates later.
alter table cars add column if not exists tank_capacity_l numeric;
update cars set tank_capacity_l = 54 where model = 'A150' and tank_capacity_l is null;

-- Data hygiene: is_full_tank must never be null (old rows predate the column).
update fuel_logs set is_full_tank = true where is_full_tank is null;

-- Data fix (already applied 2026-07-02 via the API, recorded here for
-- reproducibility): the first two Mercedes fills are full-tank-sized
-- (52.2 L / 48.6 L on a 54 L tank) and were seeded as full tanks, but had
-- been flipped to partial — which left the app with a single full tank and
-- therefore no measurable consumption period at all.
update fuel_logs
set is_full_tank = true
where car_id in (select id from cars where model = 'A150')
  and date in ('2026-03-04', '2026-03-27')
  and liters > 45
  and is_full_tank = false;
