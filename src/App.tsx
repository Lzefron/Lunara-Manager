import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Header } from './components/Header'
import { BottomNav } from './components/BottomNav'
import { SyncAuthModal } from './components/SyncAuthModal'
import { ToastHost } from './components/ToastHost'
import type { Tab } from './types/nav'
import { seedIfEmpty } from './db/seed'
import { consumeSharedPhoto } from './lib/shareTarget'
import { isSupabaseConfigured } from './lib/supabaseConfig'
import { ProductsPage } from './features/products/ProductsPage'
import { PhotoSearchOverlay } from './features/products/PhotoSearchOverlay'
import { OrdersPage } from './features/orders/OrdersPage'
import { CalculatorPage } from './features/calculator/CalculatorPage'
import { RepliesPage } from './features/replies/RepliesPage'
import { DashboardPage } from './features/dashboard/DashboardPage'

const PAGES: Record<Tab, () => React.JSX.Element> = {
  products: ProductsPage,
  orders: OrdersPage,
  calculator: CalculatorPage,
  replies: RepliesPage,
  dashboard: DashboardPage,
}

function App() {
  const [tab, setTab] = useState<Tab>('products')
  const [ready, setReady] = useState(false)
  const [searchImage, setSearchImage] = useState<Blob | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [authClient, setAuthClient] = useState<SupabaseClient | null>(null)
  const [syncMessage, setSyncMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    seedIfEmpty()
      .catch((err) => console.error('Seeding failed', err))
      .finally(() => setReady(true))
  }, [])

  // Android share-target: the service worker stashed the shared screenshot
  // in a cache and redirected here with ?shared=1.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('shared') !== '1') return
    window.history.replaceState(null, '', window.location.pathname)
    consumeSharedPhoto().then((blob) => {
      if (blob) setSearchImage(blob)
    })
  }, [])

  // Ctrl+V anywhere in the app triggers photo search, unless something more
  // specific (e.g. the per-product photo picker) already handled the paste.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (e.defaultPrevented || !e.clipboardData) return
      const file = Array.from(e.clipboardData.items)
        .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
        ?.getAsFile()
      if (file) setSearchImage(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  useEffect(() => {
    if (!syncMessage) return
    const timer = setTimeout(() => setSyncMessage(null), 5000)
    return () => clearTimeout(timer)
  }, [syncMessage])

  async function performSync() {
    setSyncing(true)
    setSyncMessage(null)
    try {
      // Dynamically imported so @supabase/supabase-js never enters the main
      // bundle for the (common) case where the user never taps Sync.
      const { runSync } = await import('./lib/sync')
      const result = await runSync()
      setSyncMessage({ kind: 'success', text: `Synced — ${result.pushed} pushed, ${result.pulled} pulled.` })
    } catch (err) {
      setSyncMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Sync failed.' })
    } finally {
      setSyncing(false)
    }
  }

  async function handleSyncClick() {
    if (!isSupabaseConfigured) {
      setSyncMessage({ kind: 'error', text: 'Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.' })
      return
    }
    const { supabase } = await import('./lib/supabase')
    if (!supabase) {
      setSyncMessage({ kind: 'error', text: 'Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.' })
      return
    }
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      setAuthClient(supabase)
      return
    }
    await performSync()
  }

  const Page = PAGES[tab]

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <Header onPhotoSearch={setSearchImage} onSync={handleSyncClick} syncing={syncing} />

      {syncMessage && (
        <div
          className={`mx-auto max-w-3xl px-4 py-2 text-sm ${
            syncMessage.kind === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {syncMessage.text}
        </div>
      )}

      <main className="mx-auto max-w-3xl pb-20">
        {ready ? <Page /> : <p className="p-4 text-sm text-neutral-500">Loading Lunara…</p>}
      </main>
      <BottomNav active={tab} onChange={setTab} />

      {searchImage && (
        <PhotoSearchOverlay image={searchImage} onReplace={setSearchImage} onClose={() => setSearchImage(null)} />
      )}

      {authClient && (
        <SyncAuthModal
          supabase={authClient}
          onClose={() => setAuthClient(null)}
          onSignedIn={() => {
            setAuthClient(null)
            performSync()
          }}
        />
      )}

      <ToastHost />
    </div>
  )
}

export default App
