import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Product } from '../../types'
import { fuzzySearch } from '../../lib/fuzzySearch'
import { ProductCard } from './ProductCard'
import { ProductDetail } from './ProductDetail'
import { ProductForm } from './ProductForm'

export function ProductsPage() {
  const products = useLiveQuery(() => db.products.filter((p) => !p.deleted && !p.trashed_at).toArray(), [])
  const [publishMode, setPublishMode] = useState(false)
  const [listingFilter, setListingFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [detailProduct, setDetailProduct] = useState<Product | null>(null)
  const [formTarget, setFormTarget] = useState<Product | 'new' | null>(null)

  const visible = useMemo(() => {
    if (!products) return []
    const sorted = [...products].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    return fuzzySearch(query, sorted.filter(p => listingFilter === 'all' || (listingFilter === 'published' ? p.catalog_visible : !p.catalog_visible)), (p) => `${p.name} ${p.category ?? ''} ${p.subcategory ?? ''}`)
  }, [products, query, listingFilter])

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Products</h1>
        <button
          type="button"
          onClick={() => { setPublishMode(false); setFormTarget('new') }}
          className="rounded-full bg-violet-600 px-3.5 py-1.5 text-sm font-medium text-white"
        >
          + Add
        </button>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products…"
        className="mb-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
      />

      <label className="mb-3 block text-sm">Customer catalog <select aria-label="Listing status" value={listingFilter} onChange={e => setListingFilter(e.target.value)} className="rounded border p-2 dark:bg-neutral-800"><option value="all">All products</option><option value="published">Published</option><option value="private">Not published</option></select></label>
      {!products ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-neutral-500">{query ? 'No matches.' : 'No products yet.'}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((product) => (
            <ProductCard key={product.id} product={product} onOpen={() => setDetailProduct(product)} onPublish={() => { setPublishMode(true); setFormTarget(product) }} />
          ))}
        </div>
      )}

      {detailProduct && (
        <ProductDetail
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onEdit={() => {
            setPublishMode(false); setFormTarget(detailProduct)
            setDetailProduct(null)
          }}
          onPublish={() => { setPublishMode(true); setFormTarget(detailProduct); setDetailProduct(null) }}
          onDeleted={() => setDetailProduct(null)}
        />
      )}

      {formTarget && (
        <ProductForm
          publishMode={publishMode}
          product={formTarget === 'new' ? null : formTarget}
          onClose={() => setFormTarget(null)}
          onSaved={() => setFormTarget(null)}
        />
      )}
    </div>
  )
}
