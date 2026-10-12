// Ryan's decision (Oct 2026): a .wfservice carries its pictures, backgrounds
// and videos, so a service saved to a USB stick on one PC opens complete on the
// booth PC. Before, the file held only the paths on the PC that made it, so
// every background/image/video arrived missing.
//
// Layout: a plain POSIX (ustar) tar —
//   service.json          the service (same JSON as a media-less .wfservice,
//                         plus a `media` list: original path → entry name)
//   media/0001-<name>.mp4 each file, byte for byte
// Tar because it can be written and read as a stream: a 2 GB video is copied
// through in chunks, never held in memory, and reading an entry is a ranged
// read of the file. Any tar tool (Windows' built-in tar.exe, 7-Zip) can open it.
//
// A service with no media is still saved as plain JSON, which every older
// WorshipFlow can open. Files written before this change (always JSON) keep
// importing as before.
//
// Entry names are ours, never trusted on the way in: the importer only reads
// entries the manifest names in the `media/<file>` form and writes them under
// names it makes itself (no path in the archive ever becomes a path on disk).

import { createHash } from 'crypto'
import { createReadStream, createWriteStream, existsSync, promises as fsp, statSync, type WriteStream } from 'fs'
import { once } from 'events'
import { basename, dirname, join } from 'path'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { storedMediaStem } from '../shared/mediaName'
import { archiveEntryName, type BundleMedia } from '../shared/serviceBundle'
import { contentMatchesExtension, hasMediaExtension, isNetworkPath, sniffMedia } from './mediaImport'

const BLOCK = 512
/** ustar's 11-digit octal size field. */
export const MAX_ENTRY_BYTES = 0o77777777777 // 8 GiB - 1
/** service.json is read into memory; no real service comes near this. */
const MAX_JSON_BYTES = 64 * 1024 * 1024
export const SERVICE_JSON = 'service.json'
export const MEDIA_ENTRY = /^media\/[A-Za-z0-9][A-Za-z0-9 _.-]{0,90}$/

function octal(n: number, width: number): string {
  return n.toString(8).padStart(width - 1, '0') + '\0'
}

/** One ustar header block for a regular file. */
export function tarHeader(name: string, size: number, mtimeMs = Date.now()): Buffer {
  const nameBytes = Buffer.from(name, 'utf8')
  if (nameBytes.length > 100) throw new Error(`archive entry name too long: ${name}`)
  if (size < 0 || size > MAX_ENTRY_BYTES) throw new Error(`${name} is too large for a service file`)
  const h = Buffer.alloc(BLOCK, 0)
  nameBytes.copy(h, 0)
  h.write(octal(0o644, 8), 100, 'latin1')
  h.write(octal(0, 8), 108, 'latin1')
  h.write(octal(0, 8), 116, 'latin1')
  h.write(octal(size, 12), 124, 'latin1')
  h.write(octal(Math.floor(mtimeMs / 1000), 12), 136, 'latin1')
  h.write('        ', 148, 'latin1') // checksum placeholder (8 spaces)
  h.write('0', 156, 'latin1') // regular file
  h.write('ustar\0', 257, 'latin1')
  h.write('00', 263, 'latin1')
  let sum = 0
  for (const b of h) sum += b
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'latin1')
  return h
}

const padFor = (size: number): number => (BLOCK - (size % BLOCK)) % BLOCK

async function write(out: WriteStream, chunk: Buffer): Promise<void> {
  if (!out.write(chunk)) await once(out, 'drain')
}

export interface ArchiveMedia {
  /** File on this PC to copy in. */
  src: string
  /** Entry name inside the archive (`media/…`). */
  entry: string
}

/**
 * Stream `json` + every media file into a tar at `destPath`. Written to a
 * `.part` file and renamed, so a stick pulled mid-write never leaves a
 * truncated .wfservice behind. Throws on any read/write failure (the caller
 * reports it); a file that changes size while being copied is an error too.
 */
