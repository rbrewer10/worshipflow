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
  main: TrackSnapshot
  second: TrackSnapshot | null
  // Live zone pins ("hold this screen on X"). Optional: snapshots written by
  // earlier builds simply have none, and electron-store tolerates the new key.
  pins?: ZonePins
}

const recoveryStore = new Store<{ lastState: RecoverySnapshot | null }>({ name: 'recovery' })

export function readRecovery(): RecoverySnapshot | null {
  try {
    return recoveryStore.get('lastState') ?? null
  } catch {
    return null
  }
}

export function writeRecovery(snap: RecoverySnapshot): void {
  try {
    recoveryStore.set('lastState', snap)
  } catch {
    // Never let autosave crash the live engine.
  }
}
