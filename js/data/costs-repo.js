// Queries only — table/date-column mapping comes from js/domain/costs.js.

import { supabase } from './supabase-client.js'
import { COST_TYPES, sortCostsDesc } from '../domain/costs.js'

export async function getCostsByType(carId, type) {
  const meta = COST_TYPES[type]
  if (!meta) return []
  const { data, error } = await supabase
    .from(meta.table)
    .select('*')
    .eq('car_id', carId)
    .order(meta.dateColumn, { ascending: false })   // insurance = start_date
  if (error) throw error
  return (data || []).map(r => ({ ...r, _type: type }))
}

export async function getAllCosts(carId) {
  const results = await Promise.all(
    Object.keys(COST_TYPES).map(t => getCostsByType(carId, t))
  )
  return sortCostsDesc(results.flat())
}

// Per-category totals in one round of parallel queries.
export async function getCostTotals(carId) {
  const totals = {}
  await Promise.all(Object.entries(COST_TYPES).map(async ([type, meta]) => {
    const { data, error } = await supabase
      .from(meta.table)
      .select('cost')
      .eq('car_id', carId)
    if (error) throw error
    totals[type] = (data || []).reduce((s, r) => s + (Number(r.cost) || 0), 0)
  }))
  return totals
}

export async function addCost(type, carId, payload) {
  const meta = COST_TYPES[type]
  if (!meta) throw new Error(`Unknown cost type: ${type}`)
  const { error } = await supabase.from(meta.table).insert({ car_id: carId, ...payload })
  if (error) throw error
}

export async function deleteCost(type, id) {
  const meta = COST_TYPES[type]
  if (!meta) throw new Error(`Unknown cost type: ${type}`)
  const { error } = await supabase.from(meta.table).delete().eq('id', id)
  if (error) throw error
}
