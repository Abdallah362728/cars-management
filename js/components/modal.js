const modal = () => document.getElementById('modal')
const body  = () => document.getElementById('modal-body')

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
