const CACHE_NAME = 'myp-v2'
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json?v=2.0',
  '/icons/icon-192x192.png?v=2.0',
  '/icons/icon-512x512.png?v=2.0',
  '/favicon-16x16.png?v=2.0',
  '/favicon-32x32.png?v=2.0',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&display=swap',
  'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js',
]

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE)
    })
  )
})

// Activate Event (Cleanup old caches)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    })
  )
})

// Paths that should NEVER be cached (require fresh auth)
const PRIVATE_PATHS = ['/admin', '/dashboard', '/settings', '/logout', '/mes-cours']

// Fetch Event
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  
  // Ignore chrome-extension:// and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return
  }
  
  const isPrivate = PRIVATE_PATHS.some((path) => url.pathname.startsWith(path))

  // Strategy: Network Only for private paths
  if (isPrivate) {
    event.respondWith(fetch(event.request))
    return
  }

  // Strategy: Network First for public HTML
  if (
    event.request.mode === 'navigate' ||
    event.request.headers.get('accept').includes('text/html')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If the server says we are unauthorized or redirected, don't cache this as a valid page
          if (response.status === 401 || url.pathname === '/login') {
            return response
          }
          const responseToCache = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache)
          })
          return response
        })
        .catch(() => caches.match(event.request))
    )
  } else {
    // Cache First for Assets
    event.respondWith(
      caches.match(event.request).then(
        (res) =>
          res ||
          fetch(event.request).then((response) => {
            // Only cache valid responses
            if (!response || response.status !== 200 || response.type !== 'basic' || !url.protocol.startsWith('http')) {
              return response
            }
            const responseToCache = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache))
            return response
          })
      )
    )
  }
})

// Listener to clear cache from the main thread
self.addEventListener('message', (event) => {
  if (event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('PWA Cache cleared successfully.')
    })
  }
})
