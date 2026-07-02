import { getFuelLogsRaw, addFuelLog } from '../../data/fuel-repo.js'
import { getCostTotals } from '../../data/costs-repo.js'
import {
  normalizeFuelRows, enrichFuelLogs, computeFuelStats,
  monthlySpend, efficiencyTrend, daysSince,
} from '../../domain/fuel-metrics.js'
import { round, fmtMoney, fmtNum } from '../../domain/format.js'
import { isStale, route } from '../../core/router.js'
import { renderCarHeader } from '../components/car-header.js'
import { createChartManager } from '../components/charts.js'
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
    container.innerHTML = `<div class="flex items-center justify-center p-8 text-slate-500 text-sm" style="min-height:60dvh">No active car found.</div>`
    return
  }

  container.innerHTML = ''
  renderCarHeader(container, {
    subtitle: `${state.activeCar.year} · ${state.activeCar.operating_country || ''}`,
  })

  const grid = document.createElement('div')
  grid.innerHTML = `
    <div class="px-4 grid grid-cols-2 gap-3 mb-3">
      ${Array(4).fill('<div class="skeleton h-24 rounded-2xl"></div>').join('')}
    </div>
    <div class="px-4 mb-3"><div class="skeleton h-44 rounded-2xl"></div></div>
    <div class="px-4 mb-3"><div class="skeleton h-36 rounded-2xl"></div></div>
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

  grid.innerHTML = ''

  const { stats } = data
  const spec = Number(state.activeCar.factory_fuel_spec) || null
  const avgL100 = stats.blendedAvgL100 ?? stats.measuredAvgL100
  const fuelColor = avgL100 == null ? 'text-slate-400'
    : avgL100 > (spec ?? 999) + 1 ? 'text-red-400' : 'text-green-400'
  const vsFactory = (avgL100 != null && spec) ? round(avgL100 - spec, 1) : null

  grid.innerHTML += `
    <div class="px-4 grid grid-cols-2 gap-3 mb-3">
      <div class="card">
        <p class="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Avg Fuel Use</p>
        <div class="flex items-baseline gap-1 mb-1">
          <span class="${fuelColor} text-2xl font-bold">${fmtNum(avgL100)}</span>
          <span class="text-slate-500 text-xs">L/100km</span>
        </div>
        ${vsFactory != null
          ? `<span class="pill ${vsFactory > 0 ? 'pill-red' : 'pill-green'}">${vsFactory > 0 ? '↑' : '↓'} ${Math.abs(vsFactory)} vs factory</span>`
          : `<span class="text-slate-600 text-xs">Factory: ${spec ?? '—'}</span>`}
      </div>
      <div class="card">
        <p class="text-slate-500 text-[10px] uppercase tracking-wider mb-1">This Month</p>
        <div class="flex items-baseline gap-1 mb-1">
          <span class="text-white text-2xl font-bold">${fmtMoney(data.thisMonthFuel, { decimals: 0 })}</span>
        </div>
        <span class="text-slate-500 text-xs">Total owned: ${fmtMoney(data.totalCoo, { decimals: 0 })}</span>
      </div>
      <div class="card">
        <p class="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Fuel Cost / 100km</p>
        <div class="flex items-baseline gap-1 mb-1">
          <span class="text-white text-2xl font-bold">${fmtMoney(stats.blendedEurPer100km)}</span>
        </div>
        <span class="text-slate-500 text-xs">${stats.totalKm ? `${fmtMoney(stats.costPerKm, { decimals: 3 })}/km · ${stats.totalKm.toLocaleString()} km` : 'No data yet'}</span>
      </div>
      <div class="card">
        <p class="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Last Fill-up</p>
        <div class="flex items-baseline gap-1 mb-1">
          ${data.daysSinceFuel != null
            ? `<span class="text-white text-2xl font-bold">${data.daysSinceFuel}</span><span class="text-slate-500 text-xs">days ago</span>`
            : `<span class="text-slate-400 text-xl font-bold">—</span>`}
        </div>
        <span class="text-slate-500 text-xs">${stats.lastFuel ? stats.lastFuel.date : 'No fill-ups yet'}</span>
      </div>
    </div>
  `

  const hasEstimates = data.trend.some(t => t.isEstimate)
  grid.innerHTML += `
    <div class="px-4 mb-3">
      <div class="card">
        <div class="flex justify-between items-center mb-3">
          <p class="text-white text-sm font-bold">Fuel Efficiency</p>
          <span class="text-slate-500 text-[10px] bg-slate-900 px-2.5 py-1 rounded-full">last ${data.trend.length} fill-ups</span>
        </div>
        <div style="position:relative;height:110px">
          <canvas id="trend-chart"></canvas>
        </div>
        <div class="flex items-center gap-3 mt-2 flex-wrap">
          ${spec ? `
            <span class="flex items-center gap-1.5">
              <svg width="18" height="6" viewBox="0 0 18 6"><line x1="0" y1="3" x2="18" y2="3" stroke="rgba(248,113,113,0.7)" stroke-width="1.5" stroke-dasharray="5,4"/></svg>
              <span class="text-red-400 text-[10px]">Factory: ${spec} L/100km</span>
            </span>` : ''}
          ${hasEstimates ? `
            <span class="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="#fbbf24" stroke-width="1.5" stroke-dasharray="2,1.5"/></svg>
              <span class="text-amber-400 text-[10px]">Hollow = estimated (partial fill)</span>
            </span>` : ''}
        </div>
      </div>
    </div>
  `

  grid.innerHTML += `
    <div class="px-4 mb-3">
      <div class="card">
        <div class="flex justify-between items-center mb-3">
          <p class="text-white text-sm font-bold">Monthly Spend</p>
          <span class="text-slate-500 text-[10px] bg-slate-900 px-2.5 py-1 rounded-full">6 months</span>
        </div>
        <div style="position:relative;height:100px">
          <canvas id="monthly-chart"></canvas>
        </div>
      </div>
    </div>
  `

  if (stats.lastFuel) {
    const last = stats.lastFuel
    const lastPoint = data.trend[data.trend.length - 1]
    grid.innerHTML += `
      <div class="px-4 mb-4">
        <span class="section-label">Latest Fill-up</span>
        <div class="card flex items-center gap-4">
          <div class="w-10 h-10 bg-blue-500/10 rounded-2xl flex items-center justify-center flex-shrink-0 border border-blue-500/15">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round">
              <path d="M3 22V9l5-7h8l5 7v13H3z"/><path d="M3 9h18"/><path d="M9 22V12h6v10"/>
            </svg>
          </div>
          <div class="flex-1">
            <p class="text-white font-semibold text-sm">${fmtNum(last.liters, 2)} L &nbsp;·&nbsp; ${fmtMoney(last.total_cost)}</p>
            <p class="text-slate-500 text-xs">${fmtMoney(last.price_per_liter, { decimals: 3 })}/L &nbsp;·&nbsp; ${last.date}</p>
          </div>
          <div class="text-right">
            ${lastPoint
              ? `<p class="${fuelColor} font-bold text-lg">${lastPoint.isEstimate ? '~' : ''}${fmtNum(lastPoint.value)}</p>
                 <p class="text-slate-500 text-[10px]">${lastPoint.isEstimate ? 'L/100km est.' : 'L/100km'}</p>`
              : '<p class="text-slate-500 text-sm">—</p>'}
          </div>
        </div>
      </div>
    `
  } else {
    grid.innerHTML += `
      <div class="px-4 mb-4 text-center py-6 text-slate-600">
        <p class="text-sm">No fill-ups yet. Tap + to add your first one.</p>
      </div>
    `
  }

  container.appendChild(grid)

  drawCharts(data, spec)

  window.__openAddModal = () => openAddFuelModal(state, route)
}

function drawCharts(data, factorySpec) {
  Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, sans-serif'
  Chart.defaults.color = '#64748b'

  const trendCanvas = document.getElementById('trend-chart')
  if (trendCanvas && data.trend.length > 0) {
    const spec = Number(factorySpec)

    const factoryLinePlugin = {
      id: 'factoryLine',
      afterDraw(chart) {
        if (!spec) return
        const { ctx, chartArea, scales } = chart
        const y = scales.y.getPixelForValue(spec)
        if (y < chartArea.top || y > chartArea.bottom) return
        ctx.save()
        ctx.strokeStyle = 'rgba(248,113,113,0.85)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([5, 4])
        ctx.beginPath()
        ctx.moveTo(chartArea.left, y)
        ctx.lineTo(chartArea.right, y)
        ctx.stroke()
        ctx.restore()
      },
    }

    charts.add(new Chart(trendCanvas, {
      type: 'line',
      data: {
        labels: data.trend.map(t => t.label),
        datasets: [{
          data: data.trend.map(t => t.value),
          borderColor: '#60a5fa',
          backgroundColor: 'rgba(96,165,250,0.08)',
          borderWidth: 2.5,
          pointRadius: 4,
          // Estimated points render hollow; measured points solid.
          pointBackgroundColor: data.trend.map(t => t.isEstimate ? '#0f172a' : '#60a5fa'),
          pointBorderColor: data.trend.map(t => t.isEstimate ? '#fbbf24' : '#0f172a'),
          pointBorderWidth: 2,
          fill: true,
          tension: 0.4,
          segment: {
            borderDash: ctx => (data.trend[ctx.p1DataIndex]?.isEstimate || data.trend[ctx.p0DataIndex]?.isEstimate) ? [5, 4] : undefined,
          },
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1,
            callbacks: { label: c => ` ${c.parsed.y} L/100km${data.trend[c.dataIndex]?.isEstimate ? ' (estimated)' : ''}` },
          },
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { font: { size: 10 } } },
          y: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { font: { size: 10 }, callback: v => v + 'L' },
            ...(spec && {
              min: round(Math.min(...data.trend.map(t => t.value), spec) * 0.95, 1),
              max: round(Math.max(...data.trend.map(t => t.value), spec) * 1.05, 1),
            }),
          },
        },
      },
      plugins: [factoryLinePlugin],
    }))
  }

  const monthCanvas = document.getElementById('monthly-chart')
  if (monthCanvas) {
    charts.add(new Chart(monthCanvas, {
      type: 'bar',
      data: {
        labels: data.monthly.map(m => m.label),
        datasets: [{
          data: data.monthly.map(m => m.total),
          backgroundColor: data.monthly.map(m => m.total > 0 ? '#3b82f6' : 'rgba(59,130,246,0.12)'),
          borderRadius: 8,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1, callbacks: { label: c => ` €${c.parsed.y}` } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { font: { size: 10 }, callback: v => '€' + v } },
        },
      },
    }))
  }
}

export function openAddFuelModal(state, onSaved) {
  const today = new Date().toISOString().slice(0, 10)
  openModal(`
    ${modalHandle()}
    <h2 class="text-white text-lg font-bold mb-5">Add Fill-up</h2>
    <form id="fuel-form" class="space-y-4">
      <div>
        <label class="section-label">Date</label>
        <input type="date" name="date" value="${today}" required autocomplete="off">
      </div>
      <div>
        <label class="section-label">Odometer (km)</label>
        <input type="number" name="odometer_km" inputmode="decimal" placeholder="178917" required autocomplete="off" style="font-size:22px;font-weight:700;">
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="section-label">Liters</label>
          <input type="number" name="liters" inputmode="decimal" step="0.01" placeholder="0.00" required autocomplete="off">
        </div>
        <div>
          <label class="section-label">Total Cost (€)</label>
          <input type="number" name="total_cost" inputmode="decimal" step="0.01" placeholder="0.00" required autocomplete="off">
        </div>
      </div>
      ${tankToggleField()}
      <div>
        <label class="section-label">Notes (optional)</label>
        <input type="text" name="notes" placeholder="e.g. Highway fill-up" autocomplete="off">
      </div>
      ${modalFooter('Cancel', 'Save Fill-up')}
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
      showToast('Fill-up saved!')
      onSaved()
    } catch (err) {
      showToast(err.message, 'error')
      btn.textContent = 'Save Fill-up'
      btn.disabled = false
    }
  })
}
