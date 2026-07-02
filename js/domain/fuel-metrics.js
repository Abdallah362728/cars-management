// Fuel consumption & cost metrics — pure functions, no DOM, no Supabase.
//
// Methodology (hybrid):
//  1. MEASURED L/100km & €/100km are only physically exact between two FULL
//     tanks. Partial fills roll their liters/cost into the open period; the
//     next full tank closes the period and carries the measured values.
//  2. BLENDED €/100km (computeFuelStats) = total spend ÷ total distance, so
//     partial fills always count toward cost statistics.
//  3. ESTIMATED values are attached to rows that can't get a measured value
//     (partials, first full tank after an unknown start), projected from a
//     rolling window of recent measured periods. They are flagged
//     `is_estimate` so the UI can render them as estimates, never as facts.

import { round, daysBetween, todayStr } from './format.js'

// Sort ascending by (date, id) and coerce numerics once at the boundary so
// downstream math never sees strings from Supabase `numeric` columns.
export function normalizeFuelRows(rows) {
  return (rows || [])
    .map(r => {
      const liters = Number(r.liters) || 0
      const totalCost = Number(r.total_cost) || 0
      const odoRaw = r.odometer_km == null ? NaN : Number(r.odometer_km)
      const pplRaw = r.price_per_liter == null ? NaN : Number(r.price_per_liter)
      return {
        ...r,
        liters,
        total_cost: totalCost,
        odometer_km: Number.isFinite(odoRaw) ? odoRaw : null,
        is_full_tank: r.is_full_tank !== false,
        price_per_liter: Number.isFinite(pplRaw) ? pplRaw
          : (liters > 0 ? round(totalCost / liters, 3) : null),
      }
    })
    .sort((a, b) =>
      String(a.date ?? '').localeCompare(String(b.date ?? ''))
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    )
}

// Input must come from normalizeFuelRows (ascending, numerics coerced).
export function enrichFuelLogs(rows, { estimateWindow = 3, factorySpec = null } = {}) {
  const periods = []            // closed measured periods: { closedAt, distKm, liters, cost }
  let baselineIdx = null        // index of the previous full-tank baseline
  let periodLiters = 0
  let periodCost = 0
  let prevOdoIdx = null         // previous row with a valid odometer (for leg distance)

  // ── Pass 1: legs, anomalies, measured full→full periods ──
  const out = rows.map((row, i) => {
    const prev = i > 0 ? rows[i - 1] : null
    const days = prev && prev.date && row.date ? daysBetween(prev.date, row.date) : null

    let distance = null
    let anomaly = false
    if (row.odometer_km != null && prevOdoIdx !== null) {
      const leg = row.odometer_km - rows[prevOdoIdx].odometer_km
      if (leg > 0) distance = leg
      else anomaly = true       // odometer went backwards (or repeated): typo or reset
    }

    // An anomalous or missing odometer poisons the open period — discard it.
    if (anomaly || row.odometer_km == null) {
      baselineIdx = null
      periodLiters = 0
      periodCost = 0
    }

    // Roll this fill into the open measurement period.
    periodLiters += row.liters
    periodCost += row.total_cost

    let l100 = null, eur100 = null, periodKm = null
    if (row.is_full_tank && baselineIdx !== null && row.odometer_km != null) {
      const dist = row.odometer_km - rows[baselineIdx].odometer_km
      if (dist > 0) {
        periodKm = dist
        l100 = round(periodLiters / dist * 100, 1)
        eur100 = round(periodCost / dist * 100, 2)
        periods.push({ closedAt: i, distKm: dist, liters: periodLiters, cost: periodCost })
      }
    }

    const isBaseline = row.is_full_tank && baselineIdx === null

    // A full tank with a trustworthy odometer closes the period and becomes
    // the next baseline.
    if (row.is_full_tank && row.odometer_km != null) {
      baselineIdx = i
      periodLiters = 0
      periodCost = 0
    }
    if (row.odometer_km != null) prevOdoIdx = i

    return {
      ...row,
      distance_km: distance,
      days_since_last: days,
      l_per_100km: l100,
      eur_per_100km: eur100,
      eur_per_km: eur100 != null ? round(eur100 / 100, 3) : null,
      period_km: periodKm,
      est_l_per_100km: null,
      est_eur_per_100km: null,
      is_estimate: false,
      is_baseline: isBaseline,
      odo_anomaly: anomaly,
      daily_km: (distance && days && days > 0) ? round(distance / days, 1) : null,
      daily_cost: (days && days > 0) ? round(row.total_cost / days, 2) : null,
    }
  })

  // ── Pass 2: estimates for rows without a measured value ──
  const overallAvg = weightedL100(periods)
  for (let i = 0; i < out.length; i++) {
    const row = out[i]
    if (row.l_per_100km != null) continue
    if (row.distance_km == null || row.distance_km <= 0) continue

    const before = periods.filter(p => p.closedAt < i).slice(-estimateWindow)
    const basis = weightedL100(before) ?? overallAvg
      ?? (Number.isFinite(Number(factorySpec)) && Number(factorySpec) > 0 ? Number(factorySpec) : null)
    if (basis == null) continue

    row.est_l_per_100km = round(basis, 1)
    row.est_eur_per_100km = row.price_per_liter != null
      ? round(basis * row.price_per_liter, 2) : null
    row.is_estimate = true
  }

  return out
}

