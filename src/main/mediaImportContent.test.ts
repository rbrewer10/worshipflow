import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, linkSync, mkdirSync, mkdtempSync, promises as fsp, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { contentMatchesExtension, importMediaFile, MediaImportRefused, migrateOutsidePaths, servablePath, sniffMedia, type MediaRoots } from './mediaImport'

// QA A4-N1: imported-media content was checked by extension only. A hard link
// to a text file named .jpg, a database renamed .mp4, or a file swapped for a
// symlink between the check and the copy all landed non-media bytes that the
// LAN /file route then served as a picture/video.

const bytes = (...parts: Array<number[] | string>): Buffer => Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p))))
const u32 = (n: number): number[] => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]
const SAMPLES: Record<string, Buffer> = {
  jpg: bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], 'JFIF'),
  png: bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d], 'IHDR'),
  gif: bytes('GIF89a', [1, 0, 1, 0]),
  webp: bytes('RIFF', u32(100), 'WEBPVP8 '),
  bmp: bytes('BM', u32(70), [0, 0, 0, 0], u32(54), u32(40), u32(1), u32(1)),
  mp4: bytes([0, 0, 0, 0x18], 'ftypisom', [0, 0, 2, 0], 'isomiso2'),
  m4v: bytes([0, 0, 0, 0x18], 'ftypM4V ', [0, 0, 0, 1], 'M4V M4A '),
  mov: bytes([0, 0, 0, 0x14], 'ftypqt  ', [0, 0, 2, 0], 'qt  '),
  webm: bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 1]),
}

describe('sniffMedia / contentMatchesExtension', () => {
  it('recognises every picture and video type the app imports', () => {
    expect(sniffMedia(SAMPLES.jpg)).toBe('jpeg')
    expect(sniffMedia(SAMPLES.png)).toBe('png')
    expect(sniffMedia(SAMPLES.gif)).toBe('gif')
    expect(sniffMedia(SAMPLES.webp)).toBe('webp')
    expect(sniffMedia(SAMPLES.bmp)).toBe('bmp')
    expect(sniffMedia(SAMPLES.mp4)).toBe('isobmff')
    expect(sniffMedia(SAMPLES.mov)).toBe('quicktime')
    expect(sniffMedia(bytes([0, 0, 0, 8], 'wide', [0, 0, 0, 0], 'mdat'))).toBe('quicktime')
    expect(sniffMedia(SAMPLES.webm)).toBe('webm')
    expect(sniffMedia(bytes([0, 0, 0, 0x1c], 'ftypavif'))).toBe('avif')
  })
  it('says nothing for text, keys, databases, JSON, SVG, HTML or an empty file', () => {
    for (const s of ['root:x:0:0:root:/root:/bin/bash', '-----BEGIN OPENSSH PRIVATE KEY-----', 'SQLite format 3\u0000', '{"track":"main"}', '<svg xmlns=', '<!doctype html>', 'BMW owners manual', '']) {
      expect(sniffMedia(Buffer.from(s, 'latin1')), JSON.stringify(s)).toBeNull()
    }
  })
  it('a picture must be a picture and a video a video; a mislabelled one within the kind is fine', () => {
    expect(contentMatchesExtension('a.png', 'jpeg')).toBe(true)
    expect(contentMatchesExtension('a.mp4', 'quicktime')).toBe(true)
    expect(contentMatchesExtension('a.jpg', 'isobmff')).toBe(false)
    expect(contentMatchesExtension('a.mp4', 'png')).toBe(false)
    expect(contentMatchesExtension('a.jpg', null)).toBe(false)
  })
})

let root: string
let pics: string
let roots: MediaRoots
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wf-a4n1-'))
  const ud = join(root, 'userData')
  pics = join(root, 'Pictures')
  mkdirSync(pics, { recursive: true })
  mkdirSync(ud, { recursive: true })
  roots = { mediaDir: join(ud, 'imported-media'), allowedRoots: [join(ud, 'backgrounds'), join(ud, 'imported-media'), join(ud, 'generated')], userDataDir: ud }
  writeFileSync(join(root, 'etc_passwd.txt'), 'A4CANARY_PASSWD root:x:0:0:root:/root:/bin/bash\n')
  writeFileSync(join(root, 'secret.db'), 'SQLite format 3\u0000 A4CANARY_DB')
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})
const landed = (): string[] => (existsSync(roots.mediaDir) ? readdirSync(roots.mediaDir) : [])
const refusedFor = async (p: string): Promise<string> => {
  const err = await importMediaFile(p, roots).catch((e: unknown) => e)
  expect(err, p).toBeInstanceOf(MediaImportRefused)
  return (err as Error).message
}

