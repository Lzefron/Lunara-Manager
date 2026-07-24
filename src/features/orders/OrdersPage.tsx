import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Order, OrderStatus } from '../../types'
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from '../../types'
import { formatDate } from '../../lib/time'
import { OrderPasteBox } from './OrderPasteBox'
import { OrderForm } from './OrderForm'
import { OrderDetail } from './OrderDetail'
import type { ParsedOrder } from '../../lib/orderParser'

export function OrdersPage() {
  const orders = useLiveQuery(() => db.orders.filter((o) => !o.deleted).toArray(), [])
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null)
  const [formTarget, setFormTarget] = useState<Order | 'new' | null>(null)
  const [prefill, setPrefill] = useState<ParsedOrder | undefined>(undefined)

  // Look the detail order up live (rather than holding a snapshot) so status
  // taps and date edits made inside OrderDetail re-render immediately.
  const detailOrder = detailOrderId ? orders?.find((o) => o.id === detailOrderId) ?? null : null

  const visible = useMemo(() => {
    if (!orders) return []
    let list = orders
    if (statusFilter !== 'all') list = list.filter((o) => o.status === statusFilter)
    if (fromDate) list = list.filter((o) => o.created_at >= fromDate)
    if (toDate) list = list.filter((o) => o.created_at <= `${toDate}T23:59:59.999Z`)
    return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [orders, statusFilter, fromDate, toDate])

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Orders</h1>
        <button
          type="button"
          onClick={() => {
            setPrefill(undefined)
            setFormTarget('new')
          }}
          className="rounded-full bg-violet-600 px-3.5 py-1.5 text-sm font-medium text-white"
        >
          + Add
        </button>
      </div>

      <OrderPasteBox
        onParsed={(parsed) => {
          setPrefill(parsed)
          setFormTarget('new')
        }}
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
          className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        >
          <option value="all">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      </div>

      {!orders ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-neutral-500">No orders match.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((order) => (
            <li key={order.id}>
              <button
                type="button"
                onClick={() => setDetailOrderId(order.id)}
                className="w-full rounded-lg border border-neutral-200 p-3 text-left dark:border-neutral-800"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">{order.customer_name}</span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-sm text-neutral-500">
                  <span>{order.phone}</span>
                  <span>{formatDate(order.created_at)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {detailOrder && (
        <OrderDetail
          order={detailOrder}
          onClose={() => setDetailOrderId(null)}
          onEdit={() => {
            setFormTarget(detailOrder)
            setDetailOrderId(null)
          }}
          onDeleted={() => setDetailOrderId(null)}
        />
      )}

      {formTarget && (
        <OrderForm
          order={formTarget === 'new' ? null : formTarget}
          prefill={prefill}
          onClose={() => setFormTarget(null)}
          onSaved={() => setFormTarget(null)}
        />
      )}
    </div>
  )
}
