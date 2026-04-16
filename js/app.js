import { getCars, esc } from './api.js'
import { initNav } from './components/nav.js'
import { initModal } from './components/modal.js'

// ─── Global state ────────────────────────────────────────────────────────────
export const state = {
  cars:      [],
  activeCar: null,
  loading:   false,
}

// ─── Page registry (lazy-loaded) ─────────────────────────────────────────────
const PAGES = {
  '#dashboard':  () => import('./pages/dashboard.js'),
  '#fuel':       () => import('./pages/fuel.js'),
  '#costs':      () => import('./pages/costs.js'),
  '#additional': () => import('./pages/additional.js'),
}

// FAB visibility per page
const FAB_PAGES = new Set(['#dashboard', '#fuel', '#costs'])

// ─── Router ──────────────────────────────────────────────────────────────────
let currentCleanup = null

async function route() {
  const hash   = location.hash || '#dashboard'
  const loader = PAGES[hash] ?? PAGES['#dashboard']
  const app    = document.getElementById('app')
  const fab    = document.getElementById('fab')

  // Cleanup previous page
  if (typeof currentCleanup === 'function') {
    currentCleanup()
    currentCleanup = null
  }
  window.__openAddModal = null

  // FAB visibility
  fab.classList.toggle('hidden-fab', !FAB_PAGES.has(hash))

  // Update nav active state
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const active = btn.dataset.hash === hash
    btn.classList.toggle('text-blue-400', active)
    btn.classList.toggle('text-slate-500', !active)
  })

  // Loading skeleton
  app.innerHTML = `<div class="p-4 space-y-3">
    <div class="skeleton h-32 w-full"></div>
    <div class="skeleton h-24 w-full"></div>
    <div class="skeleton h-40 w-full"></div>
  </div>`

  try {
    const { render, cleanup } = await loader()
    currentCleanup = cleanup ?? null
    await render(app, state)
  } catch (err) {
    console.error(err)
    if (err?.message?.includes('YOUR_SUPABASE')) {
      app.innerHTML = setupScreen()
    } else {
      app.innerHTML = `<div class="flex flex-col items-center justify-center p-8 text-center" style="min-height:60dvh">
        <p class="text-red-400 font-semibold mb-2">Something went wrong</p>
        <p class="text-slate-500 text-sm">${err.message}</p>
        <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-slate-700 text-slate-300 rounded-xl text-sm">Retry</button>
      </div>`
    }
  }
}

function setupScreen() {
  return `<div class="flex flex-col items-center justify-center p-6 text-center" style="min-height:90dvh">
    <div class="w-16 h-16 bg-blue-500/10 rounded-3xl flex items-center justify-center border border-blue-500/20 mb-5">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="1.5" stroke-linecap="round">
        <path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/>
        <path d="M5 17H3V11L5 6H19L21 11V17H19M9 17H15M9 11H19M9 11H5"/>
      </svg>
    </div>
    <h1 class="text-white text-2xl font-bold mb-2">Cars Manager</h1>
    <p class="text-slate-400 text-sm mb-6 max-w-xs">One step to connect your database. Open <code class="text-blue-400">js/supabase-client.js</code> and paste your Supabase credentials.</p>
    <div class="card text-left w-full max-w-sm mb-6">
      <p class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Setup steps</p>
      <ol class="space-y-3 text-sm text-slate-300">
        <li class="flex gap-3"><span class="text-blue-400 font-bold flex-shrink-0">1.</span>Go to <strong>supabase.com</strong> → create free project</li>
        <li class="flex gap-3"><span class="text-blue-400 font-bold flex-shrink-0">2.</span>SQL Editor → paste & run <code class="text-green-400">supabase/schema.sql</code></li>
        <li class="flex gap-3"><span class="text-blue-400 font-bold flex-shrink-0">3.</span>Settings → API → copy Project URL + anon key</li>
        <li class="flex gap-3"><span class="text-blue-400 font-bold flex-shrink-0">4.</span>Paste into <code class="text-green-400">js/supabase-client.js</code></li>
        <li class="flex gap-3"><span class="text-blue-400 font-bold flex-shrink-0">5.</span>Deploy to Netlify (drag folder to netlify.com/drop)</li>
      </ol>
    </div>
  </div>`
}

// ─── Car switcher (header helper) ────────────────────────────────────────────
export function renderCarHeader(container, { title, subtitle, onSwitch } = {}) {
  const activeCars = state.cars.filter(c => c.status === 'active')
  const el = document.createElement('div')
  el.className = 'flex items-start justify-between px-5 pt-5 pb-3'
  el.innerHTML = `
    <div>
      <p class="text-slate-500 text-xs mb-0.5">${esc(title || 'Active Car')}</p>
      <h1 class="text-white text-2xl font-bold tracking-tight leading-tight">${state.activeCar ? `${esc(state.activeCar.make)} ${esc(state.activeCar.model)}` : '—'}</h1>
      <p class="text-slate-500 text-sm">${subtitle ? esc(subtitle) : (state.activeCar ? `${state.activeCar.year}` + (state.activeCar.operating_country ? ` · ${esc(state.activeCar.operating_country)}` : '') : '')}</p>
    </div>
    ${activeCars.length > 1 ? `<button id="car-switch-btn" class="text-blue-400 text-sm px-3 py-1.5 bg-blue-500/10 rounded-xl border border-blue-500/20">Switch</button>` : ''}
  `
  container.appendChild(el)

  if (activeCars.length > 1) {
    el.querySelector('#car-switch-btn')?.addEventListener('click', () => {
      const idx  = activeCars.findIndex(c => c.id === state.activeCar?.id)
      state.activeCar = activeCars[(idx + 1) % activeCars.length]
      onSwitch?.()
      route()
    })
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
async function bootstrap() {
  initModal()
  initNav()

  // Wire nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      location.hash = btn.dataset.hash
    })
  })
  window.addEventListener('hashchange', route)

  // Load cars
  try {
    state.cars = await getCars()
    state.activeCar = state.cars.find(c => c.status === 'active') ?? state.cars[0] ?? null
  } catch (err) {
    if (err?.message?.includes('YOUR_SUPABASE') || err?.message?.includes('fetch')) {
      document.getElementById('app').innerHTML = setupScreen()
      return
    }
  }

  route()
}

bootstrap()
