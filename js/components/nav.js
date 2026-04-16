export function initNav() {
  // Highlight active nav button on load
  updateActive(location.hash || '#dashboard')
  window.addEventListener('hashchange', () => updateActive(location.hash))
}

function updateActive(hash) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const isActive = btn.dataset.hash === hash
    btn.classList.toggle('text-blue-400', isActive)
    btn.classList.toggle('text-slate-500', !isActive)
    const svg = btn.querySelector('svg')
    if (svg) {
      svg.setAttribute('stroke', isActive ? '#60a5fa' : '#64748b')
    }
  })
}
