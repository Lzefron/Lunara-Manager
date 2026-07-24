import { useState } from 'react'
import type { Order, OrderStatus } from '../../types'
import { ORDER_STATUS_LABELS } from '../../types'
import { db, nowIso } from '../../db/db'
import { Modal } from '../../components/Modal'
import { formatDate } from '../../lib/time'
import { errorMessage, showToast } from '../../lib/toast'
import { trashItem } from '../../lib/trash'

const PIPELINE: OrderStatus[] = ['china', 'shipped_bd', 'steadfast', 'delivered']

interface Props {
  order: Order
  onClose: () => void
  onEdit: () => void
  onDeleted: () => void
}

export function OrderDetail({ order, onClose, onEdit, onDeleted }: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function setStatus(status: OrderStatus) {
    try {
      await db.orders.update(order.id, {
        status,
        status_dates: { ...order.status_dates, [status]: nowIso() },
        updated_at: nowIso(),
      })
    } catch (err) {
      showToast(errorMessage(err, 'Could not update status.'))
    }
  }

  async function editDate(status: OrderStatus, value: string) {
    if (!value) return
    try {
      const iso = new Date(value).toISOString()
      await db.orders.update(order.id, {
        status_dates: { ...order.status_dates, [status]: iso },
        updated_at: nowIso(),
      })
    } catch (err) {
      showToast(errorMessage(err, 'Could not update the date.'))
    }
  }

  async function handleDelete() {
    try {
      await trashItem('orders', order.id)
      onDeleted()
    } catch (err) {
      showToast(errorMessage(err, 'Could not delete the order.'))
    }
  }

  async function updateTrackingId(value: string) {
    try {
      await db.orders.update(order.id, { steadfast_tracking_id: value, updated_at: nowIso() })
    } catch (err) {
      showToast(errorMessage(err, 'Could not save the tracking ID.'))
    }
  }

  const stampedStatuses = (Object.keys(order.status_dates) as OrderStatus[]).filter((s) => order.status_dates[s])

  return (
    <Modal title={order.customer_name} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">Status</span>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {PIPELINE.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatus(status)}
                className={`rounded-lg py-2.5 text-sm font-medium ${
                  order.status === status
                    ? 'bg-violet-600 text-white'
                    : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
                }`}
              >
                {ORDER_STATUS_LABELS[status]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setStatus('returned')}
            className={`mt-1.5 w-full rounded-lg py-2 text-sm font-medium ${
              order.status === 'returned'
                ? 'bg-red-600 text-white'
                : 'border border-red-300 text-red-600 dark:border-red-900'
            }`}
          >
            Returned
          </button>
        </div>

        {stampedStatuses.length > 0 && (
          <div>
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Status dates</span>
            <div className="space-y-1.5">
              {stampedStatuses.map((status) => (
                <div key={status} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500">{ORDER_STATUS_LABELS[status]}</span>
                  <input
                    type="date"
                    defaultValue={order.status_dates[status]?.slice(0, 10)}
                    onChange={(e) => editDate(status, e.target.value)}
                    className="rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-neutral-500">Phone</dt>
          <dd className="text-neutral-900 dark:text-neutral-100">{order.phone || '—'}</dd>
          <dt className="text-neutral-500">Address</dt>
          <dd className="text-neutral-900 dark:text-neutral-100">{order.address || '—'}</dd>
          <dt className="text-neutral-500">Total</dt>
          <dd className="font-semibold text-violet-600 dark:text-violet-400">৳{order.total_price}</dd>
          <dt className="text-neutral-500">Placed</dt>
          <dd className="text-neutral-900 dark:text-neutral-100">{formatDate(order.created_at)}</dd>
        </dl>

        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-500">Steadfast tracking ID</span>
          <div className="flex gap-2">
            <input
              defaultValue={order.steadfast_tracking_id}
              onBlur={(e) => updateTrackingId(e.target.value)}
              placeholder="Not set"
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
            />
            {order.steadfast_tracking_id && (
              <a
                href={`https://steadfast.com.bd/t/${order.steadfast_tracking_id}`}
                target="_blank"
                rel="noreferrer"
                className="whitespace-nowrap rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
              >
                Track
              </a>
            )}
          </div>
        </div>

        {order.notes && (
          <p className="rounded-lg bg-neutral-100 p-2.5 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            {order.notes}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 rounded-lg border border-neutral-300 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
          >
            Edit
          </button>
          {confirmingDelete ? (
            <button type="button" onClick={handleDelete} className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white">
              Confirm delete
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="flex-1 rounded-lg border border-red-300 py-2 text-sm font-medium text-red-600 dark:border-red-900"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
