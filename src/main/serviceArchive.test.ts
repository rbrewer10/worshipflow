import { createHash } from 'crypto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, openSync, ftruncateSync, writeSync, closeSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  writeServiceArchive, readServiceArchive, isServiceArchive, extractEntry, tarHeader,
  planExportMedia, restoreArchiveMedia, contentMediaName, ExtractRefused, MAX_EXTRACT_BYTES, MEDIA_ENTRY, SERVICE_JSON,
  isTarHeader, removeStaleParts, PartLeftError
} from './serviceArchive'

// Ryan's decision (Oct 2026): a .wfservice carries every picture, background
// and video; big videos are streamed, never held in memory.

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 1, 2, 3, 4])
const MP4_HEAD = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(12)])

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'wf-arch-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('service archive (tar) round trip', () => {
  it('writes service.json first and every file byte for byte; reads them back', async () => {
    const cross = join(dir, 'cross.png'); writeFileSync(cross, PNG)
    const loop = join(dir, 'loop.mp4'); writeFileSync(loop, Buffer.concat([MP4_HEAD, Buffer.alloc(1000, 7)]))
    const json = JSON.stringify({ version: 3, name: 'Sunday', items: [] })
    const out = join(dir, 'Sunday.wfservice')
    await writeServiceArchive(out, json, [{ src: cross, entry: 'media/0001-cross.png' }, { src: loop, entry: 'media/0002-loop.mp4' }])
    expect(await isServiceArchive(out)).toBe(true)
    expect(readdirSync(dir).filter((f) => f.includes('.part'))).toEqual([])
    const { json: back, entries } = await readServiceArchive(out)
    expect(back).toBe(json)
    expect([...entries.keys()]).toEqual([SERVICE_JSON, 'media/0001-cross.png', 'media/0002-loop.mp4'])
    // 512-byte aligned, ends with two zero blocks
    expect(statSync(out).size % 512).toBe(0)
    const dest = join(dir, 'x.mp4')
    await extractEntry(out, entries.get('media/0002-loop.mp4')!, dest)
    expect(readFileSync(dest).equals(readFileSync(loop))).toBe(true)
  })
  it('headers are standard ustar (checksum, size, magic) so any tar tool opens the file', () => {
    const h = tarHeader('media/0001-cross.png', 1234, 0)
    expect(h.length).toBe(512)
    expect(h.toString('latin1', 257, 263)).toBe('ustar\0')
    expect(parseInt(h.toString('latin1', 124, 135), 8)).toBe(1234)
    let sum = 0
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i]
    expect(parseInt(h.toString('latin1', 148, 154), 8)).toBe(sum)
    expect(() => tarHeader('x'.repeat(101), 1)).toThrow(/too long/)
  })
  it('a big video is streamed — memory does not grow with the file', async () => {
    const big = join(dir, 'big.mp4')
    const size = 192 * 1024 * 1024
    const fd = openSync(big, 'w'); writeSync(fd, MP4_HEAD); ftruncateSync(fd, size); closeSync(fd) // sparse
    const out = join(dir, 'big.wfservice')
    const before = process.memoryUsage().rss
    let peak = before
    const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss) }, 5)
    try {
      await writeServiceArchive(out, '{"version":3}', [{ src: big, entry: 'media/0001-big.mp4' }])
      const { entries } = await readServiceArchive(out)
      await extractEntry(out, entries.get('media/0001-big.mp4')!, join(dir, 'big-copy.mp4'))
    } finally { clearInterval(timer) }
    peak = Math.max(peak, process.memoryUsage().rss)
    expect(statSync(join(dir, 'big-copy.mp4')).size).toBe(size)
    expect(peak - before).toBeLessThan(96 * 1024 * 1024)
  }, 120_000)
  it('a failed write (a file vanished mid-export) leaves neither the .wfservice nor a .part behind', async () => {
    const out = join(dir, 'gone.wfservice')
    await expect(writeServiceArchive(out, '{}', [{ src: join(dir, 'nope.png'), entry: 'media/0001-nope.png' }])).rejects.toThrow()
    expect(existsSync(out)).toBe(false)
    expect(readdirSync(dir)).toEqual([])
  })
  it('plain JSON (every older .wfservice) is not an archive; a cut-short or damaged archive is an error, not a partial import', async () => {
    const old = join(dir, 'old.wfservice'); writeFileSync(old, JSON.stringify({ version: 2, name: 'x', items: [] }) + ' '.repeat(600))
    expect(await isServiceArchive(old)).toBe(false)
    const p = join(dir, 'a.png'); writeFileSync(p, PNG)
    const out = join(dir, 'ok.wfservice')
    await writeServiceArchive(out, '{"version":3}', [{ src: p, entry: 'media/0001-a.png' }])
    const full = readFileSync(out)
    const cut = join(dir, 'cut.wfservice'); writeFileSync(cut, full.subarray(0, 512 + 512 + 512 + 10))
    await expect(readServiceArchive(cut)).rejects.toThrow(/cut short/)
    const bad = Buffer.from(full); bad[0] = 'X'.charCodeAt(0)
    const badPath = join(dir, 'bad.wfservice'); writeFileSync(badPath, bad)
    await expect(readServiceArchive(badPath)).rejects.toThrow(/damaged/)
  })
})

