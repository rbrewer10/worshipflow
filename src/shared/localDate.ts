/** YYYY-MM-DD in the computer's local time zone (toISOString() is UTC — QA B2-N7). */
export function localDateString(d: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The coming Sunday as YYYY-MM-DD, local time — TODAY when it is Sunday.
 * QA B3-N7: Build service's "Start Sunday" / new-service date used
 * `(7 - day) % 7 || 7`, so on Sunday morning it defaulted to next week (and
 * disagreed with Sample Sunday, which uses today).
 */
export function upcomingSundayLocal(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  return localDateString(d)
}
