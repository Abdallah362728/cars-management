import { getCars, updateCar, addCar } from '../../data/cars-repo.js'
import { getFuelLogsRaw, updateFuelLog, deleteFuelLog } from '../../data/fuel-repo.js'
import { getCostsByType, updateCost, deleteCost } from '../../data/costs-repo.js'
import { getSchedule, updateScheduleItem, addScheduleItem, deleteScheduleItem } from '../../data/maintenance-repo.js'
import { setCars, setActiveCar } from '../../core/state.js'
import { esc, fmtMoney, fmtNum } from '../../domain/format.js'
import { isStale, route } from '../../core/router.js'
import { openModal, closeModal, modalHandle, modalFooter, tankToggleField, setupTankToggle } from '../components/modal.js'
import { showToast } from '../components/toast.js'

const ENTITIES = {
  fuel:         { label: 'Fuel' },
  maintenance:  { label: 'Maintenance' },
  supplies:     { label: 'Supplies' },
  insurance:    { label: 'Insurance' },
  registration: { label: 'Registration' },
  other:        { label: 'Other' },
  schedule:     { label: 'Schedule' },
}
let activeEntity = 'fuel'   // survives route() re-renders via module cache

const numOrNull  = (fd, n) => { const v = fd.get(n); return v === null || v === '' ? null : parseFloat(v) }
const intOrNull  = (fd, n) => { const v = fd.get(n); return v === null || v === '' ? null : parseInt(v, 10) }
const strOrNull  = (fd, n) => { const v = (fd.get(n) ?? '').trim(); return v || null }
const dateOrNull = (fd, n) => fd.get(n) || null
const currencyOf = fd => ((fd.get('currency') ?? '').trim() || 'EUR').toUpperCase()

function textField(label, name, value, { required = false, placeholder = '' } = {}) {
  return `<div>
    <label class="micro">${label}</label>
    <input type="text" name="${name}" value="${esc(value ?? '')}" placeholder="${placeholder}" ${required ? 'required' : ''} autocomplete="off">
  </div>`
}
function numField(label, name, value, { required = false, step = 'any' } = {}) {
  return `<div>
    <label class="micro">${label}</label>
    <input type="number" name="${name}" inputmode="decimal" step="${step}" value="${value ?? ''}" ${required ? 'required' : ''} autocomplete="off">
  </div>`
}
function dateField(label, name, value, { required = false } = {}) {
  return `<div>
    <label class="micro">${label}</label>
    <input type="date" name="${name}" value="${String(value ?? '').slice(0, 10)}" ${required ? 'required' : ''} autocomplete="off">
  </div>`
}

export async function render(container, state, epoch) {
  container.innerHTML = ''

  const header = document.createElement('div')
  header.className = 'page-title'
  header.innerHTML = `
    <p class="micro" style="margin-bottom:3px">App</p>
    <h1>Settings</h1>
    <p class="mute" style="font-size:12px;margin-top:2px">Cars & data editor</p>
  `
  container.appendChild(header)

  renderCarsSection(container, state)
  await renderDataSection(container, state, epoch)
}

function renderCarsSection(container, state) {
  const el = document.createElement('div')
  el.className = 'section'
  el.innerHTML = `<div class="dim-line"><span class="micro">Cars</span></div>`

  if (state.cars.length === 0) {
    el.innerHTML += `<div class="empty-note">No cars yet. Add your first car below.</div>`
  } else {
    state.cars.forEach((car, i) => {
      const pill = car.status === 'active' ? 'pill--ok' : car.status === 'stored' ? 'pill--warn' : 'pill--muted'
      el.innerHTML += `
        <div class="card row-between" style="margin-bottom:8px">
          <div style="min-width:0">
            <p style="font-size:13px;font-weight:600">${esc(car.make)} ${esc(car.model)} <span class="mute num">${car.year ?? ''}</span></p>
            <p class="mute num" style="font-size:11px;margin-top:1px">${esc(car.purchase_date ?? '—')}${car.operating_country ? ' · ' + esc(car.operating_country) : ''}</p>
          </div>
          <div class="row" style="gap:8px;flex-shrink:0">
            <span class="pill ${pill}">${esc(String(car.status ?? '').toUpperCase())}</span>
            <button class="edit-car-btn btn btn--micro" data-idx="${i}">EDIT</button>
          </div>
        </div>
      `
    })
  }

  el.innerHTML += `<button id="add-car-btn" class="btn btn--ghost" style="width:100%">+ Add car</button>`
  container.appendChild(el)

  el.querySelectorAll('.edit-car-btn').forEach(btn => {
    btn.addEventListener('click', () => openCarModal(state.cars[Number(btn.dataset.idx)], state))
  })
  el.querySelector('#add-car-btn').addEventListener('click', () => openCarModal(null, state))
}

