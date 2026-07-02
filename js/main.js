// App bootstrap: load cars, pick the active one, start the router.

import { getCars } from './data/cars-repo.js'
import { state, setCars, setActiveCar } from './core/state.js'
import { route, initRouter } from './core/router.js'
import { initModal } from './ui/components/modal.js'

async function bootstrap() {
  initModal()
  initRouter()

  try {
    setCars(await getCars())
    setActiveCar(state.cars.find(c => c.status === 'active') ?? state.cars[0] ?? null)
  } catch (err) {
    console.error(err)
    document.getElementById('app').innerHTML = `
      <div class="center-screen">
        <p style="color:var(--danger);font-weight:600;margin-bottom:8px">Could not reach the database</p>
        <p class="mute" style="font-size:13px">${String(err?.message ?? err)}</p>
        <button onclick="location.reload()" class="btn" style="margin-top:16px">Retry</button>
      </div>`
    return
  }

  route()
}

bootstrap()
