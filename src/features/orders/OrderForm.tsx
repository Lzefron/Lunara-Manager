import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Order } from '../../types'
import { db, newId, nowIso } from '../../db/db'
import { Modal } from '../../components/Modal'
import { ProductPicker } from './ProductPicker'
import type { ParsedOrder } from '../../lib/orderParser'
import { errorMessage, showToast } from '../../lib/toast'

interface Props {
  order: Order | null
  prefill?: ParsedOrder
  onClose: () => void
  onSaved: (order: Order) => void
}

interface FormState {
  customer_name: string
  phone: string
  address: string
  product_ids: string[]
  total_price: string
  notes: string
}

function toFormState(order: Order | null, prefill?: ParsedOrder): FormState {
  if (order) {
    return {
      customer_name: order.customer_name,
      phone: order.phone,
      address: order.address,
      product_ids: order.product_ids,
      total_price: String(order.total_price),
      notes: order.notes,
    }
  }
  return {
    customer_name: prefill?.name ?? '',
    phone: prefill?.phone ?? '',
    address: prefill?.address ?? '',
    product_ids: [],
    total_price: '',
    notes: '',
  }
}

export function OrderForm({ order, prefill, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => toFormState(order, prefill))
  const [saving, setSaving] = useState(false)
  const products = useLiveQuery(() => db.products.filter((p) => !p.deleted).toArray(), [])

  const suggestedTotal = useMemo(() => {
    if (!products) return 0
    return form.product_ids.reduce((sum, id) => sum + (products.find((p) => p.id === id)?.sell_price ?? 0), 0)
  }, [products, form.product_ids])

  const canSave = form.customer_name.trim() !== '' && form.phone.trim() !== ''

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const ts = nowIso()
      const saved: Order = {
        id: order?.id ?? newId(),
        created_at: order?.created_at ?? ts,
        updated_at: ts,
        deleted: false,
        trashed_at: order?.trashed_at ?? null,
        customer_name: form.customer_name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        product_ids: form.product_ids,
        total_price: Number(form.total_price) || suggestedTotal,
        status: order?.status ?? 'china',
        status_dates: order?.status_dates ?? { china: ts },
        steadfast_tracking_id: order?.steadfast_tracking_id ?? '',
        notes: form.notes,
      }
      await db.orders.put(saved)
      onSaved(saved)
    } catch (err) {
      showToast(errorMessage(err, 'Could not save the order.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={order ? 'Edit order' : 'Confirm order'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-neutral-300 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Customer name</span>
          <input
            value={form.customer_name}
            onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Phone</span>
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Address</span>
          <textarea
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>

        <ProductPicker selected={form.product_ids} onChange={(product_ids) => setForm({ ...form, product_ids })} />

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Total price (৳) {suggestedTotal > 0 && <span className="font-normal text-neutral-400">(products total ৳{suggestedTotal})</span>}
          </span>
          <input
            type="number"
            value={form.total_price}
            onChange={(e) => setForm({ ...form, total_price: e.target.value })}
            placeholder={String(suggestedTotal || 0)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Notes</span>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>
      </div>
    </Modal>
  )
}
