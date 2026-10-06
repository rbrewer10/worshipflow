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
import { basename, extname, join, relative, isAbsolute, resolve, sep } from 'path'

export const MEDIA_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']
/**
 * What the projector (wf-asset://) and the LAN /file route will serve at all
 * (QA A3-N1). Pictures and videos only — never a database, key, JSON, text…
 * SVG is left out on purpose: opened directly it can run script.
 */
export const SERVABLE_EXTENSIONS = [...MEDIA_EXTENSIONS, 'avif']

/** Lower-case extension without the dot ("" if none). */
function extOf(p: string): string {
  return extname(p).slice(1).toLowerCase()
}

export function hasMediaExtension(p: string, list: readonly string[] = MEDIA_EXTENSIONS): boolean {
  return list.includes(extOf(p))
}

/**
 * A UNC / network path (\\server\share\x.jpg, //server/share/x.jpg). Merely
 * stat-ing one makes Windows contact that server — which can leak the booth
 * account's NTLM hash to whoever wrote the path, and blocks for the SMB
 * timeout if it's offline (QA A3-N1, Windows note). Stored paths that look
 * like this are never probed.
 */
export function isNetworkPath(p: string): boolean {
  return /^(?:\\\\|\/\/)/.test(p)
}

/** Any folder on the way that starts with "." (.ssh, .config, .aws…). */
function inHiddenFolder(p: string): boolean {
  const parts = resolve(p).split(/[\\/]+/).slice(0, -1)
  return parts.some((seg) => seg.startsWith('.') && seg !== '.' && seg !== '..')
}

/** Thrown when a path may not be copied into imported-media (QA A3-N1). */
export class MediaImportRefused extends Error {
  constructor(public readonly path: string, reason: string) {
    super(`${basename(path) || path} ${reason}`)
    this.name = 'MediaImportRefused'
  }
}

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
  /**
   * <userData>. Nothing else in it (the database, recovery.json, backups,
   * secrets…) may ever be copied into imported-media (QA A3-N1).
   */
  userDataDir?: string
}

export interface ImportOptions {
  /**
   * An explicit file-dialog pick may come from a network share (the operator
   * chose it). Paths read back from the database or a .wfservice may not —
   * they're never probed (see isNetworkPath).
   */
  allowNetwork?: boolean
}

/**
 * Why `srcPath` may not be copied into imported-media, or null if it may.
 * Checks that need no filesystem access come first, so a crafted path is
 * refused before anything touches it. `real` is the resolved symlink target.
 */
