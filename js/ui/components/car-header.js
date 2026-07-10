// Page header styled like a drafting-sheet title block, with the multi-car
// switch button. Switching cars re-routes through the router (single render
// path — never call a page's render() directly from here).

import { state, setActiveCar } from '../../core/state.js'
import { route } from '../../core/router.js'
import { esc } from '../../domain/format.js'
import { openModal, closeModal, modalHandle } from './modal.js'

export function renderCarHeader(container, { title, subtitle } = {}) {
  const car = state.activeCar
  const el = document.createElement('div')
  el.className = 'row-between page-title'
  el.innerHTML = `
    <div>
      <p class="micro" style="margin-bottom:3px">${esc(title || 'Active vehicle')}</p>
      <h1>${car ? `${esc(car.make)} ${esc(car.model)}` : '—'}</h1>
      <p class="mute num" style="font-size:12px;margin-top:2px">${subtitle ? esc(subtitle) : (car ? `${car.year}` + (car.operating_country ? ` · ${esc(car.operating_country)}` : '') : '')}</p>
    </div>
    ${state.cars.length > 1 ? `<button id="car-switch-btn" class="btn btn--micro">Switch</button>` : ''}
  `
  container.appendChild(el)

  el.querySelector('#car-switch-btn')?.addEventListener('click', () => {
    openModal(`
      ${modalHandle()}
      <h2 class="modal-title">Select car</h2>
      <div class="form-stack">
        ${state.cars.map((c, i) => `
          <button type="button" class="card row-between pick-car-btn" data-idx="${i}" style="cursor:pointer;text-align:left;width:100%">
            <div>
              <p style="font-size:13px;font-weight:600">${esc(c.make)} ${esc(c.model)} <span class="mute num">${c.year ?? ''}</span></p>
              <p class="mute num" style="font-size:11px;margin-top:1px">${esc(String(c.status ?? '').toUpperCase())}${c.operating_country ? ' · ' + esc(c.operating_country) : ''}</p>
            </div>
            ${state.activeCar?.id === c.id ? '<span class="pill pill--ok">CURRENT</span>' : ''}
          </button>`).join('')}
      </div>
    `)
    document.querySelectorAll('.pick-car-btn').forEach(btn =>
      btn.addEventListener('click', () => {
        setActiveCar(state.cars[Number(btn.dataset.idx)])
        closeModal()
        route()
      }))
  })
}
