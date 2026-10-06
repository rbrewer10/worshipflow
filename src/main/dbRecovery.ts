// Startup database validation + automatic fallback to the newest good backup.
//
// QA A-C3 (0.20.2): a corrupt or truncated worshipflow.db made initDb() throw
// on its first statement; the whenReady callback had no try/catch, so no
// window ever opened while the process kept the single-instance lock — the
// app simply "didn't open" and further launches exited silently. The restore
// UI lives inside the app, so the backups that already existed were
// unreachable. The launch backup was even taken OF the corrupt file.
//
// Pure-ish (fs + an injected sql.js instance, no Electron) so it's unit-tested
// against real SQLite bytes in dbRecovery.test.ts.
import { existsSync, readFileSync, readdirSync, renameSync, statSync, copyFileSync, unlinkSync, openSync, fsyncSync, closeSync } from 'fs'
import { basename, join } from 'path'
import type { SqlJsStatic } from 'sql.js'

const SQLITE_HEADER = 'SQLite format 3\u0000'

export type DbValidation = { ok: true } | { ok: false; reason: string }

/** Full validation: SQLite header, opens, `PRAGMA quick_check` = ok, schema readable. */
export function validateDbBytes(SQL: SqlJsStatic, buf: Uint8Array): DbValidation {
  if (buf.length === 0) return { ok: false, reason: 'file is empty (0 bytes)' }
  if (buf.length < 100 || Buffer.from(buf.subarray(0, 16)).toString('latin1') !== SQLITE_HEADER) {
    return { ok: false, reason: 'file is not a database (bad header)' }
  }
  let db: InstanceType<SqlJsStatic['Database']> | null = null
  try {
    db = new SQL.Database(buf)
    const res = db.exec('PRAGMA quick_check')
    const first = String(res[0]?.values[0]?.[0] ?? '')
    if (first.toLowerCase() !== 'ok') return { ok: false, reason: `integrity check failed: ${first || 'no result'}` }
    db.exec('SELECT COUNT(*) FROM sqlite_master')
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  } finally {
    try { db?.close() } catch { /* ignore */ }
  }
}

