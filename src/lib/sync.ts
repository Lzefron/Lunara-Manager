import type { Table } from 'dexie'
import { db, SYNC_META_ID } from '../db/db'
import { PHOTOS_BUCKET, supabase } from './supabase'
import type { Order, Photo, Product, Reply, Settings } from '../types'

const EPOCH = '1970-01-01T00:00:00.000Z'

const newer = (a: string, b: string) => Date.parse(a) > Date.parse(b)

// PostgREST caps individual responses; page so recovery includes every row.
async function fetchAll<T>(table: string): Promise<T[]> {
  if (!supabase) throw new Error('Supabase not configured')
  const rows: T[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from(table).select('*').order('id').range(offset, offset + 499)
    if (error) throw new Error(`Pull ${table} failed: ${error.message}`)
    rows.push(...(data ?? []) as T[])
    if (!data || data.length < 500) return rows
  }
}

interface RemotePhoto {
  id: string
  phash: string
  webp_path: string
  thumb_path: string
  kind?: 'catalog' | 'variant' | 'real'
  label?: string
  color?: string
  size?: string
  design?: string
}

type RemoteProduct = Omit<Product, 'photos'> & { photos: RemotePhoto[] }

async function pushSimpleTable<T extends { id: string; updated_at: string }>(
  table: string,
  dexieTable: Table<T, string>,
  since: string,
): Promise<number> {
  if (!supabase) throw new Error('Supabase not configured')
  const rows = await dexieTable.filter((r) => Date.parse(r.updated_at) >= Date.parse(since)).toArray()
  if (rows.length === 0) return 0
  const { error } = await supabase.from(table).upsert(rows)
  if (error) throw new Error(`Push ${table} failed: ${error.message}`)
  return rows.length
}

/**
 * Pull ALWAYS fetches the full current row set for a table — deliberately
 * not filtered by any "since" watermark. An earlier version filtered pull
 * by a timestamp, which is exactly what caused a real bug found in live
 * two-device testing (see CLAUDE.md "Wiped-device recovery" /
 * "Sync watermark bug"): any watermark-based pull is one clock-timing edge
 * case away from silently skipping a row forever, and that risk is
 * unacceptable for the specific guarantee this app needs — a wiped or
 * new device must be able to fully rebuild itself from the server. At this
 * app's scale (a small reselling business's catalog), fetching every row's
 * small JSON metadata every manual sync is trivially cheap; only photo
 * *blobs* are worth being incremental about (see pullProducts).
 */
async function pullSimpleTable<T extends { id: string; updated_at: string }>(
  table: string,
  dexieTable: Table<T, string>,
): Promise<number> {
  if (!supabase) throw new Error('Supabase not configured')
  const data = await fetchAll<T>(table)
  let applied = 0
  for (const remote of (data ?? []) as T[]) {
    await db.transaction('rw', dexieTable, async () => {
      const local = await dexieTable.get(remote.id)
      if (!local || newer(remote.updated_at, local.updated_at)) {
        await dexieTable.put(remote)
        applied++
      }
    })
  }
  return applied
}

function photoPaths(productId: string, photoId: string) {
  return {
    webp_path: `${productId}/${photoId}.webp`,
    thumb_path: `${productId}/${photoId}_thumb.webp`,
  }
}

async function pushProducts(since: string): Promise<number> {
  if (!supabase) throw new Error('Supabase not configured')
  const products = await db.products.filter((p) => Date.parse(p.updated_at) >= Date.parse(since)).toArray()
  if (products.length === 0) return 0

  for (const product of products) {
    for (const photo of product.photos) {
      const { webp_path, thumb_path } = photoPaths(product.id, photo.id)
      const [webpUpload, thumbUpload] = await Promise.all([
        supabase.storage.from(PHOTOS_BUCKET).upload(webp_path, photo.webp_blob, { upsert: true, contentType: 'image/webp' }),
        supabase.storage.from(PHOTOS_BUCKET).upload(thumb_path, photo.thumb_blob, { upsert: true, contentType: 'image/webp' }),
      ])
      if (webpUpload.error) throw new Error(`Photo upload failed: ${webpUpload.error.message}`)
      if (thumbUpload.error) throw new Error(`Thumbnail upload failed: ${thumbUpload.error.message}`)
    }
  }

  const remoteRows: RemoteProduct[] = products.map((product) => ({
    ...product,
    photos: product.photos.map((photo) => ({
      id: photo.id,
      phash: photo.phash,
      kind: photo.kind ?? 'catalog',
      label: photo.label ?? '', color: photo.color ?? '', size: photo.size ?? '', design: photo.design ?? '',
      ...photoPaths(product.id, photo.id),
    })),
  }))

  const { error } = await supabase.from('products').upsert(remoteRows)
  if (error) throw new Error(`Push products failed: ${error.message}`)
  return products.length
}

