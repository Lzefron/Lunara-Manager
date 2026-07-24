import { useEffect, useState } from 'react'
import type { Product } from '../../types'

interface Props {
  product: Product
  onOpen: () => void
}

export function ProductCard({ product, onOpen }: Props) {
  const thumb = product.photos[0]?.thumb_blob
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!thumb) {
      setUrl(null)
      return
    }
    const objUrl = URL.createObjectURL(thumb)
    setUrl(objUrl)
    return () => URL.revokeObjectURL(objUrl)
  }, [thumb])

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative aspect-square overflow-hidden rounded-xl bg-neutral-200 text-left dark:bg-neutral-800"
    >
      {url ? (
        <img src={url} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">No photo</div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2.5 pb-2 pt-6">
        <p className="truncate text-xs text-white/90">{product.name}</p>
        <p className="text-lg font-bold leading-tight text-white">৳{product.sell_price}</p>
      </div>

      <span
        className={`absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
          product.available ? 'bg-emerald-500/90 text-white' : 'bg-neutral-500/90 text-white'
        }`}
      >
        {product.available ? 'Available' : 'Out of stock'}
      </span>
    </button>
  )
}
