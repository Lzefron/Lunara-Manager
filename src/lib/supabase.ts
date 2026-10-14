import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseConfigured } from './supabaseConfig'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export { isSupabaseConfigured }

// Only construct the real client when configured — createClient() throws on
// an empty URL, and this module is imported unconditionally at startup.
export const supabase: SupabaseClient | null = isSupabaseConfigured ? createClient(url, anonKey, {
  global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(30000) }) },
}) : null

export const PHOTOS_BUCKET = 'product-photos'
