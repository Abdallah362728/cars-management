import { getAllCosts, addCost, deleteCost } from '../../data/costs-repo.js'
import { getFuelTotal } from '../../data/fuel-repo.js'
import { costDate, sumCosts, groupCostsByMonth, totalCostOfOwnership } from '../../domain/costs.js'
import { esc, fmtMoney } from '../../domain/format.js'
import { isStale, route } from '../../core/router.js'
import { renderCarHeader } from '../components/car-header.js'
import { openModal, closeModal, modalHandle, modalFooter } from '../components/modal.js'
import { showToast } from '../components/toast.js'

const TYPE_META = {
  maintenance:  { label: 'Repair',       emoji: '🔧' },
  supplies:     { label: 'Supply',       emoji: '📦' },
  insurance:    { label: 'Insurance',    emoji: '🛡️' },
  registration: { label: 'Registration', emoji: '📋' },
  other:        { label: 'Other',        emoji: '📌' },
}

// Filter selection remembered per car — never leaks across cars.
const filterByCar = new Map()

export async function render(container, state, epoch) {
  if (!state.activeCar) return
  const carId = state.activeCar.id
  const activeFilter = filterByCar.get(carId) ?? 'all'

  container.innerHTML = ''
  renderCarHeader(container, { title: 'Costs' })

  const loadingEl = document.createElement('div')
  loadingEl.className = 'px-4 space-y-3'
  loadingEl.innerHTML = Array(3).fill('<div class="skeleton h-20 rounded-2xl"></div>').join('')
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
  const totalCoo = totalCostOfOwnership({
    purchasePrice: car.purchase_price,
    fuelTotal,
    costsTotal: sumCosts(costs),
  })

  const summaryEl = document.createElement('div')
  summaryEl.className = 'px-4 mb-3'
  summaryEl.innerHTML = `
    <div class="card mb-3">
      <p class="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Total Cost of Ownership</p>
      <p class="text-white text-3xl font-black tracking-tight">${fmtMoney(totalCoo)}</p>
      <p class="text-slate-500 text-xs mt-1">Purchase + fuel + all costs · since ${car.purchase_date ?? '—'}</p>
    </div>
    <div class="card">
      <div class="grid grid-cols-2 gap-3">
        <div class="flex items-center gap-2">
          <span class="text-base">⛽</span>
          <div class="flex-1 min-w-0">
            <p class="text-slate-500 text-[10px] uppercase">Fuel</p>
            <p class="text-white text-sm font-semibold">${fmtMoney(fuelTotal)}</p>
          </div>
        </div>
        ${Object.entries(TYPE_META).map(([type, meta]) => {
          const t = sumCosts(costs.filter(c => c._type === type))
          return `<div class="flex items-center gap-2">
            <span class="text-base">${meta.emoji}</span>
            <div class="flex-1 min-w-0">
              <p class="text-slate-500 text-[10px] uppercase">${meta.label}</p>
              <p class="text-white text-sm font-semibold">${fmtMoney(t)}</p>
            </div>
          </div>`
        }).join('')}
      </div>
    </div>
  `
  container.appendChild(summaryEl)

  const filterEl = document.createElement('div')
  filterEl.className = 'px-4 mb-3 overflow-x-auto'
  filterEl.innerHTML = `
    <div class="flex gap-2 pb-1" style="width:max-content">
      <button class="filter-btn px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${activeFilter === 'all' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}" data-filter="all">All</button>
      ${Object.entries(TYPE_META).map(([type, meta]) =>
        `<button class="filter-btn px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${activeFilter === type ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}" data-filter="${type}">${meta.emoji} ${meta.label}</button>`
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
  listEl.className = 'px-4'

  const filtered = activeFilter === 'all' ? costs : costs.filter(c => c._type === activeFilter)

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="text-center py-10 text-slate-600 text-sm">No entries yet. Tap + to add one.</div>`
  } else {
    groupCostsByMonth(filtered).forEach(group => {
      const d = new Date(group.key + '-01')
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' })

      listEl.innerHTML += `<div class="flex justify-between items-center mb-2">
        <span class="section-label">${label}</span>
        <span class="text-slate-500 text-xs">${fmtMoney(group.total)}</span>
      </div>`

      group.items.forEach(cost => {
        const meta = TYPE_META[cost._type]
        const label = cost.description || cost.item || cost.provider || cost.category || meta.label

        listEl.innerHTML += `
          <div class="card flex items-center gap-3 mb-2">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base" style="background:rgba(100,116,139,0.15)">${meta.emoji}</div>
            <div class="flex-1 min-w-0">
              <p class="text-white text-sm font-semibold truncate">${esc(label)}</p>
              <p class="text-slate-500 text-xs">${esc(costDate(cost) || '—')}</p>
            </div>
            <div class="text-right flex-shrink-0">
              <p class="text-white font-bold">${fmtMoney(cost.cost)}</p>
              <button data-id="${cost.id}" data-type="${cost._type}" class="delete-cost-btn text-red-400/50 text-[10px] hover:text-red-400">Delete</button>
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
      try {
        await deleteCost(btn.dataset.type, parseInt(btn.dataset.id))
        showToast('Deleted')
        route()
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  })

  window.__openAddModal = () => openAddCostModal(state, route)
}

function openAddCostModal(state, onSaved) {
  const today = new Date().toISOString().slice(0, 10)
  openModal(`
    ${modalHandle()}
    <h2 class="text-white text-lg font-bold mb-4">Add Cost</h2>
    <div class="flex gap-2 overflow-x-auto pb-3 mb-4">
      ${Object.entries(TYPE_META).map(([type, meta], i) =>
        `<button type="button" class="type-btn flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${i === 0 ? 'bg-blue-500 text-white border-transparent' : 'bg-slate-900 text-slate-400 border-slate-700'}" data-type="${type}">${meta.emoji} ${meta.label}</button>`
      ).join('')}
    </div>
    <form id="cost-form" class="space-y-4">
      <input type="hidden" name="cost_type" value="maintenance">
      <div>
        <label class="section-label">Date</label>
        <input type="date" name="date" value="${today}" required autocomplete="off">
      </div>
      <div>
        <label class="section-label">Description</label>
        <input type="text" name="description" placeholder="e.g. Front brake pads" required autocomplete="off">
      </div>
      <div>
        <label class="section-label">Cost (€)</label>
        <input type="number" name="cost" inputmode="decimal" step="0.01" placeholder="0.00" required autocomplete="off" style="font-size:20px;font-weight:700;">
      </div>
      <div id="odometer-field">
        <label class="section-label">Odometer (km)</label>
        <input type="number" name="odometer_km" inputmode="decimal" placeholder="optional" autocomplete="off">
      </div>
      <div>
        <label class="section-label">Notes (optional)</label>
        <input type="text" name="notes" placeholder="" autocomplete="off">
      </div>
      ${modalFooter('Cancel', 'Save Cost')}
    </form>
  `)

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => {
        b.className = b.className.replace('bg-blue-500 text-white border-transparent', 'bg-slate-900 text-slate-400 border-slate-700')
      })
      btn.className = btn.className.replace('bg-slate-900 text-slate-400 border-slate-700', 'bg-blue-500 text-white border-transparent')
      document.querySelector('[name="cost_type"]').value = btn.dataset.type

      const odoField = document.getElementById('odometer-field')
      if (odoField) odoField.style.display = btn.dataset.type === 'maintenance' ? '' : 'none'
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
    if (type === 'insurance')    { payload.start_date = date; payload.provider = desc }
    if (type === 'registration') { payload.date = date; payload.description = desc }
    if (type === 'other')        { payload.date = date; payload.description = desc }

    try {
      await addCost(type, state.activeCar.id, payload)
      closeModal()
      showToast('Cost saved!')
      onSaved()
    } catch (err) {
      showToast(err.message, 'error')
      btn.textContent = 'Save Cost'
      btn.disabled = false
    }
  })
}
