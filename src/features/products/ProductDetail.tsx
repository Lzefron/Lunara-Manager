import { useEffect, useState } from 'react'
import type { Product } from '../../types'
import { Modal } from '../../components/Modal'
import { errorMessage, showToast } from '../../lib/toast'
import { trashItem } from '../../lib/trash'

interface Props {
  product: Product
  onClose: () => void
  onEdit: () => void
  onDeleted: () => void
}

export function ProductDetail({ product, onClose, onEdit, onDeleted }: Props) {
  const urls = usePhotoUrls(product)
  const [activeSlide, setActiveSlide] = useState(0)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function handleDelete() {
    try {
      await trashItem('products', product.id)
      onDeleted()
    } catch (err) {
      showToast(errorMessage(err, 'Could not delete the product.'))
    }
  }

  return (
    <Modal title={product.name} onClose={onClose}>
      <div className="space-y-3">
        {urls.length > 0 ? (
          <div>
            <div
              className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-lg"
              onScroll={(e) => {
                const el = e.currentTarget
                const idx = Math.round(el.scrollLeft / el.clientWidth)
                setActiveSlide(idx)
              }}
            >
              {urls.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`${product.name} photo ${i + 1}`}
                  className="aspect-square w-full flex-shrink-0 snap-center rounded-lg object-cover"
                />
              ))}
            </div>
            {urls.length > 1 && (
              <div className="mt-1.5 flex justify-center gap-1">
                {urls.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-1.5 rounded-full ${i === activeSlide ? 'bg-violet-600' : 'bg-neutral-300 dark:bg-neutral-700'}`}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex aspect-square items-center justify-center rounded-lg bg-neutral-100 text-sm text-neutral-400 dark:bg-neutral-800">
            No photos
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">৳{product.sell_price}</p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              product.available
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
            }`}
          >
            {product.available ? 'Available' : 'Out of stock'}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-neutral-500">Cost</dt>
          <dd className="text-neutral-900 dark:text-neutral-100">¥{product.cost_rmb}</dd>
          <dt className="text-neutral-500">Weight</dt>
          <dd className="text-neutral-900 dark:text-neutral-100">{product.weight_g} g</dd>
          <dt className="text-neutral-500">Colors</dt>
          <dd className="text-neutral-900 dark:text-neutral-100">{product.colors.join(', ') || '—'}</dd>
          <dt className="text-neutral-500">Price code</dt>
          <dd className="text-neutral-900 dark:text-neutral-100">{product.price_code || '—'}</dd>
        </dl>

        {product.notes && (
          <p className="rounded-lg bg-neutral-100 p-2.5 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            {product.notes}
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
            <button
              type="button"
              onClick={handleDelete}
              className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white"
            >
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

function usePhotoUrls(product: Product): string[] {
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    const next = product.photos.map((p) => URL.createObjectURL(p.webp_blob))
    setUrls(next)
    return () => next.forEach((u) => URL.revokeObjectURL(u))
  }, [product])
  return urls
}
