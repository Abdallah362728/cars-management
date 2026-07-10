# Full App Review — Bug Fixes, Improvements & New Settings Section

## Context

The user asked for a full functionality review of the cars-management PWA (vanilla JS + Supabase + Chart.js, no build step, deployed on Netlify). The review confirmed the user's suspicion that the **Additional/Service section has bugs** (its km-based schedule status math is unreliable, marking items done can silently lose data), found **cross-page date bugs**, an **honesty gap in the fuel averages**, and confirmed that **no record in the app can be edited** — any typo requires delete + re-add, and cars/schedule items can't be corrected at all without SQL. The user approved: fix all confirmed bugs, add three improvements (flag blended estimates, capture/show insurance coverage, guard double-click deletes), document (not fix) the missing-RLS security issue, and build a new **Settings** page with full manual data editing for every table (cars, fuel logs, all 5 cost types, maintenance schedule items).

This plan is written to be executed without further decisions: every change lists the file, the anchor to find, and the exact behavior to implement.

**Architecture facts the executor must know:**
- Pages live in `js/ui/pages/*.js`, each exports `render(container, state, epoch)` + optional `cleanup()`. The hash router is `js/core/router.js` (`PAGES` map, `FAB_PAGES` set, `route()` re-renders, `isStale(epoch)` guards async DOM writes).
- Repos in `js/data/*-repo.js` (thin Supabase queries); pure logic in `js/domain/*.js` (unit-tested with `node --test`, run via `npm test`).
- Every DB string interpolated into `innerHTML` must be wrapped in `esc()` from `js/domain/format.js`.
- Styling is hand-written CSS in `index.html` (blueprint theme). Reuse existing classes only: `card`, `section`, `micro`, `mute`, `num`, `pill` (`pill--danger/--warn/--ok/--muted`), `chip`/`chip-row`/`chip--active`, `row`, `row-between`, `dim-line`, `skeleton`, `form-stack`, `form-row`, `btn--danger-text`, `empty-note`, `scroll-x`, `page-title`.
- Supabase `numeric` columns may arrive as strings — always coerce with `Number()`/`parseFloat()` before math (the codebase already does this at some boundaries, e.g. `normalizeFuelRows`).
- Git: work on branch `claude/fix-factory-line-graph-E5TZR`, push with `git push -u origin <branch>`. Do NOT create a PR unless asked.

---

## Part 1 — Bug fixes in the Service (Additional) section

### 1.1 Coerce numerics in `computeScheduleStatus` — the km-status math
**File:** `js/domain/schedule.js`

At the top of `computeScheduleStatus(item, currentOdometer, today)`, before any logic, add coercions and use them throughout:

```js
const lastKm     = item.last_done_km == null ? null : Number(item.last_done_km)
const intervalKm = item.interval_km  == null ? null : Number(item.interval_km)
const odo        = currentOdometer   == null ? null : Number(currentOdometer)
```

- Replace the never-done guard `if (!item.last_done_km && !item.last_done_date)` with `if (lastKm == null && !item.last_done_date)` (also fixes the `last_done_km = 0` falsy edge case).
- Replace the km branch condition with `if (intervalKm && lastKm != null && odo != null)` and its body with `nextKm = lastKm + intervalKm; kmRemaining = nextKm - odo` (this fixes potential string concatenation like `"80000" + "10000"` → `"8000010000"`, which made every km-interval item permanently "OK" and rendered garbage like "7,999,831,000 km left").
- `interval_months` is an `int` column (arrives as a number) — leave the date branch as is.

### 1.2 Insufficient data must not show "OK"
**File:** `js/domain/schedule.js`

After both branches (km and months), immediately before building the return object, add:

```js
// Passed the never-done guard but neither interval could be evaluated
// (e.g. km-only item marked done with a date but no odometer).
if (nextKm == null && nextDate == null) {
  return { status: 'never_done', label: 'Needs data', color: 'indigo', nextKm: null, nextDate: null, daysUntil: null, kmRemaining: null }
}
```

This routes such items into the existing "No data" bucket on the summary strip (`js/ui/pages/additional.js` counts `never_done` as "No data") instead of a false green "OK" pill. Note the label differs from the plain never-done case ('Never done' vs 'Needs data') — both statuses are `never_done` so all existing pill/count/sort maps keep working.

### 1.3 Mark-done modal: prefill odometer, keep deterministic null behavior
**File:** `js/ui/pages/additional.js`

- `renderSchedule` already computes `lastOdometer` (line ~44). Pass it through: change the row click handler `openMarkDoneModal(item, state)` → `openMarkDoneModal(item, state, lastOdometer)`, and the function signature to match.
- In the modal HTML, change the odometer input to prefill: `value="${lastOdometer ?? ''}"` (keep `placeholder="optional"`). This makes it one tap to accept the latest known odometer, so km-interval items keep working after mark-done.
- Keep the existing behavior that an emptied field saves `last_done_km: null` — with fix 1.2 such items now honestly show "Needs data" instead of fake "OK".

### 1.4 Mark-done: don't lose notes, and handle partial failure honestly
**File:** `js/ui/pages/additional.js`, submit handler of `openMarkDoneModal` (currently lines ~150-188)

Current bugs: (a) notes are silently discarded unless cost > 0, because the `addCost` call that carries them is gated on `cost > 0`; (b) if `updateScheduleItem` succeeds but `addCost` throws, the user sees an error toast implying nothing saved, and re-submitting double-marks and can double-insert the cost.

