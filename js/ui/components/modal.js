const modal = () => document.getElementById('modal')
const body = () => document.getElementById('modal-body')

export function initModal() {
  window.__closeModal = closeModal
}

export function openModal(html, { onOpen } = {}) {
  body().innerHTML = html
  modal().classList.remove('hidden')
  document.body.style.overflow = 'hidden'
  onOpen?.()
}

export function closeModal() {
  modal().classList.add('hidden')
  document.body.style.overflow = ''
  body().innerHTML = ''
}

export function modalHandle() {
  return `<div class="w-9 h-1 bg-slate-600 rounded-full mx-auto mb-5"></div>`
}

export function modalFooter(cancelLabel = 'Cancel', submitLabel = 'Save', submitId = 'modal-submit') {
  return `<div class="grid grid-cols-2 gap-3 mt-5">
    <button type="button" onclick="window.__closeModal()" class="py-3.5 rounded-2xl bg-slate-700 text-slate-300 font-semibold text-sm">${cancelLabel}</button>
    <button type="submit" id="${submitId}" class="py-3.5 rounded-2xl font-bold text-sm text-white" style="background:linear-gradient(135deg,#3b82f6,#6366f1);box-shadow:0 4px 12px rgba(99,102,241,0.35)">${submitLabel}</button>
  </div>`
}

// ── Full / partial tank question (shared by fuel + dashboard add-fill modals) ──
// Renders a two-option segmented control bound to a hidden input named
// `is_full_tank` (value "on" = full). Pair with setupTankToggle() after openModal.
export function tankToggleField() {
  return `
    <div>
      <label class="section-label">Did you fill the tank?</label>
      <div class="grid grid-cols-2 gap-2">
        <button type="button" id="tank-full-btn">⛽ Full tank</button>
        <button type="button" id="tank-partial-btn">🪣 Partial fill</button>
      </div>
      <input type="hidden" name="is_full_tank" id="full-tank-input" value="on">
      <p id="tank-hint" class="text-slate-500 text-[11px] mt-1.5 leading-snug"></p>
    </div>`
}

export function setupTankToggle() {
  const input = document.getElementById('full-tank-input')
  const full = document.getElementById('tank-full-btn')
  const part = document.getElementById('tank-partial-btn')
  const hint = document.getElementById('tank-hint')
  if (!input || !full || !part) return

  const on = 'w-full py-2.5 rounded-xl text-sm font-semibold transition-all bg-blue-500/20 text-blue-400 border border-blue-500/50'
  const off = 'w-full py-2.5 rounded-xl text-sm font-semibold transition-all bg-slate-700/50 text-slate-500 border border-slate-600/40'
  const set = isFull => {
    input.value = isFull ? 'on' : 'off'
    full.className = isFull ? on : off
    part.className = isFull ? off : on
    hint.textContent = isFull
      ? 'Filled all the way up — used to calculate L/100km.'
      : 'Partial fill — counted in cost stats now, exact L/100km at your next full tank.'
  }
  full.addEventListener('click', () => set(true))
  part.addEventListener('click', () => set(false))
  set(true)   // default: full tank
}
