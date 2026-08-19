import Store from 'electron-store'
import type { ZonePins } from '../shared/zonePins'

// Crash recovery: persist the actual service item being played, per track, restore on launch.
// Stores the live service item ID so we can restore the exact item after a crash,
// not just a mystery black screen.
export interface TrackSnapshot {
  liveServiceItemId: number | null
  slideIndex: number
  mode: string
}

export interface RecoverySnapshot {
  // Which service was active when this snapshot was written. One service at a
  // time is ever "active", so this lives at the top level, not per-track.
  serviceId: number | null
  // Date.now() at write time, used to decide whether a snapshot is fresh
  // enough to be worth restoring (see RECOVERY_STALE_MS in index.ts).
  ts: number
  main: TrackSnapshot
  second: TrackSnapshot | null
  // Live zone pins ("hold this screen on X"). Optional: snapshots written by
  // earlier builds simply have none, and electron-store tolerates the new key.
  pins?: ZonePins
}

type RecoveryStore = Store<{ lastState: RecoverySnapshot | null }>
let recoveryStore: RecoveryStore | null = null

// Keep construction lazy so importing the pure recovery helpers does not
// require an Electron user-data directory. The live app still uses the same
// electron-store file, but only creates it when recovery is actually read or
// written.
function getRecoveryStore(): RecoveryStore {
  recoveryStore ??= new Store<{ lastState: RecoverySnapshot | null }>({ name: 'recovery' })
  return recoveryStore
}

export function readRecovery(): RecoverySnapshot | null {
  try {
    return getRecoveryStore().get('lastState') ?? null
  } catch {
    return null
  }
}

export function writeRecovery(snap: RecoverySnapshot): void {
  try {
    getRecoveryStore().set('lastState', snap)
  } catch {
    // Never let autosave crash the live engine.
  }
}

// Pure staleness check, extracted so it's testable without touching the store
// or Electron. See RECOVERY_STALE_MS in index.ts for the threshold rationale.
export function isRecoveryStale(snap: Pick<RecoverySnapshot, 'ts'>, now: number, staleMs: number): boolean {
  return now - snap.ts > staleMs
}
