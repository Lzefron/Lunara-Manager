import { useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, SYNC_META_ID } from '../db/db'
import { formatRelative } from '../lib/time'
import { PhotoSearchIcon, SyncIcon } from './icons'

interface Props {
  onSync?: () => void
  syncing?: boolean
  onPhotoSearch: (image: Blob) => void
}

export function Header({ onSync, syncing, onPhotoSearch }: Props) {
  const syncMeta = useLiveQuery(() => db.syncMeta.get(SYNC_META_ID))
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur pt-[env(safe-area-inset-top)] dark:border-neutral-800 dark:bg-neutral-950/95">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <span className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          Lunara
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Search by photo"
            title="Search by photo"
            className="flex items-center justify-center rounded-full border border-neutral-200 p-2 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
          >
            <PhotoSearchIcon className="h-4 w-4" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onPhotoSearch(file)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={onSync}
            disabled={!onSync || syncing}
            className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300"
          >
            <SyncIcon className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : formatRelative(syncMeta?.last_synced_at ?? null)}
          </button>
        </div>
      </div>
    </header>
  )
}