export async function writeServiceArchive(destPath: string, json: string, media: readonly ArchiveMedia[]): Promise<void> {
  await removeStaleParts(dirname(destPath))
  const tmp = partName(destPath)
  const out = createWriteStream(tmp, { flags: 'wx' })
  const failed = new Promise<never>((_, reject) => out.once('error', reject))
  failed.catch(() => undefined)
  try {
    const run = async (): Promise<void> => {
      const body = Buffer.from(json, 'utf8')
      await write(out, tarHeader(SERVICE_JSON, body.length))
      await write(out, body)
      await write(out, Buffer.alloc(padFor(body.length)))
      for (const m of media) {
        if (!MEDIA_ENTRY.test(m.entry)) throw new Error(`bad archive entry name: ${m.entry}`)
        const st = await fsp.stat(m.src)
        if (!st.isFile()) throw new Error(`${m.src} is not a file`)
        await write(out, tarHeader(m.entry, st.size, st.mtimeMs))
        let copied = 0
        for await (const chunk of createReadStream(m.src)) {
          copied += (chunk as Buffer).length
          if (copied > st.size) break
          await write(out, chunk as Buffer)
        }
        if (copied !== st.size) throw new Error(`${m.src} changed while it was being saved`)
        await write(out, Buffer.alloc(padFor(st.size)))
      }
      await write(out, Buffer.alloc(BLOCK * 2)) // end-of-archive marker
      out.end()
      await once(out, 'finish')
    }
    await Promise.race([run(), failed])
    await fsp.rename(tmp, destPath)
  } catch (err) {
    out.destroy()
    // QA B12-N7: best effort — a pulled stick can't be cleaned. Say so, so the
    // operator knows a partial file may be on it.
    let left = false
    await fsp.rm(tmp, { force: true }).catch(() => { left = true })
    if (!left) left = existsSync(tmp)
    throw new PartLeftError(err, left ? basename(tmp) : null)
  }
}

/** The write failed; `leftover` names a partial file that couldn't be removed. */
export class PartLeftError extends Error {
  readonly leftover: string | null
  constructor(cause: unknown, leftover: string | null) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'PartLeftError'
    this.leftover = leftover
    if (cause instanceof Error && cause.stack) this.stack = cause.stack
  }
}

const PART_RE = /\.part-\d+-(\d+)$/
const partName = (destPath: string): string => `${destPath}.part-${process.pid}-${Date.now()}`

/**
 * QA B12-N7: a stick pulled mid-export keeps its `<name>.wf….part-<pid>-<ms>`.
 * The next export to that folder removes ours that are over 10 minutes old
 * (never a write in flight). Best effort; never throws.
 */
export async function removeStaleParts(dir: string, now = Date.now(), maxAgeMs = 10 * 60_000): Promise<string[]> {
  const removed: string[] = []
  let names: string[]
  try { names = await fsp.readdir(dir) } catch { return removed }
  for (const n of names) {
    const m = PART_RE.exec(n)
    if (!m || !/\.(wfservice|wfbundle)\.part-/.test(n)) continue
    if (now - Number(m[1]) < maxAgeMs) continue
    try { await fsp.rm(join(dir, n), { force: true }); removed.push(n) } catch { /* best effort */ }
  }
  return removed
}

/** The checksum a ustar header block should carry (its checksum field counted as spaces). */
function headerChecksum(h: Buffer): number {
  let sum = 0
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : h[i]
  return sum
}

/**
 * Is this block a real ustar header? The magic alone isn't enough (QA B12-N7):
 * a plain-JSON service whose bytes 257–261 happen to read "ustar" was refused
 * as a damaged archive. A header also has to carry a valid checksum.
 */
export function isTarHeader(h: Buffer): boolean {
  if (h.length < BLOCK || h.toString('latin1', 257, 262) !== 'ustar') return false
  return parseOctal(h, 148, 8) === headerChecksum(h)
}