describe('QA A4-N1: importMediaFile checks the bytes it copies', () => {
  it('a hard link named .jpg to a text file is refused, nothing lands', async () => {
    linkSync(join(root, 'etc_passwd.txt'), join(pics, 'hardlink.jpg'))
    expect(await refusedFor(join(pics, 'hardlink.jpg'))).toMatch(/contents don't match/)
    expect(landed()).toEqual([])
  })
  it('a database renamed .mp4 is refused', async () => {
    writeFileSync(join(pics, 'movie.mp4'), readFileSync(join(root, 'secret.db')))
    expect(await refusedFor(join(pics, 'movie.mp4'))).toMatch(/contents don't match/)
    expect(landed()).toEqual([])
  })
  it('a video renamed .jpg is refused (the projector would show a broken picture)', async () => {
    writeFileSync(join(pics, 'clip.jpg'), SAMPLES.mp4)
    await refusedFor(join(pics, 'clip.jpg'))
  })
  it('TOCTOU: the picked file swapped for a symlink to the database after the checks is refused', async () => {
    const picked = join(pics, 'toctou.jpg')
    writeFileSync(picked, SAMPLES.jpg)
    const realMkdir = fsp.mkdir.bind(fsp)
    // mkdir runs after the path checks and before the copy: the race window.
    vi.spyOn(fsp, 'mkdir').mockImplementation(async (...args: Parameters<typeof fsp.mkdir>) => {
      unlinkSync(picked)
      symlinkSync(join(root, 'secret.db'), picked)
      return realMkdir(...args)
    })
    await refusedFor(picked)
    expect(landed().filter((f) => !f.includes('.part-'))).toEqual([])
    for (const f of landed()) expect(readFileSync(join(roots.mediaDir, f), 'latin1')).not.toMatch(/A4CANARY/)
  })
  it('TOCTOU: the picked file replaced by a different file after the checks is refused', async () => {
    const picked = join(pics, 'swap.jpg')
    writeFileSync(picked, SAMPLES.jpg)
    writeFileSync(join(root, 'other.jpg'), Buffer.concat([SAMPLES.jpg, Buffer.from('A4CANARY_SWAP')]))
    const realMkdir = fsp.mkdir.bind(fsp)
    vi.spyOn(fsp, 'mkdir').mockImplementation(async (...args: Parameters<typeof fsp.mkdir>) => {
      renameSync(join(root, 'other.jpg'), picked)
      return realMkdir(...args)
    })
    expect(await refusedFor(picked)).toMatch(/changed while it was being copied/)
    expect(landed()).toEqual([])
  })
  it('every real picture and video type still imports, byte for byte', async () => {
    for (const [ext, data] of Object.entries(SAMPLES)) {
      const src = join(pics, `sample.${ext}`)
      writeFileSync(src, data)
      const dest = await importMediaFile(src, roots)
      expect(readFileSync(dest), ext).toEqual(data)
      expect(servablePath(dest, roots.allowedRoots), ext).not.toBeNull()
    }
    expect(landed().some((f) => f.includes('.part-'))).toBe(false)
  })
  it('a symlink to a real picture still imports', async () => {
    writeFileSync(join(root, 'real.png'), SAMPLES.png)
    symlinkSync(join(root, 'real.png'), join(pics, 'link.png'))
    expect(readFileSync(await importMediaFile(join(pics, 'link.png'), roots))).toEqual(SAMPLES.png)
  })
  it('a big video copies whole (streamed from the opened file)', async () => {
    const big = Buffer.concat([SAMPLES.mp4, Buffer.alloc(3 * 1024 * 1024 + 7, 0xab)])
    writeFileSync(join(pics, 'big.mp4'), big)
    expect(readFileSync(await importMediaFile(join(pics, 'big.mp4'), roots)).equals(big)).toBe(true)
  })
  it('the .wfservice migration refuses a spoofed file and reports it, copying the real one', async () => {
    writeFileSync(join(pics, 'movie.mp4'), readFileSync(join(root, 'secret.db')))
    writeFileSync(join(pics, 'cross.jpg'), SAMPLES.jpg)
    const r = await migrateOutsidePaths([join(pics, 'movie.mp4'), join(pics, 'cross.jpg')], roots, (p) => servablePath(p, roots.allowedRoots) !== null)
    expect([...r.relinked.keys()]).toEqual([join(pics, 'cross.jpg')])
    for (const f of landed()) expect(readFileSync(join(roots.mediaDir, f), 'latin1')).not.toMatch(/A4CANARY/)
  })
})
