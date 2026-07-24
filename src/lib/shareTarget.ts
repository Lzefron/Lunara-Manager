const SHARE_CACHE = 'lunara-share-target'
const SHARE_KEY = '/shared-photo'

/** Reads (and clears) the photo stashed by the service worker's share-target handler. */
export async function consumeSharedPhoto(): Promise<Blob | null> {
  if (!('caches' in window)) return null
  const cache = await caches.open(SHARE_CACHE)
  const res = await cache.match(SHARE_KEY)
  if (!res) return null
  const blob = await res.blob()
  await cache.delete(SHARE_KEY)
  return blob
}
