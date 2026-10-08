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
import { join } from 'path'
import { pipeline } from 'stream/promises'
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
  const tmp = `${destPath}.part-${process.pid}-${Date.now()}`
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
    await fsp.rm(tmp, { force: true }).catch(() => undefined)
    throw err
  }
}

/** Does the file start with a ustar header (a media-carrying .wfservice)? */
export async function isServiceArchive(path: string): Promise<boolean> {
  const fh = await fsp.open(path, 'r')
  try {
    const head = Buffer.alloc(BLOCK)
    const { bytesRead } = await fh.read(head, 0, BLOCK, 0)
    return bytesRead === BLOCK && head.toString('latin1', 257, 262) === 'ustar'
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
      let sum = 0
      for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : h[i]
      if (parseOctal(h, 148, 8) !== sum) throw new Error('the service file is damaged (bad header)')
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
 * The imported-media name for a carried file: its base name plus a hash of the
 * exporting PC's path and its size, so importing the same file again reuses
 * the copy and two different "cross.jpg" never collide.
 */
export function bundledMediaName(originalPath: string, size: number): string {
  const base = baseOf(originalPath)
  const dot = base.lastIndexOf('.')
  const ext = dot > 0 ? base.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, '') : ''
  const stem = (dot > 0 ? base.slice(0, dot) : base).replace(/[^A-Za-z0-9 _.-]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60) || 'media'
  const hash = createHash('sha1').update(`wfservice|${originalPath}|${size}`).digest('hex').slice(0, 10)
  return `${stem}-${hash}${ext}`
}

export interface RestoredMedia {
  /** Exporting PC's path → the copy on this PC. */
  map: Map<string, string>
  /** Copies made by this import (removed again if the import fails). */
  created: string[]
  /** Base names left out because their bytes aren't a picture/video. */
  refused: string[]
}

/**
 * Copy every carried file listed in the manifest into `mediaDir`. Only
 * `media/<name>` entries the manifest names are read; the bytes must be a
 * picture/video matching the extension (QA A4-N1 rule); destination names are
 * generated here, never taken from the archive.
 */
export async function restoreArchiveMedia(
  archivePath: string,
  entries: ReadonlyMap<string, ArchiveEntry>,
  media: readonly BundleMedia[],
  mediaDir: string
): Promise<RestoredMedia> {
  const out: RestoredMedia = { map: new Map(), created: [], refused: [] }
  if (media.length === 0) return out
  await fsp.mkdir(mediaDir, { recursive: true })
  try {
    for (const m of media) {
      if (out.map.has(m.path)) continue
      const entry = MEDIA_ENTRY.test(m.file) ? entries.get(m.file) : undefined
      if (!entry) continue // not in the file → reported as missing
      if (!hasMediaExtension(m.path) || !contentMatchesExtension(m.path, sniffMedia(await readEntryHead(archivePath, entry)))) {
        out.refused.push(baseOf(m.path))
        continue
      }
      const dest = join(mediaDir, bundledMediaName(m.path, entry.size))
      let have = false
      try { have = existsSync(dest) && statSync(dest).size === entry.size } catch { have = false }
      if (!have) {
        await extractEntry(archivePath, entry, dest)
        out.created.push(dest)
      }
      out.map.set(m.path, dest)
    }
  } catch (err) {
    for (const f of out.created) await fsp.rm(f, { force: true }).catch(() => undefined)
    throw err
  }
  return out
}
