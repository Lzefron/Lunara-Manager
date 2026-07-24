import { db, newId, nowIso, SETTINGS_ID, SYNC_META_ID } from './db'
import type { Order, Photo, Product, Reply, Settings } from '../types'
import { compressImage, computePHash } from '../lib/image'
import { drawPlaceholder } from '../lib/placeholder'
import { generatePriceCode } from '../lib/pricing'

const SAMPLE_PRODUCTS: Array<{
  name: string
  sell_price: number
  cost_rmb: number
  weight_g: number
  colors: string[]
  notes: string
}> = [
  {
    name: 'Korean Fleece Hoodie',
    sell_price: 950,
    cost_rmb: 42,
    weight_g: 450,
    colors: ['Black', 'Beige', 'Grey'],
    notes: 'Popular winter item, restock every 2 months.',
  },
  {
    name: 'Minimalist Crossbody Bag',
    sell_price: 650,
    cost_rmb: 28,
    weight_g: 300,
    colors: ['Black', 'Tan'],
    notes: 'Comes with adjustable strap.',
  },
  {
    name: 'Wireless Earbuds Pro',
    sell_price: 1250,
    cost_rmb: 55,
    weight_g: 120,
    colors: ['White', 'Black'],
    notes: 'Check battery before shipping.',
  },
]

async function makePhoto(label: string, index: number): Promise<Photo> {
  const source = await drawPlaceholder(label, index)
  const [webp_blob, thumb_blob, phash] = await Promise.all([
    compressImage(source, 800, 0.8),
    compressImage(source, 150, 0.7),
    computePHash(source),
  ])
  return { id: newId(), webp_blob, thumb_blob, phash }
}

async function buildSeedProducts(): Promise<Product[]> {
  return Promise.all(
    SAMPLE_PRODUCTS.map(async (p, i) => {
      const photo = await makePhoto(p.name, i)
      const ts = nowIso()
      const product: Product = {
        id: newId(),
        created_at: ts,
        updated_at: ts,
        deleted: false,
        name: p.name,
        sell_price: p.sell_price,
        cost_rmb: p.cost_rmb,
        weight_g: p.weight_g,
        colors: p.colors,
        available: true,
        photos: [photo],
        notes: p.notes,
        price_code: generatePriceCode(p.sell_price),
      }
      return product
    }),
  )
}

function buildSeedOrders(productIds: string[]): Order[] {
  const ts = nowIso()
  return [
    {
      id: newId(),
      created_at: ts,
      updated_at: ts,
      deleted: false,
      customer_name: 'Farhana Akter',
      phone: '01712345678',
      address: 'House 12, Road 5, Dhanmondi, Dhaka',
      product_ids: productIds.slice(0, 1),
      total_price: 950,
      status: 'steadfast',
      status_dates: {
        china: '2026-07-10T10:00:00.000Z',
        shipped_bd: '2026-07-16T10:00:00.000Z',
        steadfast: '2026-07-20T10:00:00.000Z',
      },
      steadfast_tracking_id: 'ST123456789',
      notes: '',
    },
    {
      id: newId(),
      created_at: ts,
      updated_at: ts,
      deleted: false,
      customer_name: 'Rakibul Hasan',
      phone: '01899887766',
      address: 'Agrabad, Chattogram',
      product_ids: productIds.slice(1, 2),
      total_price: 650,
      status: 'china',
      status_dates: {
        china: '2026-07-22T10:00:00.000Z',
      },
      steadfast_tracking_id: '',
      notes: 'Wants tan color specifically.',
    },
  ]
}

function buildSeedReplies(): Reply[] {
  const ts = nowIso()
  return [
    {
      id: newId(),
      created_at: ts,
      updated_at: ts,
      deleted: false,
      category: 'Greeting',
      title: 'Welcome',
      text: 'আসসালামু আলাইকুম! Lunara তে স্বাগতম। কীভাবে সাহায্য করতে পারি?',
    },
    {
      id: newId(),
      created_at: ts,
      updated_at: ts,
      deleted: false,
      category: 'Price',
      title: 'Price + delivery included',
      text: 'দাম উল্লেখ করা আছে ছবির উপরে। ডেলিভারি চার্জ আলাদা (ঢাকার ভিতরে ৬০৳, বাইরে ১২০৳)।',
    },
    {
      id: newId(),
      created_at: ts,
      updated_at: ts,
      deleted: false,
      category: 'Delivery',
      title: 'Delivery time',
      text: 'অর্ডার করার পর সাধারণত ৭-১০ দিনের মধ্যে ডেলিভারি হয়ে থাকে।',
    },
    {
      id: newId(),
      created_at: ts,
      updated_at: ts,
      deleted: false,
      category: 'Payment',
      title: 'Cash on delivery',
      text: 'আমরা ক্যাশ অন ডেলিভারি সুবিধা দিয়ে থাকি। পণ্য হাতে পেয়ে টাকা পরিশোধ করবেন।',
    },
  ]
}

function defaultSettings(): Settings {
  const ts = nowIso()
  return {
    id: SETTINGS_ID,
    created_at: ts,
    updated_at: ts,
    deleted: false,
    rmb_to_bdt_rate: 16.5,
    shipping_rate_per_kg: 900,
    default_profit_mode: 'percent',
    default_profit_value: 30,
  }
}

/**
 * Seeds first-run sample data. The empty-check and the writes happen inside
 * one Dexie transaction: IndexedDB serializes overlapping readwrite
 * transactions on the same stores, so concurrent callers (React StrictMode's
 * double effect invocation, or two open tabs) can't both see "empty" and
 * double-insert — the second caller's re-check inside the transaction sees
 * the first caller's writes.
 */
export async function seedIfEmpty(): Promise<void> {
  const [productCount, orderCount, replyCount, hasSettings, hasSyncMeta] = await Promise.all([
    db.products.count(),
    db.orders.count(),
    db.replies.count(),
    db.settings.get(SETTINGS_ID).then((r) => !!r),
    db.syncMeta.get(SYNC_META_ID).then((r) => !!r),
  ])

  if (productCount > 0 && orderCount > 0 && replyCount > 0 && hasSettings && hasSyncMeta) return

  const seedProducts = productCount === 0 ? await buildSeedProducts() : []

  await db.transaction('rw', [db.products, db.orders, db.replies, db.settings, db.syncMeta], async () => {
    if ((await db.settings.get(SETTINGS_ID)) === undefined) {
      await db.settings.put(defaultSettings())
    }
    if ((await db.syncMeta.get(SYNC_META_ID)) === undefined) {
      await db.syncMeta.put({ id: SYNC_META_ID, last_synced_at: null })
    }
    if (seedProducts.length > 0 && (await db.products.count()) === 0) {
      await db.products.bulkAdd(seedProducts)
    }
    if ((await db.orders.count()) === 0) {
      const productIds =
        seedProducts.length > 0 ? seedProducts.map((p) => p.id) : await db.products.toCollection().primaryKeys()
      await db.orders.bulkAdd(buildSeedOrders(productIds as string[]))
    }
    if ((await db.replies.count()) === 0) {
      await db.replies.bulkAdd(buildSeedReplies())
    }
  })
}
