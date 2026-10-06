import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync, utimesSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import initSqlJs from 'sql.js'
import { BAK_INTERVAL_MS, shouldRotateBak, writeFileDurable } from './bakRotation'

// Real db.ts against a temp userData with Electron mocked (QA A-M1 repro:
// a-extra/tests/db-backup.test.ts scenario A).
let userData = ''
vi.mock('electron', () => ({
  app: { getPath: () => userData },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() }
}))

async function freshDb(): Promise<typeof import('./db')> {
  vi.resetModules()
  return await import('./db')
}

beforeEach(() => { userData = mkdtempSync(join(tmpdir(), 'wf-bak-')) })
afterEach(() => rmSync(userData, { recursive: true, force: true }))

describe('shouldRotateBak (QA A-M1)', () => {
  const now = 1_800_000_000_000
  it('rotates when there is no .bak yet', () => expect(shouldRotateBak(null, now)).toBe(true))
  it('does not rotate again within the hour', () => {
    expect(shouldRotateBak(now - 1000, now)).toBe(false)
    expect(shouldRotateBak(now - BAK_INTERVAL_MS + 1, now)).toBe(false)
  })
  it('rotates once the newest .bak is an hour old', () => expect(shouldRotateBak(now - BAK_INTERVAL_MS, now)).toBe(true))
  it('a .bak "from the future" (clock moved back) does not freeze rotation forever', () => expect(shouldRotateBak(now + 3_600_000, now)).toBe(true))
})

describe('writeFileDurable (QA A-M2)', () => {
  it('writes every byte', () => {
    const p = join(userData, 'x.bin')
    const data = new Uint8Array(200_000).map((_, i) => i % 251)
    writeFileDurable(p, data)
    expect(Buffer.compare(readFileSync(p), Buffer.from(data))).toBe(0)
  })
})

async function songTitlesIn(path: string): Promise<string[]> {
  const SQL = await initSqlJs()
  const d = new SQL.Database(readFileSync(path))
  const r = d.exec('SELECT title FROM song')
  return r.length ? r[0].values.map((v) => String(v[0])) : []
}

describe('.bak generations survive a burst of saves (QA A-M1 repro)', () => {
  it('after a mistaken delete plus 3 setting writes, a .bak still holds the deleted song', async () => {
    const db0 = await freshDb()
    await db0.initDb()
    db0.createSong({ title: 'Amazing Grace', sections: [{ kind: 'verse', label: 'V1', ordinal: 0, lyrics: 'Amazing grace' }] } as never)
    // Pretend the song was saved over an hour ago (the last .bak generation is old).
    const bak = join(userData, 'worshipflow.db.bak')
    const db = await freshDb()
    await db.initDb()
    const old = new Date(Date.now() - 2 * BAK_INTERVAL_MS)
    utimesSync(bak, old, old)

    const id = db.listSongs('Amazing Grace')[0].id
    db.deleteSong(id)
    db.setSetting('church_name', 'A')
    db.setSetting('church_name', 'B')
    db.setSetting('church_name', 'C')

    const gens = [bak, `${bak}.1`, `${bak}.2`].filter(existsSync)
    const holding = []
    for (const g of gens) if ((await songTitlesIn(g)).includes('Amazing Grace')) holding.push(g)
    expect(holding.length).toBeGreaterThan(0)
  })

  it('a launch with many saves rewrites at most one generation', async () => {
    const db0 = await freshDb()
    await db0.initDb()
    db0.setSetting('church_name', 'first')
    const bak = join(userData, 'worshipflow.db.bak')
    const before = statSync(bak).mtimeMs
    const db = await freshDb()
    await db.initDb()
    for (let i = 0; i < 10; i++) db.setSetting('church_name', `n${i}`)
    expect(statSync(bak).mtimeMs).toBe(before)
    expect(existsSync(`${bak}.2`)).toBe(false)
  })
})