/** Does the file start with a ustar header (a media bundle) rather than JSON? */
export async function isServiceArchive(path: string): Promise<boolean> {
  const fh = await fsp.open(path, 'r')
  try {
    const head = Buffer.alloc(BLOCK)
    const { bytesRead } = await fh.read(head, 0, BLOCK, 0)
    return bytesRead === BLOCK && isTarHeader(head)
  } finally {
    await fh.close()
  }
}

export interface ArchiveEntry { offset: number; size: number }

function parseOctal(buf: Buffer, start: number, len: number): number {
  const s = buf.toString('latin1', start, start + len).replace(/\0.*$/s, '').trim()
  if (!/^[0-7]*$/.test(s)) return NaN
  return s ? parseInt(s, 8) : 0
}

/**
 * Read the archive's table of contents and its service.json. Only regular
 * files are listed; anything malformed is an error ("this isn't a WorshipFlow
 * service"), never a partial read.
 */
export async function readServiceArchive(path: string): Promise<{ json: string; entries: Map<string, ArchiveEntry> }> {
  const fh = await fsp.open(path, 'r')
  try {
    const total = (await fh.stat()).size
    const entries = new Map<string, ArchiveEntry>()
    const h = Buffer.alloc(BLOCK)
    let pos = 0
    while (pos + BLOCK <= total) {
      const { bytesRead } = await fh.read(h, 0, BLOCK, pos)
      if (bytesRead < BLOCK) break
      if (h.every((b) => b === 0)) break // end-of-archive
      if (h.toString('latin1', 257, 262) !== 'ustar') throw new Error('not a WorshipFlow service archive')
      if (parseOctal(h, 148, 8) !== headerChecksum(h)) throw new Error('the service file is damaged (bad header)')
      const size = parseOctal(h, 124, 12)
      if (!Number.isFinite(size) || size < 0) throw new Error('the service file is damaged (bad size)')
      const name = h.toString('utf8', 0, 100).replace(/\0.*$/s, '')
      const type = h.toString('latin1', 156, 157)
      const offset = pos + BLOCK
      if (offset + size > total) throw new Error('the service file is cut short (was it copied completely?)')
      if ((type === '0' || type === '\0') && !entries.has(name)) entries.set(name, { offset, size })
      pos = offset + size + padFor(size)
    }
    const meta = entries.get(SERVICE_JSON)
    if (!meta) throw new Error('not a WorshipFlow service archive (no service.json)')
    if (meta.size > MAX_JSON_BYTES) throw new Error('the service description in this file is too large')
    const buf = Buffer.alloc(meta.size)
    await fh.read(buf, 0, meta.size, meta.offset)
    return { json: buf.toString('utf8'), entries }
  } finally {
    await fh.close()
  }
}

/** Read the first bytes of an entry (for content sniffing). */
export async function readEntryHead(path: string, entry: ArchiveEntry, n = 32): Promise<Buffer> {
  const fh = await fsp.open(path, 'r')
  try {
    const buf = Buffer.alloc(Math.min(n, entry.size))
    const { bytesRead } = await fh.read(buf, 0, buf.length, entry.offset)
    return buf.subarray(0, bytesRead)
  } finally {
    await fh.close()
  }
}

/** Stream one entry out to `destPath` (via a temp name + rename). */
export async function extractEntry(path: string, entry: ArchiveEntry, destPath: string): Promise<void> {
  const tmp = `${destPath}.part-${process.pid}-${Date.now()}`
  try {
    if (entry.size === 0) await fsp.writeFile(tmp, Buffer.alloc(0), { flag: 'wx' })
    else await pipeline(createReadStream(path, { start: entry.offset, end: entry.offset + entry.size - 1 }), createWriteStream(tmp, { flags: 'wx' }))
    const st = await fsp.stat(tmp)
    if (st.size !== entry.size) throw new Error('the copy came out the wrong size')
    await fsp.rename(tmp, destPath)
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => undefined)
    throw err
  }
}

// ---- The export/import halves index.ts calls (kept here so they're unit-tested
// without Electron). ----

