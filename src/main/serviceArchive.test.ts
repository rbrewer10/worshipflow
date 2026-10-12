import { createHash } from 'crypto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { watch, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, openSync, ftruncateSync, writeSync, closeSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  writeServiceArchive, readServiceArchive, isServiceArchive, extractEntry, tarHeader,
  planExportMedia, restoreArchiveMedia, contentMediaName, ExtractRefused, MAX_EXTRACT_BYTES, MEDIA_ENTRY, SERVICE_JSON,
  isTarHeader, removeStaleParts, PartLeftError, writePlainServiceFile, classifyServiceFile, MAX_PLAIN_SERVICE_BYTES
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
    expect(plan.skipped.map((x) => x.reason)).toEqual(['missing', 'network', 'notMedia', 'missing'])
    for (const m of plan.media) expect(m.file).toMatch(MEDIA_ENTRY)
  })
  it('QA B12-N6: names the real reason, judges by content, lists each path once', () => {
    const fake = join(dir, 'fake.png'); writeFileSync(fake, 'just some text, not a picture')
    const real = join(dir, 'real.png'); writeFileSync(real, PNG)
    const unc = '\\\\booth\\media\\loop.mp4'
    const plan = planExportMedia([fake, real, unc, real, unc, join(dir, 'gone.jpg')])
    expect(plan.entries.map((e) => e.src)).toEqual([real])
    expect(plan.skipped).toEqual([{ path: fake, reason: 'notMedia' }, { path: unc, reason: 'network' }, { path: join(dir, 'gone.jpg'), reason: 'missing' }])
  })
  it.skipIf(process.platform === 'win32')('QA B12-N6: a file over 8 GiB is "too big", not "not found"', () => {
    const big = join(dir, 'huge.mp4')
    const fd = openSync(big, 'w'); writeSync(fd, MP4_HEAD); ftruncateSync(fd, 8 * 1024 ** 3 + 10); closeSync(fd) // sparse
    expect(planExportMedia([big]).skipped).toEqual([{ path: big, reason: 'tooBig' }])
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
  it('QA B13-N8: stale partials are swept whatever the case of the extension (.WFBUNDLE / .WfService)', async () => {
    const now = 1_800_000_000_000
    const up = `BIG.WFBUNDLE.part-1-${now - 11 * 60_000}`
    const mixed = `Sun.WfService.part-2-${now - 11 * 60_000}`
    const freshUp = `BIG.WFBUNDLE.part-1-${now - 1000}`
    for (const n of [up, mixed, freshUp, 'clip.MP4.part-1-1']) writeFileSync(join(dir, n), 'x')
    expect((await removeStaleParts(dir, now)).sort()).toEqual([up, mixed].sort())
    expect(readdirSync(dir).sort()).toEqual([freshUp, 'clip.MP4.part-1-1'].sort())
  })
  it('QA B13-N8: a drive that vanishes mid-save (stick pulled) names the partial left on it', async () => {
    const stick = join(dir, 'stick'); mkdirSync(stick)
    const src = join(dir, 'big.png'); writeFileSync(src, Buffer.alloc(32 << 20, 7))
    // "pull the stick" the moment the partial file appears on it
    const w = watch(stick, () => { w.close(); rmSync(stick, { recursive: true, force: true }) })
    const err = await writeServiceArchive(join(stick, 'S.wfbundle'), '{}', [{ src, entry: 'media/0001-big.png' }]).catch((e) => e)
    w.close()
    expect(err).toBeInstanceOf(PartLeftError)
    expect(existsSync(stick)).toBe(false)
    expect((err as PartLeftError).leftover).toMatch(/^S\.wfbundle\.part-\d+-\d+$/)
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

describe('QA B12-N2: plain .wfservice writer', () => {
  it('writes JSON via a temp name and leaves no partial behind on failure', async () => {
    const out = join(dir, 'plain.wfservice')
    await writePlainServiceFile(out, '{"version":2,"items":[]}')
    expect(readFileSync(out, 'utf8')).toBe('{"version":2,"items":[]}')
    expect(await isServiceArchive(out)).toBe(false)
    const bad = join(dir, 'no-such-dir', 'x.wfservice')
    const err = await writePlainServiceFile(bad, '{}').catch((e) => e)
    expect(err).toBeInstanceOf(PartLeftError)
    expect(err.leftover).toBeNull()
    expect(readdirSync(dir).filter((n) => n.includes('.part-'))).toEqual([])
  })
})

describe('QA B13-N1: a big or damaged file is never read whole', () => {
  const sparse = (name: string, head: Buffer, size: number): string => {
    const p = join(dir, name)
    const fd = openSync(p, 'w'); writeSync(fd, head); ftruncateSync(fd, size); closeSync(fd)
    return p
  }
  it('a bundle whose first header checksum is damaged says "damaged (bad header)" — by magic or by .wfbundle', async () => {
    const png = join(dir, 'a.png'); writeFileSync(png, PNG)
    const good = join(dir, 'good.wfbundle')
    await writeServiceArchive(good, '{"version":3}', [{ src: png, entry: 'media/0001-a.png' }])
    expect(await classifyServiceFile(good)).toEqual({ kind: 'archive' })
    const bad = Buffer.from(readFileSync(good)); bad[0] ^= 0x20 // name byte: checksum no longer matches
    for (const name of ['bad.wfbundle', 'bad.wfservice']) {
      const p = sparse(name, bad, MAX_PLAIN_SERVICE_BYTES + 4096) // big, like the 1.6 GB stick copy
      const k = await classifyServiceFile(p)
      expect(k.kind).toBe('refused')
      expect((k as { error: string }).error).toMatch(/damaged \(bad header\)/)
    }
    // a .wfbundle without even the magic (zeroed start of a half-copied file)
    const zero = sparse('zero.wfbundle', Buffer.alloc(512), 2048)
    expect((await classifyServiceFile(zero) as { error: string }).error).toMatch(/damaged \(bad header\)/)
  })
  it('anything else over 64 MB is refused without reading it; small JSON (any extension) is JSON', async () => {
    const vid = sparse('sermon.wfservice', MP4_HEAD, MAX_PLAIN_SERVICE_BYTES + 1)
    const k = await classifyServiceFile(vid)
    expect(k.kind).toBe('refused')
    expect((k as { error: string }).error).toMatch(/isn't a WorshipFlow service file \(64 MB/)
    const j = join(dir, 'renamed.wfbundle'); writeFileSync(j, '\uFEFF  {"version":2,"items":[]}')
    expect(await classifyServiceFile(j)).toEqual({ kind: 'json' })
    const old = join(dir, 'old.wfservice'); writeFileSync(old, '{"version":2,"items":[]}')
    expect(await classifyServiceFile(old)).toEqual({ kind: 'json' })
  })
})
