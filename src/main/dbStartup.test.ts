import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Real db.ts against a temp userData with Electron mocked (same approach as
// the QA scratch tests). Regression tests for QA B1 and A-C3.
let userData = ''
vi.mock('electron', () => ({
  app: { getPath: () => userData },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() }
}))

async function freshDb(): Promise<typeof import('./db')> {
  vi.resetModules()
  return await import('./db')
}

const song = (title: string) => ({ title, author: null, ccli: null, copyright: null, sections: [{ kind: 'verse', label: 'V1', lyrics: 'line one' }] })

beforeEach(() => { userData = mkdtempSync(join(tmpdir(), 'wf-dbstartup-')) })
afterEach(() => rmSync(userData, { recursive: true, force: true }))

describe('QA B1: upgraded installs skip the first-run wizard', () => {
  it('a brand-new database does NOT get has_completed_setup (wizard still shows)', async () => {
    const db = await freshDb()
    await db.initDb()
    expect(db.getSetting('has_completed_setup')).toBeNull()
  })

  it('a 0.19-style database (songs, church name, CCLI license, no setup flag) is marked complete on startup, without touching its settings', async () => {
    const db0 = await freshDb()
    await db0.initDb()
    db0.createSong(song('Amazing Grace') as never)
    db0.setSetting('church_name', 'Snow Hill Congregational Methodist Church')
    db0.setSetting('ccli_license', '7654321')
    db0.setSetting('has_completed_setup', null) // what a 0.19 database looks like

    const db = await freshDb()
    await db.initDb()
    expect(db.getSetting('has_completed_setup')).toBe('1')
    expect(db.getSetting('church_name')).toBe('Snow Hill Congregational Methodist Church')
    expect(db.getSetting('ccli_license')).toBe('7654321')
  })

  it('a fresh profile closed half-way through the wizard (only auto-generated settings) still shows the wizard', async () => {
    const db0 = await freshDb()
    await db0.initDb()
    db0.setSetting('tablet_pin', '123456')
    const db = await freshDb()
    await db.initDb()
    expect(db.getSetting('has_completed_setup')).toBeNull()
  })
})

describe('QA A-C3: a corrupt database falls back to the newest good backup', () => {
  it('restores the launch backup and the library is intact', async () => {
    const db0 = await freshDb()
    await db0.initDb()
    db0.createSong(song('Keep Me') as never)
    const dbFile = join(userData, 'worshipflow.db')
    mkdirSync(join(userData, 'backups'), { recursive: true })
    copyFileSync(dbFile, join(userData, 'backups', 'worshipflow-20261005T120000.db'))
    // Wipe the rolling .bak copies so the launch backup is the only good one.
    for (const s of ['.bak', '.bak.1', '.bak.2']) rmSync(dbFile + s, { force: true })
    const buf = readFileSync(dbFile); buf.write('NOT A SQLITE FILE!!', 0); writeFileSync(dbFile, buf)

    const db = await freshDb()
    const report = await db.checkDatabaseOnStartup()
    expect(report.status).toBe('recovered')
    await db.initDb() // used to throw "file is not a database"
    expect(db.listSongs('').map((s) => s.title)).toEqual(['Keep Me'])
  })

  it('without the startup check, initDb on a corrupt file still throws (the check is what makes startup safe)', async () => {
    const dbFile = join(userData, 'worshipflow.db')
    writeFileSync(dbFile, Buffer.from('this is definitely not sqlite'.repeat(20)))
    const db = await freshDb()
    await expect(db.initDb()).rejects.toThrow()
  })
})
