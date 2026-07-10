import { getAllCosts, addCost, deleteCost } from '../../data/costs-repo.js'
import { getFuelTotal } from '../../data/fuel-repo.js'
import { costDate, sumCosts, groupCostsByMonth, totalCostOfOwnership } from '../../domain/costs.js'
import { esc, fmtMoney, daysBetween } from '../../domain/format.js'
import { isStale, route } from '../../core/router.js'
import { renderCarHeader } from '../components/car-header.js'
import { openModal, closeModal, modalHandle, modalFooter } from '../components/modal.js'
import { showToast } from '../components/toast.js'

const TYPE_META = {
  maintenance:  { label: 'Repairs',      code: 'RP', color: '#5A8DC8' },
  supplies:     { label: 'Supplies',     code: 'SP', color: '#58B573' },
  insurance:    { label: 'Insurance',    code: 'IN', color: '#8B7BC8' },
  registration: { label: 'Registration', code: 'RG', color: '#C87BA8' },
  other:        { label: 'Other',        code: 'OT', color: '#5E7186' },
}
const FUEL_COLOR = '#E8A33D'

// Filter selection remembered per car — never leaks across cars.
const filterByCar = new Map()

export async function render(container, state, epoch) {
  if (!state.activeCar) return
  const carId = state.activeCar.id
  const activeFilter = filterByCar.get(carId) ?? 'all'

  container.innerHTML = ''
  renderCarHeader(container, { title: 'Costs' })

  const loadingEl = document.createElement('div')
  loadingEl.className = 'section'
  loadingEl.innerHTML = Array(3).fill('<div class="skeleton" style="height:84px;margin-bottom:10px"></div>').join('')
  container.appendChild(loadingEl)

  let costs, fuelTotal
  try {
    ;[costs, fuelTotal] = await Promise.all([getAllCosts(carId), getFuelTotal(carId)])
  } catch (err) {
    if (!isStale(epoch)) showToast('Failed to load costs', 'error')
    return
  }
  if (isStale(epoch)) return
  loadingEl.remove()

  const car = state.activeCar
  const purchase = Number(car.purchase_price) || 0
  const totalCoo = totalCostOfOwnership({
    purchasePrice: purchase,
    fuelTotal,
    costsTotal: sumCosts(costs),
  })

  // Proportional segments (fuel + each category; purchase excluded from bar)
  const segments = [
    { label: 'Fuel', color: FUEL_COLOR, value: fuelTotal },
    ...Object.entries(TYPE_META).map(([type, meta]) => ({
      label: meta.label, color: meta.color, value: sumCosts(costs.filter(c => c._type === type)),
    })),
  ].filter(s => s.value > 0)
  const segTotal = segments.reduce((s, x) => s + x.value, 0)

  const summaryEl = document.createElement('div')
  summaryEl.className = 'section'
  summaryEl.innerHTML = `
    <div class="card card--plate">
      <p class="micro">Total cost of ownership</p>
      <p class="num" style="font-size:28px;font-weight:600;margin-top:4px">${fmtMoney(totalCoo)}</p>
      <p class="mute num" style="font-size:11px;margin-top:2px">purchase ${fmtMoney(purchase, { decimals: 0 })} + running ${fmtMoney(totalCoo - purchase, { decimals: 0 })} · since ${car.purchase_date ?? '—'}</p>
      ${segTotal > 0 ? `
      <div class="coo-bar">
        ${segments.map(s => `<div style="width:${(s.value / segTotal * 100).toFixed(2)}%;background:${s.color}"></div>`).join('')}
      </div>
      <div class="coo-legend">
        ${segments.map(s => `<span class="key"><span class="sw" style="background:${s.color}"></span>${s.label}</span>`).join('')}
      </div>` : ''}
    </div>
    <div class="card" style="margin-top:10px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 14px">
        ${[['Fuel', 'FU', FUEL_COLOR, fuelTotal], ...Object.entries(TYPE_META).map(([type, meta]) =>
          [meta.label, meta.code, meta.color, sumCosts(costs.filter(c => c._type === type))])]
          .map(([label, code, color, total]) => `
          <div class="row" style="gap:8px">
            <span class="num" style="width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border:1px solid ${color};color:${color};font-size:9px;border-radius:var(--r);flex-shrink:0">${code}</span>
            <div style="min-width:0">
              <p class="micro">${label}</p>
              <p class="num" style="font-size:13px;font-weight:600">${fmtMoney(total)}</p>
            </div>
          </div>`).join('')}
      </div>
    </div>
  `
  container.appendChild(summaryEl)

  const filterEl = document.createElement('div')
  filterEl.className = 'section scroll-x'
  filterEl.innerHTML = `
    <div class="chip-row">
      <button class="chip filter-btn ${activeFilter === 'all' ? 'chip--active' : ''}" data-filter="all">All</button>
      ${Object.entries(TYPE_META).map(([type, meta]) =>
        `<button class="chip filter-btn ${activeFilter === type ? 'chip--active' : ''}" data-filter="${type}">${meta.label}</button>`
      ).join('')}
    </div>
  `
  container.appendChild(filterEl)

  filterEl.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      filterByCar.set(carId, btn.dataset.filter)
      route()
    })
  })

  const listEl = document.createElement('div')
  listEl.className = 'section'

  const filtered = activeFilter === 'all' ? costs : costs.filter(c => c._type === activeFilter)

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-note">No entries yet. Tap + to add one.</div>`
  } else {
    groupCostsByMonth(filtered).forEach(group => {
      const [gy, gm] = group.key.split('-').map(Number)
      const d = new Date(gy, gm - 1, 1)
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' })

      listEl.innerHTML += `<div class="dim-line"><span class="micro">${label}</span><span class="micro num" style="color:var(--ink)">${fmtMoney(group.total)}</span></div>`

      group.items.forEach(cost => {
        const meta = TYPE_META[cost._type]
        const label = cost.description || cost.item || cost.provider || cost.category || meta.label

        let subtitle = costDate(cost) || '—'
        if (cost._type === 'insurance' && cost.end_date) {
          const months = Math.max(1, Math.round(daysBetween(cost.start_date, cost.end_date) / 30.44))
          subtitle += ` — ${cost.end_date} · ≈ ${fmtMoney(Number(cost.cost) / months)}/mo`
        }

        listEl.innerHTML += `
          <div class="card row" style="margin-bottom:8px">
            <span class="num" style="width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;border:1px solid ${meta.color};color:${meta.color};font-size:9px;border-radius:var(--r);flex-shrink:0">${meta.code}</span>
            <div style="flex:1;min-width:0">
              <p style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label)}</p>
              <p class="mute num" style="font-size:11px">${esc(subtitle)}</p>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <p class="num" style="font-weight:600">${fmtMoney(cost.cost)}</p>
              <button data-id="${cost.id}" data-type="${cost._type}" class="delete-cost-btn btn--danger-text">DELETE</button>
            </div>
          </div>
        `
      })
    })
  }

  container.appendChild(listEl)

  container.querySelectorAll('.delete-cost-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this cost entry?')) return
      btn.disabled = true
      try {
        await deleteCost(btn.dataset.type, parseInt(btn.dataset.id))
        showToast('Deleted')
        route()
      } catch (err) {
        showToast(err.message, 'error')
        btn.disabled = false
      }
    })
  })

  window.__openAddModal = () => openAddCostModal(state, route)
}

