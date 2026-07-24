import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { emptyTrash, listTrashed, restoreItem, TRASH_RETENTION_DAYS } from '../../lib/trash'
import { formatDaysAgo } from '../../lib/time'
import { errorMessage, showToast } from '../../lib/toast'

interface Props {
  onClose: () => void
}

const TYPE_LABELS = { products: 'Product', orders: 'Order', replies: 'Reply' } as const

export function TrashPage({ onClose }: Props) {
  const entries = useLiveQuery(() => listTrashed(), [])
  const [confirmingEmpty, setConfirmingEmpty] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleRestore(table: 'products' | 'orders' | 'replies', id: string) {
    try {
      await restoreItem(table, id)
    } catch (err) {
      showToast(errorMessage(err, 'Could not restore that item.'))
    }
  }

  async function handleEmptyTrash() {
    if (!confirmingEmpty) {
      setConfirmingEmpty(true)
      return
    }
    setBusy(true)
    try {
      await emptyTrash()
      setConfirmingEmpty(false)
    } catch (err) {
      showToast(errorMessage(err, 'Could not empty trash.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white dark:bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Trash</h2>
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
        <p className="mb-3 text-sm text-neutral-500">
          Items are permanently deleted automatically after {TRASH_RETENTION_DAYS} days, or immediately with Empty Trash.
        </p>

        {!entries ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-neutral-500">Trash is empty.</p>
        ) : (
          <>
            <button
              type="button"
              onClick={handleEmptyTrash}
              disabled={busy}
              className={`mb-3 w-full rounded-lg py-2 text-sm font-medium disabled:opacity-50 ${
                confirmingEmpty ? 'bg-red-600 text-white' : 'border border-red-300 text-red-600 dark:border-red-900'
              }`}
            >
              {confirmingEmpty ? `Confirm — permanently delete ${entries.length} item${entries.length === 1 ? '' : 's'}` : 'Empty Trash'}
            </button>

            <ul className="space-y-2">
              {entries.map((entry) => (
                <li
                  key={`${entry.table}-${entry.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-neutral-500 dark:bg-neutral-800">
                        {TYPE_LABELS[entry.table]}
                      </span>
                      <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">{entry.label || '(untitled)'}</span>
                    </div>
                    <p className="text-xs text-neutral-500">Trashed {formatDaysAgo(entry.trashed_at)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestore(entry.table, entry.id)}
                    className="whitespace-nowrap rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
