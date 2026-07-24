import { useState } from 'react'
import type { Reply } from '../../types'
import { errorMessage, showToast } from '../../lib/toast'
import { trashItem } from '../../lib/trash'

interface Props {
  reply: Reply
  onEdit: () => void
}

export function ReplyRow({ reply, onEdit }: Props) {
  const [copied, setCopied] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(reply.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      showToast(errorMessage(err, 'Could not copy to clipboard.'))
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    try {
      await trashItem('replies', reply.id)
    } catch (err) {
      showToast(errorMessage(err, 'Could not delete the reply.'))
    }
  }

  return (
    <li>
      <button
        type="button"
        onClick={handleCopy}
        className="w-full rounded-lg border border-neutral-200 p-3 text-left dark:border-neutral-800"
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="font-medium text-neutral-900 dark:text-neutral-100">{reply.title}</span>
          <span className="flex items-center gap-1.5">
            {copied && <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Copied</span>}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
              onKeyDown={(e) => e.key === 'Enter' && onEdit()}
              className="rounded p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              aria-label="Edit reply"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
                <path
                  d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={handleDelete}
              onKeyDown={(e) => e.key === 'Enter' && handleDelete(e as unknown as React.MouseEvent)}
              className={`rounded p-1 ${confirmingDelete ? 'text-red-600' : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'}`}
              aria-label="Delete reply"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
                <path
                  d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </span>
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{reply.text}</p>
      </button>
    </li>
  )
}
