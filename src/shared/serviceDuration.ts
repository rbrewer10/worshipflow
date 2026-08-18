import type { ServiceItem } from './types'

// Best-effort total: only item types that store an explicit duration
// contribute. Most items (songs, scripture, text, etc.) have no known
// duration, so they're silently excluded rather than treated as zero —
// the total is a helpful estimate, never a false-precision promise.
export function estimateItemDurationSeconds(item: ServiceItem): number | null {
  if (item.type === 'countdown' || item.type === 'welcome') {
    const secs = item.payload?.seconds
    return typeof secs === 'number' && secs > 0 ? secs : null
  }
  return null
}

export interface DurationEstimate {
  totalSeconds: number
  knownItemCount: number
  totalItemCount: number
}

export function estimateServiceDuration(items: ServiceItem[]): DurationEstimate {
  let totalSeconds = 0
  let knownItemCount = 0
  for (const item of items) {
    const secs = estimateItemDurationSeconds(item)
    if (secs != null) { totalSeconds += secs; knownItemCount++ }
  }
  return { totalSeconds, knownItemCount, totalItemCount: items.length }
}

// "~52 min" not "52:00" — the estimate is never precise enough to justify a
// clock-face format, and a false-precise format invites operators to trust it
// more than the underlying data supports.
export function formatDurationEstimate(totalSeconds: number): string {
  if (totalSeconds < 60) return '< 1 min'
  const minutes = Math.round(totalSeconds / 60)
  return `~${minutes} min`
}
