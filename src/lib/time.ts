export function formatRelative(iso: string | null): string {
  if (!iso) return 'Never synced'
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffSec = Math.max(0, Math.round(diffMs / 1000))
  if (diffSec < 60) return 'Synced just now'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `Synced ${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `Synced ${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  return `Synced ${diffDay}d ago`
}

export function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function todayIso(): string {
  return new Date().toISOString()
}

export function isSameDay(iso: string, reference: Date): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === reference.getFullYear() &&
    d.getMonth() === reference.getMonth() &&
    d.getDate() === reference.getDate()
  )
}

export function isSameMonth(iso: string, reference: Date): boolean {
  const d = new Date(iso)
  return d.getFullYear() === reference.getFullYear() && d.getMonth() === reference.getMonth()
}

export function daysSince(iso: string, reference: Date = new Date()): number {
  const diffMs = reference.getTime() - new Date(iso).getTime()
  return diffMs / (1000 * 60 * 60 * 24)
}