const baseOf = (p: string): string => p.split(/[\\/]/).pop() ?? p

export interface ExportMediaPlan {
  /** The manifest written into service.json. */
  media: BundleMedia[]
  /** What to stream into the archive. */
  entries: ArchiveMedia[]
  /** Referenced files that can't be carried (gone, not a file, on a network share, too big) — the operator is warned. */
  missing: string[]
}

/** Decide which of the service's media paths go into the file. */
export function planExportMedia(paths: readonly string[]): ExportMediaPlan {
  const plan: ExportMediaPlan = { media: [], entries: [], missing: [] }
  for (const p of paths) {
    // Never probe a \\server path read back from the database (it can hang
    // for a minute on a dead share — same rule as mediaImport's migration).
    if (isNetworkPath(p) || !hasMediaExtension(p)) { plan.missing.push(p); continue }
    let size: number
    try {
      const st = statSync(p)
      if (!st.isFile()) { plan.missing.push(p); continue }
      size = st.size
    } catch {
      plan.missing.push(p)
      continue
    }
    if (size > MAX_ENTRY_BYTES) { plan.missing.push(p); continue }
    const file = archiveEntryName(plan.media.length, p)
    plan.media.push({ path: p, file, size })
    plan.entries.push({ src: p, entry: file })
  }
  return plan
}

/**
 * The imported-media name for a carried file: its original name (without any
 * hash we added on an earlier trip — QA B12 watch item) plus the first 64 bits
 * of the sha256 of its BYTES (QA B12-N1). The same picture arriving again —
 * from the same file, a re-saved file, or another PC — lands on the same name
 * and is reused instead of copied a second time.
 */
export function contentMediaName(originalPath: string, sha256hex: string): string {
  const base = baseOf(originalPath)
  const dot = base.lastIndexOf('.')
  const ext = dot > 0 ? base.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, '') : ''
  return `${storedMediaStem(originalPath)}-${sha256hex.slice(0, 16)}${ext}`
}

/** QA B12-N3: never unpack more than this from one file, whatever it claims. */
export const MAX_EXTRACT_BYTES = 64 * 1024 ** 3
/** QA B12-N3: leave this much free on the drive after unpacking. */
export const FREE_SPACE_MARGIN = 512 * 1024 ** 2

/** Bytes free for this user on the drive holding `dir`, or null if it can't be told. */
export async function freeBytes(dir: string): Promise<number | null> {
  try {
    const st = await fsp.statfs(dir)
    return Number(st.bavail) * Number(st.bsize)
  } catch {
    return null
  }
}

const gib = (n: number): string => `${(n / 1024 ** 3).toFixed(1)} GB`

/** Thrown before anything is unpacked when the file can't (or mustn't) be unpacked. */
export class ExtractRefused extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExtractRefused'
  }
}

/** Stream one entry to a temp file in `dir`, hashing as it goes. */
async function extractHashed(path: string, entry: ArchiveEntry, dir: string): Promise<{ tmp: string; sha256: string }> {
  // Named like every other partial copy so the A3-N6 sweep removes it if we die mid-copy.
  const tmp = join(dir, `incoming-${Math.random().toString(36).slice(2, 8)}.part-${process.pid}-${Date.now()}`)
  const hash = createHash('sha256')
  try {
    if (entry.size === 0) await fsp.writeFile(tmp, Buffer.alloc(0), { flag: 'wx' })
    else
      await pipeline(
        createReadStream(path, { start: entry.offset, end: entry.offset + entry.size - 1 }),
        new Transform({ transform(chunk: Buffer, _enc, cb) { hash.update(chunk); cb(null, chunk) } }),
        createWriteStream(tmp, { flags: 'wx' })
      )
    const st = await fsp.stat(tmp)
    if (st.size !== entry.size) throw new Error('the copy came out the wrong size')
    return { tmp, sha256: hash.digest('hex') }
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => undefined)
    throw err
  }
}

