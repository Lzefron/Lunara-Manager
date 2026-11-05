import 'fake-indexeddb/auto'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
const mock = vi.hoisted(() => ({ rows: {} as Record<string, any[]>, afterPush: null as null | (() => Promise<void>), download: null as null | (() => Promise<void>), pages: 0, pushes: [] as any[] }))
vi.mock('../src/lib/supabase', () => ({
  PHOTOS_BUCKET: 'product-photos',
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'test' } } } }) },
    from: (table: string) => ({
      upsert: async (rows: any[]) => {
        mock.pushes.push({ table, rows: structuredClone(rows) })
        for (const row of rows) {
          const current = (mock.rows[table] ?? []).find(r => r.id === row.id)
          if (!current) (mock.rows[table] ??= []).push(structuredClone(row))
          else if (Date.parse(row.updated_at) >= Date.parse(current.updated_at)) Object.assign(current, structuredClone(row))
        }
        const callback = mock.afterPush; mock.afterPush = null
        await callback?.()
        return { error: null }
      },
      select: () => ({ order: () => ({ range: async (start: number, end: number) => { mock.pages++; return { data: structuredClone((mock.rows[table] ?? []).slice(start, end + 1)), error: null } } }) }),
    }),
    storage: { from: () => ({ upload: async () => ({ error: null }), download: async () => { await mock.download?.(); return { data: new Blob(['photo']), error: null } } }) },
  },
}))
import { db, SYNC_META_ID } from '../src/db/db'
import { runSync } from '../src/lib/sync'
const stamp = '2026-10-14T00:00:00.000Z'
const product = (id = 'p', updated_at = stamp) => ({ id, name: 'Bag', created_at: stamp, updated_at, deleted: false, trashed_at: null, sell_price: 650, cost_rmb: 20, weight_g: 200, colors: ['Black'], available: true, photos: [], notes: 'private', price_code: 'code' })
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(stamp))
  mock.rows = {}; mock.pages = 0; mock.pushes = []; mock.afterPush = null; mock.download = null
  await Promise.all([db.products.clear(), db.orders.clear(), db.settings.clear(), db.replies.clear(), db.syncMeta.clear()])
})
afterEach(() => vi.useRealTimers())
test('an edit made during sync is pushed by the next sync', async () => {
  await db.products.put(product())
  mock.afterPush = async () => { await db.products.update('p', { name: 'Edited during sync', updated_at: '2026-10-14T00:00:01.000Z' }) }
  await runSync()
  expect((await db.syncMeta.get(SYNC_META_ID))?.last_synced_at).toBe(stamp)
  expect((await db.products.get('p'))?.name).toBe('Edited during sync')
  await runSync()
  expect(mock.rows.products[0].name).toBe('Edited during sync')
})
test('newer remote changes win over stale offline edits', async () => {
  await db.products.put(product())
  mock.rows.products = [{ ...product('p', '2026-10-14T01:00:00+00:00'), name: 'Newer on sister’s phone' }]
  await runSync()
  expect((await db.products.get('p'))?.name).toBe('Newer on sister’s phone')
})
test('recovery pages beyond the API row limit', async () => {
  mock.rows.products = Array.from({ length: 1007 }, (_, i) => product(String(i).padStart(4, '0')))
  const result = await runSync()
  expect(await db.products.count()).toBe(1007)
  expect(result.pulled).toBe(1007)
  expect(mock.pages).toBe(6) // 3 product pages plus orders/settings/replies
})
test('equivalent timestamp formats do not cause repeated photo downloads', async () => {
  await db.products.put(product())
  await db.syncMeta.put({ id: SYNC_META_ID, last_synced_at: '2026-10-14T02:00:00Z' })
  mock.rows.products = [{ ...product('p', '2026-10-14T00:00:00+00:00'), photos: [{ id: 'missing', phash: '', webp_path: 'p/a', thumb_path: 'p/b' }] }]
  const download = vi.fn(); mock.download = download
  await runSync()
  expect(download).not.toHaveBeenCalled()
})
test('a local edit made during photo download survives the pull', async () => {
  await db.products.put(product())
  await db.syncMeta.put({ id: SYNC_META_ID, last_synced_at: '2026-10-14T02:00:00Z' })
  mock.rows.products = [{ ...product('p', '2026-10-14T01:00:00Z'), photos: [{ id: 'photo', phash: '', webp_path: 'p/a', thumb_path: 'p/b' }] }]
  mock.download = async () => { await db.products.update('p', { name: 'Edit during photo download', updated_at: '2026-10-14T03:00:00Z' }) }
  await runSync()
  expect((await db.products.get('p'))?.name).toBe('Edit during photo download')
})
test('photo labels and type update even when photo bytes are already cached', async () => {
  const photo = { id: 'photo', phash: '', webp_blob: new Blob(['image']), thumb_blob: new Blob(['thumb']), label: 'Old', kind: 'catalog' as const }
  await db.products.put({ ...product(), photos: [photo] })
  await db.syncMeta.put({ id: SYNC_META_ID, last_synced_at: '2026-10-14T02:00:00Z' })
  mock.rows.products = [{ ...product('p', '2026-10-14T01:00:00Z'), photos: [{ id: 'photo', phash: '', webp_path: 'p/a', thumb_path: 'p/b', label: 'Black · mini', kind: 'real' }] }]
  const download = vi.fn(); mock.download = download
  await runSync()
  expect((await db.products.get('p'))?.photos[0].label).toBe('Black · mini')
  expect((await db.products.get('p'))?.photos[0].kind).toBe('real')
  expect(download).not.toHaveBeenCalled()
})

test('publishing an existing product preserves its id and syncs extra photo attributes', async () => {
  const photo = { id: 'real-photo', phash: '', webp_blob: new Blob(['image']), thumb_blob: new Blob(['thumb']), kind: 'real' as const, color: 'Black', size: 'M', design: 'Pearl strap' }
  await db.products.put({ ...product('existing'), catalog_visible: true, category: 'Bags', subcategory: 'Clutches', photos: [photo] })
  await runSync()
  expect(mock.rows.products).toHaveLength(1)
  expect(mock.rows.products[0].id).toBe('existing')
  expect(mock.rows.products[0].photos[0]).toMatchObject({ color: 'Black', size: 'M', design: 'Pearl strap' })
  await db.products.clear()
  await runSync()
  expect((await db.products.get('existing'))?.photos[0]).toMatchObject({ color: 'Black', size: 'M', design: 'Pearl strap' })
})
