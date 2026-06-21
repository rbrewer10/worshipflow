import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'

// Crash recovery: persist the live position on every change, restore on launch.
// Phase 1 moves real data to SQLite; this lightweight JSON snapshot stays for
// instant position-recovery regardless of DB state.
export interface RecoverySnapshot {
  mode: string
  index: number
}

function file(): string {
  return join(app.getPath('userData'), 'recovery.json')
}

export function readRecovery(): RecoverySnapshot | null {
  try {
    return JSON.parse(readFileSync(file(), 'utf8')) as RecoverySnapshot
  } catch {
    return null
  }
}

export function writeRecovery(snap: RecoverySnapshot): void {
  try {
    writeFileSync(file(), JSON.stringify(snap))
  } catch {
    // Never let autosave crash the live engine.
  }
}