function openCarModal(car, state) {
  const isEdit = !!car
  openModal(`
    ${modalHandle()}
    <h2 class="modal-title">${isEdit ? 'Edit car' : 'Add car'}</h2>
    <form id="car-form" class="form-stack">
      <div class="form-row">
        ${textField('Make', 'make', car?.make, { required: true, placeholder: 'Toyota' })}
        ${textField('Model', 'model', car?.model, { required: true, placeholder: 'Corolla' })}
      </div>
      <div class="form-row">
        ${numField('Year', 'year', car?.year, { required: true, step: '1' })}
        <div>
          <label class="micro">Status</label>
          <select name="status" required>
            <option value="active" ${(car?.status ?? 'active') === 'active' ? 'selected' : ''}>Active</option>
            <option value="sold" ${car?.status === 'sold' ? 'selected' : ''}>Sold</option>
            <option value="stored" ${car?.status === 'stored' ? 'selected' : ''}>Stored</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        ${dateField('Purchase date', 'purchase_date', car?.purchase_date)}
        ${numField('Purchase price', 'purchase_price', car?.purchase_price)}
      </div>
      <div class="form-row">
        ${dateField('Sell date', 'sell_date', car?.sell_date)}
        ${numField('Sell price', 'sell_price', car?.sell_price)}
      </div>
      ${numField('Current market value', 'current_market_value', car?.current_market_value)}
      <div class="form-row">
        ${numField('Factory fuel spec (L/100km)', 'factory_fuel_spec', car?.factory_fuel_spec)}
        ${numField('Tank capacity (L)', 'tank_capacity_l', car?.tank_capacity_l)}
      </div>
      <div class="form-row">
        ${textField('Currency', 'currency', car?.purchase_currency ?? 'EUR')}
        ${textField('Operating country', 'operating_country', car?.operating_country, { placeholder: 'DE' })}
      </div>
      ${textField('Notes (optional)', 'notes', car?.notes)}
      ${modalFooter('Cancel', isEdit ? 'Save car' : 'Add car')}
    </form>
  `)

  document.getElementById('car-form').addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const btn = document.getElementById('modal-submit')
    btn.textContent = 'Saving…'
    btn.disabled = true

    const payload = {
      make: fd.get('make').trim(),
      model: fd.get('model').trim(),
      year: parseInt(fd.get('year'), 10),
      status: fd.get('status'),
      purchase_date: dateOrNull(fd, 'purchase_date'),
      purchase_price: numOrNull(fd, 'purchase_price'),
      purchase_currency: currencyOf(fd),
      sell_date: dateOrNull(fd, 'sell_date'),
      sell_price: numOrNull(fd, 'sell_price'),
      current_market_value: numOrNull(fd, 'current_market_value'),
      factory_fuel_spec: numOrNull(fd, 'factory_fuel_spec'),
      tank_capacity_l: numOrNull(fd, 'tank_capacity_l'),
      operating_country: strOrNull(fd, 'operating_country'),
      notes: strOrNull(fd, 'notes'),
    }

    try {
      if (isEdit) await updateCar(car.id, payload)
      else await addCar(payload)
      await refreshCarsState(state)
      closeModal()
      showToast(isEdit ? 'Car updated' : 'Car added')
      route()
    } catch (err) {
      showToast(err.message, 'error')
      btn.textContent = isEdit ? 'Save car' : 'Add car'
      btn.disabled = false
    }
  })
}

