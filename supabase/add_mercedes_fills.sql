-- ============================================================
-- Standalone: add the 3 new Mercedes A150 fills to an EXISTING
-- (already-seeded) live database.
--
-- Run once in the Supabase SQL editor. Idempotent: the NOT EXISTS
-- guard means re-running it will not create duplicates.
--
-- Note: the 22.06 fill only shows ~9.6 L/100km if the previous
-- full-tank fill in your DB is the 27.03 reading (179288 km). If your
-- live history differs, the number will reflect your actual data.
-- ============================================================

-- Make sure the column exists (no-op if it already does).
alter table fuel_logs add column if not exists is_full_tank boolean not null default true;

insert into fuel_logs (car_id, date, odometer_km, liters, total_cost, price_per_liter, is_full_tank, notes, currency)
select c.id, f.d::date, f.odo, f.lit, f.cost, f.ppl, f.ft, f.note, 'EUR'
from cars c
cross join (values
  ('2026-05-30', 179939, 16.59, 30.00, 1.808, false, 'Partial fill; odometer estimated'),
  ('2026-06-13', 180081, 20.46, 38.00, 1.857, false, 'Liters & price estimated from EUR 38; partial fill'),
  ('2026-06-22', 180173, 47.66, 90.00, 1.888, true,  'Near-full fill; odometer estimated')
) as f(d, odo, lit, cost, ppl, ft, note)
where c.model = 'A150'
  and not exists (
    select 1 from fuel_logs fl
    where fl.car_id = c.id
      and fl.date = f.d::date
      and fl.odometer_km = f.odo
  );
