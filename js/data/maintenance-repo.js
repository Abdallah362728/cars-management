// Queries only — status computation lives in js/domain/schedule.js.

import { supabase } from './supabase-client.js'

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
