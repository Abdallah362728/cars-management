// Page header styled like a drafting-sheet title block, with the multi-car
// switch button. Switching cars re-routes through the router (single render
// path — never call a page's render() directly from here).

import { state, activeCars, switchToNextCar } from '../../core/state.js'
import { route } from '../../core/router.js'
import { esc } from '../../domain/format.js'

export function renderCarHeader(container, { title, subtitle } = {}) {
  const cars = activeCars()
  const car = state.activeCar
  const el = document.createElement('div')
  el.className = 'row-between page-title'
  el.innerHTML = `
    <div>
      <p class="micro" style="margin-bottom:3px">${esc(title || 'Active vehicle')}</p>
      <h1>${car ? `${esc(car.make)} ${esc(car.model)}` : '—'}</h1>
      <p class="mute num" style="font-size:12px;margin-top:2px">${subtitle ? esc(subtitle) : (car ? `${car.year}` + (car.operating_country ? ` · ${esc(car.operating_country)}` : '') : '')}</p>
    </div>
    ${cars.length > 1 ? `<button id="car-switch-btn" class="btn btn--micro">Switch</button>` : ''}
  `
  container.appendChild(el)

  el.querySelector('#car-switch-btn')?.addEventListener('click', () => {
    switchToNextCar()
    route()
  })
}
