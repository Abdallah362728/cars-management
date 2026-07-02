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
  return `<div class="modal-handle"></div>`
}

export function modalFooter(cancelLabel = 'Cancel', submitLabel = 'Save', submitId = 'modal-submit') {
  return `<div class="modal-footer">
    <button type="button" onclick="window.__closeModal()" class="btn btn--ghost">${cancelLabel}</button>
    <button type="submit" id="${submitId}" class="btn btn--primary">${submitLabel}</button>
  </div>`
}

// ── Full / partial tank question (shared by fuel + dashboard add-fill modals) ──
// Renders a two-option segmented control bound to a hidden input named
// `is_full_tank` (value "on" = full). Pair with setupTankToggle() after openModal.
export function tankToggleField() {
  return `
    <div>
      <label class="micro">Did you fill the tank?</label>
      <div class="form-row">
        <button type="button" id="tank-full-btn" class="seg-btn">FULL TANK</button>
        <button type="button" id="tank-partial-btn" class="seg-btn">PARTIAL</button>
      </div>
      <input type="hidden" name="is_full_tank" id="full-tank-input" value="on">
      <p id="tank-hint" class="mute" style="font-size:11px;margin-top:6px;line-height:1.4"></p>
    </div>`
}

export function setupTankToggle() {
  const input = document.getElementById('full-tank-input')
  const full = document.getElementById('tank-full-btn')
  const part = document.getElementById('tank-partial-btn')
  const hint = document.getElementById('tank-hint')
  if (!input || !full || !part) return

  const set = isFull => {
    input.value = isFull ? 'on' : 'off'
    full.classList.toggle('seg-btn--on', isFull)
    part.classList.toggle('seg-btn--on', !isFull)
    hint.textContent = isFull
      ? 'Filled all the way up — used for the exact L/100km measurement.'
      : 'Partial fill — counted in cost stats and projected per 100 km; exact L/100km at your next full tank.'
  }
  full.addEventListener('click', () => set(true))
  part.addEventListener('click', () => set(false))
  set(true)   // default: full tank
}
