// Split out from lib/supabase.ts so callers can check configuration status
// without pulling the @supabase/supabase-js bundle into the main chunk —
// that library is only needed once the user actually taps Sync.
export const isSupabaseConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
