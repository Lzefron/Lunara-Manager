import type { Table } from 'dexie'
import { db, SYNC_META_ID, nowIso } from '../db/db'
import { PHOTOS_BUCKET, supabase } from './supabase'
import type { Order, Photo, Product, Reply, Settings } from '../types'

const EPOCH = '1970-01-01T00:00:00.000Z'

interface RemotePhoto {
  id: string
  phash: string
  webp_path: string
  thumb_path: string
}

type RemoteProduct = Omit<Product, 'photos'> & { photos: RemotePhoto[] }

async function pushSimpleTable<T extends { id: string; updated_at: string }>(
  table: string,
  dexieTable: Table<T, string>,
  since: string,
): Promise<number> {
  if (!supabase) throw new Error('Supabase not configured')
  const rows = await dexieTable.filter((r) => r.updated_at > since).toArray()
  if (rows.length === 0) return 0
  const { error } = await supabase.from(table).upsert(rows)
  if (error) throw new Error(`Push ${table} failed: ${error.message}`)
  return rows.length
}

async function pullSimpleTable<T extends { id: string; updated_at: string }>(
  table: string,
  dexieTable: Table<T, string>,
  since: string,
): Promise<number> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.from(table).select('*').gt('updated_at', since)
  if (error) throw new Error(`Pull ${table} failed: ${error.message}`)
  let applied = 0
  for (const remote of (data ?? []) as T[]) {
    const local = await dexieTable.get(remote.id)
    if (!local || remote.updated_at > local.updated_at) {
      await dexieTable.put(remote)
      applied++
    }
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
  const products = await db.products.filter((p) => p.updated_at > since).toArray()
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
  return { id: remote.id, phash: remote.phash, webp_blob: webpRes.data, thumb_blob: thumbRes.data }
}

async function pullProducts(since: string): Promise<number> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.from('products').select('*').gt('updated_at', since)
  if (error) throw new Error(`Pull products failed: ${error.message}`)

  let applied = 0
  for (const remote of (data ?? []) as RemoteProduct[]) {
    const local = await db.products.get(remote.id)
    if (local && remote.updated_at <= local.updated_at) continue

    const photos = await Promise.all(remote.photos.map((p) => downloadPhoto(remote.id, p)))
    const product: Product = { ...remote, photos }
    await db.products.put(product)
    applied++
  }
  return applied
}

export interface SyncResult {
  pushed: number
  pulled: number
}

/**
 * Push local changes since the last sync, then pull remote changes since the
 * same watermark, merging last-write-wins on `updated_at`. The watermark
 * only advances after every step succeeds, so a failure partway through
 * just leaves the next sync attempt to safely redo the same (idempotent,
 * upsert-by-id) work — it can't corrupt local data.
 */
export async function runSync(): Promise<SyncResult> {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  }
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in.')

  const meta = await db.syncMeta.get(SYNC_META_ID)
  const since = meta?.last_synced_at ?? EPOCH

  let pushed = 0
  pushed += await pushProducts(since)
  pushed += await pushSimpleTable<Order>('orders', db.orders, since)
  pushed += await pushSimpleTable<Settings>('settings', db.settings, since)
  pushed += await pushSimpleTable<Reply>('replies', db.replies, since)

  let pulled = 0
  pulled += await pullProducts(since)
  pulled += await pullSimpleTable<Order>('orders', db.orders, since)
  pulled += await pullSimpleTable<Settings>('settings', db.settings, since)
  pulled += await pullSimpleTable<Reply>('replies', db.replies, since)

  await db.syncMeta.put({ id: SYNC_META_ID, last_synced_at: nowIso() })
  return { pushed, pulled }
}
