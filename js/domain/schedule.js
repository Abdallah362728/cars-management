// Maintenance schedule status — pure function, `today` injectable for tests.

import { daysBetween, addMonths, todayStr } from './format.js'

export function computeScheduleStatus(item, currentOdometer, today = todayStr()) {
  if (!item.last_done_km && !item.last_done_date) {
    return { status: 'never_done', label: 'Never done', color: 'indigo', nextKm: null, nextDate: null, daysUntil: null, kmRemaining: null }
  }

  let worst = 'ok'
  let nextKm = null, nextDate = null, daysUntil = null, kmRemaining = null

  if (item.interval_km && item.last_done_km != null && currentOdometer != null) {
    nextKm = item.last_done_km + item.interval_km
    kmRemaining = nextKm - currentOdometer
    if (kmRemaining < 0) worst = 'overdue'
    else if (kmRemaining < 1500 && worst !== 'overdue') worst = 'due_soon'
  }

  if (item.interval_months && item.last_done_date) {
    const d = addMonths(item.last_done_date, item.interval_months)
    nextDate = d.toISOString().slice(0, 10)
    daysUntil = daysBetween(today, nextDate)
    if (daysUntil < 0 && worst !== 'overdue') worst = 'overdue'
    else if (daysUntil < 30 && worst === 'ok') worst = 'due_soon'
  }

  const labels = { overdue: 'Overdue', due_soon: 'Due soon', ok: 'OK' }
  const colors = { overdue: 'red', due_soon: 'amber', ok: 'green' }
  return { status: worst, label: labels[worst], color: colors[worst], nextKm, nextDate, daysUntil, kmRemaining }
}