async function downloadPhoto(product_id: string, remote: RemotePhoto): Promise<Photo> {
  if (!supabase) throw new Error('Supabase not configured')
  const [webpRes, thumbRes] = await Promise.all([
    supabase.storage.from(PHOTOS_BUCKET).download(remote.webp_path),
    supabase.storage.from(PHOTOS_BUCKET).download(remote.thumb_path),
  ])
  if (webpRes.error) throw new Error(`Photo download failed (${product_id}): ${webpRes.error.message}`)
  if (thumbRes.error) throw new Error(`Thumbnail download failed (${product_id}): ${thumbRes.error.message}`)
  return { id: remote.id, phash: remote.phash, kind: remote.kind, label: remote.label, color: remote.color, size: remote.size, design: remote.design, webp_blob: webpRes.data, thumb_blob: thumbRes.data }
}

/** Every photo id currently cached locally, across all products — a photo's bytes never change once uploaded, so a cache hit never needs re-downloading. */
async function localPhotoIndex(): Promise<Map<string, Photo>> {
  const products = await db.products.toArray()
  const index = new Map<string, Photo>()
  for (const product of products) {
    for (const photo of product.photos) index.set(photo.id, photo)
  }
  return index
}

async function pullProducts(): Promise<number> {
  if (!supabase) throw new Error('Supabase not configured')
  const data = await fetchAll<RemoteProduct>('products')

  const cache = await localPhotoIndex()
  let applied = 0
  for (const remote of (data ?? []) as RemoteProduct[]) {
    const local = await db.products.get(remote.id)
    if (local && !newer(remote.updated_at, local.updated_at)) continue

    const photos = await Promise.all(
      remote.photos.map((p) => {
        const cached = cache.get(p.id)
        return cached ? { ...cached, kind: p.kind, label: p.label, color: p.color, size: p.size, design: p.design } : downloadPhoto(remote.id, p)
      }),
    )
    const product: Product = { ...remote, photos }
    // Downloading photos can take time. Re-read inside a transaction so an
    // edit saved while a download runs cannot be overwritten by this pull.
    await db.transaction('rw', db.products, async () => {
      const current = await db.products.get(remote.id)
      if (!current || newer(remote.updated_at, current.updated_at)) {
        await db.products.put(product)
        applied++
      }
    })
  }
  return applied
}

export interface SyncResult {
  pushed: number
  pulled: number
}

/**
 * Push local changes since the last sync (incremental — safe, since a
 * device can only ever push what it actually has, and an empty/wiped
 * device naturally pushes nothing), then pull the full current dataset
 * (always-complete — see pullSimpleTable), merging last-write-wins on
 * `updated_at`. A pulled echo of what we just pushed is a safe no-op
 * (equal timestamps). The watermark used for the *next* push is simply
 * the start of this sync so local edits made during network work are still
 * dirty on the next pass. The database rejects stale writes from other devices.
 */
let pending: Promise<SyncResult> | null = null
export function runSync(): Promise<SyncResult> {
  if (pending) return pending
  // Web Locks serializes multiple open tabs sharing this IndexedDB.
  pending = (navigator.locks
    ? navigator.locks.request('lunara-sync', () => syncOnce())
    : syncOnce()).finally(() => { pending = null })
  return pending
}

async function syncOnce(): Promise<SyncResult> {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  }
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in.')

  const startedAt = new Date().toISOString()
  const meta = await db.syncMeta.get(SYNC_META_ID)
  const since = meta?.last_synced_at ?? EPOCH

  let pushed = 0
  pushed += await pushProducts(since)
  pushed += await pushSimpleTable<Order>('orders', db.orders, since)
  pushed += await pushSimpleTable<Settings>('settings', db.settings, since)
  pushed += await pushSimpleTable<Reply>('replies', db.replies, since)

  let pulled = 0
  pulled += await pullProducts()
  pulled += await pullSimpleTable<Order>('orders', db.orders)
  pulled += await pullSimpleTable<Settings>('settings', db.settings)
  pulled += await pullSimpleTable<Reply>('replies', db.replies)

  // Use the START, so edits made during network I/O are retried next time.
  await db.syncMeta.put({ id: SYNC_META_ID, last_synced_at: startedAt })
  return { pushed, pulled }
}
