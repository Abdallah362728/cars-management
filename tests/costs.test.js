import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COST_TYPES, costDate, sortCostsDesc, sumCosts,
  groupCostsByMonth, totalCostOfOwnership,
} from '../js/domain/costs.js'

test('every cost type declares its table and date column', () => {
  assert.equal(COST_TYPES.insurance.dateColumn, 'start_date')
  for (const meta of Object.values(COST_TYPES)) {
    assert.ok(meta.table)
    assert.ok(meta.dateColumn)
  }
})

test('insurance rows (start_date, no date) sort correctly among others', () => {
  const rows = [
    { _type: 'maintenance', date: '2026-01-10', cost: 100 },
    { _type: 'insurance', start_date: '2026-03-01', cost: 400 },   // regression: used to crash the sort
    { _type: 'supplies', date: '2026-02-05', cost: 20 },
  ]
  const sorted = sortCostsDesc(rows)
  assert.deepEqual(sorted.map(costDate), ['2026-03-01', '2026-02-05', '2026-01-10'])
})

test('groupCostsByMonth groups mixed tables by month, newest first', () => {
  const groups = groupCostsByMonth([
    { date: '2026-01-10', cost: 100 },
    { start_date: '2026-01-25', cost: 400 },
    { date: '2026-03-05', cost: '25.50' },
  ])
  assert.deepEqual(groups.map(g => g.key), ['2026-03', '2026-01'])
  assert.equal(groups[0].total, 25.5)            // string cost coerced
  assert.equal(groups[1].total, 500)
})

test('total cost of ownership includes fuel', () => {
  assert.equal(totalCostOfOwnership({ purchasePrice: 300, fuelTotal: 369.14, costsTotal: 250 }), 919.14)
  assert.equal(totalCostOfOwnership({}), 0)
})

test('sumCosts is null- and string-safe', () => {
  assert.equal(sumCosts([{ cost: '10.5' }, { cost: null }, { cost: 4.5 }]), 15)
  assert.equal(sumCosts(null), 0)
})