describe('export plan', () => {
  it('carries existing pictures/videos; lists gone files, network paths and non-media as not carried', () => {
    const a = join(dir, 'Cross Photo!.png'); writeFileSync(a, PNG)
    const plan = planExportMedia([a, join(dir, 'gone.mp4'), '\\\\server\\share\\x.jpg', join(dir, 'notes.txt'), dir + '.jpg'])
    expect(plan.media).toEqual([{ path: a, file: 'media/0001-Cross Photo-.png', size: PNG.length }])
    expect(plan.entries).toEqual([{ src: a, entry: 'media/0001-Cross Photo-.png' }])
    expect(plan.missing).toHaveLength(4)
    for (const m of plan.media) expect(m.file).toMatch(MEDIA_ENTRY)
  })
})

describe('import: restoring carried media', () => {
  async function archiveWith(files: Array<{ entry: string; bytes: Buffer }>): Promise<string> {
    const srcs = files.map((f, i) => { const p = join(dir, `src${i}`); writeFileSync(p, f.bytes); return { src: p, entry: f.entry } })
    const out = join(dir, 'in.wfservice')
    await writeServiceArchive(out, '{"version":3}', srcs)
    return out
  }
  it('copies each listed file into imported-media under a generated name and maps the old path to it', async () => {
    const arch = await archiveWith([{ entry: 'media/0001-cross.png', bytes: PNG }, { entry: 'media/0002-loop.mp4', bytes: MP4_HEAD }])
    const { entries } = await readServiceArchive(arch)
    const mediaDir = join(dir, 'imported-media')
    const media = [
      { path: 'C:\\Users\\Pastor\\Pictures\\cross.png', file: 'media/0001-cross.png', size: PNG.length },
      { path: '/home/ryan/Videos/loop.mp4', file: 'media/0002-loop.mp4', size: MP4_HEAD.length }
    ]
    const r = await restoreArchiveMedia(arch, entries, media, mediaDir)
    expect(r.refused).toEqual([])
    expect(r.created).toHaveLength(2)
    const cross = r.map.get(media[0].path)!
    expect(cross.startsWith(mediaDir)).toBe(true)
    expect(cross.endsWith(contentMediaName(media[0].path, createHash('sha256').update(PNG).digest('hex')))).toBe(true)
    expect(readFileSync(cross).equals(PNG)).toBe(true)
    // importing the same file again reuses the copies
    const again = await restoreArchiveMedia(arch, entries, media, mediaDir)
    expect(again.created).toEqual([])
    expect(again.map.get(media[0].path)).toBe(cross)
  })
  it('refuses bytes that are not a picture/video, ignores unlisted or path-like entry names, never writes outside imported-media', async () => {
    const arch = await archiveWith([{ entry: 'media/0001-evil.png', bytes: Buffer.from('#!/bin/sh\necho hi\n') }, { entry: 'media/0002-ok.png', bytes: PNG }])
    const { entries } = await readServiceArchive(arch)
    const mediaDir = join(dir, 'imported-media')
    const r = await restoreArchiveMedia(arch, entries, [
      { path: 'C:\\x\\evil.png', file: 'media/0001-evil.png', size: 18 },
      { path: 'C:\\x\\..\\..\\ok.png', file: 'media/../0002-ok.png', size: PNG.length },
      { path: 'C:\\x\\db.sqlite', file: 'media/0002-ok.png', size: PNG.length }
    ], mediaDir)
    expect(r.refused).toEqual(['evil.png', 'db.sqlite'])
    expect(r.map.size).toBe(0)
    expect(existsSync(mediaDir) ? readdirSync(mediaDir) : []).toEqual([])
  })
  it('generated names are filesystem-safe, keyed by content, and never compound hashes', () => {
    const h = 'ab'.repeat(32)
    expect(contentMediaName('C:\\a\\Cross: Easter?.JPG', h)).toBe('Cross- Easter--abababababababab.jpg')
    expect(contentMediaName('C:\\a\\cross.jpg', h)).toBe(contentMediaName('D:\\b\\cross.jpg', h))
    expect(contentMediaName('C:\\a\\cross.jpg', h)).not.toBe(contentMediaName('C:\\a\\cross.jpg', 'cd'.repeat(32)))
    // a copy that already went round once (and an older double-hashed one) gets ONE hash
    expect(contentMediaName('C:\\WF\\imported-media\\cross-0123456789abcdef.png', h)).toBe('cross-abababababababab.png')
    expect(contentMediaName('/x/imported-media/cross-0123456789-abcdef0123.png', h)).toBe('cross-abababababababab.png')
  })
})

