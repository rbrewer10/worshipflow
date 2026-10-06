import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Real db.ts + songSelect.ts with Electron mocked — ported from the QA scratch
// test (a-extra/tests/songselect.test.ts).
let userData = ''
let nextPick = ''
let confirmResponse = 0
const messageBoxes: { type?: string; message: string }[] = []
const errorBoxes: string[] = []
vi.mock('electron', () => ({
  app: { getPath: () => userData },
  safeStorage: { isEncryptionAvailable: () => false },
  BrowserWindow: class {},
  session: { fromPartition: () => ({ on() {} }) },
  dialog: {
    showOpenDialog: async () => ({ canceled: false, filePaths: [nextPick] }),
    showMessageBox: async (a: { type?: string; message: string }, b?: { type?: string; message: string }) => {
      const o = b ?? a
      messageBoxes.push({ type: o.type, message: o.message })
      return { response: o.type === 'question' ? confirmResponse : 0 }
    },
    showErrorBox: (t: string, m: string) => { errorBoxes.push(`${t}: ${m}`) },
  },
}))

async function fresh(): Promise<{ db: typeof import('./db'); ss: typeof import('./songSelect') }> {
  vi.resetModules()
  const db = await import('./db')
  await db.initDb()
  const ss = await import('./songSelect')
  return { db, ss }
}
function file(name: string, content: string): string { const p = join(userData, name); writeFileSync(p, content); return p }
const usr = (title: string, author: string, ccli: string, lyric: string): string =>
  `[File]\nType=WorshipSongs\n[S A1]\nTitle=${title}\nAuthor=${author}\nCCLI=${ccli}\n[V1]\n${lyric}\n`

describe('SongSelect file import', () => {
  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), 'wf-ss-test-'))
    messageBoxes.length = 0
    errorBoxes.length = 0
    confirmResponse = 0
  })

  it('QA A-H5: a different song that shares a title (different CCLI #) IS imported', async () => {
    const { db, ss } = await fresh()
    nextPick = file('a.usr', usr('Holy Spirit', 'Francesca Battistelli', '6087919', "There's nothing worth more"))
    const r1 = await ss.importSongSelectFile(null)
    nextPick = file('b.usr', usr('Holy Spirit', 'Bryan Torwalt', '9999999', 'A completely different song'))
    const r2 = await ss.importSongSelectFile(null)
    expect(r1?.created).toBe(true)
    expect(r2?.created).toBe(true)
    expect(r2?.id).not.toBe(r1?.id)
    expect(db.listSongs('').length).toBe(2)
  })

  it('the same song downloaded twice is still recognised (CCLI in different formats)', async () => {
    const { db, ss } = await fresh()
    nextPick = file('a.usr', usr('10,000 Reasons', 'Matt Redman', '6016351', 'Bless the Lord O my soul'))
    await ss.importSongSelectFile(null)
    nextPick = file('b.usr', usr('10,000 Reasons (Bless The Lord)', 'Matt Redman', 'CCLI# 6016351', 'Bless the Lord O my soul'))
    const r2 = await ss.importSongSelectFile(null)
    expect(r2?.created).toBe(false)
    expect(db.listSongs('').length).toBe(1)
  })

  it('QA M4 + A-H4: an empty file shows a NON-blocking error and returns null (no showErrorBox)', async () => {
    const { ss } = await fresh()
    nextPick = file('empty.txt', '   \n  ')
    await expect(ss.importSongSelectFile(null)).resolves.toBeNull()
    expect(errorBoxes).toEqual([])
    expect(messageBoxes.some((m) => m.type === 'error')).toBe(true)
  })

  it('QA M4: a title-only .usr with no lyrics is refused, not saved as an empty song', async () => {
    const { db, ss } = await fresh()
    nextPick = file('u1.usr', '[File]\nType=WorshipSongs\n[S A1]\n[V1]\n\n')
    expect(await ss.importSongSelectFile(null)).toBeNull()
    expect(db.listSongs('').length).toBe(0)
    expect(messageBoxes.some((m) => m.type === 'error')).toBe(true)
  })

  it('QA M4: a non-lyrics text file asks first; Cancel imports nothing, "Import anyway" imports it', async () => {
    const { db, ss } = await fresh()
    nextPick = file('receipt.txt', 'Order #4471\nThank you for your purchase\nTotal: $12.00')
    confirmResponse = 0
    expect(await ss.importSongSelectFile(null)).toBeNull()
    expect(db.listSongs('').length).toBe(0)
    confirmResponse = 1
    const r = await ss.importSongSelectFile(null)
    expect(r?.created).toBe(true)
    expect(messageBoxes.filter((m) => m.type === 'question').length).toBe(2)
  })

  it('a successful file import shows no native popup (the operator toast covers it)', async () => {
    const { ss } = await fresh()
    nextPick = file('a.usr', usr('Amazing Grace', 'John Newton', '22025', 'Amazing grace how sweet the sound'))
    const r = await ss.importSongSelectFile(null)
    expect(r?.created).toBe(true)
    expect(messageBoxes).toEqual([])
  })
})

describe('QA A-H4: no blocking error boxes in the main process', () => {
  it('no main-process source calls dialog.showErrorBox', () => {
    for (const f of ['index.ts', 'songSelect.ts', 'db.ts']) {
      const src = readFileSync(join(__dirname, f), 'utf8')
      expect(src.match(/dialog\.showErrorBox\(/g), f).toBeNull()
    }
  })
})
