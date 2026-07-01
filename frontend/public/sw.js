const CACHE_NAME = 'disponib-v4'

// Apenas assets imutáveis — sem HTML de rotas do Next.js
const PRECACHE_URLS = [
  '/logo-universo-aba.png',
  '/manifest.json',
]

// Extensões de assets realmente imutáveis que podem ser servidos cache-first com
// segurança. JS/CSS e chunks do Next NUNCA entram aqui (ver guarda em fetch).
const STATIC_ASSET_RE = /\.(?:png|jpe?g|gif|svg|webp|ico|woff2?)$/i

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  // Só intercepta requisições do próprio site. Cross-origin (ex.: Supabase REST,
  // worker local) passa direto pelo navegador — evita cache indevido de dados.
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  // NUNCA intercepta código da aplicação: chunks/módulos do Next, HMR e API routes.
  // Deixa passar direto para a rede — caso contrário import dinâmico e HMR quebram,
  // e chunks antigos ficam "presos" no cache após cada edição/deploy.
  if (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/api/')) return

  // Navegação (HTML): network-first para sempre pegar a versão atual do servidor.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    )
    return
  }

  // Somente assets estáticos imutáveis (imagens, fontes, manifest): cache-first.
  if (STATIC_ASSET_RE.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    )
    return
  }

  // Todo o resto: comportamento padrão do navegador (sem respondWith).
})
