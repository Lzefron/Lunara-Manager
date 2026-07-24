import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Product } from '../../types'
import { computePHash, hammingDistance, similarityFromHamming } from '../../lib/image'
import { ProductDetail } from './ProductDetail'
import { ProductForm } from './ProductForm'

interface Props {
  image: Blob
  onReplace: (image: Blob) => void
  onClose: () => void
}

interface Match {
  product: Product
  similarity: number
}

export function PhotoSearchOverlay({ image, onReplace, onClose }: Props) {
  const products = useLiveQuery(() => db.products.filter((p) => !p.deleted && p.photos.length > 0).toArray(), [])
  const [detailProduct, setDetailProduct] = useState<Product | null>(null)
  const [formTarget, setFormTarget] = useState<Product | null>(null)
  const [queryHash, setQueryHash] = useState<string | null>(null)
  const [queryUrl, setQueryUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const url = URL.createObjectURL(image)
    setQueryUrl(url)
    setQueryHash(null)
    setError(null)
    computePHash(image)
      .then(setQueryHash)
      .catch(() => setError('Could not read that image.'))
    return () => URL.revokeObjectURL(url)
  }, [image])

  const matches: Match[] = useMemo(() => {
    if (!products || !queryHash) return []
    const scored = products.map((product) => {
      const bestDistance = Math.min(...product.photos.map((p) => hammingDistance(queryHash, p.phash)))
      return { product, similarity: similarityFromHamming(bestDistance) }
    })
    scored.sort((a, b) => b.similarity - a.similarity)
    return scored.slice(0, 30)
  }, [products, queryHash])

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white dark:bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Photo search</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex items-center gap-3">
          {queryUrl && (
            <img src={queryUrl} alt="Search query" className="h-20 w-20 rounded-lg border border-neutral-200 object-cover dark:border-neutral-800" />
          )}
          <div className="flex-1">
            <p className="text-sm text-neutral-500">
              {!queryHash && !error ? 'Analyzing photo…' : error ? error : `${matches.length} product${matches.length === 1 ? '' : 's'} ranked by similarity`}
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-1.5 rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
            >
              Try another photo
            </button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onReplace(file)
            e.target.value = ''
          }}
        />

        {!products ? (
          <p className="text-sm text-neutral-500">Loading products…</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-neutral-500">No products with photos yet.</p>
        ) : (
          <ul className="space-y-2">
            {matches.map(({ product, similarity }) => (
              <MatchRow key={product.id} product={product} similarity={similarity} onOpen={() => setDetailProduct(product)} />
            ))}
          </ul>
        )}
      </div>

      {detailProduct && (
        <ProductDetail
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onEdit={() => {
            setFormTarget(detailProduct)
            setDetailProduct(null)
          }}
          onDeleted={() => setDetailProduct(null)}
        />
      )}

      {formTarget && <ProductForm product={formTarget} onClose={() => setFormTarget(null)} onSaved={() => setFormTarget(null)} />}
    </div>
  )
}

function MatchRow({ product, similarity, onOpen }: { product: Product; similarity: number; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const thumb = product.photos[0]?.thumb_blob
    if (!thumb) return
    const objUrl = URL.createObjectURL(thumb)
    setUrl(objUrl)
    return () => URL.revokeObjectURL(objUrl)
  }, [product])

  const strong = similarity >= 70

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-lg border border-neutral-200 p-2 text-left dark:border-neutral-800"
      >
        {url ? (
          <img src={url} alt="" className="h-14 w-14 flex-shrink-0 rounded-md object-cover" />
        ) : (
          <div className="h-14 w-14 flex-shrink-0 rounded-md bg-neutral-200 dark:bg-neutral-800" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">{product.name}</p>
          <p className="text-sm text-neutral-500">৳{product.sell_price}</p>
        </div>
        <span
          className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${
            strong
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
          }`}
        >
          {similarity}%
        </span>
      </button>
    </li>
  )
}
