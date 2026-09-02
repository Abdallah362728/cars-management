// Hash router with a render-epoch guard.
//
// Every navigation bumps the epoch. Async page renders capture their epoch
// and must check `isStale(epoch)` after each await before touching the DOM —
// this is what prevents a slow response from a previous page/car from
// drawing charts into a canvas that no longer exists.

import { state } from './state.js'

const PAGES = {
  '#dashboard':  () => import('../ui/pages/dashboard.js'),
  '#fuel':       () => import('../ui/pages/fuel.js'),
  '#costs':      () => import('../ui/pages/costs.js'),
  '#additional': () => import('../ui/pages/additional.js'),
  '#settings':   () => import('../ui/pages/settings.js'),
}

const FAB_PAGES = new Set(['#dashboard', '#fuel', '#costs'])

let epoch = 0
let currentCleanup = null

export function currentEpoch() {
  return epoch
}

export function isStale(e) {
  return e !== epoch
}

export async function route() {
  // While the auth gate is up, main.js owns #app: a stray hashchange (the back
  // button, a restored deep link) must not draw a page over the login screen.
  if (document.body.classList.contains('signed-out')) return

  epoch++
  const myEpoch = epoch

  const hash = location.hash || '#dashboard'
  const loader = PAGES[hash] ?? PAGES['#dashboard']
  const app = document.getElementById('app')
  const fab = document.getElementById('fab')

  if (typeof currentCleanup === 'function') {
    currentCleanup()
    currentCleanup = null
  }
  window.__openAddModal = null

  fab.classList.toggle('hidden-fab', !FAB_PAGES.has(hash))

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.hash === hash)
  })

  app.innerHTML = `<div style="padding:16px;display:grid;gap:12px">
    <div class="skeleton" style="height:128px"></div>
    <div class="skeleton" style="height:96px"></div>
    <div class="skeleton" style="height:160px"></div>
  </div>`

  try {
    const page = await loader()
    if (isStale(myEpoch)) return
    currentCleanup = page.cleanup ?? null
    await page.render(app, state, myEpoch)
  } catch (err) {
    if (isStale(myEpoch)) return
    console.error(err)
    app.innerHTML = `<div class="center-screen">
      <p style="color:var(--danger);font-weight:600;margin-bottom:8px">Something went wrong</p>
      <p class="mute" style="font-size:13px">${String(err?.message ?? err)}</p>
      <button onclick="location.reload()" class="btn" style="margin-top:16px">Retry</button>
    </div>`
  }
}

export function initRouter() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => { location.hash = btn.dataset.hash })
  })
  window.addEventListener('hashchange', route)
}
