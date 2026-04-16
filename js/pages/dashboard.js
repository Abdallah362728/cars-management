import { getDashboard, addFuelLog } from '../api.js'
import { renderCarHeader } from '../app.js'
import { openModal, closeModal, modalHandle, modalFooter } from '../components/modal.js'
import { showToast } from '../components/toast.js'

let charts = []

export function cleanup() {
  charts.forEach(c => c.destroy())
  charts = []
}

export async function render(container, state) {
  // Destroy any charts from a previous render on this page (car-switch, etc.)
  // to avoid leaking Chart.js instances attached to now-removed canvases.
  cleanup()

  if (!state.activeCar) {
    container.innerHTML = `<div class="flex items-center justify-center p-8 text-slate-500 text-sm" style="min-height:60dvh">No active car found.</div>`
    return
  }

  container.innerHTML = ''
  renderCarHeader(container, {
    subtitle: `${state.activeCar.year} · ${state.activeCar.operating_country || ''}`,
    onSwitch: () => render(container, state),
  })

  // Skeleton cards while loading
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
    data = await getDashboard(state.activeCar)
  } catch (err) {
    showToast('Failed to load dashboard', 'error')
    return
  }

  // Re-render with real data
  grid.innerHTML = ''

  // ── KPI Cards ──────────────────────────────────────────────────────────────
  const fuelColor = data.avgL100km == null ? 'text-slate-400'
    : data.avgL100km > (state.activeCar.factory_fuel_spec ?? 999) + 1 ? 'text-red-400' : 'text-green-400'
  const vsFactory = (data.avgL100km != null && state.activeCar.factory_fuel_spec)
    ? (data.avgL100km - state.activeCar.factory_fuel_spec).toFixed(1) : null

  grid.innerHTML += `
    <div class="px-4 grid grid-cols-2 gap-3 mb-3">
      <div class="card">
        <p class="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Avg Fuel Use</p>
        <div class="flex items-baseline gap-1 mb-1">
          <span class="${fuelColor} text-2xl font-bold">${data.avgL100km ?? '—'}</span>
          <span class="text-slate-500 text-xs">L/100km</span>
        </div>
        ${vsFactory != null ? `<span class="pill ${parseFloat(vsFactory) > 0 ? 'pill-red' : 'pill-green'}">${parseFloat(vsFactory) > 0 ? '↑' : '↓'} ${Math.abs(vsFactory)} vs factory</span>` : `<span class="text-slate-600 text-xs">Factory: ${state.activeCar.factory_fuel_spec ?? '—'}</span>`}
      </div>
      <div class="card">
        <p class="text-slate-500 text-[10px] uppercase tracking-wider mb-1">This Month</p>
        <div class="flex items-baseline gap-1 mb-1">
          <span class="text-white text-2xl font-bold">€${data.thisMonthFuel}</span>
        </div>
        <span class="text-slate-500 text-xs">Total owned: €${data.totalCoo}</span>
      </div>
      <div class="card">
        <p class="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Cost / km</p>
        <div class="flex items-baseline gap-1 mb-1">
          <span class="text-white text-2xl font-bold">${data.costPerKm ? '€' + data.costPerKm : '—'}</span>
        </div>
        <span class="text-slate-500 text-xs">${data.totalKm ? data.totalKm + ' km driven' : 'No data yet'}</span>
      </div>
      <div class="card">
        <p class="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Last Fill-up</p>
        <div class="flex items-baseline gap-1 mb-1">
          ${data.daysSinceFuel != null
            ? `<span class="text-white text-2xl font-bold">${data.daysSinceFuel}</span><span class="text-slate-500 text-xs">days ago</span>`
            : `<span class="text-slate-400 text-xl font-bold">—</span>`}
        </div>
        <span class="text-slate-500 text-xs">${data.lastFuel ? data.lastFuel.date : 'No fill-ups yet'}</span>
      </div>
    </div>
  `

  // ── Fuel Efficiency Trend Chart ────────────────────────────────────────────
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
        ${state.activeCar.factory_fuel_spec ? `
          <div class="flex items-center gap-2 mt-2">
            <svg width="18" height="6" viewBox="0 0 18 6"><line x1="0" y1="3" x2="18" y2="3" stroke="rgba(248,113,113,0.7)" stroke-width="1.5" stroke-dasharray="5,4"/></svg>
            <span class="text-red-400 text-[10px]">Factory: ${state.activeCar.factory_fuel_spec} L/100km</span>
          </div>` : ''}
      </div>
    </div>
  `

  // ── Monthly Spend Chart ────────────────────────────────────────────────────
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

  // ── Latest fill-up card ────────────────────────────────────────────────────
  if (data.lastFuel) {
    const ppl = data.lastFuel.price_per_liter
      ?? (data.lastFuel.total_cost / data.lastFuel.liters).toFixed(3)
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
            <p class="text-white font-semibold text-sm">${data.lastFuel.liters} L &nbsp;·&nbsp; €${data.lastFuel.total_cost}</p>
            <p class="text-slate-500 text-xs">€${parseFloat(ppl).toFixed(3)}/L &nbsp;·&nbsp; ${data.lastFuel.date}</p>
          </div>
          <div class="text-right">
            ${data.trend.length > 0
              ? `<p class="${fuelColor} font-bold text-lg">${data.trend[data.trend.length-1]?.value ?? '—'}</p>
                 <p class="text-slate-500 text-[10px]">L/100km</p>`
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

  // ── Draw charts ────────────────────────────────────────────────────────────
  Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, sans-serif'
  Chart.defaults.color = '#64748b'

  const trendCanvas = document.getElementById('trend-chart')
  if (trendCanvas && data.trend.length > 0) {
    const factorLine = state.activeCar.factory_fuel_spec
      ? data.trend.map(() => state.activeCar.factory_fuel_spec) : null

    const ds = [{
      data: data.trend.map(t => t.value),
      borderColor: '#60a5fa',
      backgroundColor: 'rgba(96,165,250,0.08)',
      borderWidth: 2.5,
      pointRadius: 4,
      pointBackgroundColor: '#60a5fa',
      pointBorderColor: '#0f172a',
      pointBorderWidth: 2,
      fill: true,
      tension: 0.4,
    }]
    if (factorLine) ds.push({
      data: factorLine,
      borderColor: 'rgba(248,113,113,0.7)',
      borderWidth: 1.5,
      borderDash: [5, 4],
      segment: { borderDash: () => [5, 4] },
      pointRadius: 0,
      fill: false,
      tension: 0,
    })

    charts.push(new Chart(trendCanvas, {
      type: 'line',
      data: { labels: data.trend.map(t => t.label), datasets: ds },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1, callbacks: { label: c => ` ${c.parsed.y} L/100km` } } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { font: { size: 10 }, callback: v => v + 'L' } },
        },
      },
    }))
  }

  const monthCanvas = document.getElementById('monthly-chart')
  if (monthCanvas) {
    charts.push(new Chart(monthCanvas, {
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

  // ── FAB → Add Fill-up ─────────────────────────────────────────────────────
  window.__openAddModal = () => openAddFuelModal(state, () => render(container, state))
}

function openAddFuelModal(state, onSaved) {
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
      <div>
        <input type="hidden" name="is_full_tank" id="full-tank-input" value="on">
        <button type="button" id="full-tank-btn"
          class="w-full py-2.5 rounded-xl text-sm font-semibold transition-all bg-blue-500/20 text-blue-400 border border-blue-500/50">
          Full Tank
        </button>
      </div>
      <div>
        <label class="section-label">Notes (optional)</label>
        <input type="text" name="notes" placeholder="e.g. Highway fill-up" autocomplete="off">
      </div>
      ${modalFooter('Cancel', 'Save Fill-up')}
    </form>
  `)

  const fullTankBtn   = document.getElementById('full-tank-btn')
  const fullTankInput = document.getElementById('full-tank-input')
  fullTankBtn.addEventListener('click', () => {
    const active = fullTankInput.value === 'on'
    fullTankInput.value = active ? 'off' : 'on'
    fullTankBtn.className = !active
      ? 'w-full py-2.5 rounded-xl text-sm font-semibold transition-all bg-blue-500/20 text-blue-400 border border-blue-500/50'
      : 'w-full py-2.5 rounded-xl text-sm font-semibold transition-all bg-slate-700/50 text-slate-500 border border-slate-600/40'
  })

  document.getElementById('fuel-form').addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const btn = document.getElementById('modal-submit')
    btn.textContent = 'Saving…'
    btn.disabled = true

    const liters = parseFloat(fd.get('liters'))
    const cost   = parseFloat(fd.get('total_cost'))
    try {
      await addFuelLog(state.activeCar.id, {
        date:         fd.get('date'),
        odometer_km:  parseFloat(fd.get('odometer_km')),
        liters,
        total_cost:   cost,
        price_per_liter: liters > 0 ? cost / liters : null,
        is_full_tank: fd.get('is_full_tank') === 'on',
        notes:        fd.get('notes') || null,
        currency:     'EUR',
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
