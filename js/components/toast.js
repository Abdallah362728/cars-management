export function showToast(message, type = 'success') {
  const el = document.createElement('div')
  el.className = `pointer-events-auto px-4 py-2.5 rounded-2xl text-white text-sm font-semibold shadow-lg transition-all duration-300 ${
    type === 'error' ? 'bg-red-500' : type === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
  }`
  el.textContent = message
  el.style.opacity = '0'
  el.style.transform = 'translateY(-8px)'

  document.getElementById('toasts').appendChild(el)

  requestAnimationFrame(() => {
    el.style.opacity = '1'
    el.style.transform = 'translateY(0)'
  })

  setTimeout(() => {
    el.style.opacity = '0'
    el.style.transform = 'translateY(-8px)'
    setTimeout(() => el.remove(), 300)
  }, 3000)
}
