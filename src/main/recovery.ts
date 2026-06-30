import Store from 'electron-store'

// Crash recovery: persist the actual service item being played, restore on launch.
// Stores the live service item ID so we can restore the exact item after a crash,
// not just a mystery black screen.
export interface RecoverySnapshot {
  liveServiceItemId: number | null
  slideIndex: number
  mode: string
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
