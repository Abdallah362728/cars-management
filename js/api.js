import { supabase } from './supabase-client.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

function sum(arr, key) {
  return (arr || []).reduce((s, r) => s + (Number(r[key]) || 0), 0)
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000)
}

function round(n, decimals = 2) {
  return Math.round(n * 10 ** decimals) / 10 ** decimals
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d
}

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

export async function getFuelLogs(carId) {
  const { data, error } = await supabase
    .from('fuel_logs')
    .select('*')
    .eq('car_id', carId)
    .order('date', { ascending: true })
    .order('id',   { ascending: true })
  if (error) throw error
  if (!data || data.length === 0) return []

  // Compute derived metrics from raw values (no stored computed columns)
  const enriched = data.map((row, i) => {
    const prev     = i > 0 ? data[i - 1] : null
    const distance = prev ? row.odometer_km - prev.odometer_km : null
    const days     = prev ? daysBetween(prev.date, row.date) : null
    const l100     = (distance && distance > 0)
      ? round(row.liters / distance * 100, 1) : null
    const eurKm    = (distance && distance > 0)
      ? round(row.total_cost / distance, 3) : null
    const ppl      = row.price_per_liter ?? round(row.total_cost / row.liters, 3)

    return {
      ...row,
      price_per_liter:  ppl,
      distance_km:      distance,
      days_since_last:  days,
      l_per_100km:      l100,
      eur_per_km:       eurKm,
      daily_km:         (distance && days && days > 0) ? round(distance / days, 1) : null,
      daily_cost:       (days && days > 0) ? round(row.total_cost / days, 2) : null,
    }
  })

  return enriched.reverse()   // newest first for display
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
  // Fetch fuel in ascending order for metric computation
  const { data: fuel } = await supabase
    .from('fuel_logs')
    .select('*')
    .eq('car_id', car.id)
    .order('date', { ascending: true })
    .order('id',   { ascending: true })

  const [
    { data: maint },
    { data: suppl },
    { data: ins   },
    { data: regs  },
    { data: other },
  ] = await Promise.all([
    supabase.from('maintenance_logs').select('cost').eq('car_id', car.id),
    supabase.from('supplies').select('cost').eq('car_id', car.id),
    supabase.from('insurance_records').select('cost').eq('car_id', car.id),
    supabase.from('registrations').select('cost').eq('car_id', car.id),
    supabase.from('other_costs').select('cost').eq('car_id', car.id),
  ])

  const totalFuel  = round(sum(fuel,  'total_cost'))
  const totalMaint = round(sum(maint, 'cost'))
  const totalSuppl = round(sum(suppl, 'cost'))
  const totalIns   = round(sum(ins,   'cost'))
  const totalOther = round(sum(other, 'cost') + sum(regs, 'cost'))

  // Enrich fuel with L/100km
  const enriched = (fuel || []).map((row, i, arr) => {
    const prev     = arr[i - 1]
    const distance = prev ? row.odometer_km - prev.odometer_km : null
    const l100     = (distance && distance > 0)
      ? round(row.liters / distance * 100, 1) : null
    return { ...row, l_per_100km: l100, distance_km: distance }
  })

  const efficiencies   = enriched.filter(f => f.l_per_100km !== null).map(f => f.l_per_100km)
  const avgL100km      = efficiencies.length
    ? round(efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length, 1) : null

  const lastFuel       = fuel?.[fuel.length - 1] ?? null
  const daysSinceFuel  = lastFuel ? daysBetween(lastFuel.date, new Date().toISOString().slice(0, 10)) : null
  const lastOdometer   = lastFuel?.odometer_km ?? null

  // Cost per km (fuel only, over total distance driven)
  const firstFuel      = fuel?.[0] ?? null
  const totalKm        = (lastFuel && firstFuel && lastFuel !== firstFuel)
    ? lastFuel.odometer_km - firstFuel.odometer_km : null
  const costPerKm      = (totalKm && totalKm > 0) ? round(totalFuel / totalKm, 3) : null

  // This month spend
  const thisMonthKey   = new Date().toISOString().slice(0, 7)
  const thisMonthFuel  = round((fuel || [])
    .filter(f => f.date.startsWith(thisMonthKey))
    .reduce((s, f) => s + f.total_cost, 0))

  // Monthly bar chart data (last 6 months)
  const monthly = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (5 - i))
    const key   = d.toISOString().slice(0, 7)
    const label = d.toLocaleString('default', { month: 'short' })
    const total = round((fuel || []).filter(f => f.date.startsWith(key)).reduce((s, f) => s + f.total_cost, 0))
    return { label, total }
  })

  // Trend chart (last 10 non-null efficiency points)
  const trend = enriched
    .filter(f => f.l_per_100km !== null)
    .slice(-10)
    .map(f => ({ label: f.date.slice(5), value: f.l_per_100km }))

  return {
    totalFuel, totalMaint, totalSuppl, totalIns, totalOther,
    totalCoo: round((car.purchase_price || 0) + totalFuel + totalMaint + totalSuppl + totalIns + totalOther),
    avgL100km, lastFuel, daysSinceFuel, lastOdometer, costPerKm,
    thisMonthFuel, monthly, trend,
    fuelCount: fuel?.length ?? 0,
    totalKm,
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

export function computeScheduleStatus(item, currentOdometer) {
  if (!item.last_done_km && !item.last_done_date) {
    return { status: 'never_done', label: 'Never done', color: 'indigo', nextKm: null, nextDate: null, daysUntil: null, kmRemaining: null }
  }

  let worst = 'ok'
  let nextKm = null, nextDate = null, daysUntil = null, kmRemaining = null

  if (item.interval_km && item.last_done_km != null) {
    nextKm      = item.last_done_km + item.interval_km
    kmRemaining = nextKm - (currentOdometer || 0)
    if (kmRemaining < 0)    worst = 'overdue'
    else if (kmRemaining < 1500 && worst !== 'overdue') worst = 'due_soon'
  }

  if (item.interval_months && item.last_done_date) {
    const d  = addMonths(item.last_done_date, item.interval_months)
    nextDate = d.toISOString().slice(0, 10)
    daysUntil = daysBetween(new Date().toISOString().slice(0, 10), nextDate)
    if (daysUntil < 0 && worst !== 'overdue')               worst = 'overdue'
    else if (daysUntil < 30 && worst === 'ok')              worst = 'due_soon'
  }

  const labels = { overdue: 'Overdue', due_soon: 'Due soon', ok: 'OK' }
  const colors = { overdue: 'red',     due_soon: 'amber',    ok: 'green' }
  return { status: worst, label: labels[worst], color: colors[worst], nextKm, nextDate, daysUntil, kmRemaining }
}

// ─── Costs (multi-table) ────────────────────────────────────────────────────

const COST_TABLES = {
  maintenance:  'maintenance_logs',
  supplies:     'supplies',
  insurance:    'insurance_records',
  registration: 'registrations',
  other:        'other_costs',
}

export async function getCostsByType(carId, type) {
  const table = COST_TABLES[type]
  if (!table) return []
  const { data } = await supabase
    .from(table)
    .select('*')
    .eq('car_id', carId)
    .order('date', { ascending: false })
  return (data || []).map(r => ({ ...r, _type: type }))
}

export async function getAllCosts(carId) {
  const results = await Promise.all(
    Object.keys(COST_TABLES).map(t => getCostsByType(carId, t))
  )
  return results.flat().sort((a, b) => b.date.localeCompare(a.date))
}

export async function addCost(type, carId, payload) {
  const table = COST_TABLES[type]
  if (!table) throw new Error(`Unknown cost type: ${type}`)
  const { error } = await supabase.from(table).insert({ car_id: carId, ...payload })
  if (error) throw error
}

export async function deleteCost(type, id) {
  const table = COST_TABLES[type]
  if (!table) throw new Error(`Unknown cost type: ${type}`)
  const { error } = await supabase.from(table).delete().eq('id', id)
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

  const latest_ins = ins?.[0]
  if (latest_ins?.end_date) {
    const days = daysBetween(today, latest_ins.end_date)
    deadlines.push({ type: 'Insurance', date: latest_ins.end_date, days, provider: latest_ins.provider })
  }

  const latest_reg = regs?.[0]
  if (latest_reg?.valid_until) {
    const days = daysBetween(today, latest_reg.valid_until)
    deadlines.push({ type: 'Registration', date: latest_reg.valid_until, days, description: latest_reg.description })
  }

  return deadlines
}
