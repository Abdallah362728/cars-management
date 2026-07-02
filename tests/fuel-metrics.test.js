import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeFuelRows, enrichFuelLogs, computeFuelStats,
  monthlySpend, efficiencyTrend, daysSince,
} from '../js/domain/fuel-metrics.js'

function fill(date, odo, liters, cost, full = true, extra = {}) {
  return { date, odometer_km: odo, liters, total_cost: cost, is_full_tank: full, ...extra }
}

function enrich(rows, opts) {
  return enrichFuelLogs(normalizeFuelRows(rows), opts)
}

// ── The real Mercedes A150 history from supabase/schema.sql ──
const MERCEDES = [
  fill('2026-03-04', 178697, 52.19, 108.56, true,  { price_per_liter: 2.080 }),
  fill('2026-03-27', 179288, 48.64, 102.58, true,  { price_per_liter: 2.109 }),
  fill('2026-05-30', 179939, 16.59,  30.00, false, { price_per_liter: 1.808 }),
  fill('2026-06-13', 180081, 20.46,  38.00, false, { price_per_liter: 1.857 }),
  fill('2026-06-22', 180173, 47.66,  90.00, true,  { price_per_liter: 1.888 }),
]

test('Mercedes history: measured periods', () => {
  const e = enrich(MERCEDES)
  assert.equal(e[0].l_per_100km, null)          // baseline — nothing to measure yet
  assert.equal(e[0].is_baseline, true)
  assert.equal(e[1].l_per_100km, 8.2)           // 48.64 L / 591 km
  assert.equal(e[1].eur_per_100km, 17.36)       // €102.58 / 591 km
  assert.equal(e[4].l_per_100km, 9.6)           // (16.59+20.46+47.66) L / 885 km
  assert.equal(e[4].eur_per_100km, 17.85)       // €(30+38+90) / 885 km
})

test('Mercedes history: partial fills get estimates, not blanks', () => {
  const e = enrich(MERCEDES)
  for (const i of [2, 3]) {
    assert.equal(e[i].l_per_100km, null)
    assert.equal(e[i].is_estimate, true)
    assert.equal(e[i].est_l_per_100km, 8.2)     // rolling window = first period only
  }
  assert.equal(e[2].est_eur_per_100km, 14.88)   // 8.2301… × €1.808/L
  assert.equal(e[3].est_eur_per_100km, 15.28)   // 8.2301… × €1.857/L
})

test('Mercedes history: blended stats count partials', () => {
  const s = computeFuelStats(enrich(MERCEDES))
  assert.equal(s.fillCount, 5)
  assert.equal(s.totalKm, 1476)                             // 180173 − 178697
  assert.equal(s.blendedEurPer100km, 17.65)                 // €260.58 / 1476 km
  assert.equal(s.costPerKm, 0.177)
  assert.equal(s.measuredAvgL100, 9.0)                      // distance-weighted, not mean of ratios
  assert.equal(s.totalCost, 369.14)
  assert.equal(s.lastOdometer, 180173)
})

test('trend includes estimate points so charts are never empty mid-period', () => {
  const t = efficiencyTrend(enrich(MERCEDES))
  assert.deepEqual(t.map(p => p.value), [8.2, 8.2, 8.2, 9.6])
  assert.deepEqual(t.map(p => p.isEstimate), [false, true, true, false])
})

// ── Edge-case matrix ──

test('empty input', () => {
  assert.deepEqual(enrich([]), [])
  const s = computeFuelStats([])
  assert.equal(s.fillCount, 0)
  assert.equal(s.totalKm, null)
  assert.equal(s.measuredAvgL100, null)
  assert.equal(s.blendedEurPer100km, null)
})

test('single full fill = baseline only', () => {
  const e = enrich([fill('2026-01-01', 1000, 40, 80)])
  assert.equal(e[0].is_baseline, true)
  assert.equal(e[0].l_per_100km, null)
  assert.equal(e[0].is_estimate, false)         // no distance → nothing to estimate
})