describe('QA B12-N7: archive detection and partial files', () => {
  it('plain JSON with "ustar" at byte 257 is still JSON (the header checksum must be valid too)', async () => {
    const json = JSON.stringify({ version: 2, name: 'x'.repeat(240), note: 'ustar is a word in this file', items: [] })
    const pad = 257 - json.indexOf('ustar')
    const text = JSON.stringify({ version: 2, name: 'x'.repeat(240 + pad), note: 'ustar is a word in this file', items: [] })
    expect(Buffer.from(text).toString('latin1', 257, 262)).toBe('ustar')
    const f = join(dir, 'odd.wfservice'); writeFileSync(f, text)
    expect(await isServiceArchive(f)).toBe(false)
    // a real header still counts, and a broken checksum doesn't
    const h = tarHeader('service.json', 2, 0)
    expect(isTarHeader(h)).toBe(true)
    const bad = Buffer.from(h); bad[0] ^= 1
    expect(isTarHeader(bad)).toBe(false)
  })
  it('stale partial files of ours (over 10 minutes old) are removed on the next save to that folder; fresh ones and other files stay', async () => {
    const now = 1_800_000_000_000
    const old = `Big.wfbundle.part-123-${now - 11 * 60_000}`
    const oldSvc = `Big.wfservice.part-9-${now - 60 * 60_000}`
    const fresh = `Big.wfbundle.part-123-${now - 60_000}`
    for (const n of [old, oldSvc, fresh, 'notes.txt.part-1-1', 'Sunday.wfservice']) writeFileSync(join(dir, n), 'x')
    expect((await removeStaleParts(dir, now)).sort()).toEqual([old, oldSvc].sort())
    expect(readdirSync(dir).sort()).toEqual([fresh, 'Sunday.wfservice', 'notes.txt.part-1-1'].sort())
  })
  it('a failed write removes its partial file and says nothing was left; the error keeps the cause', async () => {
    const out = join(dir, 'S.wfbundle')
    const err = await writeServiceArchive(out, '{}', [{ src: join(dir, 'gone.png'), entry: 'media/0001-gone.png' }]).catch((e) => e)
    expect(err).toBeInstanceOf(PartLeftError)
    expect((err as PartLeftError).leftover).toBeNull()
    expect(String((err as Error).message)).toMatch(/ENOENT/)
    expect(readdirSync(dir)).toEqual([])
  })
})

