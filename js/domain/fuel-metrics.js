// Fuel consumption & cost metrics — pure functions, no DOM, no Supabase.
//
// Attribution model (FORWARD): the fuel you add at a fill powers the distance
// you drive UNTIL your next fill. So a fill's consumption is its own liters
// divided by the leg to the *next* fill — never the leg since the previous
// one. (Filling 16 L that only has to cover the next 142 km reads ~11 L/100km,
// not the nonsensical 2.5 you'd get by crediting it with the 651 km that the
// PREVIOUS tank actually powered.)
//
//  - The most recent fill is "pending": its fuel hasn't been used up yet, so
//    it has no number until you fill again.
//  - Full tanks give a "measured" figure (a whole tank over its leg); partial
//    top-ups give a rougher, flagged "estimate".
//  - Distance / monthly-spend stats are pure odometer & euro math — projected
//    values never feed them.

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
export function enrichFuelLogs(rows) {
  const n = rows.length

  return rows.map((row, i) => {
    const prev = i > 0 ? rows[i - 1] : null
    const next = i < n - 1 ? rows[i + 1] : null
    const daysSinceLast = prev && prev.date && row.date ? daysBetween(prev.date, row.date) : null

    // Forward leg: distance this fill's fuel powers, up to the next fill.
    let distance = null
    let odoAnomaly = false
    if (row.odometer_km != null && next && next.odometer_km != null) {
      const leg = next.odometer_km - row.odometer_km
      if (leg > 0) distance = leg
      else odoAnomaly = true          // next odometer not greater: typo or reset
    }
    const daysSpan = (next && next.date && row.date) ? daysBetween(row.date, next.date) : null

    // The newest fill has no next leg yet — its fuel is still in the tank.
    const isPending = next == null && row.odometer_km != null

    let l100 = null, eur100 = null, estL100 = null, estEur100 = null, isEstimate = false
    if (distance != null) {
      if (row.is_full_tank) {
        if (row.liters > 0) l100 = round(row.liters / distance * 100, 1)
        if (row.total_cost > 0) eur100 = round(row.total_cost / distance * 100, 2)
      } else {
        // Partial top-up: liters added don't equal a tank's worth, so this is
        // a projection, not a measurement.
        if (row.liters > 0) estL100 = round(row.liters / distance * 100, 1)
        if (row.total_cost > 0) estEur100 = round(row.total_cost / distance * 100, 2)
        isEstimate = estL100 != null || estEur100 != null
      }
    }

    return {
      ...row,
      distance_km: distance,
      days_since_last: daysSinceLast,
      days_span: daysSpan,
      l_per_100km: l100,
      eur_per_100km: eur100,
      eur_per_km: eur100 != null ? round(eur100 / 100, 3) : null,
      est_l_per_100km: estL100,
      est_eur_per_100km: estEur100,
      is_estimate: isEstimate,
      is_pending: isPending,
      odo_anomaly: odoAnomaly,
      daily_km: (distance && daysSpan && daysSpan > 0) ? round(distance / daysSpan, 1) : null,
      daily_cost: (daysSpan && daysSpan > 0) ? round(row.total_cost / daysSpan, 2) : null,
    }
  })
}

export function computeFuelStats(enriched) {
  const rows = enriched || []
  const fillCount = rows.length
  const totalLiters = round(rows.reduce((s, r) => s + r.liters, 0), 2)
  const totalCost = round(rows.reduce((s, r) => s + r.total_cost, 0), 2)

  // Forward legs — each fill's distance to the next. Their sum is the total
  // distance driven, and it stays pure odometer math (no projections).
  const withLeg = rows.filter(r => r.distance_km != null && r.distance_km > 0)
  const totalKm = withLeg.reduce((s, r) => s + r.distance_km, 0)
  const litersOverLegs = withLeg.reduce((s, r) => s + r.liters, 0)
  const costOverLegs = withLeg.reduce((s, r) => s + r.total_cost, 0)

  // Measured average: full tanks that have a forward leg.
  const full = withLeg.filter(r => r.is_full_tank)
  const fullKm = full.reduce((s, r) => s + r.distance_km, 0)
  const fullLiters = full.reduce((s, r) => s + r.liters, 0)
  const measuredAvgL100 = fullKm > 0 ? round(fullLiters / fullKm * 100, 1) : null

  // Blended average: every fill that has a forward leg — partials included.
  const blendedAvgL100 = (totalKm > 0 && litersOverLegs > 0)
    ? round(litersOverLegs / totalKm * 100, 1) : null
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
    blendedAvgL100,
    blendedIncludesEstimates: withLeg.some(r => !r.is_full_tank),
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

// Chart series: measured points plus flagged estimates. The newest (pending)
// fill has no value yet, so it drops off the end of the trend.
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