export function validateDbFile(SQL: SqlJsStatic, path: string): DbValidation {
  try {
    return validateDbBytes(SQL, readFileSync(path))
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

export interface RecoveryCandidate { path: string; mtimeMs: number; kind: 'bak' | 'launch-backup' }

const LAUNCH_BACKUP_RE = /^worshipflow-\d{8}T\d{6}\.db$/
const PRE_RESTORE_RE = /^worshipflow-pre-restore-\d+\.db$/

/**
 * Every place a previous good copy may live, newest first: the per-save
 * rolling `.bak` generations next to the DB, then the per-launch snapshots
 * (and pre-restore safety copies) in `backups/`.
 */
export function listRecoveryCandidates(dbPath: string, backupsDir: string): RecoveryCandidate[] {
  const out: RecoveryCandidate[] = []
  const add = (path: string, kind: RecoveryCandidate['kind']): void => {
    try {
      const st = statSync(path)
      if (st.isFile() && st.size > 0) out.push({ path, mtimeMs: st.mtimeMs, kind })
    } catch { /* missing */ }
  }
  for (const suffix of ['.bak', '.bak.1', '.bak.2']) add(`${dbPath}${suffix}`, 'bak')
  if (existsSync(backupsDir)) {
    try {
      for (const f of readdirSync(backupsDir)) {
        if (LAUNCH_BACKUP_RE.test(f) || PRE_RESTORE_RE.test(f)) add(join(backupsDir, f), 'launch-backup')
      }
    } catch { /* unreadable dir — just no candidates from it */ }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

/** Copy via a temp file + fsync + rename so a crash mid-copy never leaves a half-written DB. */
export function atomicCopy(src: string, dest: string): void {
  const tmp = `${dest}.restore-tmp`
  copyFileSync(src, tmp)
  try {
    const fd = openSync(tmp, 'r+')
    try { fsyncSync(fd) } finally { closeSync(fd) }
  } catch { /* fsync is best-effort (some filesystems refuse it) */ }
  try {
    renameSync(tmp, dest)
  } catch (err) {
    try { unlinkSync(tmp) } catch { /* ignore */ }
    throw err
  }
}

export function stampForFilename(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-')
}

export type DbStartupReport =
  | { status: 'ok' }
  | { status: 'fresh' }
  | { status: 'recovered'; reason: string; restoredFrom: string; restoredFromMtimeMs: number; corruptPath: string | null }
  | { status: 'unrecoverable'; reason: string; corruptPath: string | null }

/**
 * Validates the database file before anything opens it. If it's damaged, the
 * bad file is moved aside (never deleted) as `worshipflow.db.corrupt-<ts>`
 * and the newest backup that passes validation is copied into place.
 *
 * A zero-byte file (QA A-M2: a power cut mid-save on Windows) counts as damage
 * when a good backup exists; with no backups at all it's treated as a fresh
 * install, exactly as before.
 */
export function checkAndRecoverDatabase(SQL: SqlJsStatic, dbPath: string, backupsDir: string, now = new Date()): DbStartupReport {
  if (!existsSync(dbPath)) return { status: 'fresh' }
  const check = validateDbFile(SQL, dbPath)
  if (check.ok) return { status: 'ok' }

  let size = -1
  try { size = statSync(dbPath).size } catch { /* treat as damaged */ }
  const candidates = listRecoveryCandidates(dbPath, backupsDir)
  const good = candidates.find((c) => validateDbFile(SQL, c.path).ok)
  if (size === 0 && !good) return { status: 'fresh' }

  let corruptPath: string | null = `${dbPath}.corrupt-${stampForFilename(now)}`
  try {
    renameSync(dbPath, corruptPath)
  } catch {
    // Couldn't move it (locked by antivirus/OneDrive?) — keep a copy instead,
    // then fall through; the restore below overwrites dbPath atomically.
    try { copyFileSync(dbPath, corruptPath) } catch { corruptPath = null }
  }

  if (!good) return { status: 'unrecoverable', reason: check.reason, corruptPath }
  atomicCopy(good.path, dbPath)
  return { status: 'recovered', reason: check.reason, restoredFrom: good.path, restoredFromMtimeMs: good.mtimeMs, corruptPath }
}

export function describeBackup(path: string): string {
  return basename(path)
}

/**
 * For when the file validates but the app still can't start on it (e.g. a
 * migration throws): move the current file aside and restore the newest good
 * backup whose bytes differ from it (the launch backup taken moments ago is
 * an identical copy and would just fail the same way).
 */
export function forceRecoverDatabase(SQL: SqlJsStatic, dbPath: string, backupsDir: string, now = new Date()): DbStartupReport {
  let current: Buffer | null = null
  try { current = readFileSync(dbPath) } catch { /* missing */ }
  const candidates = listRecoveryCandidates(dbPath, backupsDir)
  const good = candidates.find((c) => {
    try {
      const bytes = readFileSync(c.path)
      if (current && bytes.equals(current)) return false
      return validateDbBytes(SQL, bytes).ok
    } catch { return false }
  })
  let corruptPath: string | null = null
  if (current) {
    corruptPath = `${dbPath}.corrupt-${stampForFilename(now)}`
    try { renameSync(dbPath, corruptPath) } catch { try { copyFileSync(dbPath, corruptPath) } catch { corruptPath = null } }
  }
  if (!good) return { status: 'unrecoverable', reason: 'no other good backup found', corruptPath }
  atomicCopy(good.path, dbPath)
  return { status: 'recovered', reason: 'startup failed on the current database', restoredFrom: good.path, restoredFromMtimeMs: good.mtimeMs, corruptPath }
}
