import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeScheduleStatus } from '../js/domain/schedule.js'

const TODAY = '2026-07-02'

test('never done', () => {
  const s = computeScheduleStatus({ interval_km: 10000 }, 84000, TODAY)
  assert.equal(s.status, 'never_done')
})

test('km-based: overdue / due soon / ok boundaries', () => {
  const item = { interval_km: 10000, last_done_km: 80000 }
  assert.equal(computeScheduleStatus(item, 90001, TODAY).status, 'overdue')
  assert.equal(computeScheduleStatus(item, 89000, TODAY).status, 'due_soon')  // 1000 km left
  assert.equal(computeScheduleStatus(item, 85000, TODAY).status, 'ok')        // 5000 km left
  assert.equal(computeScheduleStatus(item, 85000, TODAY).kmRemaining, 5000)
})

test('date-based: overdue and due soon by month interval', () => {
  const overdue = computeScheduleStatus({ interval_months: 12, last_done_date: '2025-05-01' }, null, TODAY)
  assert.equal(overdue.status, 'overdue')
  const dueSoon = computeScheduleStatus({ interval_months: 12, last_done_date: '2025-07-20' }, null, TODAY)
  assert.equal(dueSoon.status, 'due_soon')       // due 2026-07-20, 18 days out
})

test('worst of km and date wins', () => {
  const item = { interval_km: 10000, last_done_km: 80000, interval_months: 12, last_done_date: '2026-06-01' }
  const s = computeScheduleStatus(item, 91000, TODAY)   // km overdue, date fine
  assert.equal(s.status, 'overdue')
})

test('coerces string numerics from Supabase', () => {
  const item = { interval_km: '10000', last_done_km: '80000' }
  const s = computeScheduleStatus(item, 95000, TODAY)
  assert.equal(s.status, 'overdue')
  assert.equal(s.kmRemaining, -5000)
})

test('insufficient data shows "Needs data" instead of a false OK', () => {
  const item = { interval_km: 40000, interval_months: null, last_done_date: '2026-01-01', last_done_km: null }
  const s = computeScheduleStatus(item, 90000, TODAY)
  assert.equal(s.status, 'never_done')
  assert.equal(s.label, 'Needs data')
})
