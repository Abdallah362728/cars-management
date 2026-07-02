// Transitional facade: Supabase queries + delegation to js/domain/*.
// Phase 2 of the refactor splits this into js/data/*-repo.js; pages keep
// importing from here until then.

import { supabase } from './supabase-client.js'
import { esc, round, sum, daysBetween } from './domain/format.js'
import {
  normalizeFuelRows, enrichFuelLogs, computeFuelStats,
  monthlySpend, efficiencyTrend, daysSince,
} from './domain/fuel-metrics.js'
import { COST_TYPES, sortCostsDesc } from './domain/costs.js'
import { computeScheduleStatus } from './domain/schedule.js'

export { esc, computeScheduleStatus }

// ─── Cars ───────────────────────────────────────────────────────────────────

export async function getCars() {
  const { data, error } = await supabase
    .from('cars')
    .select('*')
    .order('status')        // active first
    .order('created_at')
  if (error) throw error
  return data || []
}

export async function updateCar(id, updates) {
  const { error } = await supabase.from('cars').update(updates).eq('id', id)
  if (error) throw error
}

// ─── Fuel Logs ──────────────────────────────────────────────────────────────

async function fetchFuelAsc(carId) {
  const { data, error } = await supabase
    .from('fuel_logs')
    .select('*')
    .eq('car_id', carId)
    .order('date', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  return data || []
}

export async function getFuelLogs(carId, { factorySpec = null } = {}) {
  const rows = await fetchFuelAsc(carId)
  return enrichFuelLogs(normalizeFuelRows(rows), { factorySpec }).reverse()   // newest first for display
}

export async function addFuelLog(carId, payload) {
  const { error } = await supabase.from('fuel_logs').insert({ car_id: carId, ...payload })
  if (error) throw error
}

export async function deleteFuelLog(id) {
  const { error } = await supabase.from('fuel_logs').delete().eq('id', id)
  if (error) throw error
}

// ─── Dashboard aggregate ────────────────────────────────────────────────────

export async function getDashboard(car) {
  const [fuelRaw, ...costData] = await Promise.all([
    fetchFuelAsc(car.id),
    supabase.from('maintenance_logs').select('cost').eq('car_id', car.id),
    supabase.from('supplies').select('cost').eq('car_id', car.id),
    supabase.from('insurance_records').select('cost').eq('car_id', car.id),
    supabase.from('registrations').select('cost').eq('car_id', car.id),
    supabase.from('other_costs').select('cost').eq('car_id', car.id),
  ])
  const [{ data: maint }, { data: suppl }, { data: ins }, { data: regs }, { data: other }] = costData

  const enriched = enrichFuelLogs(normalizeFuelRows(fuelRaw), {
    factorySpec: car.factory_fuel_spec,
  })
  const stats = computeFuelStats(enriched)

  const totalFuel = stats.totalCost
  const totalMaint = round(sum(maint, 'cost'))
  const totalSuppl = round(sum(suppl, 'cost'))
  const totalIns = round(sum(ins, 'cost'))
  const totalOther = round(sum(other, 'cost') + sum(regs, 'cost'))

  const thisMonthKey = new Date().toISOString().slice(0, 7)
  const thisMonthFuel = round(enriched
    .filter(f => String(f.date ?? '').startsWith(thisMonthKey))
    .reduce((s, f) => s + f.total_cost, 0))

  return {
    totalFuel, totalMaint, totalSuppl, totalIns, totalOther,
    totalCoo: round((Number(car.purchase_price) || 0) + totalFuel + totalMaint + totalSuppl + totalIns + totalOther),
    avgL100km: stats.measuredAvgL100,
    blendedEurPer100km: stats.blendedEurPer100km,
    costPerKm: stats.costPerKm,
    lastFuel: stats.lastFuel,
    lastOdometer: stats.lastOdometer,
    daysSinceFuel: daysSince(stats.lastDate),
    thisMonthFuel,
    monthly: monthlySpend(enriched),
    trend: efficiencyTrend(enriched),
    fuelCount: stats.fillCount,
    totalKm: stats.totalKm,
  }
}

// ─── Maintenance Schedule ───────────────────────────────────────────────────

export async function getSchedule(carId) {
  const { data, error } = await supabase
    .from('maintenance_schedules')
    .select('*')
    .eq('car_id', carId)
    .order('id')
  if (error) throw error
  return data || []
}

export async function updateScheduleItem(id, updates) {
  const { error } = await supabase.from('maintenance_schedules').update(updates).eq('id', id)
  if (error) throw error
}

export async function getMaintenanceLogs(carId) {
  const { data, error } = await supabase
    .from('maintenance_logs')
    .select('*')
    .eq('car_id', carId)
    .order('date', { ascending: false })
  if (error) throw error
  return data || []
}

// ─── Costs (multi-table) ────────────────────────────────────────────────────

export async function getCostsByType(carId, type) {
  const meta = COST_TYPES[type]
  if (!meta) return []
  const { data, error } = await supabase
    .from(meta.table)
    .select('*')
    .eq('car_id', carId)
    .order(meta.dateColumn, { ascending: false })   // per-table date column (insurance = start_date)
  if (error) throw error
  return (data || []).map(r => ({ ...r, _type: type }))
}

export async function getAllCosts(carId) {
  const results = await Promise.all(
    Object.keys(COST_TYPES).map(t => getCostsByType(carId, t))
  )
  return sortCostsDesc(results.flat())
}

// Total fuel spend for a car (for cost-of-ownership on the costs page).
export async function getFuelTotal(carId) {
  const { data, error } = await supabase
    .from('fuel_logs')
    .select('total_cost')
    .eq('car_id', carId)
  if (error) throw error
  return round(sum(data, 'total_cost'))
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

// ─── Insurance / Registration (deadline tracking) ───────────────────────────

export async function getDeadlines(carId) {
  const [{ data: ins }, { data: regs }] = await Promise.all([
    supabase.from('insurance_records').select('*').eq('car_id', carId).order('end_date', { ascending: false }),
    supabase.from('registrations').select('*').eq('car_id', carId).order('valid_until', { ascending: false }),
  ])

  const today = new Date().toISOString().slice(0, 10)
  const deadlines = []

  const latestIns = ins?.[0]
  if (latestIns?.end_date) {
    deadlines.push({ type: 'Insurance', date: latestIns.end_date, days: daysBetween(today, latestIns.end_date), provider: latestIns.provider })
  }

  const latestReg = regs?.[0]
  if (latestReg?.valid_until) {
    deadlines.push({ type: 'Registration', date: latestReg.valid_until, days: daysBetween(today, latestReg.valid_until), description: latestReg.description })
  }

  return deadlines
}
