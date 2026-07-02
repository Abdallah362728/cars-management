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
      <div class="flex flex-col items-center justify-center p-8 text-center" style="min-height:60dvh">
        <p class="text-red-400 font-semibold mb-2">Could not reach the database</p>
        <p class="text-slate-500 text-sm">${String(err?.message ?? err)}</p>
        <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-slate-700 text-slate-300 rounded-xl text-sm">Retry</button>
      </div>`
    return
  }

  route()
}

bootstrap()