Rewrite the submit try-block to:

```js
try {
  await updateScheduleItem(item.id, { last_done_date: doneDate, last_done_km: doneKm })
} catch (err) {
  showToast(err.message, 'error')
  btn.textContent = 'Mark as done'; btn.disabled = false
  return
}

let costWarning = null
if (cost > 0 || notes) {
  try {
    await addCost('maintenance', carId, {
      date: doneDate, odometer_km: doneKm, category: item.item_name,
      description: item.item_name, cost, notes, currency: 'EUR',
    })
  } catch (err) {
    costWarning = err.message
  }
}

closeModal()
showToast(costWarning
  ? `${item.item_name} marked done — but the log entry failed: ${costWarning}. Add it in Costs.`
  : `${item.item_name} marked as done`, costWarning ? 'error' : undefined)
route()
```

- `cost > 0 || notes` ensures a zero-cost service with notes still produces a maintenance history entry (cost 0).
- The schedule update is the primary action: once it commits, always close + refresh, and report the secondary failure explicitly instead of pretending nothing saved.

### 1.5 Freeze the car id when the modal opens
**File:** `js/ui/pages/additional.js`

At the top of `openMarkDoneModal`, capture `const carId = state.activeCar.id` and use `carId` in the `addCost` call (replacing `state.activeCar.id` read at submit time). Prevents writing the cost to the wrong car if the user switches cars while the modal is open.

### 1.6 Number formatting on the Service page
**File:** `js/ui/pages/additional.js`

- Line ~96: `item.interval_km.toLocaleString()` → `Number(item.interval_km).toLocaleString()` (numeric strings pass through `String.prototype.toLocaleString` unformatted).
- Sold-car ledger (lines ~222-223): `car.purchase_price?.toLocaleString()` → `car.purchase_price != null ? Number(car.purchase_price).toLocaleString() : '—'`, same for `sell_price`. Keep the `${currency}` prefix as is. (`netLoss` already coerces via subtraction — line ~208-209 — leave it, but wrap its display in `Number(...)` only if you change it; not required.)

---

## Part 2 — Cross-page date bugs

### 2.1 Month headers wrong in negative-UTC timezones
**Files:** `js/ui/pages/costs.js` (lines ~122-123) and `js/ui/pages/fuel.js` (same pattern in its month-group rendering — search for `new Date(group.key + '-01')`)

`new Date('2026-03-01')` parses as UTC midnight; `toLocaleString` then renders the previous day locally west of UTC → "February 2026" header on March data. Replace in BOTH files:

```js
const [gy, gm] = group.key.split('-').map(Number)
const d = new Date(gy, gm - 1, 1)          // local-time construction
const label = d.toLocaleString('default', { month: 'long', year: 'numeric' })
```

