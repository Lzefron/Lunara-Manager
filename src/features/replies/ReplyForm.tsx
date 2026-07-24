import { useState } from 'react'
import type { Reply } from '../../types'
import { db, newId, nowIso } from '../../db/db'
import { Modal } from '../../components/Modal'
import { errorMessage, showToast } from '../../lib/toast'

interface Props {
  reply: Reply | null
  onClose: () => void
  onSaved: () => void
}

export function ReplyForm({ reply, onClose, onSaved }: Props) {
  const [category, setCategory] = useState(reply?.category ?? '')
  const [title, setTitle] = useState(reply?.title ?? '')
  const [text, setText] = useState(reply?.text ?? '')
  const [saving, setSaving] = useState(false)

  const canSave = category.trim() !== '' && title.trim() !== '' && text.trim() !== ''

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const ts = nowIso()
      const saved: Reply = {
        id: reply?.id ?? newId(),
        created_at: reply?.created_at ?? ts,
        updated_at: ts,
        deleted: false,
        category: category.trim(),
        title: title.trim(),
        text: text.trim(),
      }
      await db.replies.put(saved)
      onSaved()
    } catch (err) {
      showToast(errorMessage(err, 'Could not save the reply.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={reply ? 'Edit reply' : 'Add reply'}
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
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Category</span>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Greeting, Price, Delivery, Payment"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Text</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>
      </div>
    </Modal>
  )
}
