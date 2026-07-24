import { db, nowIso } from '../db/db'
import type { Order, Product, Reply } from '../types'

export const TRASH_RETENTION_DAYS = 7

export type TrashableTable = 'products' | 'orders' | 'replies'

export interface TrashEntry {
  table: TrashableTable
  id: string
  label: string
  trashed_at: string
}

/** Move an item to trash: hidden from every normal view, recoverable, syncs like any other edit. */
export async function trashItem(table: TrashableTable, id: string): Promise<void> {
  const ts = nowIso()
  const patch = { trashed_at: ts, updated_at: ts }
  if (table === 'products') await db.products.update(id, patch)
  else if (table === 'orders') await db.orders.update(id, patch)
  else await db.replies.update(id, patch)
}

/** Bring an item back from trash. */
export async function restoreItem(table: TrashableTable, id: string): Promise<void> {
  const ts = nowIso()
  const patch = { trashed_at: null, updated_at: ts }
  if (table === 'products') await db.products.update(id, patch)
  else if (table === 'orders') await db.orders.update(id, patch)
  else await db.replies.update(id, patch)
}

/**
 * Permanently delete: the only path to an irreversible removal. Implemented
 * as a tombstone (`deleted: true`), reusing the exact mechanism that's
 * already proven to propagate correctly through sync (see lib/sync.ts) —
 * other devices pull the tombstoned row and it disappears from their views
 * too, the next time they sync.
 */
async function tombstone(table: TrashableTable, id: string, ts: string): Promise<void> {
  const patch = { deleted: true, updated_at: ts }
  if (table === 'products') await db.products.update(id, patch)
  else if (table === 'orders') await db.orders.update(id, patch)
  else await db.replies.update(id, patch)
}

async function trashedItems(table: TrashableTable): Promise<Array<Product | Order | Reply>> {
  if (table === 'products') return db.products.filter((p) => !!p.trashed_at && !p.deleted).toArray()
  if (table === 'orders') return db.orders.filter((o) => !!o.trashed_at && !o.deleted).toArray()
  return db.replies.filter((r) => !!r.trashed_at && !r.deleted).toArray()
}

/** Permanently delete everything currently in trash. Returns how many items were removed. */
export async function emptyTrash(): Promise<number> {
  const ts = nowIso()
  let count = 0
  for (const table of ['products', 'orders', 'replies'] as const) {
    const items = await trashedItems(table)
    for (const item of items) await tombstone(table, item.id, ts)
    count += items.length
  }
  return count
}

/** Permanently delete only items that have been trashed longer than the retention window. */
export async function purgeExpiredTrash(): Promise<number> {
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
  const ts = nowIso()
  let count = 0
  for (const table of ['products', 'orders', 'replies'] as const) {
    const items = await trashedItems(table)
    const expired = items.filter((item) => new Date(item.trashed_at as string).getTime() < cutoff)
    for (const item of expired) await tombstone(table, item.id, ts)
    count += expired.length
  }
  return count
}

function labelFor(table: TrashableTable, item: Product | Order | Reply): string {
  if (table === 'products') return (item as Product).name
  if (table === 'orders') return (item as Order).customer_name
  return (item as Reply).title
}

/** All trashed items across every table, newest-trashed first, for the Trash view. */
export async function listTrashed(): Promise<TrashEntry[]> {
  const entries: TrashEntry[] = []
  for (const table of ['products', 'orders', 'replies'] as const) {
    const items = await trashedItems(table)
    for (const item of items) {
      entries.push({ table, id: item.id, label: labelFor(table, item), trashed_at: item.trashed_at as string })
    }
  }
  entries.sort((a, b) => b.trashed_at.localeCompare(a.trashed_at))
  return entries
}