(This also makes the list pages consistent with the dashboard's `monthlySpend`, which already uses the local constructor.)

### 2.2 `addMonths` day-overflow and UTC skew
**File:** `js/domain/format.js` (lines ~15-19)

`last_done_date = '2026-01-31'` + 1 month currently yields March 3. Replace the implementation:

```js
export function addMonths(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  t.setUTCDate(Math.min(d, lastDay))
  return t
}
```

The only caller is `computeScheduleStatus` (`js/domain/schedule.js` line ~21), which does `d.toISOString().slice(0, 10)` — UTC construction keeps that correct. Check `tests/schedule.test.js` after the change; if any test asserted the overflow behavior, update it to the clamped date (Jan 31 + 1mo = Feb 28/29).

---

## Part 3 — Approved improvements

### 3.1 Flag blended averages that include partial-fill estimates
**Files:** `js/domain/fuel-metrics.js`, `js/ui/pages/dashboard.js`, `js/ui/pages/fuel.js`

1. In `computeFuelStats` (fuel-metrics.js), alongside `measuredAvgL100`/`blendedAvgL100`, add to the returned object:
   `blendedIncludesEstimates: withLeg.some(r => !r.is_full_tank)`
2. In `dashboard.js` (line ~78): after `const avgL100 = stats.blendedAvgL100 ?? stats.measuredAvgL100`, add
   `const avgIsEstimate = avgL100 != null && avgL100 === stats.blendedAvgL100 && stats.blendedIncludesEstimates`
   - "Avg fuel use" stat (line ~101): render `${avgIsEstimate ? '~' : ''}${fmtNum(avgL100)}`.
   - Schematic call (line ~93): change `isEstimate: stats.measuredAvgL100 == null && avgL100 != null` → `isEstimate: avgIsEstimate || (stats.measuredAvgL100 == null && avgL100 != null)`.
3. In `fuel.js`: find where the stats strip renders the average (search `blendedAvgL100` / `measuredAvgL100`, around line ~35) and apply the same `~` prefix logic.
4. Add a unit test in `tests/fuel-metrics.test.js`: a dataset with one full-tank leg and one partial leg must return `blendedIncludesEstimates: true`; all-full-tank data must return `false`.

### 3.2 Trend label honesty
**File:** `js/ui/pages/dashboard.js` (line ~125)

`last ${data.trend.length} fills` undercounts (the trend drops the pending fill and no-value fills, capped at 10). Change the label to `${data.trend.length} points`.

### 3.3 Guard double-click deletes
**Files:** `js/ui/pages/fuel.js` (delete handler, lines ~143-154) and `js/ui/pages/costs.js` (lines ~150-161)

In both handlers, immediately after the `confirm()` returns true, add `btn.disabled = true`, and in the `catch` add `btn.disabled = false`. (On success `route()` replaces the DOM, so no re-enable needed.)

### 3.4 Insurance: capture end date & show coverage
**Files:** `js/ui/pages/costs.js`

1. **Add form** (`openAddCostModal`): after the Description field `<div>`, add an end-date field that is only visible for the insurance type (mirror the existing `#odometer-field` show/hide mechanic at lines ~192-195 and ~210-211):
   ```html
   <div id="end-date-field" style="display:none">
     <label class="micro">Coverage until (optional)</label>
     <input type="date" name="end_date" autocomplete="off">
   </div>
   ```
   In the type-chip click handler add: `document.getElementById('end-date-field').style.display = btn.dataset.type === 'insurance' ? '' : 'none'`.
   In the payload mapping, extend the insurance line: `if (type === 'insurance') { payload.start_date = date; payload.provider = desc; payload.end_date = fd.get('end_date') || null }`.
2. **List row**: in the month-group item rendering (lines ~127-144), for insurance rows show the coverage span and effective monthly cost. After computing `label`, add:
   ```js
   let subtitle = costDate(cost) || '—'
   if (cost._type === 'insurance' && cost.end_date) {
     const months = Math.max(1, Math.round(daysBetween(cost.start_date, cost.end_date) / 30.44))
     subtitle += ` — ${cost.end_date} · ≈ ${fmtMoney(Number(cost.cost) / months)}/mo`
   }
   ```
   and render `${esc(subtitle)}` in place of `${esc(costDate(cost) || '—')}`. Import `daysBetween` from `../../domain/format.js`.
3. **No chart change**: the dashboard's monthly chart is fuel-only (`monthlySpend(enriched)` over fuel rows), so there is no monthly cost chart to amortize. Do not invent one.

---

## Part 4 — Security documentation (no code behavior change)

The Supabase project has **no RLS policies** (`supabase/schema.sql` never enables row-level security), yet `js/config.js` and `README.md` claim RLS governs access. With the public anon key, anyone can read/write/delete all rows. User chose to document now, fix later.

1. **`js/config.js`**: replace the comment lines 1-3 with:
   ```js
   // Single configuration point for the app.
   // WARNING: RLS is NOT currently enabled on this Supabase project — the anon
   // key below grants full read/write to anyone who has it. Do not share the
   // app URL publicly until auth + RLS policies are added (see README).
   ```
2. **`README.md`**: find the tech list entry claiming "Postgres + RLS" (~line 240) and change it to "Postgres (⚠ RLS not yet enabled — data is publicly writable; auth + policies planned)". Add a short "Known security gap" note if a suitable section exists (do not restructure the README).
3. **`supabase/schema.sql`**: append a commented block at the end:
   ```sql
   -- TODO (security): RLS is not enabled. When adding auth, run for EACH table:
   --   alter table <t> enable row level security;
   --   create policy "authenticated full access" on <t>
   --     for all to authenticated using (true) with check (true);
   -- and remove anon write access.
   ```

---

## Part 5 — New Settings section with full manual data editing

*(User-approved scope: edit EVERYTHING — cars, fuel logs, all 5 cost types, and maintenance schedule items including add/delete. All anchors below are verified against the current code. CSS classes `btn--ghost`, `btn--micro`, `btn--danger-text`, `chip`, `seg-btn` and the `tank-partial-btn` id all exist — no CSS changes needed; `.nav-row` is flex with `flex:1` buttons so a 5th tab needs no CSS either. `sw.js` has no precache list — no sw.js change needed.)*

### 5.1 Register route — `js/core/router.js`
In the `PAGES` object, after `'#additional': () => import('../ui/pages/additional.js'),` insert:
```js
  '#settings':   () => import('../ui/pages/settings.js'),
```
Do NOT touch `FAB_PAGES` — the router already hides the FAB and nulls `window.__openAddModal` for pages not in the set. `settings.js` must never assign `window.__openAddModal`.

### 5.2 Add nav button — `index.html`
Anchor: the `</button>` closing the Service nav button (after `<span>Service</span>`). Insert after it, inside `.nav-row`:
```html
      <button class="nav-btn" data-hash="#settings">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        <span>Settings</span>
      </button>
```
No listener wiring needed — `initRouter()` binds all `.nav-btn` by `data-hash`. Match the stroke attribute style of the existing nav SVGs (check a sibling button; add `stroke="currentColor"` if the others carry it).

### 5.3 New repo helpers (4 files)
- **`js/data/cars-repo.js`** — append after `updateCar`:
  ```js
  export async function addCar(payload) {
    const { error } = await supabase.from('cars').insert(payload)
    if (error) throw error
  }
  ```
- **`js/data/fuel-repo.js`** — insert after `deleteFuelLog`:
  ```js
  export async function updateFuelLog(id, updates) {
    const { error } = await supabase.from('fuel_logs').update(updates).eq('id', id)
    if (error) throw error
  }
  ```
- **`js/data/costs-repo.js`** — append after `deleteCost`, mirroring its COST_TYPES dispatch:
  ```js
  export async function updateCost(type, id, updates) {
    const meta = COST_TYPES[type]
    if (!meta) throw new Error(`Unknown cost type: ${type}`)
    const { error } = await supabase.from(meta.table).update(updates).eq('id', id)
    if (error) throw error
  }
  ```
- **`js/data/maintenance-repo.js`** — insert after `updateScheduleItem`:
  ```js
  export async function addScheduleItem(carId, payload) {
    const { error } = await supabase.from('maintenance_schedules').insert({ car_id: carId, ...payload })
    if (error) throw error
  }
  export async function deleteScheduleItem(id) {
    const { error } = await supabase.from('maintenance_schedules').delete().eq('id', id)
    if (error) throw error
  }
  ```

### 5.4 New file `js/ui/pages/settings.js`

**Imports (exact):**
```js
import { getCars, updateCar, addCar } from '../../data/cars-repo.js'
import { getFuelLogsRaw, updateFuelLog, deleteFuelLog } from '../../data/fuel-repo.js'
import { getCostsByType, updateCost, deleteCost } from '../../data/costs-repo.js'
import { getSchedule, updateScheduleItem, addScheduleItem, deleteScheduleItem } from '../../data/maintenance-repo.js'
import { setCars, setActiveCar } from '../../core/state.js'
import { esc, fmtMoney, fmtNum } from '../../domain/format.js'
import { isStale, route } from '../../core/router.js'
import { openModal, closeModal, modalHandle, modalFooter, tankToggleField, setupTankToggle } from '../components/modal.js'
import { showToast } from '../components/toast.js'
```
(`state` arrives as a render arg; `setCars`/`setActiveCar` mutate the same singleton.)

**Module-level state:**
```js
const ENTITIES = {
  fuel:         { label: 'Fuel' },
  maintenance:  { label: 'Maintenance' },
  supplies:     { label: 'Supplies' },
  insurance:    { label: 'Insurance' },
  registration: { label: 'Registration' },
  other:        { label: 'Other' },
  schedule:     { label: 'Schedule' },
}
let activeEntity = 'fuel'   // survives route() re-renders via module cache
```

**Payload helpers (define exactly; used by every submit handler):**
```js
const numOrNull  = (fd, n) => { const v = fd.get(n); return v === null || v === '' ? null : parseFloat(v) }
const intOrNull  = (fd, n) => { const v = fd.get(n); return v === null || v === '' ? null : parseInt(v, 10) }
const strOrNull  = (fd, n) => { const v = (fd.get(n) ?? '').trim(); return v || null }
const dateOrNull = (fd, n) => fd.get(n) || null
const currencyOf = fd => ((fd.get('currency') ?? '').trim() || 'EUR').toUpperCase()
```

**Field-builder helpers (encode the null-safe prefill rules):**
```js
function textField(label, name, value, { required = false, placeholder = '' } = {}) {
  return `<div>
    <label class="micro">${label}</label>
    <input type="text" name="${name}" value="${esc(value ?? '')}" placeholder="${placeholder}" ${required ? 'required' : ''} autocomplete="off">
  </div>`
}
function numField(label, name, value, { required = false, step = 'any' } = {}) {
  return `<div>
    <label class="micro">${label}</label>
    <input type="number" name="${name}" inputmode="decimal" step="${step}" value="${value ?? ''}" ${required ? 'required' : ''} autocomplete="off">
  </div>`
}
function dateField(label, name, value, { required = false } = {}) {
  return `<div>
    <label class="micro">${label}</label>
    <input type="date" name="${name}" value="${String(value ?? '').slice(0, 10)}" ${required ? 'required' : ''} autocomplete="off">
  </div>`
}
```
Rules: null numerics render as `value=""` (never the string "null"); dates get `YYYY-MM-DD` via `.slice(0,10)`; every DB string goes through `esc()`. Use `step="any"` for ALL number inputs on this page (pre-filled DB decimals like `price_per_liter = 1.759` fail HTML validation under `step="0.01"`); exception: car `year` uses `step="1"`.

**`render(container, state, epoch)` export:** header block (`page-title` div with micro "App", `<h1>Settings</h1>`, mute subtitle "Cars & data editor"), then `renderCarsSection(container, state)` (sync), then `await renderDataSection(container, state, epoch)`. No `cleanup()` export needed (no charts/timers).

**`renderCarsSection(container, state)`** — a `div.section` starting with `<div class="dim-line"><span class="micro">Cars</span></div>`.
- If `state.cars.length === 0`: `<div class="empty-note">No cars yet. Add your first car below.</div>`.
- Else per car (index `i`):
  ```js
  const pill = car.status === 'active' ? 'pill--ok' : car.status === 'stored' ? 'pill--warn' : 'pill--muted'
  ```
  ```html
  <div class="card row-between" style="margin-bottom:8px">
    <div style="min-width:0">
      <p style="font-size:13px;font-weight:600">${esc(car.make)} ${esc(car.model)} <span class="mute num">${car.year ?? ''}</span></p>
      <p class="mute num" style="font-size:11px;margin-top:1px">${esc(car.purchase_date ?? '—')}${car.operating_country ? ' · ' + esc(car.operating_country) : ''}</p>
    </div>
    <div class="row" style="gap:8px;flex-shrink:0">
      <span class="pill ${pill}">${esc(String(car.status ?? '').toUpperCase())}</span>
      <button class="edit-car-btn btn btn--micro" data-idx="${i}">EDIT</button>
    </div>
  </div>
  ```
- After the list: `<button id="add-car-btn" class="btn btn--ghost" style="width:100%">+ Add car</button>`.
- Wiring: `.edit-car-btn` click → `openCarModal(state.cars[Number(btn.dataset.idx)], state)`; `#add-car-btn` → `openCarModal(null, state)`.

**`openCarModal(car, state)`** — shared add/edit (`const isEdit = !!car`; title `isEdit ? 'Edit car' : 'Add car'`). Form `id="car-form"` class `form-stack`, fields in this order:
- form-row: `textField('Make','make',car?.make,{required:true,placeholder:'Toyota'})` + `textField('Model','model',car?.model,{required:true,placeholder:'Corolla'})`
- form-row: `numField('Year','year',car?.year,{required:true,step:'1'})` + a Status `<select name="status" required>` with options active/sold/stored, `selected` matching `car?.status ?? 'active'` (bare `select` is already styled by `css/components.css`)
- form-row: `dateField('Purchase date','purchase_date',car?.purchase_date)` + `numField('Purchase price','purchase_price',car?.purchase_price)`
- form-row: `dateField('Sell date','sell_date',car?.sell_date)` + `numField('Sell price','sell_price',car?.sell_price)`
- `numField('Current market value','current_market_value',car?.current_market_value)`
- form-row: `numField('Factory fuel spec (L/100km)','factory_fuel_spec',car?.factory_fuel_spec)` + `numField('Tank capacity (L)','tank_capacity_l',car?.tank_capacity_l)`
- form-row: `textField('Currency','currency',car?.purchase_currency ?? 'EUR')` + `textField('Operating country','operating_country',car?.operating_country,{placeholder:'DE'})`
- `textField('Notes (optional)','notes',car?.notes)`
- `${modalFooter('Cancel', isEdit ? 'Save car' : 'Add car')}`

Submit payload (exact):
```js
const payload = {
  make: fd.get('make').trim(),
  model: fd.get('model').trim(),
  year: parseInt(fd.get('year'), 10),
  status: fd.get('status'),
  purchase_date: dateOrNull(fd, 'purchase_date'),
  purchase_price: numOrNull(fd, 'purchase_price'),
  purchase_currency: currencyOf(fd),
  sell_date: dateOrNull(fd, 'sell_date'),
  sell_price: numOrNull(fd, 'sell_price'),
  current_market_value: numOrNull(fd, 'current_market_value'),
  factory_fuel_spec: numOrNull(fd, 'factory_fuel_spec'),
  tank_capacity_l: numOrNull(fd, 'tank_capacity_l'),
  operating_country: strOrNull(fd, 'operating_country'),
  notes: strOrNull(fd, 'notes'),
}
```
try: `if (isEdit) await updateCar(car.id, payload); else await addCar(payload)` → `await refreshCarsState(state)` → `closeModal()` → `showToast(isEdit ? 'Car updated' : 'Car added')` → `route()`. catch: error toast + restore button label + re-enable. (Standard submit shape: preventDefault, FormData, `#modal-submit` → 'Saving…' + disabled.)

**`refreshCarsState(state)`** — keeps global state coherent after car writes (`state.cars` is loaded once at bootstrap in `js/main.js`, so it MUST be re-fetched here):
```js
async function refreshCarsState(state) {
  const prevId = state.activeCar?.id ?? null
  setCars(await getCars())
  setActiveCar(
    state.cars.find(c => c.id === prevId)
    ?? state.cars.find(c => c.status === 'active')
    ?? state.cars[0]
    ?? null
  )
}
```

**Data-editor dispatch trio:**
```js
async function fetchRows(type, carId) {
  if (type === 'fuel') return (await getFuelLogsRaw(carId)).slice().reverse()  // repo is asc → newest first
  if (type === 'schedule') return getSchedule(carId)                            // ordered by id
  return getCostsByType(carId, type)
}
function updateRow(type, id, updates) {
  if (type === 'fuel') return updateFuelLog(id, updates)
  if (type === 'schedule') return updateScheduleItem(id, updates)
  return updateCost(type, id, updates)
}
function deleteRow(type, id) {
  if (type === 'fuel') return deleteFuelLog(id)
  if (type === 'schedule') return deleteScheduleItem(id)
  return deleteCost(type, id)
}
```

**`rowSummary(type, row)`** → `{ title, sub, amount }` (title/sub `esc()`-wrapped INSIDE this function):
| type | title | sub | amount |
|---|---|---|---|
| fuel | `` `${row.date ?? '—'} · ${fmtNum(row.liters, 2)} L${row.is_full_tank === false ? ' · partial' : ''}` `` | `` `ODO ${row.odometer_km != null ? Number(row.odometer_km).toLocaleString() : '—'} KM` `` | `fmtMoney(row.total_cost)` |
| maintenance | `esc(row.description \|\| row.category \|\| 'Maintenance')` | `esc(row.date ?? '—')` | `fmtMoney(row.cost)` |
| supplies | `esc(row.item \|\| 'Supply')` | `esc(row.date ?? '—')` | `fmtMoney(row.cost)` |
| insurance | `esc(row.provider \|\| 'Insurance')` | `` `${esc(row.start_date ?? '—')} → ${esc(row.end_date ?? '—')}` `` | `fmtMoney(row.cost)` |
| registration | `esc(row.description \|\| 'Registration')` | `esc(row.date ?? '—')` | `fmtMoney(row.cost)` |
| other | `esc(row.description \|\| row.category \|\| 'Other')` | `esc(row.date ?? '—')` | `fmtMoney(row.cost)` |
| schedule | `esc(row.item_name)` | interval string: `EVERY {Number(interval_km).toLocaleString()} KM` / `EVERY {interval_months} MO` joined with `' / '`, plus `' · DONE {last_done_date}'` if set; `'—'` if all empty | `''` |

**`renderDataSection(container, state, epoch)`** (async):
1. `div.section` starting with `<div class="dim-line"><span class="micro">Data editor${state.activeCar ? ` — ${esc(state.activeCar.make)} ${esc(state.activeCar.model)}` : ''}</span></div>`.
2. If `!state.activeCar`: `<div class="empty-note">No active car — add a car above first.</div>` and return.
3. Entity picker:
   ```html
   <div class="scroll-x" style="margin-bottom:12px">
     <div class="chip-row">
       ${Object.entries(ENTITIES).map(([key, meta]) =>
         `<button class="chip entity-btn ${key === activeEntity ? 'chip--active' : ''}" data-entity="${key}">${meta.label}</button>`
       ).join('')}
     </div>
   </div>
   ```
   Wire each `.entity-btn` click → `activeEntity = btn.dataset.entity; route()`.
4. If `activeEntity === 'schedule'`: prepend `<button id="add-schedule-btn" class="btn btn--ghost" style="width:100%;margin-bottom:10px">+ Add schedule item</button>` wired to `openAddScheduleModal(state)`.
5. Skeleton loader (3 × 64px), then `rows = await fetchRows(activeEntity, state.activeCar.id)` in try/catch (`showToast('Failed to load records','error')` unless stale); check `isStale(epoch)` after the await before touching DOM; remove skeleton.
6. Empty: `<div class="empty-note">No ${ENTITIES[activeEntity].label.toLowerCase()} records for this car.</div>`.
7. Else per row (index `i`, `const s = rowSummary(activeEntity, row)`):
   ```html
   <div class="card row-between record-row" data-idx="${i}" style="margin-bottom:8px;cursor:pointer">
     <div style="min-width:0">
       <p style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.title}</p>
       <p class="mute num" style="font-size:11px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.sub}</p>
     </div>
     ${s.amount ? `<p class="num" style="font-weight:600;flex-shrink:0">${s.amount}</p>` : ''}
   </div>
   ```
   Wire `.record-row` click → `openEditModal(activeEntity, rows[Number(el.dataset.idx)], state)` (index lookup, not id parsing).

**`buildEditFields(type, row)`** — exact field lists (input `name` === DB column; order as written):
- **fuel**: `dateField('Date','date',row.date,{required:true})` · `numField('Odometer (km)','odometer_km',row.odometer_km,{required:true})` · form-row [`numField('Liters','liters',row.liters,{required:true})`, `numField('Total cost (€)','total_cost',row.total_cost,{required:true})`] · `numField('Price per liter (€/L)','price_per_liter',row.price_per_liter)` · `${tankToggleField()}` · `textField('Currency','currency',row.currency ?? 'EUR')` · `textField('Notes (optional)','notes',row.notes)`
- **maintenance**: date(req) · `textField('Description','description',row.description,{required:true})` · `textField('Category','category',row.category)` · form-row [`numField('Cost (€)','cost',row.cost,{required:true})`, `numField('Odometer (km)','odometer_km',row.odometer_km)`] · form-row [`numField('Next due (km)','next_due_km',row.next_due_km)`, `dateField('Next due (date)','next_due_date',row.next_due_date)`] · currency · notes
- **supplies**: date(req) · `textField('Item','item',row.item,{required:true})` · `numField('Cost (€)','cost',row.cost,{required:true})` · currency · notes
- **insurance**: form-row [`dateField('Start date','start_date',row.start_date,{required:true})`, `dateField('End date','end_date',row.end_date)`] · `textField('Provider','provider',row.provider,{required:true})` · `textField('Coverage type','coverage_type',row.coverage_type)` · cost(req) · currency · notes
- **registration**: date(req) · description(req) · cost(req) · `dateField('Valid until','valid_until',row.valid_until)` · currency · notes
- **other**: date(req) · description(req) · `textField('Category','category',row.category)` · cost(req) · currency · notes
- **schedule**: `textField('Item name','item_name',row.item_name,{required:true})` · form-row [`numField('Interval (km)','interval_km',row.interval_km)`, `numField('Interval (months)','interval_months',row.interval_months)`] · form-row [`dateField('Last done (date)','last_done_date',row.last_done_date)`, `numField('Last done (km)','last_done_km',row.last_done_km)`] · `textField('Notes (optional)','notes',row.notes)`

**`buildUpdatePayload(type, fd)`** — exact payloads (NEVER include `id`/`car_id`):
- **fuel**: `date: fd.get('date')`, `odometer_km: parseFloat(fd.get('odometer_km'))`, `liters: parseFloat(...)`, `total_cost: parseFloat(...)`; then `let ppl = numOrNull(fd,'price_per_liter'); if (ppl == null && liters > 0) ppl = total_cost / liters` → `price_per_liter: ppl`; `is_full_tank: fd.get('is_full_tank') === 'on'`; `currency: currencyOf(fd)`; `notes: strOrNull(fd,'notes')`
- **maintenance**: `date`, `description: strOrNull`, `category: strOrNull`, `cost: parseFloat`, `odometer_km: numOrNull`, `next_due_km: numOrNull`, `next_due_date: dateOrNull`, `currency: currencyOf(fd)`, `notes: strOrNull`
- **supplies**: `date`, `item: strOrNull`, `cost: parseFloat`, `currency`, `notes`
- **insurance**: `start_date: fd.get('start_date')`, `end_date: dateOrNull`, `provider: strOrNull`, `coverage_type: strOrNull`, `cost: parseFloat`, `currency`, `notes`
- **registration**: `date`, `description: strOrNull`, `cost: parseFloat`, `valid_until: dateOrNull`, `currency`, `notes`
- **other**: `date`, `description: strOrNull`, `category: strOrNull`, `cost: parseFloat`, `currency`, `notes`
- **schedule**: `item_name: strOrNull`, `interval_km: numOrNull`, `interval_months: intOrNull(fd,'interval_months')`, `last_done_date: dateOrNull`, `last_done_km: numOrNull`, `notes: strOrNull`

**`openEditModal(type, row, state)`** — module-level title map `const TITLES = { fuel: 'Edit fill-up', maintenance: 'Edit maintenance entry', supplies: 'Edit supply', insurance: 'Edit insurance record', registration: 'Edit registration', other: 'Edit cost', schedule: 'Edit schedule item' }`. Markup:
```js
openModal(`
  ${modalHandle()}
  <h2 class="modal-title">${TITLES[type]}</h2>
  <form id="record-form" class="form-stack">
    ${buildEditFields(type, row)}
    <div style="display:flex;justify-content:flex-end">
      <button type="button" id="modal-delete" class="btn--danger-text">DELETE RECORD</button>
    </div>
    ${modalFooter('Cancel', 'Save changes')}
  </form>
`)
```
After `openModal`, only for `type === 'fuel'`:
```js
setupTankToggle()
if (row.is_full_tank === false) document.getElementById('tank-partial-btn').click()
```
(`setupTankToggle()` defaults to full; the programmatic click flips the hidden `is_full_tank` input and segment styling — no modal.js changes. A row with `is_full_tank === null` stays on the FULL default, matching the app's `=== false` convention.)
- Delete: `#modal-delete` click → `confirm('Delete this record?')` → `await deleteRow(type, row.id)` → `closeModal(); showToast('Deleted'); route()`; catch → error toast.
- Submit (standard shape): `await updateRow(type, row.id, buildUpdatePayload(type, fd))` → `closeModal(); showToast('Saved'); route()`; catch → error toast + restore 'Save changes' + re-enable.

**`openAddScheduleModal(state)`** — form `id="schedule-add-form"`: `textField('Item name','item_name','',{required:true,placeholder:'Oil change'})` · form-row [`numField('Interval (km)','interval_km','')`, `numField('Interval (months)','interval_months','')`] · `textField('Notes (optional)','notes','')` · `modalFooter('Cancel','Add item')`. Submit payload `{ item_name: strOrNull, interval_km: numOrNull, interval_months: intOrNull, notes: strOrNull }` → `addScheduleItem(state.activeCar.id, payload)` → close/toast('Schedule item added')/route(); catch → error toast + restore.

### 5.5 Multi-car support — every car gets its own fully distinct pages & data

*(User requirement: they can add other cars, and each car must have fully distinct pages and data.)*

**Fact the executor must know:** data separation already exists — every repo query filters by `car_id`, and every page renders from `state.activeCar`. So "distinct data per car" is guaranteed once the user can (a) add cars — covered by 5.4's Add-car modal — and (b) reliably view any car. What's missing today is the viewing part: the "Switch" button only cycles ACTIVE cars (`switchToNextCar` in `js/core/state.js` uses `activeCars()`), it is absent from the Service page (`additional.js` builds its own header instead of calling `renderCarHeader`), and the selected car resets on every reload (never persisted). Fix all three:

1. **Car picker modal replaces blind cycling** — `js/ui/components/car-header.js`:
   - Show the `#car-switch-btn` button whenever `state.cars.length > 1` (ALL cars, not just active — sold/stored cars must be viewable as their own distinct pages).
   - Its click handler no longer calls `switchToNextCar()`; instead it opens a picker modal (import `openModal`, `closeModal`, `modalHandle` from `../components/modal.js`):
     ```js
     openModal(`
       ${modalHandle()}
       <h2 class="modal-title">Select car</h2>
       <div class="form-stack">
         ${state.cars.map((c, i) => `
           <button type="button" class="card row-between pick-car-btn" data-idx="${i}" style="cursor:pointer;text-align:left;width:100%">
             <div>
               <p style="font-size:13px;font-weight:600">${esc(c.make)} ${esc(c.model)} <span class="mute num">${c.year ?? ''}</span></p>
               <p class="mute num" style="font-size:11px;margin-top:1px">${esc(String(c.status ?? '').toUpperCase())}${c.operating_country ? ' · ' + esc(c.operating_country) : ''}</p>
             </div>
             ${state.activeCar?.id === c.id ? '<span class="pill pill--ok">CURRENT</span>' : ''}
           </button>`).join('')}
       </div>
     `)
     document.querySelectorAll('.pick-car-btn').forEach(btn =>
       btn.addEventListener('click', () => {
         setActiveCar(state.cars[Number(btn.dataset.idx)])
         closeModal()
         route()
       }))
     ```
   - Import `setActiveCar` from `../../core/state.js` and `esc` from `../../domain/format.js`. Keep `switchToNextCar` exported in state.js (harmless), but car-header.js stops using it.

2. **Persist the selected car across reloads**:
   - `js/core/state.js` — inside `setActiveCar(car)`, after assigning, add:
     ```js
     try { localStorage.setItem('activeCarId', car?.id ?? '') } catch {}
     ```
   - `js/main.js` — where the initial active car is chosen (currently first `status === 'active'` car), change the selection to:
     ```js
     const savedId = Number(localStorage.getItem('activeCarId')) || null
     setActiveCar(
       state.cars.find(c => c.id === savedId)
       ?? state.cars.find(c => c.status === 'active')
       ?? state.cars[0]
       ?? null
     )
     ```
3. **Service page joins the multi-car world** — `js/ui/pages/additional.js`: replace the hand-built header block (lines ~14-21) with `renderCarHeader(container, { title: 'Service' })` (import from `../components/car-header.js`), so the schedule page shows which car it belongs to and offers the same picker. The schedule and mark-done flows already use `state.activeCar.id`, so they become per-car automatically.
4. **Settings stays global on the Cars list but per-car in the Data editor** — already the design in 5.4 (`renderCarsSection` lists ALL cars; `renderDataSection` edits the ACTIVE car's records; its dim-line names the car). No change needed, but the executor must keep it that way.

### 5.6 Edge cases the implementation MUST honor
1. Null numeric/date DB values → empty inputs, never the literal "null".
2. `route()` is the sole refresh path after every save/delete; car saves call `refreshCarsState(state)` FIRST so header/dashboard reflect the change. Deleting cars is intentionally NOT offered.
3. Settings never sets `window.__openAddModal`; the router hides the FAB for `#settings` automatically.
4. `isStale(epoch)` checked after the single await in `renderDataSection` before touching DOM.
5. Insurance uses `start_date` (no `date` column); registrations also have `valid_until`; supplies use `item` not `description`.

---

## Part 6 — Tests, verification & delivery

### 6.1 Unit tests (`npm test` — node --test, no network needed)
1. **`tests/schedule.test.js`** — add cases feeding STRING numerics (as Supabase may deliver): `{ interval_km: '10000', last_done_km: '80000' }` with `currentOdometer 95000` → expect `status: 'overdue'`, `kmRemaining: -5000`. Add the insufficient-data case: `{ interval_km: 40000, interval_months: null, last_done_date: '2026-01-01', last_done_km: null }` → expect `status: 'never_done'`, `label: 'Needs data'`. Verify existing tests still pass; update any that asserted `addMonths` overflow (Jan 31 + 1 mo must now be Feb 28/29, not Mar 3).
2. **`tests/fuel-metrics.test.js`** — add: mixed full+partial legs → `blendedIncludesEstimates: true`; all-full legs → `false`.
3. New test file NOT required for settings.js (DOM module); repos are thin pass-throughs.

### 6.2 Static verification
- `node --check js/ui/pages/settings.js` (and every modified JS file) to catch syntax errors — there is no build step to catch them otherwise.
- Grep the new settings.js for `innerHTML` interpolations and confirm every DB-string is `esc()`-wrapped.

### 6.3 Manual verification (requires the deployed app or a machine with Supabase network access — the CI sandbox blocks Supabase, so runtime checks happen on-device)
Serve locally with `npx serve .` or `python3 -m http.server` where Supabase is reachable, then:
1. Settings tab appears 5th, highlights on tap, FAB hidden.
2. Cars: edit the Mercedes' `factory_fuel_spec` → dashboard "vs spec" updates after switching back. Add a car → appears; status select persists.
2b. Multi-car distinctness: add a second car via Settings → the header "Switch" button appears on ALL pages including Service → open the picker, select the new car → Dashboard/Fuel/Costs/Service all show empty states (no data bleed from the first car) → add a fuel log to the new car → it appears only there; switch back → the Mercedes' data is untouched. Reload the app → the last-selected car is still active (localStorage persistence).
3. Data editor: cycle all 7 chips; each lists newest-first; tap a row → every column pre-filled (empty inputs for nulls); save without changes → row unchanged; edit a partial fill → PARTIAL pre-selected on reopen; delete with confirm → row gone.
4. Schedule: add item → appears on Service page; edit intervals → status recomputes; delete → gone.
5. Service page: mark an item done leaving odometer prefilled → km countdown appears (no more bogus "OK"/giant numbers); with notes but zero cost → entry appears under Costs → Repairs with cost €0.
6. Fuel/Costs pages: month headers correct; double-tapping DELETE does not double-fire; insurance rows show coverage span + ≈€/mo when end date set.

### 6.4 Commit & delivery
Work on branch `claude/fix-factory-line-graph-E5TZR`. Commit in logical units (suggested: 1. schedule/date domain fixes + tests, 2. service-page fixes, 3. cross-page fixes + improvements, 4. security docs, 5. settings feature). Push with `git push -u origin claude/fix-factory-line-graph-E5TZR` (retry up to 4× with 2s/4s/8s/16s backoff on network failure only). Do NOT create a PR unless the user asks.

### Execution order
Part 1 → Part 2 → run `npm test` → Part 3 → Part 4 → Part 5 → Part 6 checks → commit/push. Parts are independent enough that a failure in one must not block committing the completed earlier parts.
