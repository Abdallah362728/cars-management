import { getSchedule, updateScheduleItem, getMaintenanceLogs, addCost, computeScheduleStatus, getCars } from '../api.js'
import { openModal, closeModal, modalHandle, modalFooter } from '../components/modal.js'
import { showToast } from '../components/toast.js'

export async function render(container, state) {
  container.innerHTML = ''

  // Header
  const header = document.createElement('div')
  header.className = 'px-5 pt-5 pb-3'
  header.innerHTML = `
    <h1 class="text-white text-2xl font-bold tracking-tight">Additional</h1>
    <p class="text-slate-500 text-sm">Maintenance schedule & car history</p>
  `
  container.appendChild(header)

  // Active car schedule
  if (state.activeCar) {
    await renderSchedule(container, state)
  }

  // All cars history (sold cars)
  await renderCarHistory(container, state)
}

async function renderSchedule(container, state) {
  const loadingEl = document.createElement('div')
  loadingEl.className = 'px-4 space-y-2 mb-4'
  loadingEl.innerHTML = Array(5).fill('<div class="skeleton h-16 rounded-2xl"></div>').join('')
  container.appendChild(loadingEl)

  let schedule, lastOdometer
  try {
    schedule = await getSchedule(state.activeCar.id)
    const logs = await import('../api.js').then(m => m.getFuelLogs(state.activeCar.id))
    lastOdometer = logs[0]?.odometer_km ?? null
  } catch (err) {
    showToast('Failed to load schedule', 'error')
    loadingEl.remove()
    return
  }
  loadingEl.remove()

  const schedEl = document.createElement('div')
  schedEl.className = 'px-4 mb-5'

  const neverDone = schedule.filter(s => !s.last_done_km && !s.last_done_date)
  if (neverDone.length > 0) {
    schedEl.innerHTML += `
      <div class="mb-3 bg-indigo-500/8 border border-indigo-500/25 rounded-2xl p-3.5">
        <p class="text-indigo-400 font-semibold text-sm">${neverDone.length} items need initialization</p>
        <p class="text-slate-500 text-xs mt-0.5">Tap an item to enter when it was last done</p>
      </div>
    `
  }

  schedEl.innerHTML += `<span class="section-label">Service Schedule — ${state.activeCar.make} ${state.activeCar.model}</span>`

  // Sort: overdue → due_soon → ok → never_done
  const ORDER = { overdue: 0, due_soon: 1, ok: 2, never_done: 3 }
  const withStatus = schedule.map(item => ({
    item,
    computed: computeScheduleStatus(item, lastOdometer),
  })).sort((a, b) => ORDER[a.computed.status] - ORDER[b.computed.status])

  const colorMap = {
    overdue:    { dot: 'bg-red-500',    pill: 'pill-red' },
    due_soon:   { dot: 'bg-amber-500',  pill: 'pill-amber' },
    ok:         { dot: 'bg-green-500',  pill: 'pill-green' },
    never_done: { dot: 'bg-indigo-500', pill: 'pill-indigo' },
  }

  withStatus.forEach(({ item, computed }) => {
    const colors = colorMap[computed.status]
    let subtitle = ''
    if (item.interval_km)     subtitle += `Every ${item.interval_km.toLocaleString()} km`
    if (item.interval_months) subtitle += (subtitle ? ' or ' : '') + `${item.interval_months} months`
    if (item.last_done_date)  subtitle += ` · Done: ${item.last_done_date}`

    let nextInfo = ''
    if (computed.nextKm)   nextInfo += `Next: ${computed.nextKm.toLocaleString()} km`
    if (computed.daysUntil != null) nextInfo += (nextInfo ? ' · ' : '') + (computed.daysUntil < 0 ? `${Math.abs(computed.daysUntil)}d overdue` : `${computed.daysUntil}d left`)

    const row = document.createElement('div')
    row.className = 'card flex items-center gap-3 mb-2 cursor-pointer active:scale-[0.98] transition-transform'
    row.innerHTML = `
      <div class="w-2 h-2 rounded-full ${colors.dot} flex-shrink-0"></div>
      <div class="flex-1 min-w-0">
        <p class="text-white text-sm font-semibold">${item.item_name}</p>
        <p class="text-slate-500 text-xs truncate">${subtitle}</p>
        ${nextInfo ? `<p class="text-slate-400 text-xs">${nextInfo}</p>` : ''}
      </div>
      <span class="pill ${colors.pill} flex-shrink-0">${computed.label}</span>
    `
    row.addEventListener('click', () => openMarkDoneModal(item, state, () => render(container, state)))
    schedEl.appendChild(row)
  })

  container.appendChild(schedEl)
}