async function refreshCarsState(state) {
  const prevId = state.activeCar?.id ?? null
  setCars(await getCars())
  setActiveCar(
    state.cars.find(c => c.id === prevId)
    ?? state.cars.find(c => c.status === 'active')
    ?? state.cars[0]
    ?? null
  )
}

async function fetchRows(type, carId) {
  if (type === 'fuel') return (await getFuelLogsRaw(carId)).slice().reverse()  // repo is asc → newest first
  if (type === 'schedule') return getSchedule(carId)                            // ordered by id
  return getCostsByType(carId, type)
}
function updateRow(type, id, updates) {
  if (type === 'fuel') return updateFuelLog(id, updates)
  if (type === 'schedule') return updateScheduleItem(id, updates)
  return updateCost(type, id, updates)
}
function deleteRow(type, id) {
  if (type === 'fuel') return deleteFuelLog(id)
  if (type === 'schedule') return deleteScheduleItem(id)
  return deleteCost(type, id)
}

function rowSummary(type, row) {
  if (type === 'fuel') {
    return {
      title: esc(`${row.date ?? '—'} · ${fmtNum(row.liters, 2)} L${row.is_full_tank === false ? ' · partial' : ''}`),
      sub: esc(`ODO ${row.odometer_km != null ? Number(row.odometer_km).toLocaleString() : '—'} KM`),
      amount: fmtMoney(row.total_cost),
    }
  }
  if (type === 'maintenance') {
    return { title: esc(row.description || row.category || 'Maintenance'), sub: esc(row.date ?? '—'), amount: fmtMoney(row.cost) }
  }
  if (type === 'supplies') {
    return { title: esc(row.item || 'Supply'), sub: esc(row.date ?? '—'), amount: fmtMoney(row.cost) }
  }
  if (type === 'insurance') {
    return { title: esc(row.provider || 'Insurance'), sub: esc(`${row.start_date ?? '—'} → ${row.end_date ?? '—'}`), amount: fmtMoney(row.cost) }
  }
  if (type === 'registration') {
    return { title: esc(row.description || 'Registration'), sub: esc(row.date ?? '—'), amount: fmtMoney(row.cost) }
  }
  if (type === 'other') {
    return { title: esc(row.description || row.category || 'Other'), sub: esc(row.date ?? '—'), amount: fmtMoney(row.cost) }
  }
  // schedule
  let interval = ''
  if (row.interval_km) interval += `EVERY ${Number(row.interval_km).toLocaleString()} KM`
  if (row.interval_months) interval += (interval ? ' / ' : 'EVERY ') + `${row.interval_months} MO`
  if (row.last_done_date) interval += ` · DONE ${row.last_done_date}`
  return { title: esc(row.item_name), sub: esc(interval || '—'), amount: '' }
}

