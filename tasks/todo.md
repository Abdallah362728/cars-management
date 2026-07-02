# Full refactor — 2026-07-02

## Plan
- [x] Phase 0 — housekeeping: archive xlsx/analysis files to `_archive/`, delete crash dump, pin Chart.js 4.5.1, fix launch config, add test script
- [x] Phase 1 — pure domain layer (`js/domain/`) + 24 node:test tests; fix insurance sort/query bug, string-coercion bugs
- [x] Phase 2 — restructure: `js/core` (router with render-epoch guard, state), `js/data` (repos), `js/ui` (pages/components); fix TCO-missing-fuel, chart race, number formatting
- [x] Phase 3 — engineer's-blueprint redesign: hand-written CSS token system, Tailwind removed, SVG car schematic hero, blueprint charts, ledger fuel rows, cost ownership bar
- [x] Phase 4 — Supabase migration file, manifest theme, docs

## Review

### What was broken and how it was fixed
1. **All efficiency numbers showed "—" / empty charts.** Root cause was in the *data*: the two March full-tank fills had been flipped to `is_full_tank = false`, so no measurement period could ever close. Fixed the two rows (recorded in `supabase/migrations/001_refactor_2026-07.sql`) and made the code degrade gracefully (estimates instead of blanks).
2. **Insurance costs never appeared and crashed sorting** — queries ordered every table by `date` but `insurance_records` has `start_date`. Per-table date columns now live in `js/domain/costs.js` (`COST_TYPES`).
3. **Partial fills were ignored.** New hybrid methodology in `js/domain/fuel-metrics.js`:
   - exact L/100km still measured full-tank → full-tank (partials rolled in);
   - partials get *proportional leg projections* (liters ÷ km driven × 100), flagged `is_estimate`, shown as `~x.x EST` pills and hollow chart points;
   - avg-consumption KPI is blended (all liters ÷ all km) so partials count;
   - distance / monthly stats stay pure odometer+euro math.
4. **Total cost of ownership omitted fuel** on the costs page (`totalFuelCost = 0` hardcoded) — now purchase + fuel + all cost tables, with a proportional bar.
5. **Chart race on fast page/car switching** — router render-epoch guard + chart manager.
6. Unformatted floats, string-concat sums, odometer-regression producing negative efficiency — all fixed and regression-tested.

### Structure now
`js/config.js` (secrets/config) · `js/core` (router, state) · `js/data` (Supabase repos, queries only) · `js/domain` (pure, unit-tested logic) · `js/ui` (pages + components) · `css/` (tokens, base, components) · `tests/` (`npm test` = `node --test`, 24 tests) · `supabase/` (schema + migrations).

### Follow-ups (not blocking)
- Run `supabase/migrations/001_refactor_2026-07.sql` in the Supabase SQL editor (indexes + `tank_capacity_l`; the data fix is already applied).
- Regenerate PWA icons in the blueprint palette (still the old blue).
- The Stitch design project ("Cars Manager - Engineer Blueprint") holds the reference screens if further design iteration is wanted.
