import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { importMediaFile, importedMediaName, isInsideRoots, isRealMediaPath, mediaProblemFor, migrateOutsidePaths, type MediaRoots } from './mediaImport'

// Real leading bytes: since QA A4-N1 the import checks content, not just the name.
const JPG = (body: string): Buffer => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(body)])

// QA B2-N1: a picture picked from outside the app folder must be copied into
// imported-media (the only place, with backgrounds/generated, the projector may
// load from) instead of being stored as its original path.
let root: string
let roots: MediaRoots
let pictures: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wf-media-'))
  const ud = join(root, 'userData')
  roots = { mediaDir: join(ud, 'imported-media'), allowedRoots: [join(ud, 'backgrounds'), join(ud, 'imported-media'), join(ud, 'generated')] }
  pictures = join(root, 'Pictures')
  mkdirSync(pictures, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const servable = (p: string): boolean => isInsideRoots(p, roots.allowedRoots) && existsSync(p)

describe('importMediaFile', () => {
  it('copies an outside picture into imported-media and returns the copy', async () => {
    const src = join(pictures, 'cross.jpg')
    writeFileSync(src, JPG('JPEGDATA'))
    const dest = await importMediaFile(src, roots)
    expect(dest.startsWith(roots.mediaDir)).toBe(true)
    expect(dest.endsWith('.jpg')).toBe(true)
    expect(readFileSync(dest)).toEqual(JPG('JPEGDATA'))
    expect(servable(dest)).toBe(true)
    expect(servable(src)).toBe(false)
  })

  it('reuses the same copy when the same file is picked again', async () => {
    const src = join(pictures, 'cross.jpg')
    writeFileSync(src, JPG('JPEGDATA'))
    const a = await importMediaFile(src, roots)
    const b = await importMediaFile(src, roots)
    expect(b).toBe(a)
    expect(readdirSync(roots.mediaDir)).toHaveLength(1)
  })

  it('keeps two different files with the same name apart', async () => {
    mkdirSync(join(pictures, 'usb'))
    writeFileSync(join(pictures, 'cross.jpg'), JPG('ONE'))
    writeFileSync(join(pictures, 'usb', 'cross.jpg'), JPG('TWO-LONGER'))
    const a = await importMediaFile(join(pictures, 'cross.jpg'), roots)
    const b = await importMediaFile(join(pictures, 'usb', 'cross.jpg'), roots)
    expect(a).not.toBe(b)
    expect(readFileSync(a)).toEqual(JPG('ONE'))
    expect(readFileSync(b)).toEqual(JPG('TWO-LONGER'))
  })

  it('leaves a file that is already in an allowed folder where it is', async () => {
    const bg = join(roots.allowedRoots[0], 'uploads', 'sky.png')
    mkdirSync(join(roots.allowedRoots[0], 'uploads'), { recursive: true })
    writeFileSync(bg, 'PNG')
    expect(await importMediaFile(bg, roots)).toBe(bg)
    expect(existsSync(roots.mediaDir)).toBe(false)
  })

  it('throws (and leaves no partial copy) when the source is gone', async () => {
    await expect(importMediaFile(join(pictures, 'gone.jpg'), roots)).rejects.toThrow()
    expect(existsSync(roots.mediaDir) ? readdirSync(roots.mediaDir) : []).toEqual([])
  })
})

describe('importedMediaName', () => {
  it('keeps the extension and a readable stem, and is deterministic', () => {
    const a = importedMediaName('/x/My Photo (1).JPG', 10, 1000)
    expect(a).toMatch(/^My Photo -1-?-[0-9a-f]{10}\.jpg$/)
    expect(importedMediaName('/x/My Photo (1).JPG', 10, 1000)).toBe(a)
    expect(importedMediaName('/x/My Photo (1).JPG', 11, 1000)).not.toBe(a)
  })
})

describe('isInsideRoots / isRealMediaPath', () => {
  it('rejects siblings that only share a prefix', () => {
    expect(isInsideRoots('/u/imported-media-evil/a.png', ['/u/imported-media'])).toBe(false)
    expect(isInsideRoots('/u/imported-media/a.png', ['/u/imported-media'])).toBe(true)
    expect(isInsideRoots('/u/imported-media/../x.png', ['/u/imported-media'])).toBe(false)
  })
  it('skips theme and icon markers', () => {
    expect(isRealMediaPath('theme:aurora')).toBe(false)
    expect(isRealMediaPath('icon:coffee')).toBe(false)
    expect(isRealMediaPath('')).toBe(false)
    expect(isRealMediaPath('/a/b.png')).toBe(true)
  })
})

describe('mediaProblemFor', () => {
  it('says outside for an existing file the projector may not load, missing for a gone one', () => {
    const src = join(pictures, 'cross.jpg')
    writeFileSync(src, 'x')
    expect(mediaProblemFor(src, servable)).toBe('outside')
    expect(mediaProblemFor(join(pictures, 'nope.jpg'), servable)).toBe('missing')
    expect(mediaProblemFor('theme:x', servable)).toBe(null)
    expect(mediaProblemFor(undefined, servable)).toBe(null)
  })
})

describe('migrateOutsidePaths (existing 0.20.2 items)', () => {
  it('copies outside files that exist, reports missing ones, skips servable ones', async () => {
    const outside = join(pictures, 'cross.jpg')
    writeFileSync(outside, JPG('x'))
    const inside = join(roots.mediaDir, 'slide1.png')
    mkdirSync(roots.mediaDir, { recursive: true })
    writeFileSync(inside, 'y')
    const gone = join(pictures, 'gone.mp4')
    const r = await migrateOutsidePaths([outside, inside, gone, outside, 'theme:x'], roots, servable)
    expect([...r.relinked.keys()]).toEqual([outside])
    expect(servable(r.relinked.get(outside)!)).toBe(true)
    expect(r.missing).toEqual([gone])
    expect(r.failed).toEqual([])
  })
})