async function renderDataSection(container, state, epoch) {
  const el = document.createElement('div')
  el.className = 'section'
  el.innerHTML = `<div class="dim-line"><span class="micro">Data editor${state.activeCar ? ` — ${esc(state.activeCar.make)} ${esc(state.activeCar.model)}` : ''}</span></div>`
  container.appendChild(el)

  if (!state.activeCar) {
    el.innerHTML += `<div class="empty-note">No active car — add a car above first.</div>`
    return
  }

  el.innerHTML += `
    <div class="scroll-x" style="margin-bottom:12px">
      <div class="chip-row">
        ${Object.entries(ENTITIES).map(([key, meta]) =>
          `<button class="chip entity-btn ${key === activeEntity ? 'chip--active' : ''}" data-entity="${key}">${meta.label}</button>`
        ).join('')}
      </div>
    </div>
  `
  el.querySelectorAll('.entity-btn').forEach(btn => {
    btn.addEventListener('click', () => { activeEntity = btn.dataset.entity; route() })
  })

  if (activeEntity === 'schedule') {
    const addBtn = document.createElement('button')
    addBtn.id = 'add-schedule-btn'
    addBtn.className = 'btn btn--ghost'
    addBtn.style.cssText = 'width:100%;margin-bottom:10px'
    addBtn.textContent = '+ Add schedule item'
    addBtn.addEventListener('click', () => openAddScheduleModal(state))
    el.appendChild(addBtn)
  }

  const skeleton = document.createElement('div')
  skeleton.innerHTML = Array(3).fill('<div class="skeleton" style="height:64px;margin-bottom:8px"></div>').join('')
  el.appendChild(skeleton)

  let rows
  try {
    rows = await fetchRows(activeEntity, state.activeCar.id)
  } catch (err) {
    if (!isStale(epoch)) showToast('Failed to load records', 'error')
    skeleton.remove()
    return
  }
  if (isStale(epoch)) return
  skeleton.remove()

  if (rows.length === 0) {
    el.innerHTML += `<div class="empty-note">No ${ENTITIES[activeEntity].label.toLowerCase()} records for this car.</div>`
    return
  }

  const list = document.createElement('div')
  rows.forEach((row, i) => {
    const s = rowSummary(activeEntity, row)
    const rowEl = document.createElement('div')
    rowEl.className = 'card row-between record-row'
    rowEl.dataset.idx = i
    rowEl.style.cssText = 'margin-bottom:8px;cursor:pointer'
    rowEl.innerHTML = `
      <div style="min-width:0">
        <p style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.title}</p>
        <p class="mute num" style="font-size:11px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.sub}</p>
      </div>
      ${s.amount ? `<p class="num" style="font-weight:600;flex-shrink:0">${s.amount}</p>` : ''}
    `
    rowEl.addEventListener('click', () => openEditModal(activeEntity, rows[Number(rowEl.dataset.idx)], state))
    list.appendChild(rowEl)
  })
  el.appendChild(list)
}

