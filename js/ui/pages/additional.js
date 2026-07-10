import { getSchedule, updateScheduleItem } from '../../data/maintenance-repo.js'
import { getFuelLogsRaw } from '../../data/fuel-repo.js'
import { addCost } from '../../data/costs-repo.js'
import { getCars } from '../../data/cars-repo.js'
import { computeScheduleStatus } from '../../domain/schedule.js'
import { esc } from '../../domain/format.js'
import { isStale, route } from '../../core/router.js'
import { renderCarHeader } from '../components/car-header.js'
import { openModal, closeModal, modalHandle, modalFooter } from '../components/modal.js'
import { showToast } from '../components/toast.js'

export async function render(container, state, epoch) {
  container.innerHTML = ''
  renderCarHeader(container, { title: 'Service' })

  if (state.activeCar) {
    await renderSchedule(container, state, epoch)
    if (isStale(epoch)) return
  }

  await renderCarHistory(container, epoch)
}

async function renderSchedule(container, state, epoch) {
  const loadingEl = document.createElement('div')
  loadingEl.className = 'section'
  loadingEl.innerHTML = Array(5).fill('<div class="skeleton" style="height:60px;margin-bottom:8px"></div>').join('')
  container.appendChild(loadingEl)

  let schedule, lastOdometer
  try {
    const [sched, fuel] = await Promise.all([
      getSchedule(state.activeCar.id),
      getFuelLogsRaw(state.activeCar.id),
    ])
    schedule = sched
    lastOdometer = fuel.length ? Number(fuel[fuel.length - 1].odometer_km) : null
  } catch (err) {
    if (!isStale(epoch)) showToast('Failed to load schedule', 'error')
    loadingEl.remove()
    return
  }
  if (isStale(epoch)) return
  loadingEl.remove()

  const schedEl = document.createElement('div')
  schedEl.className = 'section'

  const withStatus = schedule.map(item => ({
    item,
    computed: computeScheduleStatus(item, lastOdometer),
  }))

  // Summary strip
  const counts = { overdue: 0, due_soon: 0, ok: 0, never_done: 0 }
  withStatus.forEach(({ computed }) => counts[computed.status]++)
  schedEl.innerHTML += `
    <div class="card data-strip" style="margin-bottom:14px">
      <div><p class="stat-value num" style="color:var(--danger)">${counts.overdue}</p><p class="micro">Overdue</p></div>
      <div><p class="stat-value num" style="color:var(--amber)">${counts.due_soon}</p><p class="micro">Due soon</p></div>
      <div><p class="stat-value num" style="color:var(--ok)">${counts.ok}</p><p class="micro">OK</p></div>
      <div><p class="stat-value num" style="color:var(--ink-mute)">${counts.never_done}</p><p class="micro">No data</p></div>
    </div>
  `

  if (counts.never_done > 0) {
    schedEl.innerHTML += `
      <div class="card" style="border-style:dashed;margin-bottom:14px">
        <p style="font-size:12.5px;font-weight:600;color:var(--info)">${counts.never_done} items need initialization</p>
        <p class="mute" style="font-size:11px;margin-top:2px">Tap an item to enter when it was last done</p>
      </div>
    `
  }

  schedEl.innerHTML += `<div class="dim-line"><span class="micro">Service schedule — ${esc(state.activeCar.make)} ${esc(state.activeCar.model)}</span></div>`

  const ORDER = { overdue: 0, due_soon: 1, ok: 2, never_done: 3 }
  withStatus.sort((a, b) => ORDER[a.computed.status] - ORDER[b.computed.status])

  const pillMap = {
    overdue:    'pill--danger',
    due_soon:   'pill--warn',
    ok:         'pill--ok',
    never_done: 'pill--muted',
  }

  withStatus.forEach(({ item, computed }) => {
    let subtitle = ''
    if (item.interval_km)     subtitle += `EVERY ${Number(item.interval_km).toLocaleString()} KM`
    if (item.interval_months) subtitle += (subtitle ? ' / ' : 'EVERY ') + `${item.interval_months} MO`
    if (item.last_done_date)  subtitle += ` · DONE ${item.last_done_date}`

    let nextInfo = ''
    if (computed.kmRemaining != null) nextInfo += computed.kmRemaining < 0 ? `${Math.abs(computed.kmRemaining).toLocaleString()} km over` : `${computed.kmRemaining.toLocaleString()} km left`
    if (computed.daysUntil != null) nextInfo += (nextInfo ? ' · ' : '') + (computed.daysUntil < 0 ? `${Math.abs(computed.daysUntil)}d over` : `${computed.daysUntil}d left`)

    const row = document.createElement('div')
    row.className = 'card row'
    row.style.cssText = 'margin-bottom:8px;cursor:pointer'
    row.innerHTML = `
      <div class="status-sq status-sq--${computed.status}"></div>
      <div style="flex:1;min-width:0">
        <p style="font-size:13px;font-weight:600">${esc(item.item_name)}</p>
        <p class="micro num" style="margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(subtitle)}</p>
        ${nextInfo ? `<p class="mute num" style="font-size:11px;margin-top:1px">${nextInfo}</p>` : ''}
      </div>
      <span class="pill ${pillMap[computed.status]}">${computed.label.toUpperCase()}</span>
    `
    row.addEventListener('click', () => openMarkDoneModal(item, state, lastOdometer))
    schedEl.appendChild(row)
  })

  container.appendChild(schedEl)
}

