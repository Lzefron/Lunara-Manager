import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, nowIso, SETTINGS_ID, SYNC_META_ID } from '../db/db'
import { DEFAULT_CATEGORIES } from '../lib/catalog'
import { isSupabaseConfigured } from '../lib/supabaseConfig'
import { Modal } from './Modal'

export function CatalogSettings({ onClose }: { onClose: () => void }) {
  const settings = useLiveQuery(() => db.settings.get(SETTINGS_ID))
  const categories = settings?.catalog_categories ?? DEFAULT_CATEGORIES
  const [name, setName] = useState('')
  const [parent, setParent] = useState('')
  const [message, setMessage] = useState('')
  async function add() {
    const value = name.trim()
    if (!value) return
    const meta = await db.syncMeta.get(SYNC_META_ID)
    if (!settings && isSupabaseConfigured && !meta?.last_synced_at) { setMessage('Tap Sync once to load your shared settings, then add categories.'); return }
    const existing = parent ? categories.find(c => c.name === parent)?.subcategories : categories.map(c => c.name)
    if (existing?.some(c => c.toLowerCase() === value.toLowerCase())) { setMessage('That name already exists.'); return }
    try {
      const ts = nowIso()
      await db.transaction('rw', db.settings, async () => {
      const current = await db.settings.get(SETTINGS_ID)
      await db.settings.put({
        id: SETTINGS_ID, created_at: ts, deleted: false, rmb_to_bdt_rate: 16.5,
        shipping_rate_per_kg: 900, default_profit_mode: 'percent', default_profit_value: 30,
        ...current,
        catalog_categories: parent
          ? categories.map(c => c.name === parent ? { ...c, subcategories: [...c.subcategories, value] } : c)
          : [...categories, { name: value, subcategories: [] }],
        updated_at: ts,
      })
      })
      setName(''); setMessage('Saved. Categories sync automatically when signed in.')
    } catch { setMessage('Could not save. Please try again.') }
  }
  return <Modal title="Customer catalog" onClose={onClose}>
    <p className="mb-4 text-sm text-neutral-500">Create sections here. Open any product to choose its section, add a customer description, and switch on “Show in customer catalog”.</p>
    <div className="space-y-3 mb-5">{categories.map(c => <div key={c.name} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
      <strong>{c.name}</strong><p className="text-sm text-neutral-500">{c.subcategories.join(' · ') || 'No subcategories yet'}</p>
    </div>)}</div>
    <label className="block mb-3 text-sm">Add to<select className="mt-1 w-full rounded-lg border p-2 dark:bg-neutral-800" value={parent} onChange={e => setParent(e.target.value)}>
      <option value="">New main category</option>{categories.map(c => <option key={c.name} value={c.name}>{c.name} — new subcategory</option>)}
    </select></label>
    <label className="block text-sm">Name<input className="mt-1 w-full rounded-lg border p-2 dark:bg-neutral-800" value={name} onChange={e => setName(e.target.value)} placeholder={parent ? 'e.g. Mini bags' : 'e.g. Accessories'} /></label>
    <button type="button" className="mt-3 w-full rounded-lg bg-violet-600 p-2 text-white" onClick={add}>Add {parent ? 'subcategory' : 'category'}</button>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </Modal>
}
