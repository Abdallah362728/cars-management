export function showToast(message, type = 'success') {
  const el = document.createElement('div')
  el.className = `toast toast--${type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'success'}`
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
