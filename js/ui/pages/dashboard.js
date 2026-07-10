import { getFuelLogsRaw, addFuelLog } from '../../data/fuel-repo.js'
import { getCostTotals } from '../../data/costs-repo.js'
import {
  normalizeFuelRows, enrichFuelLogs, computeFuelStats,
  monthlySpend, efficiencyTrend, daysSince,
} from '../../domain/fuel-metrics.js'
import { round, fmtMoney, fmtNum } from '../../domain/format.js'
import { isStale, route } from '../../core/router.js'
import { renderCarHeader } from '../components/car-header.js'
import { renderCarSchematic } from '../components/car-schematic.js'
import { createChartManager, applyChartDefaults, makeTrendChart, makeMonthlyChart } from '../components/charts.js'
import { openModal, closeModal, modalHandle, modalFooter, tankToggleField, setupTankToggle } from '../components/modal.js'
import { showToast } from '../components/toast.js'

const charts = createChartManager()

export function cleanup() {
  charts.destroyAll()
}

// Compose repos + domain into everything the dashboard shows.
async function loadDashboardData(car) {
  const [fuelRaw, costTotals] = await Promise.all([
    getFuelLogsRaw(car.id),
    getCostTotals(car.id),
  ])

  const enriched = enrichFuelLogs(normalizeFuelRows(fuelRaw))
  const stats = computeFuelStats(enriched)

  const costsTotal = Object.values(costTotals).reduce((s, v) => s + v, 0)
  const thisMonthKey = new Date().toISOString().slice(0, 7)

  return {
    stats,
    trend: efficiencyTrend(enriched),
    monthly: monthlySpend(enriched),
    thisMonthFuel: round(enriched
      .filter(f => String(f.date ?? '').startsWith(thisMonthKey))
      .reduce((s, f) => s + f.total_cost, 0)),
    totalCoo: round((Number(car.purchase_price) || 0) + stats.totalCost + costsTotal),
    daysSinceFuel: daysSince(stats.lastDate),
  }
}

export async function render(container, state, epoch) {
  cleanup()

  if (!state.activeCar) {
    container.innerHTML = `<div class="center-screen mute">No active car found.</div>`
    return
  }

  container.innerHTML = ''
  renderCarHeader(container, { title: 'Dashboard' })

  const grid = document.createElement('div')
  grid.innerHTML = `
    <div class="section"><div class="skeleton" style="height:210px"></div></div>
    <div class="section" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${Array(4).fill('<div class="skeleton" style="height:84px"></div>').join('')}
    </div>
    <div class="section"><div class="skeleton" style="height:170px"></div></div>
  `
  container.appendChild(grid)

  let data
  try {
    data = await loadDashboardData(state.activeCar)
  } catch (err) {
    if (!isStale(epoch)) showToast('Failed to load dashboard', 'error')
    return
  }
  if (isStale(epoch)) return

  const { stats } = data
  const spec = Number(state.activeCar.factory_fuel_spec) || null
  const avgL100 = stats.blendedAvgL100 ?? stats.measuredAvgL100
  const avgIsEstimate = avgL100 != null && avgL100 === stats.blendedAvgL100 && stats.blendedIncludesEstimates
  const overSpec = avgL100 != null && spec != null && avgL100 > spec + 1
  const vsFactory = (avgL100 != null && spec) ? round(avgL100 - spec, 1) : null
  const last = stats.lastFuel
  const lastVal = last ? (last.l_per_100km ?? last.est_l_per_100km) : null
  const hasEstimates = data.trend.some(t => t.isEstimate)

  grid.innerHTML = `
    <div class="section">
      <div class="card card--plate" style="padding:10px 8px 4px">
        ${renderCarSchematic({
          car: state.activeCar,
          avgL100,
          eur100: stats.blendedEurPer100km,
          totalKm: stats.totalKm,
          isEstimate: avgIsEstimate || (stats.measuredAvgL100 == null && avgL100 != null),
        })}
      </div>
    </div>

    <div class="section stat-grid">
      <div class="card stat">
        <p class="micro">Avg fuel use</p>
        <p class="stat-value num" style="${overSpec ? 'color:var(--danger)' : avgL100 != null ? 'color:var(--ok)' : ''}">${avgIsEstimate ? '~' : ''}${fmtNum(avgL100)} <span style="font-size:11px;color:var(--ink-mute);font-weight:400">L/100</span></p>
        <p class="stat-sub num">${vsFactory != null ? `${vsFactory > 0 ? '▲' : '▼'} ${Math.abs(vsFactory)} vs spec ${spec}` : (spec ? `spec ${spec}` : 'no factory spec')}</p>
      </div>
      <div class="card stat">
        <p class="micro">This month</p>
        <p class="stat-value num">${fmtMoney(data.thisMonthFuel, { decimals: 0 })}</p>
        <p class="stat-sub num">owned total ${fmtMoney(data.totalCoo, { decimals: 0 })}</p>
      </div>
      <div class="card stat">
        <p class="micro">Fuel cost / 100 km</p>
        <p class="stat-value num">${fmtMoney(stats.blendedEurPer100km)}</p>
        <p class="stat-sub num">${stats.totalKm ? `${fmtMoney(stats.costPerKm, { decimals: 3 })}/km · ${stats.totalKm.toLocaleString()} km` : 'no data yet'}</p>
      </div>
      <div class="card stat">
        <p class="micro">Last fill-up</p>
        <p class="stat-value num">${data.daysSinceFuel != null ? `${data.daysSinceFuel} <span style="font-size:11px;color:var(--ink-mute);font-weight:400">days ago</span>` : '—'}</p>
        <p class="stat-sub num">${stats.lastFuel ? stats.lastFuel.date : 'no fill-ups yet'}</p>
      </div>
    </div>

    <div class="section">
      <div class="card">
        <div class="row-between" style="margin-bottom:10px">
          <p class="micro" style="color:var(--ink)">Fuel efficiency trend</p>
          <span class="micro num">${data.trend.length} points</span>
        </div>
        <div style="position:relative;height:120px">
          <canvas id="trend-chart"></canvas>
        </div>
        <div class="row" style="margin-top:10px;flex-wrap:wrap;gap:6px 16px">
          ${spec ? `
            <span class="row" style="gap:6px">
              <svg width="18" height="6" viewBox="0 0 18 6"><line x1="0" y1="3" x2="18" y2="3" stroke="var(--danger)" stroke-width="1.2" stroke-dasharray="5,4"/></svg>
              <span class="micro" style="color:var(--danger)">factory ${spec} L/100km</span>
            </span>` : ''}
          ${hasEstimates ? `
            <span class="row" style="gap:6px">
              <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="var(--amber)" stroke-width="1.3" stroke-dasharray="2,1.5"/></svg>
              <span class="micro" style="color:var(--amber)">hollow = estimated (partial)</span>
            </span>` : ''}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="card">
        <div class="row-between" style="margin-bottom:10px">
          <p class="micro" style="color:var(--ink)">Monthly spend</p>
          <span class="micro num">6 months</span>
        </div>
        <div style="position:relative;height:110px">
          <canvas id="monthly-chart"></canvas>
        </div>
      </div>
    </div>

    ${stats.lastFuel ? `
    <div class="section">
      <div class="dim-line"><span class="micro">Latest fill-up</span></div>
      <div class="card row-between">
        <div>
          <p class="num" style="font-size:14px;font-weight:600">${fmtNum(stats.lastFuel.liters, 2)} L · ${fmtMoney(stats.lastFuel.total_cost)}</p>
          <p class="mute num" style="font-size:11px;margin-top:2px">${fmtMoney(stats.lastFuel.price_per_liter, { decimals: 3 })}/L · ${stats.lastFuel.date}</p>
        </div>
        <div style="text-align:right">
          ${last.is_pending
            ? `<p class="num" style="font-size:15px;font-weight:600;color:var(--ink-mute)">PENDING</p>
               <p class="micro">measured at next fill</p>`
            : lastVal != null
              ? `<p class="num" style="font-size:17px;font-weight:600;color:${last.is_estimate ? 'var(--amber)' : overSpec ? 'var(--danger)' : 'var(--ok)'}">${last.is_estimate ? '~' : ''}${fmtNum(lastVal)}</p>
                 <p class="micro">${last.is_estimate ? 'L/100km est' : 'L/100km'}</p>`
              : '<p class="mute">—</p>'}
        </div>
      </div>
    </div>` : `
    <div class="section empty-note">No fill-ups yet. Tap + to add your first one.</div>`}
  `

  applyChartDefaults()
  const trendCanvas = document.getElementById('trend-chart')
  if (trendCanvas && data.trend.length > 0) {
    charts.add(makeTrendChart(trendCanvas, data.trend, { factorySpec: spec }))
  }
  const monthCanvas = document.getElementById('monthly-chart')
  if (monthCanvas) {
    charts.add(makeMonthlyChart(monthCanvas, data.monthly))
  }

  window.__openAddModal = () => openAddFuelModal(state, route)
}

