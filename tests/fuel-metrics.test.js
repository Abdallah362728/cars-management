import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeFuelRows, enrichFuelLogs, computeFuelStats,
  monthlySpend, efficiencyTrend, daysSince,
} from '../js/domain/fuel-metrics.js'

function fill(date, odo, liters, cost, full = true, extra = {}) {
  return { date, odometer_km: odo, liters, total_cost: cost, is_full_tank: full, ...extra }
}

function enrich(rows) {
  return enrichFuelLogs(normalizeFuelRows(rows))
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

test('Mercedes history: partial fills get proportional leg projections, not blanks', () => {
  const e = enrich(MERCEDES)
  for (const i of [2, 3]) {
    assert.equal(e[i].l_per_100km, null)
    assert.equal(e[i].is_estimate, true)
  }
  assert.equal(e[2].est_l_per_100km, 2.5)       // 16.59 L / 651 km × 100
  assert.equal(e[2].est_eur_per_100km, 4.61)    // €30 / 651 km × 100
  assert.equal(e[3].est_l_per_100km, 14.4)      // 20.46 L / 142 km × 100
  assert.equal(e[3].est_eur_per_100km, 26.76)   // €38 / 142 km × 100
})

test('Mercedes history: blended stats count partials', () => {
  const s = computeFuelStats(enrich(MERCEDES))
  assert.equal(s.fillCount, 5)
  assert.equal(s.totalKm, 1476)                             // 180173 − 178697
  assert.equal(s.blendedEurPer100km, 17.65)                 // €260.58 / 1476 km
  assert.equal(s.costPerKm, 0.177)
  assert.equal(s.measuredAvgL100, 9.0)                      // distance-weighted, not mean of ratios
  assert.equal(s.blendedAvgL100, 9.0)                       // 133.35 L / 1476 km — partials count
  assert.equal(s.totalCost, 369.14)
  assert.equal(s.lastOdometer, 180173)
})

test('trend includes estimate points so charts are never empty mid-period', () => {
  const t = efficiencyTrend(enrich(MERCEDES))
  assert.deepEqual(t.map(p => p.value), [8.2, 2.5, 14.4, 9.6])
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

test('history starting with a partial: first full gets a proportional leg projection', () => {
  const e = enrich(
    [fill('2026-01-01', 1000, 20, 40, false), fill('2026-01-10', 1400, 40, 90, true)],
  )
  // The full tank can't be measured (unknown tank level at history start)…
  assert.equal(e[1].l_per_100km, null)
  // …but it has a leg, so it gets a clearly-flagged projection.
  assert.equal(e[1].is_estimate, true)
  assert.equal(e[1].est_l_per_100km, 10)        // 40 L / 400 km × 100
  assert.equal(e[1].est_eur_per_100km, 22.5)    // €90 / 400 km × 100
})

test('trailing partials after the last full tank get leg projections', () => {
  const e = enrich([
    fill('2026-01-01', 1000, 40, 80),
    fill('2026-02-01', 1500, 40, 80),           // measured: 8 L/100km
    fill('2026-02-15', 1700, 15, 30, false),    // trailing partial: 200 km leg
  ])
  assert.equal(e[2].is_estimate, true)
  assert.equal(e[2].est_l_per_100km, 7.5)       // 15 L / 200 km × 100
  assert.equal(e[2].est_eur_per_100km, 15)      // €30 / 200 km × 100
})

test('projections never affect distance or monthly stats', () => {
  const rows = [
    fill('2026-01-01', 1000, 40, 80),
    fill('2026-01-20', 1500, 15, 30, false),    // partial with projection
  ]
  const s = computeFuelStats(enrich(rows))
  assert.equal(s.totalKm, 500)                  // pure odometer math
  const m = monthlySpend(rows, { months: 1, today: new Date(2026, 0, 25) })
  assert.equal(m[0].total, 110)                 // real euros only, no projected values
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