function buildEditFields(type, row) {
  if (type === 'fuel') {
    return `
      ${dateField('Date', 'date', row.date, { required: true })}
      ${numField('Odometer (km)', 'odometer_km', row.odometer_km, { required: true })}
      <div class="form-row">
        ${numField('Liters', 'liters', row.liters, { required: true })}
        ${numField('Total cost (€)', 'total_cost', row.total_cost, { required: true })}
      </div>
      ${numField('Price per liter (€/L)', 'price_per_liter', row.price_per_liter)}
      ${tankToggleField()}
      ${textField('Currency', 'currency', row.currency ?? 'EUR')}
      ${textField('Notes (optional)', 'notes', row.notes)}
    `
  }
  if (type === 'maintenance') {
    return `
      ${dateField('Date', 'date', row.date, { required: true })}
      ${textField('Description', 'description', row.description, { required: true })}
      ${textField('Category', 'category', row.category)}
      <div class="form-row">
        ${numField('Cost (€)', 'cost', row.cost, { required: true })}
        ${numField('Odometer (km)', 'odometer_km', row.odometer_km)}
      </div>
      <div class="form-row">
        ${numField('Next due (km)', 'next_due_km', row.next_due_km)}
        ${dateField('Next due (date)', 'next_due_date', row.next_due_date)}
      </div>
      ${textField('Currency', 'currency', row.currency ?? 'EUR')}
      ${textField('Notes (optional)', 'notes', row.notes)}
    `
  }
  if (type === 'supplies') {
    return `
      ${dateField('Date', 'date', row.date, { required: true })}
      ${textField('Item', 'item', row.item, { required: true })}
      ${numField('Cost (€)', 'cost', row.cost, { required: true })}
      ${textField('Currency', 'currency', row.currency ?? 'EUR')}
      ${textField('Notes (optional)', 'notes', row.notes)}
    `
  }
  if (type === 'insurance') {
    return `
      <div class="form-row">
        ${dateField('Start date', 'start_date', row.start_date, { required: true })}
        ${dateField('End date', 'end_date', row.end_date)}
      </div>
      ${textField('Provider', 'provider', row.provider, { required: true })}
      ${textField('Coverage type', 'coverage_type', row.coverage_type)}
      ${numField('Cost (€)', 'cost', row.cost, { required: true })}
      ${textField('Currency', 'currency', row.currency ?? 'EUR')}
      ${textField('Notes (optional)', 'notes', row.notes)}
    `
  }
  if (type === 'registration') {
    return `
      ${dateField('Date', 'date', row.date, { required: true })}
      ${textField('Description', 'description', row.description, { required: true })}
      ${numField('Cost (€)', 'cost', row.cost, { required: true })}
      ${dateField('Valid until', 'valid_until', row.valid_until)}
      ${textField('Currency', 'currency', row.currency ?? 'EUR')}
      ${textField('Notes (optional)', 'notes', row.notes)}
    `
  }
  if (type === 'other') {
    return `
      ${dateField('Date', 'date', row.date, { required: true })}
      ${textField('Description', 'description', row.description, { required: true })}
      ${textField('Category', 'category', row.category)}
      ${numField('Cost (€)', 'cost', row.cost, { required: true })}
      ${textField('Currency', 'currency', row.currency ?? 'EUR')}
      ${textField('Notes (optional)', 'notes', row.notes)}
    `
  }
  // schedule
  return `
    ${textField('Item name', 'item_name', row.item_name, { required: true })}
    <div class="form-row">
      ${numField('Interval (km)', 'interval_km', row.interval_km)}
      ${numField('Interval (months)', 'interval_months', row.interval_months)}
    </div>
    <div class="form-row">
      ${dateField('Last done (date)', 'last_done_date', row.last_done_date)}
      ${numField('Last done (km)', 'last_done_km', row.last_done_km)}
    </div>
    ${textField('Notes (optional)', 'notes', row.notes)}
  `
}

function buildUpdatePayload(type, fd) {
  if (type === 'fuel') {
    const liters = parseFloat(fd.get('liters'))
    const total_cost = parseFloat(fd.get('total_cost'))
    let ppl = numOrNull(fd, 'price_per_liter')
    if (ppl == null && liters > 0) ppl = total_cost / liters
    return {
      date: fd.get('date'),
      odometer_km: parseFloat(fd.get('odometer_km')),
      liters,
      total_cost,
      price_per_liter: ppl,
      is_full_tank: fd.get('is_full_tank') === 'on',
      currency: currencyOf(fd),
      notes: strOrNull(fd, 'notes'),
    }
  }
  if (type === 'maintenance') {
    return {
      date: fd.get('date'),
      description: strOrNull(fd, 'description'),
      category: strOrNull(fd, 'category'),
      cost: parseFloat(fd.get('cost')),
      odometer_km: numOrNull(fd, 'odometer_km'),
      next_due_km: numOrNull(fd, 'next_due_km'),
      next_due_date: dateOrNull(fd, 'next_due_date'),
      currency: currencyOf(fd),
      notes: strOrNull(fd, 'notes'),
    }
  }
  if (type === 'supplies') {
    return {
      date: fd.get('date'),
      item: strOrNull(fd, 'item'),
      cost: parseFloat(fd.get('cost')),
      currency: currencyOf(fd),
      notes: strOrNull(fd, 'notes'),
    }
  }
  if (type === 'insurance') {
    return {
      start_date: fd.get('start_date'),
      end_date: dateOrNull(fd, 'end_date'),
      provider: strOrNull(fd, 'provider'),
      coverage_type: strOrNull(fd, 'coverage_type'),
      cost: parseFloat(fd.get('cost')),
      currency: currencyOf(fd),
      notes: strOrNull(fd, 'notes'),
    }
  }
  if (type === 'registration') {
    return {
      date: fd.get('date'),
      description: strOrNull(fd, 'description'),
      cost: parseFloat(fd.get('cost')),
      valid_until: dateOrNull(fd, 'valid_until'),
      currency: currencyOf(fd),
      notes: strOrNull(fd, 'notes'),
    }
  }
  if (type === 'other') {
    return {
      date: fd.get('date'),
      description: strOrNull(fd, 'description'),
      category: strOrNull(fd, 'category'),
      cost: parseFloat(fd.get('cost')),
      currency: currencyOf(fd),
      notes: strOrNull(fd, 'notes'),
    }
  }
  // schedule
  return {
    item_name: strOrNull(fd, 'item_name'),
    interval_km: numOrNull(fd, 'interval_km'),
    interval_months: intOrNull(fd, 'interval_months'),
    last_done_date: dateOrNull(fd, 'last_done_date'),
    last_done_km: numOrNull(fd, 'last_done_km'),
    notes: strOrNull(fd, 'notes'),
  }
}