export function refuseImportReason(srcPath: string, real: string | null, roots: MediaRoots, opts: ImportOptions = {}): string | null {
  if (!isAbsolute(srcPath) && !isNetworkPath(srcPath)) return "isn't a full file path"
  if (isNetworkPath(srcPath) && !opts.allowNetwork) return 'is on a network share'
  if (!hasMediaExtension(srcPath)) return "isn't a picture or video"
  if (real == null) return null
  if (real !== srcPath && !hasMediaExtension(real)) return "isn't a picture or video"
  if (inHiddenFolder(real)) return 'is in a hidden folder'
  if (roots.userDataDir) {
    const ud = realOrResolved(roots.userDataDir)
    if (isInsideRoots(real, [ud]) && !isInsideRoots(real, [realOrResolved(roots.mediaDir)])) {
      return "is inside WorshipFlow's own data folder"
    }
  }
  return null
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
export async function importMediaFile(srcPath: string, roots: MediaRoots, opts: ImportOptions = { allowNetwork: true }): Promise<string> {
  // QA A3-N1: a crafted .wfservice could point at ~/.ssh/id_rsa, the database
  // or a relative path, and migration copied it into the LAN-served folder.
  const early = refuseImportReason(srcPath, null, roots, opts)
  if (early) throw new MediaImportRefused(srcPath, early)
  const real = realOrResolved(srcPath)
  if (isInsideRoots(real, roots.allowedRoots.map(realOrResolved)) && hasMediaExtension(real, SERVABLE_EXTENSIONS)) return srcPath
  const why = refuseImportReason(srcPath, real, roots, opts)
  if (why) throw new MediaImportRefused(srcPath, why)
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

/**
 * The gate for wf-asset:// (projector, previews) and the unauthenticated LAN
 * /file route: the real, existing path to serve, or null.
 *  - pictures/videos only, by the requested AND the real (symlink-resolved)
 *    extension (QA A3-N1 — never a database, key or JSON file);
 *  - a full path; a network path only when it is exactly a configured logo
 *    (never stat an arbitrary \\\\server path a LAN page sent us);
 *  - inside one of `allowedRoots`, or exactly one of the configured logo
 *    files (the operator picked those in Settings, wherever they live).
 */
export function servablePath(requestedPath: string, allowedRoots: string[], configured: Array<string | null | undefined> = []): string | null {
  try {
    if (typeof requestedPath !== 'string' || !requestedPath) return null
    if (!hasMediaExtension(requestedPath, SERVABLE_EXTENSIONS)) return null
    const isConfigured = configured.some((c) => c && c === requestedPath)
    if (isNetworkPath(requestedPath) && !isConfigured) return null
    if (!isAbsolute(requestedPath) && !isNetworkPath(requestedPath)) return null
    const realPath = realpathSync(resolve(requestedPath))
    if (!hasMediaExtension(realPath, SERVABLE_EXTENSIONS)) return null
    for (const c of configured) {
      if (!c || (isNetworkPath(c) && c !== requestedPath)) continue
      try {
        if (realpathSync(resolve(c)) === realPath) return realPath
      } catch { /* configured file missing — fall through */ }
    }
    for (const root of allowedRoots) {
      let realRoot = root
      try { realRoot = realpathSync(root) } catch { /* not created yet */ }
      const rel = relative(realRoot, realPath)
      // On Windows a different drive (or UNC share) gives an absolute
      // "relative" path rather than a ".."-prefixed one — outside too.
      if (rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && statSync(realPath).isFile()) return realPath
    }
    return null
  } catch {
    return null
  }
}

export type MediaProblem = 'missing' | 'outside'

/**
 * Why the projector can't show a stored media path, or null if it can.
 * `isServable` is validateMediaPath (allowed roots + the configured logo files).
 */
export function mediaProblemFor(p: unknown, isServable: (p: string) => boolean): MediaProblem | null {
  if (!isRealMediaPath(p)) return null
  // Never probe a network path (NTLM leak / SMB timeout) or resolve a relative
  // one against wherever the app happened to start.
  if (isNetworkPath(p)) return 'outside'
  if (!isAbsolute(p)) return 'missing'
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
): Promise<{ relinked: Map<string, string>; failed: Array<{ path: string; error: string }>; missing: string[]; refused: Array<{ path: string; reason: string }> }> {
  const relinked = new Map<string, string>()
  const failed: Array<{ path: string; error: string }> = []
  const missing: string[] = []
  const refused: Array<{ path: string; reason: string }> = []
  for (const p of new Set(paths)) {
    if (!isRealMediaPath(p)) continue
    // Refuse before probing: relative paths, network shares, non-media files.
    const early = refuseImportReason(p, null, roots, { allowNetwork: false })
    if (early) {
      // Only worth reporting when the projector can't already show it.
      if (isNetworkPath(p) || !isAbsolute(p) || !isServable(p)) refused.push({ path: p, reason: early })
      continue
    }
    const problem = mediaProblemFor(p, isServable)
    if (problem === null) continue
    if (problem === 'missing') { missing.push(p); continue }
    try {
      const dest = await importMediaFile(p, roots, { allowNetwork: false })
      if (dest !== p) relinked.set(p, dest)
    } catch (err) {
      if (err instanceof MediaImportRefused) refused.push({ path: p, reason: err.message })
      else failed.push({ path: p, error: (err as Error)?.message ?? String(err) })
    }
  }
  return { relinked, failed, missing, refused }
}

/** Is this a leftover temp file from a copy that was cut short (crash, power cut)? */
export function isPartialCopy(name: string): boolean {
  return /\.part-\d+-\d+$/.test(name)
}

export const PARTIAL_COPY_MAX_AGE_MS = 60 * 60 * 1000 // 1 hour
export const ORPHAN_GRACE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export interface CleanupPlan {
  /** File names to delete now. */
  remove: string[]
  /** name → when it was first seen referenced by nothing (persist this). */
  orphanSince: Record<string, number>
}

/**
 * QA A3-N6: imported-media only ever grew — copies cut short left .part files
 * (813 MB in QA's test) and deleting services left every copy behind.
 *  - a `.part-…` file older than an hour is a dead copy → delete;
 *  - a copy nothing in the database mentions is remembered with the time it
 *    was first seen unreferenced, and deleted only after 30 days of that (so
 *    an undo, a re-import or restoring a backup still finds it);
 *  - anything referenced again is forgotten from the orphan list.
 * Pure: the caller lists the folder, decides what "referenced" means, and
 * persists `orphanSince`.
 */
export function planImportedMediaCleanup(
  files: Array<{ name: string; mtimeMs: number }>,
  isReferenced: (name: string) => boolean,
  orphanSince: Record<string, number>,
  now: number
): CleanupPlan {
  const remove: string[] = []
  const next: Record<string, number> = {}
  for (const f of files) {
    if (f.name.startsWith('.')) continue // our own bookkeeping
    if (isPartialCopy(f.name)) {
      if (now - f.mtimeMs > PARTIAL_COPY_MAX_AGE_MS) remove.push(f.name)
      continue
    }
    if (isReferenced(f.name)) continue
    const since = orphanSince[f.name] ?? now
    if (now - since >= ORPHAN_GRACE_MS) remove.push(f.name)
    else next[f.name] = since
  }
  return { remove, orphanSince: next }
}

/** Never delete outside the folder: plain names only. */
export function safeCleanupName(name: string): boolean {
  return name !== '' && name === basename(name) && !name.includes('..') && !name.includes(sep) && !name.includes('/') && !name.includes('\\')
}
