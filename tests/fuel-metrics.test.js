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

// The core fix: a fill owns the leg to the NEXT fill, not the one behind it.
test('distance is the leg to the next fill, not the previous one', () => {
  const e = enrich(MERCEDES)
  assert.equal(e[0].distance_km, 591)   // 03-04 → 03-27
  assert.equal(e[1].distance_km, 651)   // 03-27 → 05-30
  assert.equal(e[2].distance_km, 142)   // 05-30 → 06-13  (was wrongly 651 before)
  assert.equal(e[3].distance_km, 92)    // 06-13 → 06-22
  assert.equal(e[4].distance_km, null)  // newest fill: no next leg yet
})

test('full tanks are measured over their forward leg; newest fill is pending', () => {
  const e = enrich(MERCEDES)
  assert.equal(e[0].l_per_100km, 8.8)           // 52.19 L over the 591 km it powered
  assert.equal(e[0].eur_per_100km, 18.37)       // €108.56 over 591 km
  assert.equal(e[1].l_per_100km, 7.5)           // 48.64 L over 651 km
  assert.equal(e[1].eur_per_100km, 15.76)       // €102.58 over 651 km
  assert.equal(e[4].is_pending, true)           // fuel not used up yet
  assert.equal(e[4].l_per_100km, null)
})

test('partial fills project over their own forward leg — sane, not absurd', () => {
  const e = enrich(MERCEDES)
  for (const i of [2, 3]) {
    assert.equal(e[i].l_per_100km, null)
    assert.equal(e[i].is_estimate, true)
  }
  assert.equal(e[2].est_l_per_100km, 11.7)      // 16.59 L over its real 142 km leg
  assert.equal(e[2].est_eur_per_100km, 21.13)   // €30 over 142 km
  assert.equal(e[3].est_l_per_100km, 22.2)      // 20.46 L over 92 km
  assert.equal(e[3].est_eur_per_100km, 41.3)    // €38 over 92 km
})

test('blended stats count partials and stay on pure distance', () => {
  const s = computeFuelStats(enrich(MERCEDES))
  assert.equal(s.fillCount, 5)
  assert.equal(s.totalKm, 1476)                             // 180173 − 178697
  assert.equal(s.blendedAvgL100, 9.3)                       // 137.88 L / 1476 km
  assert.equal(s.blendedEurPer100km, 18.91)                 // €279.14 / 1476 km
  assert.equal(s.costPerKm, 0.189)
  assert.equal(s.measuredAvgL100, 8.1)                      // full tanks only: 100.83 L / 1242 km
  assert.equal(s.totalCost, 369.14)
  assert.equal(s.lastOdometer, 180173)
})

test('trend shifts back one fill; the newest (pending) fill drops off', () => {
  const t = efficiencyTrend(enrich(MERCEDES))
  assert.deepEqual(t.map(p => p.value), [8.8, 7.5, 11.7, 22.2])
  assert.deepEqual(t.map(p => p.isEstimate), [false, false, true, true])
})

// ── Edge-case matrix ──

test('empty input', () => {
  assert.deepEqual(enrich([]), [])
  const s = computeFuelStats([])
  assert.equal(s.fillCount, 0)
  assert.equal(s.totalKm, null)
  assert.equal(s.measuredAvgL100, null)
  assert.equal(s.blendedAvgL100, null)
})

test('single fill is pending — nothing consumed yet', () => {
  const e = enrich([fill('2026-01-01', 1000, 40, 80)])
  assert.equal(e[0].is_pending, true)
  assert.equal(e[0].l_per_100km, null)
  assert.equal(e[0].distance_km, null)
})

test('two full fills: the first is measured, the second is pending', () => {
  const e = enrich([fill('2026-01-01', 1000, 40, 80), fill('2026-02-01', 1500, 35, 70)])
  assert.equal(e[0].l_per_100km, 8)             // 40 L over its 500 km leg
  assert.equal(e[0].eur_per_100km, 16)
  assert.equal(e[1].is_pending, true)
  assert.equal(e[1].l_per_100km, null)
})

