import { getFuelLogs, addFuelLog, deleteFuelLog } from '../api.js'
import { renderCarHeader } from '../app.js'
import { openModal, closeModal, modalHandle, modalFooter } from '../components/modal.js'
import { showToast } from '../components/toast.js'

export async function render(container, state) {
  if (!state.activeCar) return

  container.innerHTML = ''
  renderCarHeader(container, { title: 'Fuel Log', onSwitch: () => render(container, state) })

  const loading = document.createElement('div')
  loading.className = 'px-4 space-y-3'
  loading.innerHTML = Array(3).fill('<div class="skeleton h-28 rounded-2xl"></div>').join('')
  container.appendChild(loading)

  let logs
  try {
    logs = await getFuelLogs(state.activeCar.id)
  } catch (err) {
    showToast('Failed to load fuel logs', 'error')
    return
  }

  loading.remove()

  // Stats bar
  const totalLiters = logs.reduce((s, l) => s + (l.liters || 0), 0)
  const totalCost   = logs.reduce((s, l) => s + (l.total_cost || 0), 0)
  const totalKm     = logs.length > 1 ? logs[0].odometer_km - logs[logs.length - 1].odometer_km : null
  const efficiencies = logs.filter(l => l.l_per_100km != null).map(l => l.l_per_100km)
  const avgL100      = efficiencies.length
    ? (efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length).toFixed(1) : null

  const statsEl = document.createElement('div')
  statsEl.className = 'mx-4 mb-4 card'
  statsEl.innerHTML = `
    <div class="grid grid-cols-4 text-center gap-2">
      <div>
        <p class="text-blue-400 text-xl font-bold">${logs.length}</p>
        <p class="text-slate-500 text-[10px]">Fill-ups</p>
      </div>
      <div>
        <p class="text-white text-xl font-bold">€${totalCost.toFixed(0)}</p>
        <p class="text-slate-500 text-[10px]">Total</p>
      </div>
      <div>
        <p class="${avgL100 && parseFloat(avgL100) > (state.activeCar.factory_fuel_spec ?? 999) + 1 ? 'text-red-400' : 'text-green-400'} text-xl font-bold">${avgL100 ?? '—'}</p>
        <p class="text-slate-500 text-[10px]">Avg L/100</p>
      </div>
      <div>
        <p class="text-white text-xl font-bold">${totalKm ?? '—'}</p>
        <p class="text-slate-500 text-[10px]">km</p>
      </div>
    </div>
  `
  container.appendChild(statsEl)

  // Group by month
  if (logs.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'text-center py-12 text-slate-600'
    empty.innerHTML = `<p class="text-sm">No fill-ups yet. Tap + to add one.</p>`
    container.appendChild(empty)
  } else {
    const groups = {}
    logs.forEach(log => {
      const key = log.date.slice(0, 7)
      if (!groups[key]) groups[key] = []
      groups[key].push(log)
    })

    Object.entries(groups).forEach(([key, entries]) => {
      const d = new Date(key + '-01')
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' })

      const section = document.createElement('div')
      section.className = 'px-4 mb-2'
      section.innerHTML = `<span class="section-label">${label}</span>`

      entries.forEach(log => {
        const colorClass = log.l_per_100km == null ? 'text-slate-400'
          : log.l_per_100km > (state.activeCar.factory_fuel_spec ?? 999) + 1 ? 'text-red-400' : 'text-green-400'
        const pillClass = log.l_per_100km == null ? 'pill-blue'
          : log.l_per_100km > (state.activeCar.factory_fuel_spec ?? 999) + 1 ? 'pill-red' : 'pill-green'

        const card = document.createElement('div')
        card.className = 'card mb-2'
        card.innerHTML = `
          <div class="flex justify-between items-start mb-2">
            <div>
              <p class="text-white font-bold text-sm">${log.date}</p>
              <p class="text-slate-500 text-xs">Odometer: ${log.odometer_km.toLocaleString()} km</p>
            </div>
            <span class="pill ${pillClass}">${log.l_per_100km != null ? log.l_per_100km + ' L/100km' : 'No calc'}</span>
          </div>
          <div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-700/60">
            <div><p class="text-slate-500 text-[10px] uppercase">Liters</p><p class="text-white text-sm font-semibold">${log.liters} L</p></div>
            <div><p class="text-slate-500 text-[10px] uppercase">Cost</p><p class="text-white text-sm font-semibold">€${log.total_cost}</p></div>
            <div><p class="text-slate-500 text-[10px] uppercase">Price/L</p><p class="text-white text-sm font-semibold">€${parseFloat(log.price_per_liter).toFixed(3)}</p></div>
          </div>
          ${log.distance_km != null ? `
          <div class="grid grid-cols-3 gap-2 pt-2 mt-2 border-t border-slate-700/60">
            <div><p class="text-slate-500 text-[10px] uppercase">Distance</p><p class="text-white text-sm font-semibold">${log.distance_km} km</p></div>
            <div><p class="text-slate-500 text-[10px] uppercase">€/km</p><p class="${colorClass} text-sm font-semibold">${log.eur_per_km ?? '—'}</p></div>
            <div><p class="text-slate-500 text-[10px] uppercase">Days</p><p class="text-white text-sm font-semibold">${log.days_since_last ?? '—'}</p></div>
          </div>` : ''}
          ${log.notes ? `<p class="text-slate-500 text-xs mt-2 pt-2 border-t border-slate-700/60">📝 ${log.notes}</p>` : ''}
          <div class="flex justify-end mt-2 pt-2 border-t border-slate-700/60">
            <button data-id="${log.id}" class="delete-fuel-btn text-red-400/60 text-xs hover:text-red-400">Delete</button>
          </div>
        `
        section.appendChild(card)
      })

      container.appendChild(section)
    })
  }

  // Delete handlers
  container.querySelectorAll('.delete-fuel-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this fill-up?')) return
      try {
        await deleteFuelLog(parseInt(btn.dataset.id))
        showToast('Deleted')
        render(container, state)
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  })

  // FAB → add
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
        <input type="date" name="date" value="${today}" required>
      </div>
      <div>
        <label class="section-label">Odometer (km)</label>
        <input type="number" name="odometer_km" inputmode="decimal" placeholder="178917" required style="font-size:22px;font-weight:700;">
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="section-label">Liters</label>
          <input type="number" name="liters" inputmode="decimal" step="0.01" placeholder="0.00" required>
        </div>
        <div>
          <label class="section-label">Total Cost (€)</label>
          <input type="number" name="total_cost" inputmode="decimal" step="0.01" placeholder="0.00" required>
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
        <input type="text" name="notes" placeholder="e.g. Highway fill-up">
      </div>
      ${modalFooter('Cancel', 'Save Fill-up')}
    </form>
  `)

  const fullTankBtn   = document.getElementById('full-tank-btn')
  const fullTankInput = document.getElementById('full-tank-input')
  fullTankBtn.addEventListener('click', () => {
    const active = fullTankInput.value === 'on'
    fullTankInput.value = active ? 'off' : 'on'
    if (!active) {
      fullTankBtn.className = 'w-full py-2.5 rounded-xl text-sm font-semibold transition-all bg-blue-500/20 text-blue-400 border border-blue-500/50'
    } else {
      fullTankBtn.className = 'w-full py-2.5 rounded-xl text-sm font-semibold transition-all bg-slate-700/50 text-slate-500 border border-slate-600/40'
    }
  })

  document.getElementById('fuel-form').addEventListener('submit', async e => {
    e.preventDefault()
    const fd  = new FormData(e.target)
    const btn = document.getElementById('modal-submit')
    btn.textContent = 'Saving…'
    btn.disabled = true
    try {
      await addFuelLog(state.activeCar.id, {
        date:           fd.get('date'),
        odometer_km:    parseFloat(fd.get('odometer_km')),
        liters:         parseFloat(fd.get('liters')),
        total_cost:     parseFloat(fd.get('total_cost')),
        price_per_liter: parseFloat(fd.get('total_cost')) / parseFloat(fd.get('liters')),
        is_full_tank:   fd.get('is_full_tank') === 'on',
        notes:          fd.get('notes') || null,
        currency:       'EUR',
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
