const CACHE_NAME = 'disponib-v3'

// Apenas assets imutáveis — sem HTML de rotas do Next.js
const PRECACHE_URLS = [
  '/logo-universo-aba.png',
  '/manifest.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  // Só intercepta requisições do próprio site. Requisições cross-origin
  // (ex.: worker local em http://127.0.0.1:3010) passam direto pelo navegador,
  // sem o SW — evita conflito com a Content Security Policy e cache indevido.
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  // Rotas HTML: network-first para garantir sempre a versão atualizada do servidor
  // após cada deploy (evita stale chunk hashes após redeploy)
  const isHTML = event.request.headers.get('Accept')?.includes('text/html')
  if (isHTML) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    )
    return
  }

  // Assets estáticos (imagens, manifest): cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  )
})
