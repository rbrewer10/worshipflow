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
