import { useEffect, useRef, useState } from 'react'
import type { Photo } from '../../types'
import { compressImage, computePHash } from '../../lib/image'
import { newId } from '../../db/db'
import { showToast } from '../../lib/toast'

interface Props {
  photos: Photo[]
  onChange: (photos: Photo[]) => void
}

async function fileToPhoto(source: Blob): Promise<Photo> {
  const [webp_blob, thumb_blob, phash] = await Promise.all([
    compressImage(source, 800, 0.8),
    compressImage(source, 150, 0.7),
    computePHash(source),
  ])
  return { id: newId(), webp_blob, thumb_blob, phash }
}

export function PhotoInput({ photos, onChange }: Props) {
  const [processing, setProcessing] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const thumbUrls = useThumbUrls(photos)

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) return
    setProcessing((n) => n + list.length)
    const settled = await Promise.allSettled(
      list.map(async (f) => {
        try {
          return await fileToPhoto(f)
        } finally {
          setProcessing((n) => n - 1)
        }
      }),
    )
    const results = settled.filter((r): r is PromiseFulfilledResult<Photo> => r.status === 'fulfilled').map((r) => r.value)
    const failedCount = settled.length - results.length
    if (failedCount > 0) {
      showToast(`Couldn't process ${failedCount} photo${failedCount === 1 ? '' : 's'} — try a different image.`)
    }
    if (results.length > 0) onChange([...photos, ...results])
  }

  function handlePaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null)
    if (files.length > 0) {
      e.preventDefault()
      addFiles(files)
    }
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Photos</span>
      <div className="flex flex-wrap gap-2">
        {photos.map((photo, i) => (
          <div key={photo.id} className="relative w-36 rounded-lg border border-neutral-200 p-2 dark:border-neutral-700">
            <img src={thumbUrls[i]} alt={photo.label || `Photo ${i + 1}`} className="h-28 w-full rounded object-cover" />
            <button
              type="button"
              onClick={() => onChange(photos.filter((p) => p.id !== photo.id))}
              aria-label="Remove photo"
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5">
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
            <button type="button" onClick={() => onChange([photo, ...photos.filter(p => p.id !== photo.id)])} className="my-2 w-full rounded bg-violet-100 px-2 py-1 text-xs text-violet-700">{i === 0 ? '✓ Cover image' : 'Use as cover'}</button>
            <label className="block text-xs">Photo type<select value={photo.kind ?? 'catalog'} onChange={e => onChange(photos.map(p => p.id === photo.id ? { ...p, kind: e.target.value as Photo['kind'] } : p))} className="mt-1 w-full rounded border p-1 text-xs dark:bg-neutral-800"><option value="catalog">Catalog photo</option><option value="variant">Color / design</option><option value="real">Real photo</option></select></label>
            <label className="mt-2 block text-xs">Label<input value={photo.label ?? ''} placeholder="e.g. Black · mini" onChange={e => onChange(photos.map(p => p.id === photo.id ? { ...p, label: e.target.value } : p))} className="mt-1 w-full rounded border p-1 text-xs dark:bg-neutral-800" /></label>
          </div>
        ))}

        <div
          tabIndex={0}
          onPaste={handlePaste}
          onClick={() => fileRef.current?.click()}
          className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-neutral-300 text-neutral-400 outline-none focus:border-violet-400 focus:text-violet-500 dark:border-neutral-700"
        >
          {processing > 0 ? (
            <span className="text-[11px]">Processing…</span>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              <span className="text-[10px] leading-tight">Add / paste</span>
            </>
          )}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <p className="mt-1 text-xs text-neutral-400">The first photo is the storefront cover. Add color/design variations and real photos, then label each one. Click Add / paste then press Ctrl+V to paste a copied image.</p>
    </div>
  )
}

function useThumbUrls(photos: Photo[]): string[] {
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    const next = photos.map((p) => URL.createObjectURL(p.thumb_blob))
    setUrls(next)
    return () => next.forEach((u) => URL.revokeObjectURL(u))
  }, [photos])
  return urls
}