function openMarkDoneModal(item, state, lastOdometer) {
  const carId = state.activeCar.id
  const today = new Date().toISOString().slice(0, 10)
  openModal(`
    ${modalHandle()}
    <h2 class="modal-title" style="margin-bottom:4px">${esc(item.item_name)}</h2>
    <p class="mute" style="font-size:12px;margin-bottom:16px">Mark as done — enter when it was completed</p>
    <form id="done-form" class="form-stack">
      <div>
        <label class="micro">Date completed</label>
        <input type="date" name="done_date" value="${today}" required autocomplete="off">
      </div>
      <div>
        <label class="micro">Odometer at time (km)</label>
        <input type="number" name="done_km" inputmode="decimal" value="${lastOdometer ?? ''}" placeholder="optional" autocomplete="off" style="font-size:19px;font-weight:600">
      </div>
      <div>
        <label class="micro">Cost (€)</label>
        <input type="number" name="cost" inputmode="decimal" step="0.01" placeholder="0.00" autocomplete="off">
      </div>
      <div>
        <label class="micro">Notes (optional)</label>
        <input type="text" name="notes" placeholder="" autocomplete="off">
      </div>
      ${modalFooter('Cancel', 'Mark as done')}
    </form>
  `)

  document.getElementById('done-form').addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const btn = document.getElementById('modal-submit')
    btn.textContent = 'Saving…'
    btn.disabled = true

    const doneDate = fd.get('done_date')
    const doneKm = fd.get('done_km') ? parseFloat(fd.get('done_km')) : null
    const cost = fd.get('cost') ? parseFloat(fd.get('cost')) : 0
    const notes = fd.get('notes') || null

    try {
      await updateScheduleItem(item.id, { last_done_date: doneDate, last_done_km: doneKm })
    } catch (err) {
      showToast(err.message, 'error')
      btn.textContent = 'Mark as done'
      btn.disabled = false
      return
    }

    let costWarning = null
    if (cost > 0 || notes) {
      try {
        await addCost('maintenance', carId, {
          date: doneDate, odometer_km: doneKm, category: item.item_name,
          description: item.item_name, cost, notes, currency: 'EUR',
        })
      } catch (err) {
        costWarning = err.message
      }
    }

    closeModal()
    showToast(costWarning
      ? `${item.item_name} marked done — but the log entry failed: ${costWarning}. Add it in Costs.`
      : `${item.item_name} marked as done`, costWarning ? 'error' : undefined)
    route()
  })
}

async function renderCarHistory(container, epoch) {
  let allCars
  try {
    allCars = await getCars()
  } catch (err) {
    return
  }
  if (isStale(epoch)) return

  const sold = allCars.filter(c => c.status === 'sold')
  if (sold.length === 0) return

  const histEl = document.createElement('div')
  histEl.className = 'section'
  histEl.innerHTML = `<div class="dim-line"><span class="micro">Vehicle history</span></div>`

  sold.forEach(car => {
    const netLoss = (car.purchase_price && car.sell_price)
      ? car.sell_price - car.purchase_price : null
    const currency = car.purchase_currency || 'EUR'

    histEl.innerHTML += `
      <div class="card" style="margin-bottom:8px;opacity:0.75">
        <div class="row-between" style="margin-bottom:10px">
          <div>
            <p style="font-size:13px;font-weight:600">${esc(car.make)} ${esc(car.model)} <span class="mute num">${car.year}</span></p>
            <p class="mute num" style="font-size:11px;margin-top:1px">${esc(car.purchase_date ?? '?')} — ${esc(car.sell_date ?? '?')}${car.operating_country ? ' · ' + esc(car.operating_country) : ''}</p>
          </div>
          <span class="pill pill--muted">SOLD</span>
        </div>
        <div class="ledger-cols" style="border-top:var(--hairline);padding-top:8px;margin-top:0">
          <div><p class="micro">Bought</p><p class="num">${currency} ${car.purchase_price != null ? Number(car.purchase_price).toLocaleString() : '—'}</p></div>
          <div><p class="micro">Sold</p><p class="num">${currency} ${car.sell_price != null ? Number(car.sell_price).toLocaleString() : '—'}</p></div>
          <div><p class="micro">Net</p><p class="num" style="color:${netLoss != null && netLoss < 0 ? 'var(--danger)' : 'var(--ok)'}">${netLoss != null ? `${netLoss >= 0 ? '+' : ''}${netLoss.toLocaleString()}` : '—'}</p></div>
        </div>
      </div>
    `
  })

  container.appendChild(histEl)
}
