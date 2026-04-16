const CACHE = 'cars-v2'
const STATIC = ['/', '/index.html', '/manifest.json', '/js/app.js', '/js/api.js', '/js/supabase-client.js',
  '/js/components/nav.js', '/js/components/modal.js', '/js/components/toast.js',
  '/js/pages/dashboard.js', '/js/pages/fuel.js', '/js/pages/costs.js', '/js/pages/additional.js']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC).catch(() => {})))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // Supabase API — always network, no cache
  if (url.hostname.includes('supabase')) {
    e.respondWith(fetch(e.request))
    return
  }

  // CDN scripts — network first, fall back to cache
  if (url.hostname.includes('cdn.')) {
    e.respondWith(
      fetch(e.request).then(r => {
        const clone = r.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
        return r
      }).catch(() => caches.match(e.request))
    )
    return
  }

  // App static files — cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(r => {
      const clone = r.clone()
      caches.open(CACHE).then(c => c.put(e.request, clone))
      return r
    }))
  )
})