describe('QA B12-N1/N3: content-hash dedupe, one copy per entry, size and space checks', () => {
  async function archiveWith(files: Array<{ entry: string; bytes: Buffer }>): Promise<string> {
    const srcs = files.map((f, i) => { const p = join(dir, `n1src${i}`); writeFileSync(p, f.bytes); return { src: p, entry: f.entry } })
    const out = join(dir, `n1-${Math.random().toString(36).slice(2)}.wfbundle`)
    await writeServiceArchive(out, '{"version":3}', srcs)
    return out
  }
  it('the same bytes under a different path/name (or from a re-saved file) reuse the existing copy', async () => {
    const mediaDir = join(dir, 'imported-media')
    const a1 = await archiveWith([{ entry: 'media/0001-cross.png', bytes: PNG }])
    const r1 = await restoreArchiveMedia(a1, (await readServiceArchive(a1)).entries, [{ path: 'C:\\A\\cross.png', file: 'media/0001-cross.png', size: PNG.length }], mediaDir)
    expect(r1.created).toHaveLength(1)
    // another PC, another folder, same picture, same size → same copy
    const a2 = await archiveWith([{ entry: 'media/0001-cross.png', bytes: PNG }])
    const r2 = await restoreArchiveMedia(a2, (await readServiceArchive(a2)).entries, [{ path: 'E:\\Stick\\Pics\\cross.png', file: 'media/0001-cross.png', size: PNG.length }], mediaDir)
    expect(r2.created).toEqual([])
    expect(r2.map.get('E:\\Stick\\Pics\\cross.png')).toBe(r1.created[0])
    // same path and size, DIFFERENT bytes → a new copy, never the stale one
    const PNG2 = Buffer.concat([PNG.subarray(0, PNG.length - 1), Buffer.from([PNG[PNG.length - 1] ^ 1])])
    const a3 = await archiveWith([{ entry: 'media/0001-cross.png', bytes: PNG2 }])
    const r3 = await restoreArchiveMedia(a3, (await readServiceArchive(a3)).entries, [{ path: 'C:\\A\\cross.png', file: 'media/0001-cross.png', size: PNG2.length }], mediaDir)
    expect(r3.created).toHaveLength(1)
    expect(r3.created[0]).not.toBe(r1.created[0])
    expect(readFileSync(r3.created[0]).equals(PNG2)).toBe(true)
    expect(readdirSync(mediaDir).filter((n) => n.includes('.part-'))).toEqual([])
  })
  it('many manifest rows pointing at one entry copy it once and all point at that copy', async () => {
    const mediaDir = join(dir, 'imported-media')
    const arch = await archiveWith([{ entry: 'media/0001-loop.mp4', bytes: MP4_HEAD }])
    const rows = Array.from({ length: 50 }, (_, i) => ({ path: `C:\\v\\loop${i}.mp4`, file: 'media/0001-loop.mp4', size: MP4_HEAD.length }))
    const r = await restoreArchiveMedia(arch, (await readServiceArchive(arch)).entries, rows, mediaDir)
    expect(r.created).toHaveLength(1)
    expect(new Set(r.map.values())).toEqual(new Set(r.created))
    expect(r.map.size).toBe(50)
    expect(readdirSync(mediaDir)).toHaveLength(1)
  })
  it('refuses to unpack more than the file holds, more than the cap, or more than the free space — before writing anything', async () => {
    const mediaDir = join(dir, 'imported-media')
    const arch = await archiveWith([{ entry: 'media/0001-loop.mp4', bytes: MP4_HEAD }])
    const { entries } = await readServiceArchive(arch)
    const row = [{ path: 'C:\\v\\loop.mp4', file: 'media/0001-loop.mp4', size: MP4_HEAD.length }]
    await expect(restoreArchiveMedia(arch, entries, row, mediaDir, { archiveBytes: MP4_HEAD.length - 1 })).rejects.toThrow(/more than it holds/)
    const huge = new Map([['media/0001-loop.mp4', { ...entries.get('media/0001-loop.mp4')!, size: MAX_EXTRACT_BYTES + 1 }]])
    await expect(restoreArchiveMedia(arch, huge, row, mediaDir, { archiveBytes: MAX_EXTRACT_BYTES * 2 })).rejects.toThrow(/may unpack/)
    await expect(restoreArchiveMedia(arch, entries, row, mediaDir, { free: async () => 1024 })).rejects.toBeInstanceOf(ExtractRefused)
    await expect(restoreArchiveMedia(arch, entries, row, mediaDir, { free: async () => 1024 })).rejects.toThrow(/not enough free space/)
    expect(existsSync(mediaDir) ? readdirSync(mediaDir) : []).toEqual([])
  })
  it('a refused file is listed once however many rows name it', async () => {
    const arch = await archiveWith([{ entry: 'media/0001-evil.png', bytes: Buffer.from('#!/bin/sh\necho hi\n') }])
    const rows = [1, 2, 3].map((i) => ({ path: `C:\\x${i}\\evil.png`, file: 'media/0001-evil.png', size: 18 }))
    const r = await restoreArchiveMedia(arch, (await readServiceArchive(arch)).entries, rows, join(dir, 'imported-media'))
    expect(r.refused).toEqual(['evil.png'])
  })
})
