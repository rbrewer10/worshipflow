// Save-path helpers for db.ts persist() (QA A-M1, A-M2).
//
// A-M1: persist() used to rotate worshipflow.db.bak -> .bak.1 -> .bak.2 on
// EVERY write, and setSetting() persists on every call — so after a mistaken
// delete plus three setting changes no .bak still held the deleted song, and a
// single launch rewrote all three generations within a minute.
// Now .bak is still refreshed on every save (it is the "previous save" that
// startup corruption recovery restores, so at most one edit is lost), but the
// older generations .bak.1 / .bak.2 move on at most once per BAK_INTERVAL_MS,
// judged from .bak.1's own timestamp so it also holds across restarts (a crash
// loop of quick relaunches can't churn them either).
//
// A-M2: the temp file is fsync'd before the rename, so a power cut can't leave
// a renamed-but-empty worshipflow.db behind.
//
// QA A2-N3: the hourly clock used to be .bak.1's own mtime, stamped "now" on
// every rotation — but .bak.1's CONTENT is the previous session's previous
// save. Startup recovery ranks candidates by mtime, so with db and .bak both
// damaged it picked .bak.1 over a newer launch backup. The clock now lives in
// a sidecar file (worshipflow.db.bak.rotated), and the generations keep the
// mtime of the save they hold (a rename preserves it).
import { closeSync, existsSync, fsyncSync, openSync, statSync, utimesSync, writeSync, copyFileSync, writeFileSync } from 'fs'

export const BAK_INTERVAL_MS = 60 * 60 * 1000

/** Should this save shift .bak -> .bak.1 -> .bak.2? (pass .bak.1's mtime) */
export function shouldRotateBak(bakMtimeMs: number | null, nowMs: number, intervalMs = BAK_INTERVAL_MS): boolean {
  if (bakMtimeMs == null) return true
  // A clock that jumped backwards (.bak.1 "from the future") also rotates, rather than freezing forever.
  return nowMs - bakMtimeMs >= intervalMs || bakMtimeMs - nowMs > 60_000
}

export function bakMtime(bakPath: string): number | null {
  try {
    return existsSync(bakPath) ? statSync(bakPath).mtimeMs : null
  } catch {
    return null
  }
}

/** The sidecar that records when .bak.1/.bak.2 last moved on (A2-N3). */
export const rotationClockPath = (bakPath: string): string => `${bakPath}.rotated`

/** When the generations last rotated: the sidecar's mtime, else (an upgrade) .bak.1's. */
export function lastRotationMs(bakPath: string): number | null {
  return bakMtime(rotationClockPath(bakPath)) ?? bakMtime(`${bakPath}.1`)
}

/** Record a rotation without touching the generations' own timestamps. */
export function markRotated(bakPath: string, now = new Date()): void {
  const clock = rotationClockPath(bakPath)
  try {
    writeFileSync(clock, String(now.getTime()))
    utimesSync(clock, now, now)
  } catch { /* advisory — worst case the next save rotates again */ }
}

/** Stamp a file "now" — a rename keeps the old mtime, which would re-trigger rotation on the next save. */
export function stampNow(path: string, now = new Date()): void {
  try { utimesSync(path, now, now) } catch { /* timestamp is advisory */ }
}

/** Copy dbPath to bakPath and stamp it "now" (Windows CopyFile keeps the source's mtime). */
export function copyToBak(dbPath: string, bakPath: string, now = new Date()): void {
  copyFileSync(dbPath, bakPath)
  // fsync too (A2-N3 note): .bak is what a power cut falls back on.
  try {
    const fd = openSync(bakPath, 'r+')
    try { fsyncSync(fd) } finally { closeSync(fd) }
  } catch { /* best effort — some filesystems refuse fsync */ }
  try { utimesSync(bakPath, now, now) } catch { /* timestamp is advisory */ }
}

/** writeFileSync + fsync, so the bytes are on disk before the caller renames the file into place. */
export function writeFileDurable(path: string, data: Uint8Array): void {
  const fd = openSync(path, 'w')
  try {
    let off = 0
    while (off < data.length) off += writeSync(fd, data, off, data.length - off)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}
