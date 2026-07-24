/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.skipWaiting()
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

const SHARE_CACHE = 'lunara-share-target'
export const SHARE_TARGET_PATH = '/share-target'

// Android's share sheet POSTs the shared image here. There is no backend, so
// the service worker intercepts the request, stashes the image blob in the
// Cache API, then redirects to a page that reads it and runs photo search.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method === 'POST' && url.pathname === SHARE_TARGET_PATH) {
    event.respondWith(handleShareTarget(event.request))
  }
})

async function handleShareTarget(request: Request): Promise<Response> {
  try {
    const formData = await request.formData()
    const file = formData.get('photo')
    if (file instanceof File) {
      const cache = await caches.open(SHARE_CACHE)
      await cache.put('/shared-photo', new Response(file, { headers: { 'Content-Type': file.type || 'image/jpeg' } }))
    }
  } catch {
    // fall through to redirect regardless; the app will just show no shared image
  }
  return Response.redirect('/?shared=1', 303)
}
