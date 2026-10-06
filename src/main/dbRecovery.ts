// Startup database validation + automatic fallback to the newest good backup.
//
// QA A-C3 (0.20.2): a corrupt or truncated worshipflow.db made initDb() throw
// on its first statement; the whenReady callback had no try/catch, so no
// window ever opened while the process kept the single-instance lock — the
// app simply "didn't open" and further launches exited silently. The restore
// UI lives inside the app, so the backups that already existed were
// unreachable. The launch backup was even taken OF the corrupt file.
//
// Retest follow-ups (0.20.3 candidate):
//  - A-N1: the "initDb failed → restore newest good backup" path could loop,
//    restoring older and older data: the launch backup was taken of the failing
//    file before initDb, and only the *current* file's bytes were excluded.
//    Now known-bad bytes (any .corrupt-* file) are never candidates, the launch
//    backup is only written after initDb succeeds (index.ts), and the automatic
//    restore is capped at one attempt (restore-attempt marker below).
//  - A-N2: the damaged file used to be renamed away BEFORE the backup copy, so
//    a failed copy left no database at all and the app silently started an
//    empty library. The backup is now staged to a temp file first and only
//    then swapped in; a missing database with backups present is reported
//    as 'missing' so the operator is offered a restore.
//  - A-N7: a valid but unrelated SQLite file passed validation; WorshipFlow's
//    core tables are now required.
//
// Pure-ish (fs + an injected sql.js instance, no Electron) so it's unit-tested
// against real SQLite bytes in dbRecovery.test.ts.
import { existsSync, readFileSync, readdirSync, renameSync, statSync, copyFileSync, unlinkSync, openSync, fsyncSync, closeSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import { basename, dirname, join } from 'path'
import type { SqlJsStatic } from 'sql.js'

const SQLITE_HEADER = 'SQLite format 3\u0000'

/** Tables (and columns) every WorshipFlow database has had since its first release (QA A-N7). */
export const CORE_SCHEMA: Record<string, string[]> = {
  song: ['id', 'title'],
  service: ['id', 'name'],
  setting: ['key', 'value']
}

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
    for (const [table, cols] of Object.entries(CORE_SCHEMA)) {
      const info = db.exec(`PRAGMA table_info(${table})`)
      const have = new Set((info[0]?.values ?? []).map((row) => String(row[1])))
      if (have.size === 0) return { ok: false, reason: `not a WorshipFlow database (no ${table} table)` }
      const missing = cols.filter((c) => !have.has(c))
      if (missing.length) return { ok: false, reason: `not a WorshipFlow database (${table} table has no ${missing.join(', ')} column)` }
    }
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

/** Copy src to `${dest}.restore-tmp` and fsync it. Throws if the copy fails; dest is untouched. */
export function stageCopy(src: string, dest: string): string {
  const tmp = `${dest}.restore-tmp`
  try {
    copyFileSync(src, tmp)
    try {
      const fd = openSync(tmp, 'r+')
      try { fsyncSync(fd) } finally { closeSync(fd) }
    } catch { /* fsync is best-effort (some filesystems refuse it) */ }
    return tmp
  } catch (err) {
    try { unlinkSync(tmp) } catch { /* ignore */ }
    throw err
  }
}

/** Copy via a temp file + fsync + rename so a crash mid-copy never leaves a half-written DB. */
export function atomicCopy(src: string, dest: string): void {
  const tmp = stageCopy(src, dest)
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
  /** No database file, but a good backup exists — ask before starting empty (QA A-N2). */
  | { status: 'missing'; candidate: string; candidateMtimeMs: number }
  | { status: 'recovered'; reason: string; restoredFrom: string; restoredFromMtimeMs: number; corruptPath: string | null }
  /** `damagedInPlace`: the bad file is still at dbPath (call moveAside before starting empty). */
  | { status: 'unrecoverable'; reason: string; corruptPath: string | null; damagedInPlace?: boolean
      /** A good backup exists but couldn't be copied / swapped in (disk full, file locked) — worth a retry (QA A2-N5). */
      restoreFailed?: boolean }

function sha1(buf: Uint8Array): string {
  return createHash('sha1').update(buf).digest('hex')
}

/** Hashes of every file already set aside as damaged/failing (worshipflow.db.corrupt-*). */
export function knownBadHashes(dbPath: string): Set<string> {
  const out = new Set<string>()
  const prefix = `${basename(dbPath)}.corrupt-`
  try {
    for (const f of readdirSync(dirname(dbPath))) {
      if (!f.startsWith(prefix)) continue
      try { out.add(sha1(readFileSync(join(dirname(dbPath), f)))) } catch { /* unreadable */ }
    }
  } catch { /* no dir */ }
  return out
}

/** Good candidates, newest first, skipping known-bad bytes and anything in `exclude`. */
export function goodCandidates(SQL: SqlJsStatic, dbPath: string, backupsDir: string, exclude: Set<string> = new Set()): RecoveryCandidate[] {
  const bad = knownBadHashes(dbPath)
  return listRecoveryCandidates(dbPath, backupsDir).filter((c) => {
    try {
      const bytes = readFileSync(c.path)
      const h = sha1(bytes)
      if (bad.has(h) || exclude.has(h)) return false
      return validateDbBytes(SQL, bytes).ok
    } catch { return false }
  })
}

/** Move the damaged file aside (never delete it). Falls back to a copy if it's locked. */
export function moveAside(dbPath: string, now = new Date()): string | null {
  const corruptPath = `${dbPath}.corrupt-${stampForFilename(now)}`
  try {
    renameSync(dbPath, corruptPath)
    return corruptPath
  } catch {
    // Couldn't move it (locked by antivirus/OneDrive?) — keep a copy instead;
    // the swap below then replaces dbPath in one rename.
    try { copyFileSync(dbPath, corruptPath); return corruptPath } catch { return null }
  }
}

/**
 * Stage the first candidate that copies cleanly, then set the current file
 * aside and swap the staged copy in. If no candidate can be copied, nothing on
 * disk changes (QA A-N2: a failed copy used to leave no database at all).
 */
function restoreFrom(candidates: RecoveryCandidate[], dbPath: string, now: Date, reason: string): DbStartupReport {
  let staged: { tmp: string; from: RecoveryCandidate } | null = null
  let lastErr = ''
  for (const c of candidates) {
    try { staged = { tmp: stageCopy(c.path, dbPath), from: c }; break } catch (err) { lastErr = err instanceof Error ? err.message : String(err) }
  }
  if (!staged) {
    return { status: 'unrecoverable', reason: `${reason}; a backup exists but couldn't be copied (${lastErr})`, corruptPath: null, damagedInPlace: existsSync(dbPath), restoreFailed: true }
  }
  const corruptPath = existsSync(dbPath) ? moveAside(dbPath, now) : null
  try {
    renameSync(staged.tmp, dbPath)
  } catch (err) {
    try { unlinkSync(staged.tmp) } catch { /* ignore */ }
    // Put the original back if we moved it, so the next launch sees the same state.
    if (corruptPath && !existsSync(dbPath)) { try { renameSync(corruptPath, dbPath) } catch { /* leave it at corruptPath */ } }
    return { status: 'unrecoverable', reason: `${reason}; couldn't put the backup in place (${err instanceof Error ? err.message : String(err)})`, corruptPath: existsSync(dbPath) ? null : corruptPath, damagedInPlace: existsSync(dbPath), restoreFailed: true }
  }
  return { status: 'recovered', reason, restoredFrom: staged.from.path, restoredFromMtimeMs: staged.from.mtimeMs, corruptPath }
}

/**
 * Validates the database file before anything opens it. If it's damaged, the
 * newest good backup is staged, the bad file moved aside (never deleted) as
 * `worshipflow.db.corrupt-<ts>`, and the backup swapped in.
 *
 * A zero-byte file (QA A-M2: a power cut mid-save on Windows) counts as damage
 * when a good backup exists; with no backups at all it's treated as a fresh
 * install, exactly as before. With no good backup the damaged file stays put
 * (damagedInPlace) until the operator chooses to start empty.
 */
export function checkAndRecoverDatabase(SQL: SqlJsStatic, dbPath: string, backupsDir: string, now = new Date()): DbStartupReport {
  if (!existsSync(dbPath)) {
    const good = goodCandidates(SQL, dbPath, backupsDir)[0]
    return good ? { status: 'missing', candidate: good.path, candidateMtimeMs: good.mtimeMs } : { status: 'fresh' }
  }
  const check = validateDbFile(SQL, dbPath)
  if (check.ok) return { status: 'ok' }

  let size = -1
  try { size = statSync(dbPath).size } catch { /* treat as damaged */ }
  const good = goodCandidates(SQL, dbPath, backupsDir)
  if (size === 0 && good.length === 0) return { status: 'fresh' }
  if (good.length === 0) return { status: 'unrecoverable', reason: check.reason, corruptPath: null, damagedInPlace: true }
  return restoreFrom(good, dbPath, now, check.reason)
}

/** The operator chose "Restore" for a missing database. */
export function restoreMissingDatabase(SQL: SqlJsStatic, dbPath: string, backupsDir: string, now = new Date()): DbStartupReport {
  const good = goodCandidates(SQL, dbPath, backupsDir)
  if (good.length === 0) return { status: 'unrecoverable', reason: 'no good backup found', corruptPath: null }
  return restoreFrom(good, dbPath, now, 'the database file was missing')
}

export function describeBackup(path: string): string {
  return basename(path)
}

/**
 * For when the file validates but the app still can't start on it (e.g. a
 * migration throws): restore the newest good backup whose bytes differ from
 * the current file and from every file already set aside as failing. With no
 * such backup the current file is left exactly where it is (QA A-N1: it used
 * to be renamed away anyway, so the next launch was an empty library).
 */
export function forceRecoverDatabase(SQL: SqlJsStatic, dbPath: string, backupsDir: string, now = new Date()): DbStartupReport {
  const exclude = new Set<string>()
  try { exclude.add(sha1(readFileSync(dbPath))) } catch { /* missing */ }
  const good = goodCandidates(SQL, dbPath, backupsDir, exclude)
  if (good.length === 0) return { status: 'unrecoverable', reason: 'no other good backup found', corruptPath: null, damagedInPlace: existsSync(dbPath) }
  return restoreFrom(good, dbPath, now, 'startup failed on the current database')
}

// --- One automatic restore per failure (QA A-N1) -----------------------------
// If a restored backup ALSO fails to start, the cause is almost certainly the
// software (a migration bug, or a file from a newer version), not the data —
// restoring ever-older backups just walks the library backwards. The marker is
// written when a restore happens and cleared once initDb succeeds.

const ATTEMPT_FILE = 'db-restore-attempt.json'

export interface RestoreAttempt { at: number; restoredFrom: string; corruptPath: string | null; restoredFromMtimeMs?: number }

export function readRestoreAttempt(userDataDir: string): RestoreAttempt | null {
  try {
    const v = JSON.parse(readFileSync(join(userDataDir, ATTEMPT_FILE), 'utf8')) as RestoreAttempt
    return typeof v?.at === 'number' ? v : null
  } catch { return null }
}

export function recordRestoreAttempt(userDataDir: string, a: RestoreAttempt): void {
  try { writeFileSync(join(userDataDir, ATTEMPT_FILE), JSON.stringify(a)) } catch { /* advisory */ }
}

export function clearRestoreAttempt(userDataDir: string): void {
  try { unlinkSync(join(userDataDir, ATTEMPT_FILE)) } catch { /* not there */ }
}