function openMarkDoneModal(item, state, onSaved) {
  const today = new Date().toISOString().slice(0, 10)
  openModal(`
    ${modalHandle()}
    <h2 class="text-white text-lg font-bold mb-1">${item.item_name}</h2>
    <p class="text-slate-500 text-sm mb-5">Mark as done — enter when it was completed</p>
    <form id="done-form" class="space-y-4">
      <div>
        <label class="section-label">Date Completed</label>
        <input type="date" name="done_date" value="${today}" required>
      </div>
      <div>
        <label class="section-label">Odometer at time (km)</label>
        <input type="number" name="done_km" inputmode="decimal" placeholder="optional" style="font-size:20px;font-weight:700;">
      </div>
      <div>
        <label class="section-label">Cost (€)</label>
        <input type="number" name="cost" inputmode="decimal" step="0.01" placeholder="0.00">
      </div>
      <div>
        <label class="section-label">Notes (optional)</label>
        <input type="text" name="notes" placeholder="">
      </div>
      ${modalFooter('Cancel', 'Mark as Done')}
    </form>
  `)

  document.getElementById('done-form').addEventListener('submit', async e => {
    e.preventDefault()
    const fd  = new FormData(e.target)
    const btn = document.getElementById('modal-submit')
    btn.textContent = 'Saving…'
    btn.disabled = true

    const doneDate = fd.get('done_date')
    const doneKm   = fd.get('done_km') ? parseFloat(fd.get('done_km')) : null
    const cost     = fd.get('cost')    ? parseFloat(fd.get('cost'))    : 0
    const notes    = fd.get('notes')   || null

    try {
      // Update schedule last_done
      await updateScheduleItem(item.id, {
        last_done_date: doneDate,
        last_done_km:   doneKm,
      })

      // Also save to maintenance_logs if cost > 0
      if (cost > 0) {
        const { addCost } = await import('../api.js')
        await addCost('maintenance', state.activeCar.id, {
          date:        doneDate,
          odometer_km: doneKm,
          category:    item.item_name,
          description: item.item_name,
          cost,
          notes,
          currency:    'EUR',
        })
      }

      closeModal()
      showToast(`${item.item_name} marked as done!`)
      onSaved()
    } catch (err) {
      showToast(err.message, 'error')
      btn.textContent = 'Mark as Done'
      btn.disabled = false
    }
  })
}

async function renderCarHistory(container, state) {
  let allCars
  try {
    const { getCars } = await import('../api.js')
    allCars = await getCars()
  } catch (err) {
    return
  }

  const sold = allCars.filter(c => c.status === 'sold')
  if (sold.length === 0) return

  const histEl = document.createElement('div')
  histEl.className = 'px-4 mb-6'
  histEl.innerHTML = `<span class="section-label">Past Cars</span>`

  sold.forEach(car => {
    const netLoss = (car.purchase_price && car.sell_price)
      ? car.sell_price - car.purchase_price : null
    const currency = car.purchase_currency || 'EUR'

    histEl.innerHTML += `
      <div class="card mb-2 opacity-70">
        <div class="flex justify-between items-start mb-2">
          <div>
            <p class="text-white font-bold text-sm">${car.make} ${car.model} ${car.year}</p>
            <p class="text-slate-500 text-xs">${car.purchase_date ?? '?'} – ${car.sell_date ?? '?'} · ${car.operating_country ?? ''}</p>
          </div>
          <span class="pill pill-blue">Sold</span>
        </div>
        <div class="grid grid-cols-3 gap-3 pt-2 border-t border-slate-700/50">
          <div>
            <p class="text-slate-500 text-[10px] uppercase">Bought</p>
            <p class="text-white text-sm font-semibold">${currency} ${car.purchase_price?.toLocaleString() ?? '—'}</p>
          </div>
          <div>
            <p class="text-slate-500 text-[10px] uppercase">Sold</p>
            <p class="text-white text-sm font-semibold">${currency} ${car.sell_price?.toLocaleString() ?? '—'}</p>
          </div>
          <div>
            <p class="text-slate-500 text-[10px] uppercase">Net</p>
            <p class="${netLoss != null && netLoss < 0 ? 'text-red-400' : 'text-green-400'} text-sm font-bold">
              ${netLoss != null ? `${netLoss >= 0 ? '+' : ''}${currency} ${netLoss.toLocaleString()}` : '—'}
            </p>
          </div>
        </div>
      </div>
    `
  })

  container.appendChild(histEl)
}
