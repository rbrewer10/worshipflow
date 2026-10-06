import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  importMediaFile, isNetworkPath, migrateOutsidePaths, mediaProblemFor, MediaImportRefused, planImportedMediaCleanup,
  safeCleanupName, servablePath, ORPHAN_GRACE_MS, PARTIAL_COPY_MAX_AGE_MS, type MediaRoots
} from './mediaImport'

// QA A3-N1 (High, security): a crafted .wfservice could point image items at
// ~/.ssh/id_rsa, worshipflow.db, recovery.json or a relative path; the
// migration copied them into imported-media and the PIN-less LAN /file route
// served them. These tests pin every layer of the fix.
let root: string
let ud: string
let roots: MediaRoots
let home: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wf-sec-'))
  ud = join(root, 'userData')
  home = join(root, 'home')
  roots = { mediaDir: join(ud, 'imported-media'), allowedRoots: [join(ud, 'backgrounds'), join(ud, 'imported-media'), join(ud, 'generated')], userDataDir: ud }
  mkdirSync(join(ud, 'backups'), { recursive: true })
  mkdirSync(join(home, '.ssh'), { recursive: true })
  mkdirSync(join(home, 'Pictures'), { recursive: true })
  writeFileSync(join(home, '.ssh', 'id_rsa'), '-----BEGIN FAKE PRIVATE KEY----- canary')
  writeFileSync(join(home, '.ssh', 'stolen.png'), 'PNG-IN-HIDDEN-DIR')
  writeFileSync(join(ud, 'worshipflow.db'), 'SQLite format 3')
  writeFileSync(join(ud, 'recovery.json'), '{}')
  writeFileSync(join(ud, 'backups', 'old.png'), 'PNG-IN-USERDATA')
  writeFileSync(join(home, 'Pictures', 'secret.txt'), 'private notes')
  writeFileSync(join(home, 'Pictures', 'cross.jpg'), 'JPEG')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const mediaFiles = (): string[] => (existsSync(roots.mediaDir) ? readdirSync(roots.mediaDir) : [])
const servable = (p: string): boolean => servablePath(p, roots.allowedRoots) !== null

