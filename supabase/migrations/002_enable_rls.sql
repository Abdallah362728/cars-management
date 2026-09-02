-- ============================================================
-- Migration 002 — row-level security, scoped per user.
-- Idempotent: safe to re-run. Run in the Supabase SQL editor.
--
-- Every account sees only its own cars and everything hanging off them.
-- Ownership lives in one place — cars.user_id — because every other table
-- already points at a car. New sign-ups start with an empty garage.
--
-- BEFORE running: create your own account so the existing data has an owner
-- to attach to (Dashboard → Authentication → Users → "Add user", or just sign
-- up through the app). The backfill at the bottom fails loudly if you don't.
-- ============================================================

-- ── Ownership column ────────────────────────────────────────
-- `default auth.uid()` means the app never has to set this: an insert from a
-- signed-in browser is stamped with that user automatically.
alter table cars add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table cars alter column user_id set default auth.uid();

-- Every policy below filters on it.
create index if not exists idx_cars_user on cars (user_id);

-- ── Does the caller own this car? ───────────────────────────
-- security definer so the check reads `cars` directly instead of recursing
-- through the policy being evaluated; stable so it is cached within a statement.
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

-- ── Policies ────────────────────────────────────────────────
alter table cars enable row level security;
drop policy if exists "owner full access" on cars;   -- older name, if present
drop policy if exists "own cars" on cars;
create policy "own cars" on cars
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
revoke all on cars from anon;

-- The seven child tables are reached through their car.
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

    -- Recreate rather than `if not exists`, so re-running picks up policy edits.
    execute format('drop policy if exists "owner full access" on public.%I', t);
    execute format('drop policy if exists "own car rows" on public.%I', t);
    execute format(
      'create policy "own car rows" on public.%I for all to authenticated '
      || 'using (public.owns_car(car_id)) with check (public.owns_car(car_id))',
      t
    );

    -- Defence in depth: RLS already blocks anon, this removes the grant too.
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ── Attach the pre-existing data to its owner ───────────────
-- Rows created before this migration have no user_id, and a null owner matches
-- nobody — they would silently vanish from the app. Runs once; later re-runs
-- find nothing to do.
do $$
declare
  orphans int;
  n_users int;
  owner   uuid;
begin
  select count(*) into orphans from cars where user_id is null;

  if orphans = 0 then
    raise notice 'Backfill: no unowned cars, nothing to do.';
  else
    select count(*) into n_users from auth.users;
    if n_users = 1 then
      select id into owner from auth.users;
      update cars set user_id = owner where user_id is null;
      raise notice 'Backfill: assigned % existing car(s) to the only account.', orphans;
    else
      -- Ambiguous: say who should get them rather than guessing. Raising here
      -- also stops the NOT NULL below from firing on still-unowned rows.
      raise exception
        'Backfill: % unowned car(s) but % accounts exist. Run this with your address, then re-run this file: '
        'update cars set user_id = (select id from auth.users where email = ''you@example.com'') where user_id is null;',
        orphans, n_users;
    end if;
  end if;

  -- Every car now has an owner, so make an unowned one impossible from here on.
  -- A car with a null user_id is invisible to every account, which would look
  -- like data loss rather than an error.
  alter table cars alter column user_id set not null;
end $$;

-- ── Clean up the earlier single-owner allowlist, if it was ever applied ──
drop function if exists public.is_app_owner();
drop table if exists app_owners;

-- Verify — every row should show your own email and nothing else:
--   select c.id, c.make, c.model, u.email
--   from cars c left join auth.users u on u.id = c.user_id order by c.id;
