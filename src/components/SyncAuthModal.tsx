import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Modal } from './Modal'
import { syncErrorMessage } from '../lib/syncErrors'

interface Props {
  supabase: SupabaseClient
  onClose: () => void
  onSignedIn: () => void
}

export function SyncAuthModal({ supabase, onClose, onSignedIn }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSignIn() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      onSignedIn()
    } catch (err) {
      setError(syncErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="Sign in to sync"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={handleSignIn}
          disabled={loading || !email.trim() || !password}
          className="w-full rounded-lg bg-violet-600 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-neutral-500">
          Use the shared Lunara account (the same one for both devices).
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>
      </div>
    </Modal>
  )
}