export function openAddFuelModal(state, onSaved) {
  const today = new Date().toISOString().slice(0, 10)
  openModal(`
    ${modalHandle()}
    <h2 class="modal-title">Add fill-up</h2>
    <form id="fuel-form" class="form-stack">
      <div>
        <label class="micro">Date</label>
        <input type="date" name="date" value="${today}" required autocomplete="off">
      </div>
      <div>
        <label class="micro">Odometer (km)</label>
        <input type="number" name="odometer_km" inputmode="decimal" placeholder="178917" required autocomplete="off" style="font-size:21px;font-weight:600">
      </div>
      <div class="form-row">
        <div>
          <label class="micro">Liters</label>
          <input type="number" name="liters" inputmode="decimal" step="0.01" placeholder="0.00" required autocomplete="off">
        </div>
        <div>
          <label class="micro">Total cost (€)</label>
          <input type="number" name="total_cost" inputmode="decimal" step="0.01" placeholder="0.00" required autocomplete="off">
        </div>
      </div>
      ${tankToggleField()}
      <div>
        <label class="micro">Notes (optional)</label>
        <input type="text" name="notes" placeholder="Highway fill-up" autocomplete="off">
      </div>
      ${modalFooter('Cancel', 'Save fill-up')}
    </form>
  `)

  setupTankToggle()

  document.getElementById('fuel-form').addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const btn = document.getElementById('modal-submit')
    btn.textContent = 'Saving…'
    btn.disabled = true

    const liters = parseFloat(fd.get('liters'))
    const cost = parseFloat(fd.get('total_cost'))
    try {
      await addFuelLog(state.activeCar.id, {
        date: fd.get('date'),
        odometer_km: parseFloat(fd.get('odometer_km')),
        liters,
        total_cost: cost,
        price_per_liter: liters > 0 ? cost / liters : null,
        is_full_tank: fd.get('is_full_tank') === 'on',
        notes: fd.get('notes') || null,
        currency: 'EUR',
      })
      closeModal()
      showToast('Fill-up saved')
      onSaved()
    } catch (err) {
      showToast(err.message, 'error')
      btn.textContent = 'Save fill-up'
      btn.disabled = false
    }
  })
}
