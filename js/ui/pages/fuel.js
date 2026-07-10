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
  renderCarHeader(container, { title: 'Fuel log' })

  const loading = document.createElement('div')
  loading.className = 'section'
  loading.innerHTML = Array(3).fill('<div class="skeleton" style="height:110px;margin-bottom:10px"></div>').join('')
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
  const avgColor = avgL100 == null ? '' : avgL100 > (spec ?? 999) + 1 ? 'color:var(--danger)' : 'color:var(--ok)'
  const avgIsEstimate = avgL100 != null && avgL100 === stats.blendedAvgL100 && stats.blendedIncludesEstimates

  const statsEl = document.createElement('div')
  statsEl.className = 'section'
  statsEl.innerHTML = `
    <div class="card data-strip">
      <div>
        <p class="stat-value num" style="color:var(--amber)">${stats.fillCount}</p>
        <p class="micro">Fills</p>
      </div>
      <div>
        <p class="stat-value num">${fmtMoney(stats.totalCost, { decimals: 0 })}</p>
        <p class="micro">Total</p>
      </div>
      <div>
        <p class="stat-value num" style="${avgColor}">${avgIsEstimate ? '~' : ''}${fmtNum(avgL100)}</p>
        <p class="micro">L/100</p>
      </div>
      <div>
        <p class="stat-value num">${stats.totalKm ? stats.totalKm.toLocaleString() : '—'}</p>
        <p class="micro">km</p>
      </div>
    </div>
  `
  container.appendChild(statsEl)

  if (logs.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-note'
    empty.textContent = 'No fill-ups yet. Tap + to add one.'
    container.appendChild(empty)
  } else {
    const groups = {}
    logs.forEach(log => {
      const key = String(log.date ?? '').slice(0, 7)
      if (!groups[key]) groups[key] = []
      groups[key].push(log)
    })

    Object.entries(groups).forEach(([key, entries]) => {
      const [gy, gm] = key.split('-').map(Number)
      const d = new Date(gy, gm - 1, 1)
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' })
      const monthTotal = entries.reduce((s, l) => s + l.total_cost, 0)

      const section = document.createElement('div')
      section.className = 'section'
      section.innerHTML = `<div class="dim-line"><span class="micro">${label}</span><span class="micro num" style="color:var(--ink)">${fmtMoney(monthTotal)}</span></div>`

      entries.forEach(log => {
        const measured = log.l_per_100km != null
        const estimated = log.is_estimate
        const overSpec = measured && log.l_per_100km > (spec ?? 999) + 1

        let pillClass, pillText
        if (log.odo_anomaly) {
          pillClass = 'pill--danger'; pillText = 'CHECK ODO'
        } else if (log.is_pending) {
          pillClass = 'pill--muted'; pillText = 'PENDING'
        } else if (measured) {
          pillClass = overSpec ? 'pill--danger' : 'pill--ok'
          pillText = `${fmtNum(log.l_per_100km)} MEASURED`
        } else if (estimated) {
          pillClass = 'pill--est'
          pillText = `~${fmtNum(log.est_l_per_100km)} EST`
        } else {
          pillClass = 'pill--info'; pillText = 'PARTIAL'
        }

        const eur100 = log.eur_per_100km ?? log.est_eur_per_100km
        const eur100Text = eur100 != null
          ? `${estimated && log.eur_per_100km == null ? '~' : ''}${fmtMoney(eur100)}` : '—'

        const card = document.createElement('div')
        card.className = 'card'
        card.style.marginBottom = '10px'
        card.innerHTML = `
          <div class="row-between">
            <div>
              <p class="num" style="font-size:13px;font-weight:600">${log.date}${log.is_full_tank === false ? ' <span class="mute" style="font-weight:400">· partial</span>' : ''}</p>
              <p class="mute num" style="font-size:11px;margin-top:1px">ODO ${log.odometer_km != null ? log.odometer_km.toLocaleString() : '—'} KM</p>
            </div>
            <span class="pill ${pillClass}">${pillText}</span>
          </div>
          <div class="ledger-cols" style="border-top:var(--hairline);padding-top:8px;margin-top:10px">
            <div><p class="micro">Liters</p><p class="num">${fmtNum(log.liters, 2)}</p></div>
            <div><p class="micro">Cost</p><p class="num">${fmtMoney(log.total_cost)}</p></div>
            <div><p class="micro">€ / L</p><p class="num">${fmtMoney(log.price_per_liter, { decimals: 3 })}</p></div>
          </div>
          ${log.distance_km != null ? `
          <div class="ledger-cols" style="border-top:var(--hairline);padding-top:8px;margin-top:8px">
            <div><p class="micro">Leg to next</p><p class="num">${log.distance_km.toLocaleString()} km</p></div>
            <div><p class="micro">€ / 100km</p><p class="num" style="color:${estimated && log.eur_per_100km == null ? 'var(--amber)' : 'var(--ink)'}">${eur100Text}</p></div>
            <div><p class="micro">Days</p><p class="num">${log.days_span ?? '—'}</p></div>
          </div>` : ''}
          ${log.is_pending ? `<p class="mute" style="font-size:11px;margin-top:8px;padding-top:8px;border-top:var(--hairline)">Newest fill — its consumption is measured once you fill up again.</p>` : ''}
          ${log.notes ? `<p class="mute" style="font-size:11px;margin-top:8px;padding-top:8px;border-top:var(--hairline)">${esc(log.notes)}</p>` : ''}
          <div style="display:flex;justify-content:flex-end;margin-top:6px">
            <button data-id="${log.id}" class="delete-fuel-btn btn--danger-text">DELETE</button>
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
      btn.disabled = true
      try {
        await deleteFuelLog(parseInt(btn.dataset.id))
        showToast('Deleted')
        route()
      } catch (err) {
        showToast(err.message, 'error')
        btn.disabled = false
      }
    })
  })

  window.__openAddModal = () => openAddFuelModal(state, route)
}
