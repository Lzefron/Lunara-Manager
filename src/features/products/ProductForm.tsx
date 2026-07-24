import { useState } from 'react'
import type { Photo, Product } from '../../types'
import { db, newId, nowIso } from '../../db/db'
import { Modal } from '../../components/Modal'
import { TagInput } from '../../components/TagInput'
import { PhotoInput } from './PhotoInput'
import { generatePriceCode } from '../../lib/pricing'
import { errorMessage, showToast } from '../../lib/toast'

interface Props {
  product: Product | null
  prefill?: Partial<Pick<Product, 'cost_rmb' | 'weight_g' | 'sell_price'>>
  onClose: () => void
  onSaved: (product: Product) => void
}

interface FormState {
  name: string
  sell_price: string
  cost_rmb: string
  weight_g: string
  colors: string[]
  available: boolean
  notes: string
  price_code: string
  photos: Photo[]
}

function toFormState(product: Product | null, prefill?: Props['prefill']): FormState {
  if (product) {
    return {
      name: product.name,
      sell_price: String(product.sell_price),
      cost_rmb: String(product.cost_rmb),
      weight_g: String(product.weight_g),
      colors: product.colors,
      available: product.available,
      notes: product.notes,
      price_code: product.price_code,
      photos: product.photos,
    }
  }
  const sellPrice = prefill?.sell_price
  return {
    name: '',
    sell_price: sellPrice !== undefined ? String(sellPrice) : '',
    cost_rmb: prefill?.cost_rmb !== undefined ? String(prefill.cost_rmb) : '',
    weight_g: prefill?.weight_g !== undefined ? String(prefill.weight_g) : '',
    colors: [],
    available: true,
    notes: '',
    price_code: sellPrice !== undefined ? generatePriceCode(sellPrice) : '',
    photos: [],
  }
}

export function ProductForm({ product, prefill, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => toFormState(product, prefill))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sellPriceNum = Number(form.sell_price)
  const canSave = form.name.trim() !== '' && form.sell_price !== '' && !Number.isNaN(sellPriceNum)

  async function handleSave() {
    if (!canSave) {
      setError('Name and sell price are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const ts = nowIso()
      const saved: Product = {
        id: product?.id ?? newId(),
        created_at: product?.created_at ?? ts,
        updated_at: ts,
        deleted: false,
        name: form.name.trim(),
        sell_price: sellPriceNum,
        cost_rmb: Number(form.cost_rmb) || 0,
        weight_g: Number(form.weight_g) || 0,
        colors: form.colors,
        available: form.available,
        photos: form.photos,
        notes: form.notes,
        price_code: form.price_code.trim() || generatePriceCode(sellPriceNum),
      }
      await db.products.put(saved)
      onSaved(saved)
    } catch (err) {
      showToast(errorMessage(err, 'Could not save the product.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={product ? 'Edit product' : 'Add product'}
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
        {error && <p className="text-sm text-red-600">{error}</p>}

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Name</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
            placeholder="Product name"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Sell price (৳)</span>
            <input
              type="number"
              value={form.sell_price}
              onChange={(e) => setForm({ ...form, sell_price: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Cost (RMB)</span>
            <input
              type="number"
              value={form.cost_rmb}
              onChange={(e) => setForm({ ...form, cost_rmb: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Weight (g)</span>
            <input
              type="number"
              value={form.weight_g}
              onChange={(e) => setForm({ ...form, weight_g: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
          <label className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              checked={form.available}
              onChange={(e) => setForm({ ...form, available: e.target.checked })}
              className="h-4 w-4 rounded border-neutral-300"
            />
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Available</span>
          </label>
        </div>

        <TagInput
          label="Colors"
          tags={form.colors}
          onChange={(colors) => setForm({ ...form, colors })}
          placeholder="Type a color, Enter to add"
        />

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Notes</span>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Price code</span>
          <div className="flex gap-2">
            <input
              value={form.price_code}
              onChange={(e) => setForm({ ...form, price_code: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
            />
            <button
              type="button"
              onClick={() => setForm({ ...form, price_code: generatePriceCode(sellPriceNum || 0) })}
              className="whitespace-nowrap rounded-lg border border-neutral-300 px-3 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
            >
              Regenerate
            </button>
          </div>
        </label>

        <PhotoInput photos={form.photos} onChange={(photos) => setForm({ ...form, photos })} />
      </div>
    </Modal>
  )
}