// Distance-weighted average consumption over measured periods:
// Σ liters / Σ km × 100 (NOT a mean of per-period ratios).
function weightedL100(periods) {
  const km = periods.reduce((s, p) => s + p.distKm, 0)
  const liters = periods.reduce((s, p) => s + p.liters, 0)
  return km > 0 ? liters / km * 100 : null
}

export function computeFuelStats(enriched) {
  const rows = enriched || []
  const fillCount = rows.length
  const totalLiters = round(rows.reduce((s, r) => s + r.liters, 0), 2)
  const totalCost = round(rows.reduce((s, r) => s + r.total_cost, 0), 2)

  // Distance & cost over tracked legs only (anomalous legs excluded).
  const legs = rows.filter(r => r.distance_km != null && r.distance_km > 0)
  const totalKm = legs.reduce((s, r) => s + r.distance_km, 0)
  const costOverLegs = legs.reduce((s, r) => s + r.total_cost, 0)

  // Measured average: distance-weighted over closed full→full periods.
  const measured = rows.filter(r => r.l_per_100km != null && r.period_km > 0)
  const periodKm = measured.reduce((s, r) => s + r.period_km, 0)
  const periodLiters = measured.reduce((s, r) => s + r.l_per_100km * r.period_km / 100, 0)
  const measuredAvgL100 = periodKm > 0 ? round(periodLiters / periodKm * 100, 1) : null

  // Blended cost: every euro after the tracking start counts, partials included.
  const blendedEurPer100km = (totalKm > 0 && costOverLegs > 0)
    ? round(costOverLegs / totalKm * 100, 2) : null

  const last = rows.length ? rows[rows.length - 1] : null
  const first = rows.length ? rows[0] : null

  return {
    fillCount,
    totalLiters,
    totalCost,
    totalKm: totalKm > 0 ? totalKm : null,
    measuredAvgL100,
    blendedEurPer100km,
    costPerKm: blendedEurPer100km != null ? round(blendedEurPer100km / 100, 3) : null,
    lastFuel: last,
    lastOdometer: last?.odometer_km ?? null,
    firstDate: first?.date ?? null,
    lastDate: last?.date ?? null,
  }
}

// Spend per calendar month over the trailing `months` months (oldest first).
export function monthlySpend(rows, { months = 6, today = new Date() } = {}) {
  const y = today.getFullYear()
  const m = today.getMonth()
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(y, m - (months - 1 - i), 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('default', { month: 'short' })
    const total = round((rows || [])
      .filter(r => String(r.date ?? '').startsWith(key))
      .reduce((s, r) => s + (Number(r.total_cost) || 0), 0))
    return { key, label, total }
  })
}

// Chart series: measured points plus flagged estimates, so the trend is
// never empty just because the latest fills were partial.
export function efficiencyTrend(enriched, { limit = 10 } = {}) {
  return (enriched || [])
    .filter(r => r.l_per_100km != null || r.est_l_per_100km != null)
    .slice(-limit)
    .map(r => ({
      label: String(r.date ?? '').slice(5),
      value: r.l_per_100km ?? r.est_l_per_100km,
      isEstimate: r.l_per_100km == null,
    }))
}

export function daysSince(dateStr, today = new Date()) {
  if (!dateStr) return null
  return daysBetween(dateStr, todayStr(today))
}
