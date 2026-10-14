import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Photo, Product } from '../../types'
import { db, newId, nowIso, SETTINGS_ID } from '../../db/db'
import { DEFAULT_CATEGORIES } from '../../lib/catalog'
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
  catalog_visible: boolean
  category: string
  subcategory: string
  public_description: string
  featured: boolean
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
      catalog_visible: product.catalog_visible ?? false,
      category: product.category ?? '',
      subcategory: product.subcategory ?? '',
      public_description: product.public_description ?? '',
      featured: product.featured ?? false,
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
    catalog_visible: false,
    category: '',
    subcategory: '',
    public_description: '',
    featured: false,
  }
}

export function ProductForm({ product, prefill, onClose, onSaved }: Props) {
  const settings = useLiveQuery(() => db.settings.get(SETTINGS_ID))
  const categories = settings?.catalog_categories ?? DEFAULT_CATEGORIES
  const [form, setForm] = useState<FormState>(() => toFormState(product, prefill))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sellPriceNum = Number(form.sell_price)
  const canSave = form.name.trim() !== '' && form.sell_price !== '' && Number.isFinite(sellPriceNum) && sellPriceNum >= 0 && (!form.catalog_visible || !!form.category)

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
        trashed_at: product?.trashed_at ?? null,
        name: form.name.trim(),
        sell_price: sellPriceNum,
        cost_rmb: Number(form.cost_rmb) || 0,
        weight_g: Number(form.weight_g) || 0,
        colors: form.colors,
        available: form.available,
        photos: form.photos,
        notes: form.notes,
        price_code: form.price_code.trim() || generatePriceCode(sellPriceNum),
        catalog_visible: form.catalog_visible,
        category: form.category,
        subcategory: form.subcategory,
        public_description: form.public_description.trim(),
        featured: form.featured,
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

        <fieldset className="space-y-3 rounded-xl border border-violet-200 p-3 dark:border-violet-800">
          <legend className="px-1 text-sm font-semibold text-violet-600">Customer catalog</legend>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.catalog_visible} onChange={e => setForm({ ...form, catalog_visible: e.target.checked })} />Show in customer catalog</label>
          <label className="block text-sm">Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value, subcategory: '' })} className="mt-1 w-full rounded-lg border p-2 dark:bg-neutral-800"><option value="">Choose a category</option>{categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select></label>
          <label className="block text-sm">Subcategory<select value={form.subcategory} onChange={e => setForm({ ...form, subcategory: e.target.value })} className="mt-1 w-full rounded-lg border p-2 dark:bg-neutral-800"><option value="">All / no subcategory</option>{categories.find(c => c.name === form.category)?.subcategories.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
          <label className="block text-sm">Customer description<textarea value={form.public_description} onChange={e => setForm({ ...form, public_description: e.target.value })} rows={3} className="mt-1 w-full rounded-lg border p-2 dark:bg-neutral-800" placeholder="Material, size, and details customers should see" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.featured} onChange={e => setForm({ ...form, featured: e.target.checked })} />Feature in the daily feed</label>
          <p className="text-xs text-neutral-500">Only the customer description is public. Internal notes and costs stay private. Create more categories using Customer catalog above the product list.</p>
        </fieldset>
        <PhotoInput photos={form.photos} onChange={(photos) => setForm({ ...form, photos })} />
      </div>
    </Modal>
  )
}
