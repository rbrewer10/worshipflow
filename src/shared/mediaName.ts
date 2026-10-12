// QA B12 watch item: an image item's title is its file name, and the copies
// WorshipFlow stores carry a hash suffix ("cross-1a2b3c4d5e.png"). Shown as a
// title, that hash leaked into the run sheet, and a file carried PC → stick →
// PC → stick picked up one more suffix each trip. The hashed name is for the
// stored file only: titles show the original name, and new stored names are
// built from the clean stem so they never compound.

/** One or more "-<10 or 16 hex>" suffixes our stored copies get. */
const HASH_SUFFIX = /(?:-[0-9a-f]{10}(?:[0-9a-f]{6})?)+$/

function split(base: string): { stem: string; ext: string } {
  const dot = base.lastIndexOf('.')
  return dot > 0 ? { stem: base.slice(0, dot), ext: base.slice(dot) } : { stem: base, ext: '' }
}

/** True when the path sits in one of our imported-media folders. */
export function isStoredMediaPath(path: string): boolean {
  return path.split(/[\\/]/).slice(0, -1).some((s) => s.toLowerCase() === 'imported-media')
}

/** A stem with our hash suffixes removed (kept as-is if that would leave nothing). */
export function stripMediaHash(stem: string): string {
  return stem.replace(HASH_SUFFIX, '') || stem
}

/** The name to show for a media path: the original name, without our hash. */
export function mediaDisplayName(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path
  if (!isStoredMediaPath(path)) return base
  const { stem, ext } = split(base)
  return stripMediaHash(stem) + ext
}

/** A filesystem-safe stem for a new stored copy of `path` (never compounding hashes). */
export function storedMediaStem(path: string): string {
  const { stem } = split(path.split(/[\\/]/).pop() ?? path)
  return stripMediaHash(stem).replace(/[^A-Za-z0-9 _.-]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60) || 'media'
}

/**
 * QA B13-N7: titles show the original file name, so two different pictures
 * that were both called "cross.png" got the same label in the rail and Build.
 * When one title stands for more than one file in a service, the second file
 * becomes "cross.png (2)", the third "(3)" — in running order; rows showing
 * the same file keep the same label, and unique titles are untouched.
 */
export function disambiguateMediaTitles<T extends { type: string; title: string; payload: Record<string, unknown> }>(items: T[]): T[] {
  const files = new Map<string, string[]>() // title → distinct paths, first seen first
  for (const it of items) {
    if (it.type !== 'image') continue
    const p = String(it.payload.path ?? '')
    const list = files.get(it.title) ?? []
    if (!list.includes(p)) list.push(p)
    files.set(it.title, list)
  }
  return items.map((it) => {
    if (it.type !== 'image') return it
    const list = files.get(it.title)!
    const n = list.indexOf(String(it.payload.path ?? ''))
    return list.length > 1 && n > 0 ? { ...it, title: `${it.title} (${n + 1})` } : it
  })
}