const TITLES = {
  fuel: 'Edit fill-up',
  maintenance: 'Edit maintenance entry',
  supplies: 'Edit supply',
  insurance: 'Edit insurance record',
  registration: 'Edit registration',
  other: 'Edit cost',
  schedule: 'Edit schedule item',
}

function openEditModal(type, row, state) {
  openModal(`
    ${modalHandle()}
    <h2 class="modal-title">${TITLES[type]}</h2>
    <form id="record-form" class="form-stack">
      ${buildEditFields(type, row)}
      <div style="display:flex;justify-content:flex-end">
        <button type="button" id="modal-delete" class="btn--danger-text">DELETE RECORD</button>
      </div>
      ${modalFooter('Cancel', 'Save changes')}
    </form>
  `)

  if (type === 'fuel') {
    setupTankToggle()
    if (row.is_full_tank === false) document.getElementById('tank-partial-btn').click()
  }

  document.getElementById('modal-delete').addEventListener('click', async () => {
    if (!confirm('Delete this record?')) return
    try {
      await deleteRow(type, row.id)
      closeModal()
      showToast('Deleted')
      route()
    } catch (err) {
      showToast(err.message, 'error')
    }
  })

  document.getElementById('record-form').addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const btn = document.getElementById('modal-submit')
    btn.textContent = 'Saving…'
    btn.disabled = true

    try {
      await updateRow(type, row.id, buildUpdatePayload(type, fd))
      closeModal()
      showToast('Saved')
      route()
    } catch (err) {
      showToast(err.message, 'error')
      btn.textContent = 'Save changes'
      btn.disabled = false
    }
  })
}

function openAddScheduleModal(state) {
  openModal(`
    ${modalHandle()}
    <h2 class="modal-title">Add schedule item</h2>
    <form id="schedule-add-form" class="form-stack">
      ${textField('Item name', 'item_name', '', { required: true, placeholder: 'Oil change' })}
      <div class="form-row">
        ${numField('Interval (km)', 'interval_km', '')}
        ${numField('Interval (months)', 'interval_months', '')}
      </div>
      ${textField('Notes (optional)', 'notes', '')}
      ${modalFooter('Cancel', 'Add item')}
    </form>
  `)

  document.getElementById('schedule-add-form').addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const btn = document.getElementById('modal-submit')
    btn.textContent = 'Saving…'
    btn.disabled = true

    const payload = {
      item_name: strOrNull(fd, 'item_name'),
      interval_km: numOrNull(fd, 'interval_km'),
      interval_months: intOrNull(fd, 'interval_months'),
      notes: strOrNull(fd, 'notes'),
    }

    try {
      await addScheduleItem(state.activeCar.id, payload)
      closeModal()
      showToast('Schedule item added')
      route()
    } catch (err) {
      showToast(err.message, 'error')
      btn.textContent = 'Add item'
      btn.disabled = false
    }
  })
}
