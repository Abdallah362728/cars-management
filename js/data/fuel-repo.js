// Queries only — enrichment happens in js/domain/fuel-metrics.js.

import { supabase } from './supabase-client.js'

// Raw rows ascending by (date, id) — the order the domain layer expects.
export async function getFuelLogsRaw(carId) {
  const { data, error } = await supabase
    .from('fuel_logs')
    .select('*')
    .eq('car_id', carId)
    .order('date', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  return data || []
}

export async function addFuelLog(carId, payload) {
  const { error } = await supabase.from('fuel_logs').insert({ car_id: carId, ...payload })
  if (error) throw error
}

export async function deleteFuelLog(id) {
  const { error } = await supabase.from('fuel_logs').delete().eq('id', id)
  if (error) throw error
}

// Total fuel spend (for cost-of-ownership on the costs page).
export async function getFuelTotal(carId) {
  const { data, error } = await supabase
    .from('fuel_logs')
    .select('total_cost')
    .eq('car_id', carId)
  if (error) throw error
  return (data || []).reduce((s, r) => s + (Number(r.total_cost) || 0), 0)
}
