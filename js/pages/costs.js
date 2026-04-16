import { getAllCosts, addCost, deleteCost, esc } from '../api.js'
import { renderCarHeader } from '../app.js'
import { openModal, closeModal, modalHandle, modalFooter } from '../components/modal.js'
import { showToast } from '../components/toast.js'

const TYPE_META = {
  maintenance:  { label: 'Repair',       emoji: '🔧', color: 'purple' },
  supplies:     { label: 'Supply',        emoji: '📦', color: 'blue'   },
  insurance:    { label: 'Insurance',     emoji: '🛡️',  color: 'amber'  },
  registration: { label: 'Registration',  emoji: '📋', color: 'amber'  },
  other:        { label: 'Other',         emoji: '📌', color: 'slate'  },
}

let activeFilter = 'all'

export async function render(container, state) {
  if (!state.activeCar) return

  container.innerHTML = ''
  renderCarHeader(container, { title: 'Costs', onSwitch: () => render(container, state) })

  const loadingEl = document.createElement('div')
  loadingEl.className = 'px-4 space-y-3'
  loadingEl.innerHTML = Array(3).fill('<div class="skeleton h-20 rounded-2xl"></div>').join('')
  container.appendChild(loadingEl)

  let costs
  try {
    costs = await getAllCosts(state.activeCar.id)
  } catch (err) {
    showToast('Failed to load costs', 'error')
    return
  }
  loadingEl.remove()

  // Totals
  const car = state.activeCar
  const totalFuelCost = 0       // not in costs table, comes from fuel_logs — show separately
  const totalAll = costs.reduce((s, c) => s + (Number(c.cost) || 0), 0)
  const totalCoo = (car.purchase_price || 0) + totalAll

  const summaryEl = document.createElement('div')
  summaryEl.className = 'px-4 mb-3'
  summaryEl.innerHTML = `
    <div class="card mb-3">
      <p class="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Total Cost of Ownership</p>
      <p class="text-white text-3xl font-black tracking-tight">€${totalCoo.toFixed(2)}</p>
      <p class="text-slate-500 text-xs mt-1">Since ${car.purchase_date ?? '—'}</p>
    </div>
    <div class="card">
      <div class="grid grid-cols-2 gap-3">
        ${Object.entries(TYPE_META).map(([type, meta]) => {
          const t = costs.filter(c => c._type === type).reduce((s, c) => s + (Number(c.cost) || 0), 0)
          return `<div class="flex items-center gap-2">
            <span class="text-base">${meta.emoji}</span>
            <div class="flex-1 min-w-0">
              <p class="text-slate-500 text-[10px] uppercase">${meta.label}</p>
              <p class="text-white text-sm font-semibold">€${t.toFixed(2)}</p>
            </div>
          </div>`
        }).join('')}
      </div>
    </div>
  `
  container.appendChild(summaryEl)

  // Filter tabs
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
      activeFilter = btn.dataset.filter
      render(container, state)
    })
  })

  // Entries list
  const listEl = document.createElement('div')
  listEl.className = 'px-4'

  const filtered = activeFilter === 'all' ? costs : costs.filter(c => c._type === activeFilter)

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="text-center py-10 text-slate-600 text-sm">No entries yet. Tap + to add one.</div>`
  } else {
    // Group by month
    const groups = {}
    filtered.forEach(c => {
      const key = (c.date || c.start_date || '').slice(0, 7)
      if (!groups[key]) groups[key] = []
      groups[key].push(c)
    })

    Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0])).forEach(([key, entries]) => {
      const d = new Date(key + '-01')
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' })
      const monthTotal = entries.reduce((s, c) => s + (Number(c.cost) || 0), 0)

      listEl.innerHTML += `<div class="flex justify-between items-center mb-2">
        <span class="section-label">${label}</span>
        <span class="text-slate-500 text-xs">€${monthTotal.toFixed(2)}</span>
      </div>`

      entries.forEach(cost => {
        const meta = TYPE_META[cost._type]
        const label = cost.description || cost.item || cost.category || meta.label
        const date  = cost.date || cost.start_date || '—'

        listEl.innerHTML += `
          <div class="card flex items-center gap-3 mb-2">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base" style="background:rgba(100,116,139,0.15)">${meta.emoji}</div>
            <div class="flex-1 min-w-0">
              <p class="text-white text-sm font-semibold truncate">${esc(label)}</p>
              <p class="text-slate-500 text-xs">${esc(date)}</p>
            </div>
            <div class="text-right flex-shrink-0">
              <p class="text-white font-bold">€${Number(cost.cost).toFixed(2)}</p>
              <button data-id="${cost.id}" data-type="${cost._type}" class="delete-cost-btn text-red-400/50 text-[10px] hover:text-red-400">Delete</button>
            </div>
          </div>
        `
      })
    })
  }

  container.appendChild(listEl)

  // Delete handlers
  container.querySelectorAll('.delete-cost-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this cost entry?')) return
      try {
        await deleteCost(btn.dataset.type, parseInt(btn.dataset.id))
        showToast('Deleted')
        render(container, state)
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  })

  // FAB → add cost
  window.__openAddModal = () => openAddCostModal(state, () => render(container, state))
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

  // Type switcher
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => {
        b.className = b.className.replace('bg-blue-500 text-white border-transparent', 'bg-slate-900 text-slate-400 border-slate-700')
      })
      btn.className = btn.className.replace('bg-slate-900 text-slate-400 border-slate-700', 'bg-blue-500 text-white border-transparent')
      document.querySelector('[name="cost_type"]').value = btn.dataset.type

      // Show/hide odometer field (maintenance only)
      const odoField = document.getElementById('odometer-field')
      if (odoField) odoField.style.display = btn.dataset.type === 'maintenance' ? '' : 'none'
    })
  })

  document.getElementById('cost-form').addEventListener('submit', async e => {
    e.preventDefault()
    const fd   = new FormData(e.target)
    const type = fd.get('cost_type')
    const btn  = document.getElementById('modal-submit')
    btn.textContent = 'Saving…'
    btn.disabled = true

    const payload = {
      cost:        parseFloat(fd.get('cost')),
      currency:    'EUR',
      notes:       fd.get('notes') || null,
    }

    // Map field names to table column names
    // insurance_records uses start_date (no `date` column); all other tables use `date`.
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
