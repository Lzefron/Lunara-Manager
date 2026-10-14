export function syncErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (!navigator.onLine) return 'You are offline. Your changes are saved on this device and will sync when you reconnect.'
  if (/fetch|network|timeout|abort|502|503|504|paused|unavailable/i.test(message)) {
    return 'Supabase is offline or unavailable. Your changes are saved on this device. If the project is paused, resume it in the Supabase dashboard, then tap Sync.'
  }
  if (/PGRST204|column|schema cache|customer_catalog/i.test(message)) return `Database setup needs updating. Apply the latest Supabase migrations, then tap Sync. (${message})`
  if (/row-level security|permission denied/i.test(message)) return 'This account does not have Manager access. Use the existing shared Lunara account.'
  return message
}
