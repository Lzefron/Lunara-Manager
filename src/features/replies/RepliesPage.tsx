import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Reply } from '../../types'
import { ReplyRow } from './ReplyRow'
import { ReplyForm } from './ReplyForm'

export function RepliesPage() {
  const replies = useLiveQuery(() => db.replies.filter((r) => !r.deleted).toArray(), [])
  const [formTarget, setFormTarget] = useState<Reply | 'new' | null>(null)

  const grouped = useMemo(() => {
    if (!replies) return []
    const byCategory = new Map<string, Reply[]>()
    for (const reply of replies) {
      const list = byCategory.get(reply.category) ?? []
      list.push(reply)
      byCategory.set(reply.category, list)
    }
    return [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [replies])

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Replies</h1>
        <button
          type="button"
          onClick={() => setFormTarget('new')}
          className="rounded-full bg-violet-600 px-3.5 py-1.5 text-sm font-medium text-white"
        >
          + Add
        </button>
      </div>

      {!replies ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : replies.length === 0 ? (
        <p className="text-sm text-neutral-500">No saved replies yet.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([category, items]) => (
            <section key={category}>
              <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">{category}</h2>
              <ul className="space-y-2">
                {items.map((reply) => (
                  <ReplyRow key={reply.id} reply={reply} onEdit={() => setFormTarget(reply)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {formTarget && (
        <ReplyForm reply={formTarget === 'new' ? null : formTarget} onClose={() => setFormTarget(null)} onSaved={() => setFormTarget(null)} />
      )}
    </div>
  )
}
