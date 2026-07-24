import { useState } from 'react'
import { parseOrderMessage, type ParsedOrder } from '../../lib/orderParser'

interface Props {
  onParsed: (parsed: ParsedOrder) => void
}

export function OrderPasteBox({ onParsed }: Props) {
  const [raw, setRaw] = useState('')

  function handleParse() {
    if (!raw.trim()) return
    onParsed(parseOrderMessage(raw))
    setRaw('')
  }

  return (
    <div className="mb-4 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <span className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Paste customer message
      </span>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={3}
        placeholder={'e.g.\nRakib Hassan\n01712345678\nHouse 5, Road 2, Mirpur, Dhaka'}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
      />
      <button
        type="button"
        onClick={handleParse}
        disabled={!raw.trim()}
        className="mt-2 w-full rounded-lg bg-violet-600 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        Parse order
      </button>
    </div>
  )
}