describe('A3-N1: importMediaFile copies only absolute picture/video files from outside WorshipFlow', () => {
  const refuse = async (p: string, why: RegExp): Promise<void> => {
    const err = await importMediaFile(p, roots).catch((e: unknown) => e)
    expect(err, p).toBeInstanceOf(MediaImportRefused)
    expect((err as Error).message).toMatch(why)
  }

  it('refuses an SSH key, a database and a JSON file (no picture/video extension)', async () => {
    await refuse(join(home, '.ssh', 'id_rsa'), /isn't a picture or video/)
    await refuse(join(ud, 'worshipflow.db'), /isn't a picture or video/)
    await refuse(join(ud, 'recovery.json'), /isn't a picture or video/)
    await refuse(join(home, 'Pictures', 'secret.txt'), /isn't a picture or video/)
    expect(mediaFiles()).toEqual([])
  })

  it('refuses relative paths (they resolved against the process cwd)', async () => {
    await refuse('notes-rel.jpg', /full file path/)
    await refuse(join('..', 'userData', 'worshipflow.db'), /full file path|picture or video/)
    expect(mediaFiles()).toEqual([])
  })

  it('refuses anything under userData other than imported-media — even with a picture extension', async () => {
    await refuse(join(ud, 'backups', 'old.png'), /WorshipFlow's own data folder/)
    await refuse(join(roots.mediaDir, '..', 'worshipflow.db'), /picture or video/)
    expect(mediaFiles()).toEqual([])
  })

  it('refuses a symlink named .jpg that points at a non-media file, judged by the real target', async () => {
    const link = join(home, 'Pictures', 'innocent.jpg')
    symlinkSync(join(home, '.ssh', 'id_rsa'), link)
    await refuse(link, /picture or video|hidden folder/)
    expect(mediaFiles()).toEqual([])
  })

  it('refuses hidden folders such as ~/.ssh', async () => {
    await refuse(join(home, '.ssh', 'stolen.png'), /hidden folder/)
  })

  it('refuses a network path when copying from stored data (never probed), allows it for an explicit pick', async () => {
    await expect(importMediaFile('\\\\attacker\\share\\x.jpg', roots, { allowNetwork: false })).rejects.toThrow(/network share/)
    await expect(importMediaFile('//attacker/share/x.jpg', roots, { allowNetwork: false })).rejects.toThrow(/network share/)
    expect(isNetworkPath('\\\\srv\\a.jpg')).toBe(true)
    expect(isNetworkPath('C:\\Users\\a.jpg')).toBe(false)
  })

  it('still copies an ordinary picture', async () => {
    const dest = await importMediaFile(join(home, 'Pictures', 'cross.jpg'), roots)
    expect(dest.startsWith(roots.mediaDir)).toBe(true)
    expect(readFileSync(dest, 'utf8')).toBe('JPEG')
  })
})

describe('A3-N1: the migration of stored/imported paths launders nothing', () => {
  it("QA's crafted .wfservice paths: nothing copied, every one reported as refused, network paths never stat-ed", async () => {
    const crafted = [
      join(home, '.ssh', 'id_rsa'),
      'notes-rel.txt',
      join(roots.mediaDir, '..', 'worshipflow.db'),
      join(ud, 'recovery.json'),
      join(ud, 'backups', 'old.png'),
      '\\\\attacker\\share\\x.jpg',
    ]
    const probed: string[] = []
    const r = await migrateOutsidePaths(crafted, roots, (p) => { probed.push(p); return servable(p) })
    expect(r.relinked.size).toBe(0)
    expect(mediaFiles()).toEqual([])
    expect(r.refused.map((x) => x.path).sort()).toEqual([...crafted].sort())
    expect(probed).not.toContain('\\\\attacker\\share\\x.jpg')
    expect(probed).not.toContain('notes-rel.txt')
  })

  it('mediaProblemFor never probes a network or relative path', () => {
    const boom = (): boolean => { throw new Error('probed') }
    expect(mediaProblemFor('\\\\attacker\\share\\x.jpg', boom)).toBe('outside')
    expect(mediaProblemFor('rel/x.jpg', boom)).toBe('missing')
  })
})

describe('A3-N1: servablePath (wf-asset:// and the LAN /file route) serves pictures and videos only', () => {
  beforeEach(() => {
    mkdirSync(roots.mediaDir, { recursive: true })
    writeFileSync(join(roots.mediaDir, 'cross-0123456789.jpg'), 'JPEG')
    writeFileSync(join(roots.mediaDir, 'id_rsa-1a41fdac80'), 'KEY') // what the old migration left behind
    writeFileSync(join(roots.mediaDir, 'worshipflow-b87a8e943c.db'), 'SQLite')
    writeFileSync(join(roots.mediaDir, 'recovery-9321200890.json'), '{}')
  })

  it('serves a picture inside imported-media', () => {
    expect(servablePath(join(roots.mediaDir, 'cross-0123456789.jpg'), roots.allowedRoots)).not.toBeNull()
  })

  it('refuses non-media files even inside imported-media', () => {
    for (const f of ['id_rsa-1a41fdac80', 'worshipflow-b87a8e943c.db', 'recovery-9321200890.json']) {
      expect(servablePath(join(roots.mediaDir, f), roots.allowedRoots), f).toBeNull()
    }
  })

  it('refuses traversal, outside files, relative paths, symlinks out, and network paths', () => {
    expect(servablePath(join(roots.mediaDir, '..', 'worshipflow.db'), roots.allowedRoots)).toBeNull()
    expect(servablePath(join(home, 'Pictures', 'cross.jpg'), roots.allowedRoots)).toBeNull()
    expect(servablePath('cross.jpg', roots.allowedRoots)).toBeNull()
    symlinkSync(join(home, 'Pictures', 'cross.jpg'), join(roots.mediaDir, 'link.jpg'))
    expect(servablePath(join(roots.mediaDir, 'link.jpg'), roots.allowedRoots)).toBeNull()
    expect(servablePath('\\\\attacker\\share\\x.jpg', roots.allowedRoots)).toBeNull()
  })

  it('serves the configured logo wherever it lives, but only if it is a picture', () => {
    const logo = join(home, 'Pictures', 'cross.jpg')
    expect(servablePath(logo, roots.allowedRoots, [logo])).not.toBeNull()
    expect(servablePath(join(home, 'Pictures', 'secret.txt'), roots.allowedRoots, [join(home, 'Pictures', 'secret.txt')])).toBeNull()
  })
})

describe('A3-N6: imported-media cleanup', () => {
  const now = 1_800_000_000_000
  it('deletes .part leftovers older than an hour, keeps a copy in progress', () => {
    const plan = planImportedMediaCleanup([
      { name: 'big-be08f33119.mp4.part-1235541-1759760000000', mtimeMs: now - PARTIAL_COPY_MAX_AGE_MS - 1 },
      { name: 'new-0000000000.mp4.part-99-1759769999000', mtimeMs: now - 5000 },
    ], () => false, {}, now)
    expect(plan.remove).toEqual(['big-be08f33119.mp4.part-1235541-1759760000000'])
  })

  it('never deletes a referenced copy; an unreferenced one only after 30 days unreferenced', () => {
    const files = [{ name: 'used-1.jpg', mtimeMs: 0 }, { name: 'orphan-2.mp4', mtimeMs: 0 }, { name: '.cleanup.json', mtimeMs: 0 }]
    const used = (n: string): boolean => n === 'used-1.jpg'
    const first = planImportedMediaCleanup(files, used, {}, now)
    expect(first.remove).toEqual([]) // just noticed — start the clock
    expect(first.orphanSince).toEqual({ 'orphan-2.mp4': now })
    const later = planImportedMediaCleanup(files, used, first.orphanSince, now + ORPHAN_GRACE_MS - 1)
    expect(later.remove).toEqual([])
    const after = planImportedMediaCleanup(files, used, first.orphanSince, now + ORPHAN_GRACE_MS)
    expect(after.remove).toEqual(['orphan-2.mp4'])
    // referenced again (undo / re-import) → forgotten, clock resets
    expect(planImportedMediaCleanup(files, () => true, first.orphanSince, now + ORPHAN_GRACE_MS).orphanSince).toEqual({})
  })

  it('only plain names directly inside the folder are ever deleted', () => {
    expect(safeCleanupName('cross-0123456789.jpg')).toBe(true)
    for (const bad of ['', '../worshipflow.db', 'a/b.jpg', 'a\\b.jpg', '..']) expect(safeCleanupName(bad), bad).toBe(false)
  })
})
