/** YYYY-MM-DD in the computer's local time zone (toISOString() is UTC — QA B2-N7). */
export function localDateString(d: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