test('two full fills = second is measured', () => {
  const e = enrich([fill('2026-01-01', 1000, 40, 80), fill('2026-02-01', 1500, 35, 70)])
  assert.equal(e[1].l_per_100km, 7)             // 35 / 500 × 100
  assert.equal(e[1].eur_per_100km, 14)
})

test('history starting with a partial: first full gets an estimate via factory spec fallback', () => {
  const e = enrich(
    [fill('2026-01-01', 1000, 20, 40, false), fill('2026-01-10', 1400, 45, 90, true)],
    { factorySpec: 6.8 },
  )
  // The full tank can't be measured (unknown tank level at history start)…
  assert.equal(e[1].l_per_100km, null)
  // …but it has a distance, so it gets a clearly-flagged estimate.
  assert.equal(e[1].is_estimate, true)
  assert.equal(e[1].est_l_per_100km, 6.8)
})

test('trailing partials after the last full tank get rolling-window estimates', () => {
  const e = enrich([
    fill('2026-01-01', 1000, 40, 80),
    fill('2026-02-01', 1500, 40, 80),           // measured: 8 L/100km
    fill('2026-02-15', 1700, 15, 30, false),    // trailing partial
  ])
  assert.equal(e[2].is_estimate, true)
  assert.equal(e[2].est_l_per_100km, 8)
  assert.equal(e[2].est_eur_per_100km, 16)      // 8 × €2/L
})

test('odometer going backwards is flagged and never yields negative efficiency', () => {
  const e = enrich([
    fill('2026-01-01', 1000, 40, 80),
    fill('2026-02-01', 900, 35, 70),            // typo: odometer decreased
    fill('2026-03-01', 1400, 38, 76),           // recovery leg measured from row 1 (odo 900)
  ])
  assert.equal(e[1].odo_anomaly, true)
  assert.equal(e[1].distance_km, null)
  assert.equal(e[1].l_per_100km, null)
  assert.equal(e[2].odo_anomaly, false)
  assert.equal(e[2].distance_km, 500)
  assert.equal(e[2].l_per_100km, 7.6)           // 38 / 500 × 100 — fresh period after reset
  const s = computeFuelStats(e)
  assert.equal(s.totalKm, 500)                  // anomalous leg excluded
})

test('numeric strings from the DB are coerced, never concatenated', () => {
  const e = enrich([
    { date: '2026-01-01', odometer_km: '1000', liters: '40', total_cost: '80', is_full_tank: true },
    { date: '2026-02-01', odometer_km: '1500', liters: '35.5', total_cost: '71', is_full_tank: true },
  ])
  assert.equal(e[1].l_per_100km, 7.1)
  const s = computeFuelStats(e)
  assert.equal(s.totalCost, 151)                // 80 + 71, not "8071"
})

test('rows are sorted by date even if stored out of order', () => {
  const e = enrich([
    fill('2026-02-01', 1500, 35, 70),
    fill('2026-01-01', 1000, 40, 80),
  ])
  assert.equal(e[0].date, '2026-01-01')
  assert.equal(e[1].l_per_100km, 7)
})

test('monthlySpend buckets by calendar month without end-of-month drift', () => {
  const rows = [
    fill('2026-05-30', 1, 10, 30),
    fill('2026-06-13', 2, 10, 38),
    fill('2026-06-22', 3, 10, 90),
  ]
  const m = monthlySpend(rows, { months: 3, today: new Date(2026, 6, 31) })  // Jul 31
  assert.deepEqual(m.map(x => x.key), ['2026-05', '2026-06', '2026-07'])
  assert.deepEqual(m.map(x => x.total), [30, 128, 0])
})

test('daysSince', () => {
  assert.equal(daysSince('2026-06-28', new Date('2026-07-02T12:00:00Z')), 4)
  assert.equal(daysSince(null), null)
})
