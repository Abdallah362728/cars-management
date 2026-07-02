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
    const active = btn.dataset.hash === hash
    btn.classList.toggle('text-blue-400', active)
    btn.classList.toggle('text-slate-500', !active)
    btn.querySelector('svg')?.setAttribute('stroke', active ? '#60a5fa' : '#64748b')
  })

  app.innerHTML = `<div class="p-4 space-y-3">
    <div class="skeleton h-32 w-full"></div>
    <div class="skeleton h-24 w-full"></div>
    <div class="skeleton h-40 w-full"></div>
  </div>`

  try {
    const page = await loader()
    if (isStale(myEpoch)) return
    currentCleanup = page.cleanup ?? null
    await page.render(app, state, myEpoch)
  } catch (err) {
    if (isStale(myEpoch)) return
    console.error(err)
    app.innerHTML = `<div class="flex flex-col items-center justify-center p-8 text-center" style="min-height:60dvh">
      <p class="text-red-400 font-semibold mb-2">Something went wrong</p>
      <p class="text-slate-500 text-sm">${String(err?.message ?? err)}</p>
      <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-slate-700 text-slate-300 rounded-xl text-sm">Retry</button>
    </div>`
  }
}

export function initRouter() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => { location.hash = btn.dataset.hash })
  })
  window.addEventListener('hashchange', route)
}
