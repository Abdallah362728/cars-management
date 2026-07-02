// Queries only — no business logic (that lives in js/domain/).

import { supabase } from './supabase-client.js'

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
