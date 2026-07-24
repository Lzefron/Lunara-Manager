import Dexie, { type Table } from 'dexie'
import type { Order, Product, Reply, Settings, SyncMeta } from '../types'

export class LunaraDB extends Dexie {
  products!: Table<Product, string>
  orders!: Table<Order, string>
  settings!: Table<Settings, string>
  replies!: Table<Reply, string>
  syncMeta!: Table<SyncMeta, string>

  constructor() {
    super('lunara-db')
    // `deleted` and `available` are booleans, which IndexedDB cannot index as
    // key values — those fields are filtered in memory instead.
    this.version(1).stores({
      products: 'id, name, updated_at',
      orders: 'id, status, updated_at, phone, customer_name',
      settings: 'id',
      replies: 'id, category, updated_at',
      syncMeta: 'id',
    })
    // v2: adds trashed_at (indexed — null entries are simply skipped by
    // IndexedDB, which is fine, we only ever query it for non-null values).
    this.version(2).stores({
      products: 'id, name, updated_at, trashed_at',
      orders: 'id, status, updated_at, phone, customer_name, trashed_at',
      settings: 'id',
      replies: 'id, category, updated_at, trashed_at',
      syncMeta: 'id',
    })
  }
}

export const db = new LunaraDB()

export const SETTINGS_ID = 'default'
export const SYNC_META_ID = 'default'

export function nowIso(): string {
  return new Date().toISOString()
}

export function newId(): string {
  return crypto.randomUUID()
}