test('a mid-history partial projects over its forward leg; newest stays pending', () => {
  const e = enrich([
    fill('2026-01-01', 1000, 40, 80),
    fill('2026-01-20', 1500, 15, 30, false),
    fill('2026-02-01', 1600, 20, 40),
  ])
  assert.equal(e[0].l_per_100km, 8)             // 40 / 500
  assert.equal(e[1].is_estimate, true)
  assert.equal(e[1].est_l_per_100km, 15)        // 15 L over its 100 km leg
  assert.equal(e[1].est_eur_per_100km, 30)      // €30 over 100 km
  assert.equal(e[2].is_pending, true)
})

test('projections never affect distance or monthly stats', () => {
  const rows = [
    fill('2026-01-01', 1000, 40, 80),
    fill('2026-01-20', 1500, 15, 30, false),    // partial with a projection
    fill('2026-02-01', 1600, 20, 40),
  ]
  const s = computeFuelStats(enrich(rows))
  assert.equal(s.totalKm, 600)                  // 500 + 100, pure odometer
  const m = monthlySpend(rows, { months: 2, today: new Date(2026, 1, 25) })
  assert.equal(m[0].total, 110)                 // Jan: 80 + 30, real euros only
  assert.equal(m[1].total, 40)                  // Feb: 40
})

test('odometer going backwards flags the leg and never yields a value', () => {
  const e = enrich([
    fill('2026-01-01', 1000, 40, 80),
    fill('2026-02-01', 900, 35, 70),            // typo: odometer decreased
    fill('2026-03-01', 1400, 38, 76),
  ])
  assert.equal(e[0].odo_anomaly, true)          // next odometer 900 ≤ 1000
  assert.equal(e[0].distance_km, null)
  assert.equal(e[0].l_per_100km, null)
  assert.equal(e[1].distance_km, 500)           // 1400 − 900
  assert.equal(e[1].l_per_100km, 7)             // 35 / 500 × 100
  assert.equal(e[2].is_pending, true)
  const s = computeFuelStats(e)
  assert.equal(s.totalKm, 500)                  // anomalous leg excluded
})

test('numeric strings from the DB are coerced, never concatenated', () => {
  const e = enrich([
    { date: '2026-01-01', odometer_km: '1000', liters: '40', total_cost: '80', is_full_tank: true },
    { date: '2026-02-01', odometer_km: '1500', liters: '35.5', total_cost: '71', is_full_tank: true },
  ])
  assert.equal(e[0].l_per_100km, 8)             // 40 / 500 × 100
  const s = computeFuelStats(e)
  assert.equal(s.totalCost, 151)                // 80 + 71, not "8071"
})

test('rows are sorted by date even if stored out of order', () => {
  const e = enrich([
    fill('2026-02-01', 1500, 35, 70),
    fill('2026-01-01', 1000, 40, 80),
  ])
  assert.equal(e[0].date, '2026-01-01')
  assert.equal(e[0].l_per_100km, 8)             // 40 / 500 × 100
  assert.equal(e[1].is_pending, true)
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

test('blendedIncludesEstimates flags blended averages built from partial fills', () => {
  const withPartial = computeFuelStats(enrich(MERCEDES))
  assert.equal(withPartial.blendedIncludesEstimates, true)

  const allFull = computeFuelStats(enrich([
    fill('2026-01-01', 1000, 40, 80),
    fill('2026-02-01', 1500, 35, 70),
    fill('2026-03-01', 2000, 38, 76),
  ]))
  assert.equal(allFull.blendedIncludesEstimates, false)
})

test('daysSince', () => {
  assert.equal(daysSince('2026-06-28', new Date('2026-07-02T12:00:00Z')), 4)
  assert.equal(daysSince(null), null)
})
