import { useLiveQuery } from 'dexie-react-hooks'
import { db, SETTINGS_ID } from '../../db/db'
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from '../../types'
import { daysSince, formatDate, isSameDay, isSameMonth } from '../../lib/time'

const STUCK_STATUSES = ['china', 'shipped_bd', 'steadfast'] as const
const STUCK_THRESHOLD_DAYS = 7

export function DashboardPage() {
  const orders = useLiveQuery(() => db.orders.filter((o) => !o.deleted).toArray(), [])
  const products = useLiveQuery(() => db.products.filter((p) => !p.deleted).toArray(), [])
  const settings = useLiveQuery(() => db.settings.get(SETTINGS_ID))

  const now = new Date()

  const counts = ORDER_STATUSES.map((status) => ({
    status,
    count: orders?.filter((o) => o.status === status).length ?? 0,
  }))

  const ordersToday = orders?.filter((o) => isSameDay(o.created_at, now)).length ?? 0
  const ordersThisMonth = orders?.filter((o) => isSameMonth(o.created_at, now)).length ?? 0

  const { revenue, profit } = (() => {
    if (!orders || !products || !settings) return { revenue: 0, profit: 0 }
    const productsById = new Map(products.map((p) => [p.id, p]))
    const rate = settings.rmb_to_bdt_rate
    const shippingRate = settings.shipping_rate_per_kg

    let revenue = 0
    let cost = 0
    for (const order of orders) {
      if (order.status === 'returned' || !isSameMonth(order.created_at, now)) continue
      revenue += order.total_price
      for (const productId of order.product_ids) {
        const product = productsById.get(productId)
        if (!product) continue
        cost += product.cost_rmb * rate + (product.weight_g / 1000) * shippingRate
      }
    }
    return { revenue, profit: revenue - cost }
  })()

  const stuckOrders = (orders ?? [])
    .filter((o) => (STUCK_STATUSES as readonly string[]).includes(o.status))
    .filter((o) => daysSince(o.status_dates[o.status] ?? o.created_at, now) > STUCK_THRESHOLD_DAYS)
    .sort((a, b) => (a.status_dates[a.status] ?? a.created_at).localeCompare(b.status_dates[b.status] ?? b.created_at))

  const loading = !orders || !products || !settings

  return (
    <div className="p-4">
      <h1 className="mb-3 text-xl font-semibold text-neutral-900 dark:text-neutral-100">Dashboard</h1>
      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {counts.map(({ status, count }) => (
              <div key={status} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{count}</p>
                <p className="text-xs text-neutral-500">{ORDER_STATUS_LABELS[status]}</p>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
              <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{ordersToday}</p>
              <p className="text-xs text-neutral-500">Orders today</p>
            </div>
            <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
              <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{ordersThisMonth}</p>
              <p className="text-xs text-neutral-500">Orders this month</p>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
              <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">৳{revenue.toFixed(0)}</p>
              <p className="text-xs text-neutral-500">Revenue this month</p>
            </div>
            <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
              <p className={`text-2xl font-semibold ${profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                ৳{profit.toFixed(0)}
              </p>
              <p className="text-xs text-neutral-500">Est. profit this month</p>
            </div>
          </section>

          <section>
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Stuck orders (7+ days, no status change)
            </h2>
            {stuckOrders.length === 0 ? (
              <p className="text-sm text-neutral-500">Nothing stuck. Nice.</p>
            ) : (
              <ul className="space-y-2">
                {stuckOrders.map((o) => (
                  <li key={o.id} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">{o.customer_name}</span>
                      <span className="text-xs text-amber-700 dark:text-amber-400">{ORDER_STATUS_LABELS[o.status]}</span>
                    </div>
                    <p className="text-xs text-neutral-500">Since {formatDate(o.status_dates[o.status] ?? o.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
