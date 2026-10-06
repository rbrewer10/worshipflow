// QA B2-N1: pictures and videos picked with a file dialog used to be stored as
// the raw path the dialog returned (e.g. C:\Users\ryan\Pictures\cross.jpg or a
// USB stick). The projector loads media through the wf-asset:// protocol, and
// validateMediaPath() only serves files inside WorshipFlow's own data folders
// (backgrounds, imported-media, generated) — deliberately, because the same
// check guards the LAN tablet /file route. So an "outside" file went up as a
// silent blank projector with a 403 in the log.
//
// The fix mirrors what PPTX import already does: copy the picked file into
// <userData>/imported-media and store THAT path. This module holds the
// filesystem-light logic so it can be unit-tested without Electron; index.ts
// wires it to dialogs, the database and the startup migration.

import { createHash } from 'crypto'
import { promises as fsp, existsSync, statSync, realpathSync } from 'fs'
import { basename, extname, join, relative, isAbsolute, resolve } from 'path'

export const MEDIA_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']

/** `theme:<id>` motion themes and `icon:<key>` built-in icons are not files. */
export function isRealMediaPath(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !value.startsWith('theme:') && !value.startsWith('icon:')
}

/** Is `p` inside one of `roots`? Purely lexical (callers resolve symlinks first if they care). */
export function isInsideRoots(p: string, roots: string[]): boolean {
  const abs = resolve(p)
  for (const root of roots) {
    const rel = relative(resolve(root), abs)
    // On Windows a different drive (or UNC share) gives an absolute "relative"
    // path rather than a ".."-prefixed one — that is outside too.
    if (rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)) return true
  }
  return false
}

/**
 * Deterministic file name for an imported copy: the original base name (made
 * filesystem-safe) plus a short hash of where it came from, its size and its
 * modification time. Picking the same file twice reuses one copy; two
 * different "cross.jpg" files from different folders don't collide.
 */
export function importedMediaName(srcPath: string, size: number, mtimeMs: number): string {
  const ext = extname(srcPath).toLowerCase()
  const stem = basename(srcPath, extname(srcPath))
    .replace(/[^A-Za-z0-9 _.-]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || 'media'
  const hash = createHash('sha1').update(`${resolve(srcPath)}|${size}|${Math.round(mtimeMs)}`).digest('hex').slice(0, 10)
  return `${stem}-${hash}${ext}`
}

export interface MediaRoots {
  /** <userData>/imported-media — where copies go. */
  mediaDir: string
  /** Every folder the projector is allowed to load from (imported-media included). */
  allowedRoots: string[]
}

function realOrResolved(p: string): string {
  try { return realpathSync(p) } catch { return resolve(p) }
}

/**
 * Make `srcPath` servable: if it's already inside an allowed root, return it
 * unchanged; otherwise copy it into `mediaDir` (async, so a big video doesn't
 * freeze the operator window) and return the copy's path. Throws if the
 * source can't be read or the copy fails — callers turn that into a message.
 */
export async function importMediaFile(srcPath: string, roots: MediaRoots): Promise<string> {
  const real = realOrResolved(srcPath)
  if (isInsideRoots(real, roots.allowedRoots.map(realOrResolved))) return srcPath
  const st = statSync(real)
  if (!st.isFile()) throw new Error(`${basename(srcPath)} is not a file`)
  await fsp.mkdir(roots.mediaDir, { recursive: true })
  const dest = join(roots.mediaDir, importedMediaName(real, st.size, st.mtimeMs))
  if (existsSync(dest)) {
    try {
      if (statSync(dest).size === st.size) return dest // same file picked again
    } catch { /* fall through and re-copy */ }
  }
  // Copy to a temp name and rename, so a copy cut short (USB pulled, disk
  // full) never leaves a truncated file that a later pick would "reuse".
  const tmp = `${dest}.part-${process.pid}-${Date.now()}`
  try {
    await fsp.copyFile(real, tmp)
    await fsp.rename(tmp, dest)
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => undefined)
    throw err
  }
  return dest
}

export type MediaProblem = 'missing' | 'outside'

/**
 * Why the projector can't show a stored media path, or null if it can.
 * `isServable` is validateMediaPath (allowed roots + the configured logo files).
 */
export function mediaProblemFor(p: unknown, isServable: (p: string) => boolean): MediaProblem | null {
  if (!isRealMediaPath(p)) return null
  if (isServable(p)) return null
  return existsSync(p) ? 'outside' : 'missing'
}

/**
 * Startup/after-import migration: copy every stored media path that points
 * outside the allowed folders (and still exists) into imported-media. Returns
 * old → new for the ones that copied; failures are reported, never thrown.
 */
export async function migrateOutsidePaths(
  paths: Iterable<string>,
  roots: MediaRoots,
  isServable: (p: string) => boolean
): Promise<{ relinked: Map<string, string>; failed: Array<{ path: string; error: string }>; missing: string[] }> {
  const relinked = new Map<string, string>()
  const failed: Array<{ path: string; error: string }> = []
  const missing: string[] = []
  for (const p of new Set(paths)) {
    const problem = mediaProblemFor(p, isServable)
    if (problem === null) continue
    if (problem === 'missing') { missing.push(p); continue }
    try {
      const dest = await importMediaFile(p, roots)
      if (dest !== p) relinked.set(p, dest)
    } catch (err) {
      failed.push({ path: p, error: (err as Error)?.message ?? String(err) })
    }
  }
  return { relinked, failed, missing }
}