export interface RestoredMedia {
  /** Exporting PC's path → the copy on this PC. */
  map: Map<string, string>
  /** Copies made by this import (removed again if the import fails). */
  created: string[]
  /** Base names left out because their bytes aren't a picture/video (each once). */
  refused: string[]
}

export interface RestoreOptions {
  /** Free-space probe (tests stub it). */
  free?: (dir: string) => Promise<number | null>
  /** Size of the archive file (defaults to a stat of it). */
  archiveBytes?: number
}

/**
 * Copy every carried file listed in the manifest into `mediaDir`. Only
 * `media/<name>` entries the manifest names are read; the bytes must be a
 * picture/video matching the extension (QA A4-N1 rule); destination names are
 * generated here, never taken from the archive.
 *
 * QA B12-N3: each entry is unpacked at most once however many manifest rows
 * point at it; the total is capped by the archive's own size (entries can't
 * overlap into more bytes than the file holds) and MAX_EXTRACT_BYTES; and the
 * free space is checked BEFORE anything is written.
 */
export async function restoreArchiveMedia(
  archivePath: string,
  entries: ReadonlyMap<string, ArchiveEntry>,
  media: readonly BundleMedia[],
  mediaDir: string,
  opts: RestoreOptions = {}
): Promise<RestoredMedia> {
  const out: RestoredMedia = { map: new Map(), created: [], refused: [] }
  if (media.length === 0) return out
  // Plan: which entries to unpack, and which rows point at each.
  const rowsByEntry = new Map<string, { entry: ArchiveEntry; first: string; paths: string[] }>()
  const refused = new Set<string>()
  const seen = new Set<string>()
  for (const m of media) {
    if (seen.has(m.path)) continue
    seen.add(m.path)
    const entry = MEDIA_ENTRY.test(m.file) ? entries.get(m.file) : undefined
    if (!entry) continue // not in the file → reported as missing
    if (!hasMediaExtension(m.path) || !contentMatchesExtension(m.path, sniffMedia(await readEntryHead(archivePath, entry)))) {
      refused.add(baseOf(m.path))
      continue
    }
    const g = rowsByEntry.get(m.file)
    if (g) g.paths.push(m.path)
    else rowsByEntry.set(m.file, { entry, first: m.path, paths: [m.path] })
  }
  out.refused = [...refused]
  if (rowsByEntry.size === 0) return out

  const total = [...rowsByEntry.values()].reduce((n, g) => n + g.entry.size, 0)
  const archiveBytes = opts.archiveBytes ?? (await fsp.stat(archivePath)).size
  if (total > archiveBytes || total > MAX_EXTRACT_BYTES)
    throw new ExtractRefused(`the file lists ${gib(total)} of pictures and videos, more than it ${total > archiveBytes ? `holds (${gib(archiveBytes)})` : `may unpack (${gib(MAX_EXTRACT_BYTES)})`} — it may be damaged`)
  await fsp.mkdir(mediaDir, { recursive: true })
  const free = await (opts.free ?? freeBytes)(mediaDir)
  if (free != null && free < total + FREE_SPACE_MARGIN)
    throw new ExtractRefused(`not enough free space on this computer for its pictures and videos (needs ${gib(total + FREE_SPACE_MARGIN)}, ${gib(free)} free)`)

  try {
    for (const g of rowsByEntry.values()) {
      const { tmp, sha256 } = await extractHashed(archivePath, g.entry, mediaDir)
      const dest = join(mediaDir, contentMediaName(g.first, sha256))
      let have = false
      try { have = existsSync(dest) && statSync(dest).size === g.entry.size } catch { have = false }
      if (have) await fsp.rm(tmp, { force: true }).catch(() => undefined)
      else {
        await fsp.rename(tmp, dest)
        out.created.push(dest)
      }
      for (const p of g.paths) out.map.set(p, dest)
    }
  } catch (err) {
    for (const f of out.created) await fsp.rm(f, { force: true }).catch(() => undefined)
    throw err
  }
  return out
}
