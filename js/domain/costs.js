// Cost bookkeeping helpers — pure functions, no DOM, no Supabase.

import { round } from './format.js'

// Each cost type lives in its own table with its own date column.
// insurance_records has no `date` — a policy has a start/end period.
export const COST_TYPES = {
  maintenance:  { table: 'maintenance_logs',  dateColumn: 'date' },
  supplies:     { table: 'supplies',          dateColumn: 'date' },
  insurance:    { table: 'insurance_records', dateColumn: 'start_date' },
  registration: { table: 'registrations',     dateColumn: 'date' },
  other:        { table: 'other_costs',       dateColumn: 'date' },
}

// Uniform display/sort date for a cost row from any table.
export function costDate(row) {
  return row.date ?? row.start_date ?? String(row.created_at ?? '').slice(0, 10)
}

// Newest first, regardless of which table the row came from.
export function sortCostsDesc(rows) {
  return [...(rows || [])].sort((a, b) => costDate(b).localeCompare(costDate(a)))
}

export function sumCosts(rows) {
  return round((rows || []).reduce((s, r) => s + (Number(r.cost) || 0), 0))
}

// Group rows (any type) by YYYY-MM, newest month first, preserving row order.
export function groupCostsByMonth(rows) {
  const groups = new Map()
  for (const row of rows || []) {
    const key = costDate(row).slice(0, 7)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => ({ key, items, total: sumCosts(items) }))
}

// The real total: purchase price + fuel + every recorded cost.
export function totalCostOfOwnership({ purchasePrice = 0, fuelTotal = 0, costsTotal = 0 } = {}) {
  return round((Number(purchasePrice) || 0) + (Number(fuelTotal) || 0) + (Number(costsTotal) || 0))
}
