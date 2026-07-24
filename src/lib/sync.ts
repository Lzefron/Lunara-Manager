import type { Table } from 'dexie'
import { db, SYNC_META_ID } from '../db/db'
import { PHOTOS_BUCKET, supabase } from './supabase'
import type { Order, Photo, Product, Reply, Settings } from '../types'

const EPOCH = '1970-01-01T00:00:00.000Z'

interface RemotePhoto {
  id: string
  phash: string
  webp_path: string
  thumb_path: string
}

type RemoteProduct = Omit<Product, 'photos'> & { photos: RemotePhoto[]; server_updated_at: string }
type WithServerTs<T> = T & { server_updated_at: string }

interface StepResult {
  count: number
  maxServerTs: string
}

function laterOf(a: string, b: string): string {
  return b > a ? b : a
}

function maxServerTsOf(rows: { server_updated_at: string }[], fallback: string): string {
  return rows.reduce((max, row) => laterOf(max, row.server_updated_at), fallback)
}

async function pushSimpleTable<T extends { id: string; updated_at: string }>(
  table: string,
  dexieTable: Table<T, string>,
  since: string,
): Promise<StepResult> {
  if (!supabase) throw new Error('Supabase not configured')
  const rows = await dexieTable.filter((r) => r.updated_at > since).toArray()
  if (rows.length === 0) return { count: 0, maxServerTs: since }
  const { data, error } = await supabase.from(table).upsert(rows).select('server_updated_at')
  if (error) throw new Error(`Push ${table} failed: ${error.message}`)
  return { count: rows.length, maxServerTs: maxServerTsOf((data ?? []) as { server_updated_at: string }[], since) }
}

async function pullSimpleTable<T extends { id: string; updated_at: string }>(
  table: string,
  dexieTable: Table<T, string>,
  since: string,
): Promise<StepResult> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.from(table).select('*').gt('server_updated_at', since)
  if (error) throw new Error(`Pull ${table} failed: ${error.message}`)
  const rows = (data ?? []) as WithServerTs<T>[]
  let applied = 0
  for (const remote of rows) {
    const local = await dexieTable.get(remote.id)
    if (!local || remote.updated_at > local.updated_at) {
      const { server_updated_at: _server_updated_at, ...rest } = remote
      await dexieTable.put(rest as unknown as T)
      applied++
    }
  }
  return { count: applied, maxServerTs: maxServerTsOf(rows, since) }
}

function photoPaths(productId: string, photoId: string) {
  return {
    webp_path: `${productId}/${photoId}.webp`,
    thumb_path: `${productId}/${photoId}_thumb.webp`,
  }
}

async function pushProducts(since: string): Promise<StepResult> {
  if (!supabase) throw new Error('Supabase not configured')
  const products = await db.products.filter((p) => p.updated_at > since).toArray()
  if (products.length === 0) return { count: 0, maxServerTs: since }

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

  const remoteRows = products.map((product) => ({
    ...product,
    photos: product.photos.map((photo) => ({
      id: photo.id,
      phash: photo.phash,
      ...photoPaths(product.id, photo.id),
    })),
  }))

  const { data, error } = await supabase.from('products').upsert(remoteRows).select('server_updated_at')
  if (error) throw new Error(`Push products failed: ${error.message}`)
  return { count: products.length, maxServerTs: maxServerTsOf((data ?? []) as { server_updated_at: string }[], since) }
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

async function pullProducts(since: string): Promise<StepResult> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.from('products').select('*').gt('server_updated_at', since)
  if (error) throw new Error(`Pull products failed: ${error.message}`)
  const rows = (data ?? []) as RemoteProduct[]

  let applied = 0
  for (const remote of rows) {
    const local = await db.products.get(remote.id)
    if (local && remote.updated_at <= local.updated_at) continue

    const photos = await Promise.all(remote.photos.map((p) => downloadPhoto(remote.id, p)))
    const { server_updated_at: _server_updated_at, ...rest } = remote
    const product: Product = { ...rest, photos }
    await db.products.put(product)
    applied++
  }
  return { count: applied, maxServerTs: maxServerTsOf(rows, since) }
}

export interface SyncResult {
  pushed: number
  pulled: number
}

/**
 * Push local changes since the last sync, then pull remote changes since the
 * same watermark, merging last-write-wins on `updated_at`.
 *
 * The pull watermark is tracked against `server_updated_at` (a
 * trigger-assigned, server-clock timestamp — see migration 0002), NOT the
 * client-supplied `updated_at` used for last-write-wins. Using `updated_at`
 * for both purposes was a real bug found in live two-device testing: a
 * device's own watermark (set to its local "now" right after its own sync)
 * can end up chronologically after another device's *edit* timestamp even
 * though that edit hadn't been pushed to the server yet. Once it finally
 * was pushed, `updated_at > since` was false forever and the change was
 * silently never pulled again. `server_updated_at` is monotonic in actual
 * write order, which is what an incremental-pull watermark needs.
 *
 * The watermark only advances to the max `server_updated_at` actually
 * observed this round (from both our own push's response and any pulled
 * rows) — never to "now" — so a failure partway through leaves the next
 * attempt to safely redo the same idempotent (upsert-by-id) work rather
 * than risk skipping something.
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
  let watermark = since

  let pushed = 0
  for (const step of [
    await pushProducts(since),
    await pushSimpleTable<Order>('orders', db.orders, since),
    await pushSimpleTable<Settings>('settings', db.settings, since),
    await pushSimpleTable<Reply>('replies', db.replies, since),
  ]) {
    pushed += step.count
    watermark = laterOf(watermark, step.maxServerTs)
  }

  let pulled = 0
  for (const step of [
    await pullProducts(since),
    await pullSimpleTable<Order>('orders', db.orders, since),
    await pullSimpleTable<Settings>('settings', db.settings, since),
    await pullSimpleTable<Reply>('replies', db.replies, since),
  ]) {
    pulled += step.count
    watermark = laterOf(watermark, step.maxServerTs)
  }

  await db.syncMeta.put({ id: SYNC_META_ID, last_synced_at: watermark })
  return { pushed, pulled }
}
