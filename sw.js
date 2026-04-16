const CACHE = 'cars-v3'

self.addEventListener('install', e => {
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // Localhost — always network so dev changes show immediately
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    e.respondWith(fetch(e.request))
    return
  }

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

  // App files — network first so deploys show immediately, cache as offline fallback
  e.respondWith(
    fetch(e.request).then(r => {
      const clone = r.clone()
      caches.open(CACHE).then(c => c.put(e.request, clone))
      return r
    }).catch(() => caches.match(e.request))
  )
})
