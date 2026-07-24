import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { fuzzySearch } from '../../lib/fuzzySearch'

interface Props {
  selected: string[]
  onChange: (ids: string[]) => void
}

export function ProductPicker({ selected, onChange }: Props) {
  const products = useLiveQuery(() => db.products.filter((p) => !p.deleted).toArray(), [])
  const [query, setQuery] = useState('')

  const visible = products ? fuzzySearch(query, products, (p) => p.name).slice(0, 8) : []

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  const selectedProducts = (products ?? []).filter((p) => selected.includes(p.id))

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Products</span>
      {selectedProducts.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {selectedProducts.map((p) => (
            <span
              key={p.id}
              className="flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800 dark:bg-violet-900/40 dark:text-violet-300"
            >
              {p.name}
              <button type="button" onClick={() => toggle(p.id)} className="text-violet-500 hover:text-violet-700">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products to add…"
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
      />
      {query && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          {visible.length === 0 ? (
            <p className="p-2 text-sm text-neutral-400">No matches</p>
          ) : (
            visible.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  toggle(p.id)
                  setQuery('')
                }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                <span>{p.name}</span>
                <span className="text-neutral-400">৳{p.sell_price}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