function openAddCostModal(state, onSaved) {
  const today = new Date().toISOString().slice(0, 10)
  openModal(`
    ${modalHandle()}
    <h2 class="modal-title">Add cost</h2>
    <div class="scroll-x" style="margin-bottom:14px">
      <div class="chip-row">
        ${Object.entries(TYPE_META).map(([type, meta], i) =>
          `<button type="button" class="chip type-btn ${i === 0 ? 'chip--active' : ''}" data-type="${type}">${meta.label}</button>`
        ).join('')}
      </div>
    </div>
    <form id="cost-form" class="form-stack">
      <input type="hidden" name="cost_type" value="maintenance">
      <div>
        <label class="micro">Date</label>
        <input type="date" name="date" value="${today}" required autocomplete="off">
      </div>
      <div>
        <label class="micro">Description</label>
        <input type="text" name="description" placeholder="Front brake pads" required autocomplete="off">
      </div>
      <div id="end-date-field" style="display:none">
        <label class="micro">Coverage until (optional)</label>
        <input type="date" name="end_date" autocomplete="off">
      </div>
      <div>
        <label class="micro">Cost (€)</label>
        <input type="number" name="cost" inputmode="decimal" step="0.01" placeholder="0.00" required autocomplete="off" style="font-size:19px;font-weight:600">
      </div>
      <div id="odometer-field">
        <label class="micro">Odometer (km)</label>
        <input type="number" name="odometer_km" inputmode="decimal" placeholder="optional" autocomplete="off">
      </div>
      <div>
        <label class="micro">Notes (optional)</label>
        <input type="text" name="notes" placeholder="" autocomplete="off">
      </div>
      ${modalFooter('Cancel', 'Save cost')}
    </form>
  `)

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('chip--active'))
      btn.classList.add('chip--active')
      document.querySelector('[name="cost_type"]').value = btn.dataset.type

      const odoField = document.getElementById('odometer-field')
      if (odoField) odoField.style.display = btn.dataset.type === 'maintenance' ? '' : 'none'
      document.getElementById('end-date-field').style.display = btn.dataset.type === 'insurance' ? '' : 'none'
    })
  })

  document.getElementById('cost-form').addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const type = fd.get('cost_type')
    const btn = document.getElementById('modal-submit')
    btn.textContent = 'Saving…'
    btn.disabled = true

    const payload = {
      cost: parseFloat(fd.get('cost')),
      currency: 'EUR',
      notes: fd.get('notes') || null,
    }

    // Map field names to table column names.
    // insurance_records uses start_date (no `date` column); all others use `date`.
    const date = fd.get('date')
    const desc = fd.get('description')
    if (type === 'maintenance')  { payload.date = date; payload.description = desc; const o = fd.get('odometer_km'); if (o) payload.odometer_km = parseFloat(o) }
    if (type === 'supplies')     { payload.date = date; payload.item = desc }
    if (type === 'insurance')    { payload.start_date = date; payload.provider = desc; payload.end_date = fd.get('end_date') || null }
    if (type === 'registration') { payload.date = date; payload.description = desc }
    if (type === 'other')        { payload.date = date; payload.description = desc }

    try {
      await addCost(type, state.activeCar.id, payload)
      closeModal()
      showToast('Cost saved')
      onSaved()
    } catch (err) {
      showToast(err.message, 'error')
      btn.textContent = 'Save cost'
      btn.disabled = false
    }
  })
}
