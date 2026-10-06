// Save-path helpers for db.ts persist() (QA A-M1, A-M2).
//
// A-M1: persist() used to rotate worshipflow.db.bak -> .bak.1 -> .bak.2 on
// EVERY write, and setSetting() persists on every call — so after a mistaken
// delete plus three setting changes no .bak still held the deleted song, and a
// single launch rewrote all three generations within a minute.
// Now a generation is taken at most once per BAK_INTERVAL_MS, judged from the
// .bak file's own timestamp so it also holds across restarts (a crash loop of
// quick relaunches can't churn them either).
//
// A-M2: the temp file is fsync'd before the rename, so a power cut can't leave
// a renamed-but-empty worshipflow.db behind.
import { closeSync, existsSync, fsyncSync, openSync, statSync, utimesSync, writeSync, copyFileSync } from 'fs'

export const BAK_INTERVAL_MS = 60 * 60 * 1000

/** Should this save start a new .bak generation? */
export function shouldRotateBak(bakMtimeMs: number | null, nowMs: number, intervalMs = BAK_INTERVAL_MS): boolean {
  if (bakMtimeMs == null) return true
  // A clock that jumped backwards (bak "from the future") also rotates, rather than freezing forever.
  return nowMs - bakMtimeMs >= intervalMs || bakMtimeMs - nowMs > 60_000
}

export function bakMtime(bakPath: string): number | null {
  try {
    return existsSync(bakPath) ? statSync(bakPath).mtimeMs : null
  } catch {
    return null
  }
}

/** Copy dbPath to bakPath and stamp it "now" (Windows CopyFile keeps the source's mtime). */
export function copyToBak(dbPath: string, bakPath: string, now = new Date()): void {
  copyFileSync(dbPath, bakPath)
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
