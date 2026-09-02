// App bootstrap: require a session, load cars, pick the active one, start the router.
//
// The database is behind per-user RLS, so there is nothing to show without a
// signed-in account — auth is a gate in front of the shell, not a page inside
// it — and what loads is only ever that account's own cars.

import { getCars } from './data/cars-repo.js'
import { state, setCars, setActiveCar } from './core/state.js'
import { route, initRouter } from './core/router.js'
import { getSession, onAuthChange } from './core/auth.js'
import { initModal } from './ui/components/modal.js'
import { renderLogin } from './ui/pages/login.js'

const app = () => document.getElementById('app')

// True while the app shell is up, so a sign-out event knows whether it has
// anything to tear down (and doesn't fire on the login screen itself).
let running = false

function showLogin(message = '') {
  running = false
  document.body.classList.add('signed-out')
  renderLogin(app(), gate, { message })
}

function showError(title, detail) {
  app().innerHTML = `
    <div class="center-screen">
      <p style="color:var(--danger);font-weight:600;margin-bottom:8px">${title}</p>
      <p class="mute" style="font-size:13px">${String(detail?.message ?? detail)}</p>
      <button onclick="location.reload()" class="btn" style="margin-top:16px">Retry</button>
    </div>`
}

// Decides what the user sees: the login screen or the app. Also the callback
// the login screen calls after a successful sign-in or sign-up.
async function gate() {
  let session
  try {
    session = await getSession()
  } catch (err) {
    showError('Could not check your session', err)
    return
  }

  if (!session) {
    showLogin()
    return
  }

  document.body.classList.remove('signed-out')
  await bootstrap()
}

async function bootstrap() {
  try {
    setCars(await getCars())
    const savedId = Number(localStorage.getItem('activeCarId')) || null
    setActiveCar(
      state.cars.find(c => c.id === savedId)
      ?? state.cars.find(c => c.status === 'active')
      ?? state.cars[0]
      ?? null
    )
  } catch (err) {
    console.error(err)
    showError('Could not reach the database', err)
    return
  }

  running = true
  route()
}

initModal()
initRouter()

// Catches both the Settings sign-out button and a refresh token that finally
// expired mid-session.
onAuthChange(event => {
  if (event === 'SIGNED_OUT' && running) {
    showLogin('Signed out.')
  }
})

gate()
