import type { Intent, TrackId, ZoneId } from '../shared/types'

// Runtime guards for the IPC argument shapes TypeScript can only check at
// compile time. The audit's concern: "IPC inputs are typed at compile time
// but generally lack runtime validation" — a stale renderer build, a typo in
// a call site, or a future refactor that forgets to update every caller can
// still send a malformed value at runtime, and TypeScript can't catch that.
//
// Electron already catches an exception thrown inside an ipcMain.handle
// callback and turns it into a rejected promise on the renderer side rather
// than crashing the whole process — so this isn't a crash-prevention fix.
// What it fixes is *where* and *how* the failure surfaces: today, a bad
// `track` value reaches `tracks[track]` deep inside the handler and throws a
// generic "Cannot set properties of undefined" with no indication of what was
// actually wrong. Asserting at the boundary fails immediately with a message
// that names the parameter and the bad value.

export function isTrackId(v: unknown): v is TrackId {
  return v === 'main' || v === 'second'
}

export function isZoneId(v: unknown): v is ZoneId {
  return v === 1 || v === 2 || v === 3 || v === 4
}

export function assertTrackId(v: unknown, paramName = 'track'): TrackId {
  if (!isTrackId(v)) throw new Error(`Invalid ${paramName}: expected 'main' or 'second', got ${JSON.stringify(v)}`)
  return v
}

export function assertZoneId(v: unknown, paramName = 'zoneId'): ZoneId {
  if (!isZoneId(v)) throw new Error(`Invalid ${paramName}: expected 1, 2, 3, or 4, got ${JSON.stringify(v)}`)
  return v
}

const INTENT_VALUES: Intent[] = ['next', 'prev', 'black', 'logo', 'lyrics']

// Unlike the tracked/zone IDs above, an unrecognized Intent is already a safe
// no-op downstream (processIntent's if/else chain just falls through) — this
// guard exists for the tablet remote's WS handler, which is genuinely
// network-facing input (any device on the LAN, not just this app's own
// renderer), so it deserves the same "reject clearly" treatment even though
// nothing was actually unsafe about the old behavior.
export function isIntent(v: unknown): v is Intent {
  return typeof v === 'string' && (INTENT_VALUES as string[]).includes(v)
}

export function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0
}

// Service dates are stored as bare YYYY-MM-DD strings and compared as strings
// (see announcementMatchesDate) — never parsed as Date, which would drag the
// operator's timezone into what is meant to be a plain calendar day. So the
// guard checks the literal shape AND that the numbers describe a real date:
// '2026-02-30' matches the pattern but is not a day, and would silently never
// match an announcement window.
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1) return false
  // Day 0 of the next month is the last day of this one. Month is 1-based here
  // because Date's month argument is 0-based, so `m` already means "next month".
  return d <= new Date(y, m, 0).getDate()
}

export function assertIsoDateOrNull(v: unknown, paramName = 'date'): string | null {
  if (v == null) return null
  if (!isIsoDate(v)) throw new Error(`Invalid ${paramName}: expected YYYY-MM-DD, got ${JSON.stringify(v)}`)
  return v
}
