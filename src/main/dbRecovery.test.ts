import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, mkdirSync, utimesSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import initSqlJs, { type SqlJsStatic } from 'sql.js'
import { validateDbBytes, checkAndRecoverDatabase, forceRecoverDatabase, listRecoveryCandidates } from './dbRecovery'

// QA A-C3 regression: a corrupt/truncated worshipflow.db used to mean no
// window at all, with good backups sitting unused in backups/.

let SQL: SqlJsStatic
beforeAll(async () => {
  const dist = dirname(require.resolve('sql.js'))
  SQL = await initSqlJs({ locateFile: (f) => join(dist, f) })
})

function dbBytes(marker: string): Buffer {
  const db = new SQL.Database()
  db.run('CREATE TABLE song (id INTEGER PRIMARY KEY, title TEXT)')
  // Enough rows to span several pages, so truncation really damages it.
  for (let i = 0; i < 400; i++) db.run('INSERT INTO song (title) VALUES (?)', [`${marker} ${i} ${'x'.repeat(40)}`])
  const out = Buffer.from(db.export())
  db.close()
  return out
}

function titleIn(path: string): string {
  const db = new SQL.Database(readFileSync(path))
  const r = db.exec('SELECT title FROM song WHERE id = 1')
  db.close()
  return String(r[0].values[0][0])
}

let dir: string
let dbPath: string
let backups: string
let t = Date.now() / 1000 - 10_000
function write(path: string, buf: Buffer): void {
  writeFileSync(path, buf)
  t += 60
  utimesSync(path, t, t) // deterministic "newest first" ordering
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wf-dbrecovery-'))
  dbPath = join(dir, 'worshipflow.db')
  backups = join(dir, 'backups')
  mkdirSync(backups)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('validateDbBytes', () => {
  it('accepts a real database', () => {
    expect(validateDbBytes(SQL, dbBytes('ok'))).toEqual({ ok: true })
  })
  it('rejects an overwritten header ("file is not a database")', () => {
    const b = dbBytes('x'); b.write('NOT A SQLITE FILE!!', 0)
    expect(validateDbBytes(SQL, b).ok).toBe(false)
  })
  it('rejects a file cut in half ("database disk image is malformed")', () => {
    const b = dbBytes('x')
    expect(validateDbBytes(SQL, b.subarray(0, Math.floor(b.length / 2))).ok).toBe(false)
  })
  it('rejects an empty file', () => {
    expect(validateDbBytes(SQL, Buffer.alloc(0))).toEqual({ ok: false, reason: expect.stringMatching(/empty/) })
  })
})

describe('checkAndRecoverDatabase', () => {
  it('leaves a healthy database alone', () => {
    write(dbPath, dbBytes('live'))
    expect(checkAndRecoverDatabase(SQL, dbPath, backups).status).toBe('ok')
    expect(titleIn(dbPath)).toMatch(/^live/)
  })

  it('reports a fresh install when there is no database yet', () => {
    expect(checkAndRecoverDatabase(SQL, dbPath, backups).status).toBe('fresh')
  })

  it('moves a corrupt database aside (never deletes it) and restores the newest GOOD backup', () => {
    write(join(backups, 'worshipflow-20261001T120000.db'), dbBytes('old launch backup'))
    write(join(backups, 'worshipflow-20261004T120000.db'), dbBytes('newest launch backup'))
    const corruptBackup = dbBytes('corrupt'); corruptBackup.write('garbage!!!!!!!!!!!!', 0)
    write(`${dbPath}.bak`, corruptBackup) // newest candidate, but damaged — must be skipped
    const bad = dbBytes('live'); bad.write('NOT A SQLITE FILE!!', 0)
    write(dbPath, bad)

    const r = checkAndRecoverDatabase(SQL, dbPath, backups, new Date('2026-10-06T12:00:00Z'))
    expect(r.status).toBe('recovered')
    if (r.status !== 'recovered') return
    expect(r.restoredFrom).toBe(join(backups, 'worshipflow-20261004T120000.db'))
    expect(titleIn(dbPath)).toMatch(/^newest launch backup/)
    expect(r.corruptPath).toMatch(/worshipflow\.db\.corrupt-2026-10-06T12-00-00-000Z$/)
    expect(readFileSync(r.corruptPath!).equals(bad)).toBe(true)
  })

  it('prefers a newer .bak over older launch backups', () => {
    write(join(backups, 'worshipflow-20261001T120000.db'), dbBytes('launch'))
    write(`${dbPath}.bak`, dbBytes('bak'))
    const b = dbBytes('live'); write(dbPath, b.subarray(0, 3000))
    const r = checkAndRecoverDatabase(SQL, dbPath, backups)
    expect(r.status).toBe('recovered')
    expect(titleIn(dbPath)).toMatch(/^bak/)
  })

  it('is unrecoverable (but keeps the damaged file) when no backup is good', () => {
    const b = dbBytes('live'); b.write('NOT A SQLITE FILE!!', 0); write(dbPath, b)
    const r = checkAndRecoverDatabase(SQL, dbPath, backups)
    expect(r.status).toBe('unrecoverable')
    if (r.status !== 'unrecoverable') return
    expect(existsSync(dbPath)).toBe(false)
    expect(readFileSync(r.corruptPath!).equals(b)).toBe(true)
  })

  it('QA A-M2: a zero-byte database with a good backup is restored instead of opening as an empty library', () => {
    write(join(backups, 'worshipflow-20261004T120000.db'), dbBytes('backup'))
    write(dbPath, Buffer.alloc(0))
    expect(checkAndRecoverDatabase(SQL, dbPath, backups).status).toBe('recovered')
    expect(titleIn(dbPath)).toMatch(/^backup/)
  })

  it('a zero-byte database with no backups is still treated as a fresh install', () => {
    write(dbPath, Buffer.alloc(0))
    expect(checkAndRecoverDatabase(SQL, dbPath, backups).status).toBe('fresh')
  })

  it('leaves no temp files behind', () => {
    write(join(backups, 'worshipflow-20261004T120000.db'), dbBytes('backup'))
    write(dbPath, Buffer.from('junk'.repeat(100)))
    checkAndRecoverDatabase(SQL, dbPath, backups)
    expect(readdirSync(dir).filter((f) => f.includes('tmp'))).toEqual([])
  })
})

describe('forceRecoverDatabase (initDb threw on a file that validated)', () => {
  it('skips backups identical to the current file', () => {
    const current = dbBytes('current')
    write(join(backups, 'worshipflow-20261003T120000.db'), dbBytes('older good'))
    write(join(backups, 'worshipflow-20261006T120000.db'), current) // today's launch backup = same bytes
    write(dbPath, current)
    const r = forceRecoverDatabase(SQL, dbPath, backups)
    expect(r.status).toBe('recovered')
    expect(titleIn(dbPath)).toMatch(/^older good/)
  })
})

describe('listRecoveryCandidates', () => {
  it('ignores unrelated files and empty files', () => {
    write(join(backups, 'notes.txt'), Buffer.from('hi'))
    write(join(backups, 'worshipflow-20261004T120000.db'), Buffer.alloc(0))
    write(join(backups, 'worshipflow-pre-restore-1759750000000.db'), dbBytes('pre'))
    const c = listRecoveryCandidates(dbPath, backups)
    expect(c.map((x) => x.path)).toEqual([join(backups, 'worshipflow-pre-restore-1759750000000.db')])
    expect(statSync(c[0].path).size).toBeGreaterThan(0)
  })
})
