import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { relocateStoredPath } from './pathRelocation'

// A tiny fake filesystem: only the paths listed here "exist".
function fakeFs(existingPaths: string[]): (p: string) => boolean {
  const set = new Set(existingPaths)
  return (p: string) => set.has(p)
}

describe('relocateStoredPath', () => {
  it('leaves a path alone when it already resolves on this machine', () => {
    const p = 'C:\\Users\\ryan\\AppData\\Roaming\\worshipflow\\backgrounds\\uploads\\a.png'
    const exists = fakeFs([p])
    expect(relocateStoredPath(p, 'C:\\Users\\ryan\\AppData\\Roaming\\worshipflow', exists)).toBe(p)
  })

  it('relocates a background path onto a different username after the DB+files were copied to a new machine', () => {
    const stored = 'C:\\Users\\ryan\\AppData\\Roaming\\worshipflow\\backgrounds\\uploads\\a.png'
    const relocated = 'C:\\Users\\pastor.jim\\AppData\\Roaming\\worshipflow\\backgrounds\\uploads\\a.png'
    const exists = fakeFs([relocated]) // the OLD path does not exist here; the new one does
    expect(relocateStoredPath(stored, 'C:\\Users\\pastor.jim\\AppData\\Roaming\\worshipflow', exists)).toBe(relocated)
  })

  it('relocates a path nested in a subfolder (uploaded folder organization), not just the top level', () => {
    const stored = 'C:\\Users\\ryan\\AppData\\Roaming\\worshipflow\\backgrounds\\uploads\\Crosses - Landscape\\174.png'
    const relocated = 'C:\\Users\\pastor.jim\\AppData\\Roaming\\worshipflow\\backgrounds\\uploads\\Crosses - Landscape\\174.png'
    const exists = fakeFs([relocated])
    expect(relocateStoredPath(stored, 'C:\\Users\\pastor.jim\\AppData\\Roaming\\worshipflow', exists)).toBe(relocated)
  })

  it('relocates imported-media paths the same way as backgrounds', () => {
    const stored = 'C:\\Users\\ryan\\AppData\\Roaming\\worshipflow\\imported-media\\slide1.png'
    const relocated = 'C:\\Users\\pastor.jim\\AppData\\Roaming\\worshipflow\\imported-media\\slide1.png'
    const exists = fakeFs([relocated])
    expect(relocateStoredPath(stored, 'C:\\Users\\pastor.jim\\AppData\\Roaming\\worshipflow', exists)).toBe(relocated)
  })

  it('leaves the original path alone when the file cannot be found anywhere sensible, rather than guessing', () => {
    const stored = 'C:\\Users\\ryan\\AppData\\Roaming\\worshipflow\\backgrounds\\uploads\\gone.png'
    const exists = fakeFs([]) // nothing exists, old machine's files genuinely weren't copied
    expect(relocateStoredPath(stored, 'C:\\Users\\pastor.jim\\AppData\\Roaming\\worshipflow', exists)).toBe(stored)
  })

  it('never touches a theme: marker — it is not a real path', () => {
    const exists = fakeFs([])
    expect(relocateStoredPath('theme:sunrise', 'C:\\Users\\pastor.jim\\AppData\\Roaming\\worshipflow', exists)).toBe('theme:sunrise')
  })

  it('never touches an icon: marker — it is not a real path', () => {
    const exists = fakeFs([])
    expect(relocateStoredPath('icon:megaphone', 'C:\\Users\\pastor.jim\\AppData\\Roaming\\worshipflow', exists)).toBe('icon:megaphone')
  })

  it('passes through null and undefined unchanged', () => {
    const exists = fakeFs([])
    expect(relocateStoredPath(null, 'C:\\Users\\pastor.jim\\AppData\\Roaming\\worshipflow', exists)).toBe(null)
    expect(relocateStoredPath(undefined, 'C:\\Users\\pastor.jim\\AppData\\Roaming\\worshipflow', exists)).toBe(null)
  })

  it('passes through an empty string unchanged', () => {
    const exists = fakeFs([])
    expect(relocateStoredPath('', 'C:\\Users\\pastor.jim\\AppData\\Roaming\\worshipflow', exists)).toBe('')
  })
})

// Everything above uses a fake in-memory filesystem. This proves the same
// logic against REAL files on real disk with Node's actual existsSync — the
// closest this can get to the real "copy the DB + backgrounds folder to a
// new machine, launch the app" scenario without an actual second Windows
// user account to test against.
describe('relocateStoredPath against a real filesystem', () => {
  let oldRoot: string
  let newRoot: string

  afterEach(() => {
    if (oldRoot) rmSync(oldRoot, { recursive: true, force: true })
    if (newRoot) rmSync(newRoot, { recursive: true, force: true })
  })

  it('finds the real file after the whole userData tree was copied elsewhere', () => {
    // Only the PATH STRING for the old machine's userData folder (stands in
    // for C:\Users\ryan\AppData\Roaming\worshipflow) — deliberately never
    // created on disk, since the whole point is that this path does NOT
    // exist on the machine now running the code. A real mkdtempSync'd
    // directory that never gets a file written into it also guarantees no
    // real accident of a temp-dir collision could make it "exist".
    oldRoot = join(tmpdir(), 'wf-old-userdata-does-not-exist')
    const oldBackgroundsUploads = join(oldRoot, 'backgrounds', 'uploads', 'Crosses - Landscape')
    const storedPath = join(oldBackgroundsUploads, '174-Meadow-Stone-Cross.png')

    // ... and the NEW machine's userData folder (stands in for
    // C:\Users\pastor.jim\AppData\Roaming\worshipflow), containing a COPY of
    // just the backgrounds folder — exactly what "copy backgrounds + the
    // installer to a harddrive for someone else" produces.
    newRoot = mkdtempSync(join(tmpdir(), 'wf-new-userdata-'))
    const newBackgroundsUploads = join(newRoot, 'backgrounds', 'uploads', 'Crosses - Landscape')
    mkdirSync(newBackgroundsUploads, { recursive: true })
    writeFileSync(join(newBackgroundsUploads, '174-Meadow-Stone-Cross.png'), 'fake png bytes')

    // storedPath still says the OLD machine's path (this is exactly what's
    // sitting in the copied database's song.background column) — relocating
    // against the NEW userData root, using Node's real existsSync, must find
    // the copy that's actually on disk there.
    const relocated = relocateStoredPath(storedPath, newRoot, existsSync)
    expect(relocated).toBe(join(newBackgroundsUploads, '174-Meadow-Stone-Cross.png'))
    expect(existsSync(relocated!)).toBe(true)
  })
})
