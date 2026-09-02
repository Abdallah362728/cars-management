# Enable RLS + per-user auth (Supabase advisor: "RLS Disabled in Public")

## Context

Supabase's advisor flagged `public.maintenance_schedules` as public with RLS
disabled. It under-reported: **none** of the 8 tables had RLS, and the app had no
auth at all — `js/data/supabase-client.js` used the anon key, published in
`js/config.js` and served from Netlify. Anyone with the URL had full
read/write/delete on everything.

The first pass built a single-owner allowlist. The user then asked whether a new
sign-up would get their own fresh data — it would not, it would be locked out —
and chose **multi-tenant with open sign-up**. Since the allowlist migration had
never been applied to the live database, it was rewritten in place rather than
stacked with a 003.

## Design

**Ownership lives only on `cars.user_id`.** The other seven tables already carry
`car_id`, so their policies ask `owns_car(car_id)` — a `security definer` helper,
so the check reads `cars` directly instead of recursing through the policy being
evaluated. `cars.user_id` defaults to `auth.uid()`, so the browser never sets it;
a row is stamped with whoever inserted it, and `addCar()` needed no change.

Rejected: a `user_id` column on all eight tables (more columns, more app touch
points, same guarantee).

## Tasks

- [x] `supabase/migrations/002_enable_rls.sql` — `cars.user_id`, `owns_car()`,
      policies on all 8 tables, revoke anon grants, backfill, `set not null`.
- [x] `supabase/schema.sql` — same security block, so a fresh DB comes up secure.
- [x] `js/core/auth.js` — `getSession` / `signIn` / `signUp` / `signOut` / `onAuthChange`.
- [x] `js/ui/pages/login.js` — sign-in + create-account, with the email-confirmation branch.
- [x] `js/main.js` — gate bootstrap on a session; re-gate when it ends.
- [x] `css/components.css` — hide nav + FAB while signed out.
- [x] `js/core/router.js` — ignore hashchange while the gate is up.
- [x] `js/ui/pages/settings.js` — signed-in email + Sign out.
- [x] `js/ui/pages/dashboard.js` — real first-run empty state (a new account has no cars).
- [x] Docs: `js/config.js`, `README.md`.
- [x] Verify against a real Postgres and in the browser.

## Review

**Two things the original plan got wrong, both caught before shipping:**

1. The TODO that had been sitting in `schema.sql` proposed
   `for all to authenticated using (true)`. That fixes nothing — Supabase allows
   public sign-up by default, so any stranger who registered would have inherited
   the whole database.
2. Backfill is not optional. Rows predating the migration have a null `user_id`,
   which matches nobody — the existing three cars would have silently vanished
   from the app rather than erroring. The migration assigns them to the sole
   account, aborts with the exact statement to run if that is ambiguous, and then
   sets `not null` so it can never recur.

**Verification** — 27 unit tests pass; `node --check` clean on every touched module.

Against a throwaway Postgres 16 in Docker, loading `git show HEAD:supabase/schema.sql`
first so the starting point was the live database as it actually is today:

- Migration backfilled all 3 cars to the only account; `alice` then saw her 3 cars,
  8 fuel logs, 10 schedules.
- `bob` (a later sign-up, `auth.uid()` confirmed non-null so the test is not vacuous)
  saw 0 cars / 0 fuel logs / 0 schedules; could not insert against alice's car; his
  update and delete against her rows touched 0 rows.
- `bob` inserted his own car — `default auth.uid()` stamped him as owner — and could
  write to it. Alice's counts were unchanged afterwards.
- `anon` denied outright on every table; RLS reported on for all 8.
- Re-running 002 twice and running the new `schema.sql` on an empty database were
  both clean; the ambiguous-backfill path aborts with exactly one clear error and
  leaves the data untouched.

In the browser: login screen renders, nav/FAB hidden, sign-in ↔ create-account
toggle switches copy and password autocomplete, a bad password returns
"Wrong email or password." from the live auth endpoint, `#settings` while signed
out stays on the login screen, and both dashboard empty states link to Settings.

**Not done / caveats**
- The SQL has not been run against the live Supabase project — that needs dashboard
  access. The advisor warning stays open until it is.
- The sign-up success path was not exercised against the live project: that would
  mean creating a real account in it.
- `cars.user_id` is `not null` after the migration, so a manual `insert into cars`
  from the SQL editor must now name a `user_id`. Same reason re-running the whole
  of `schema.sql` after migrating would fail on its seed inserts — it says "run
  this once", and the security block itself is idempotent.
- Open sign-up means strangers' rows land in the user's Supabase project against
  the user's quota. Flagged in the README; turning the provider toggle off makes it
  invite-only with no code change.
