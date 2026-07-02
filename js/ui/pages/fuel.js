import { getFuelLogsRaw, deleteFuelLog } from '../../data/fuel-repo.js'
import { normalizeFuelRows, enrichFuelLogs, computeFuelStats } from '../../domain/fuel-metrics.js'
import { esc, fmtMoney, fmtNum } from '../../domain/format.js'
import { isStale, route } from '../../core/router.js'
import { renderCarHeader } from '../components/car-header.js'
import { showToast } from '../components/toast.js'
import { openAddFuelModal } from './dashboard.js'

export async function render(container, state, epoch) {
  if (!state.activeCar) return

  container.innerHTML = ''
  renderCarHeader(container, { title: 'Fuel Log' })

  const loading = document.createElement('div')
  loading.className = 'px-4 space-y-3'
  loading.innerHTML = Array(3).fill('<div class="skeleton h-28 rounded-2xl"></div>').join('')
  container.appendChild(loading)

  let logs, stats
  try {
    const raw = await getFuelLogsRaw(state.activeCar.id)
    const enriched = enrichFuelLogs(normalizeFuelRows(raw))
    stats = computeFuelStats(enriched)
    logs = enriched.slice().reverse()   // newest first for display
  } catch (err) {
    if (!isStale(epoch)) showToast('Failed to load fuel logs', 'error')
    return
  }
  if (isStale(epoch)) return

  loading.remove()

  const spec = Number(state.activeCar.factory_fuel_spec) || null
  const avgL100 = stats.blendedAvgL100 ?? stats.measuredAvgL100
  const avgColor = avgL100 != null && avgL100 > (spec ?? 999) + 1
    ? 'text-red-400' : 'text-green-400'

  const statsEl = document.createElement('div')
  statsEl.className = 'mx-4 mb-4 card'
  statsEl.innerHTML = `
    <div class="grid grid-cols-4 text-center gap-2">
      <div>
        <p class="text-blue-400 text-xl font-bold">${stats.fillCount}</p>
        <p class="text-slate-500 text-[10px]">Fill-ups</p>
      </div>
      <div>
        <p class="text-white text-xl font-bold">${fmtMoney(stats.totalCost, { decimals: 0 })}</p>
        <p class="text-slate-500 text-[10px]">Total</p>
      </div>
      <div>
        <p class="${avgL100 == null ? 'text-slate-400' : avgColor} text-xl font-bold">${fmtNum(avgL100)}</p>
        <p class="text-slate-500 text-[10px]">Avg L/100</p>
      </div>
      <div>
        <p class="text-white text-xl font-bold">${stats.totalKm ? stats.totalKm.toLocaleString() : '—'}</p>
        <p class="text-slate-500 text-[10px]">km</p>
      </div>
    </div>
  `
  container.appendChild(statsEl)

  if (logs.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'text-center py-12 text-slate-600'
    empty.innerHTML = `<p class="text-sm">No fill-ups yet. Tap + to add one.</p>`
    container.appendChild(empty)
  } else {
    const groups = {}
    logs.forEach(log => {
      const key = String(log.date ?? '').slice(0, 7)
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
        const measured = log.l_per_100km != null
        const estimated = log.is_estimate
        const overSpec = measured && log.l_per_100km > (spec ?? 999) + 1

        // Pill: measured value > estimate > anomaly > baseline
        let pillClass, pillText, effColor
        if (log.odo_anomaly) {
          pillClass = 'pill-red'; pillText = '⚠ Check odometer'; effColor = 'text-red-400'
        } else if (measured) {
          pillClass = overSpec ? 'pill-red' : 'pill-green'
          pillText = `${fmtNum(log.l_per_100km)} L/100km`
          effColor = overSpec ? 'text-red-400' : 'text-green-400'
        } else if (estimated) {
          pillClass = 'pill-amber'
          pillText = `~${fmtNum(log.est_l_per_100km)} L/100km est.`
          effColor = 'text-amber-400'
        } else if (log.is_baseline) {
          pillClass = 'pill-indigo'; pillText = 'Baseline'; effColor = 'text-slate-400'
        } else {
          pillClass = 'pill-blue'; pillText = '🪣 Partial fill'; effColor = 'text-slate-400'
        }

        const eur100 = log.eur_per_100km ?? log.est_eur_per_100km
        const eur100Text = eur100 != null
          ? `${estimated && log.eur_per_100km == null ? '~' : ''}${fmtMoney(eur100)}` : '—'

        const card = document.createElement('div')
        card.className = 'card mb-2'
        card.innerHTML = `
          <div class="flex justify-between items-start mb-2">
            <div>
              <p class="text-white font-bold text-sm">${log.date}</p>
              <p class="text-slate-500 text-xs">Odometer: ${log.odometer_km != null ? log.odometer_km.toLocaleString() : '—'} km</p>
            </div>
            <span class="pill ${pillClass}">${pillText}</span>
          </div>
          <div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-700/60">
            <div><p class="text-slate-500 text-[10px] uppercase">Liters</p><p class="text-white text-sm font-semibold">${fmtNum(log.liters, 2)} L</p></div>
            <div><p class="text-slate-500 text-[10px] uppercase">Cost</p><p class="text-white text-sm font-semibold">${fmtMoney(log.total_cost)}</p></div>
            <div><p class="text-slate-500 text-[10px] uppercase">Price/L</p><p class="text-white text-sm font-semibold">${fmtMoney(log.price_per_liter, { decimals: 3 })}</p></div>
          </div>
          ${log.distance_km != null ? `
          <div class="grid grid-cols-3 gap-2 pt-2 mt-2 border-t border-slate-700/60">
            <div><p class="text-slate-500 text-[10px] uppercase">Distance</p><p class="text-white text-sm font-semibold">${log.distance_km.toLocaleString()} km</p></div>
            <div><p class="text-slate-500 text-[10px] uppercase">€/100km</p><p class="${effColor} text-sm font-semibold">${eur100Text}</p></div>
            <div><p class="text-slate-500 text-[10px] uppercase">Days</p><p class="text-white text-sm font-semibold">${log.days_since_last ?? '—'}</p></div>
          </div>` : ''}
          ${log.notes ? `<p class="text-slate-500 text-xs mt-2 pt-2 border-t border-slate-700/60">📝 ${esc(log.notes)}</p>` : ''}
          <div class="flex justify-end mt-2 pt-2 border-t border-slate-700/60">
            <button data-id="${log.id}" class="delete-fuel-btn text-red-400/60 text-xs hover:text-red-400">Delete</button>
          </div>
        `
        section.appendChild(card)
      })

      container.appendChild(section)
    })
  }

  container.querySelectorAll('.delete-fuel-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this fill-up?')) return
      try {
        await deleteFuelLog(parseInt(btn.dataset.id))
        showToast('Deleted')
        route()
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  })

  window.__openAddModal = () => openAddFuelModal(state, route)
}
