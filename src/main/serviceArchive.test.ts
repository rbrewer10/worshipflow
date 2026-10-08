import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, openSync, ftruncateSync, writeSync, closeSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  writeServiceArchive, readServiceArchive, isServiceArchive, extractEntry, tarHeader,
  planExportMedia, restoreArchiveMedia, bundledMediaName, MEDIA_ENTRY, SERVICE_JSON
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
    expect(cross.endsWith(bundledMediaName(media[0].path, PNG.length))).toBe(true)
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
    expect(readdirSync(mediaDir)).toEqual([])
  })
  it('generated names are filesystem-safe and differ for different source paths', () => {
    expect(bundledMediaName('C:\\a\\Cross: Easter?.JPG', 10)).toMatch(/^Cross- Easter--[0-9a-f]{10}\.jpg$/)
    expect(bundledMediaName('C:\\a\\cross.jpg', 10)).not.toBe(bundledMediaName('C:\\b\\cross.jpg', 10))
  })
})
