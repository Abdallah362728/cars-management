// Page header with active-car title and the multi-car switch button.
// Switching cars re-routes through the router (single render path — never
// call a page's render() directly from here).

import { state, activeCars, switchToNextCar } from '../../core/state.js'
import { route } from '../../core/router.js'
import { esc } from '../../domain/format.js'

export function renderCarHeader(container, { title, subtitle } = {}) {
  const cars = activeCars()
  const el = document.createElement('div')
  el.className = 'flex items-start justify-between px-5 pt-5 pb-3'
  el.innerHTML = `
    <div>
      <p class="text-slate-500 text-xs mb-0.5">${esc(title || 'Active Car')}</p>
      <h1 class="text-white text-2xl font-bold tracking-tight leading-tight">${state.activeCar ? `${esc(state.activeCar.make)} ${esc(state.activeCar.model)}` : '—'}</h1>
      <p class="text-slate-500 text-sm">${subtitle ? esc(subtitle) : (state.activeCar ? `${state.activeCar.year}` + (state.activeCar.operating_country ? ` · ${esc(state.activeCar.operating_country)}` : '') : '')}</p>
    </div>
    ${cars.length > 1 ? `<button id="car-switch-btn" class="text-blue-400 text-sm px-3 py-1.5 bg-blue-500/10 rounded-xl border border-blue-500/20">Switch</button>` : ''}
  `
  container.appendChild(el)

  el.querySelector('#car-switch-btn')?.addEventListener('click', () => {
    switchToNextCar()
    route()
  })
}
