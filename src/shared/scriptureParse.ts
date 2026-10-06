// One reference grammar for the whole app (QA B4-N1).
//
// The setlist importer accepted "Mark 4:35–41" (en dash), "Psalm 23-24",
// "John 3:35-4:3" and "Psalm 23, 24", the KJV lookup rejected all four, and the
// operator only found out on Sunday when Go Live did nothing. The importer, the
// lookup (main/scripture.ts) and the readiness check now all read references
// through this module. Pure: no Bible text here, just the book table and how
// many chapters each book has, which is enough to say whether a reference can
// resolve.

export const BIBLE_BOOKS = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth',
  '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra',
  'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon',
  'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah',
  'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians',
  '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians',
  '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James',
  '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation'
] as const

// Chapters per book, in BIBLE_BOOKS order (checked against resources/kjv.json
// by scriptureParse.test.ts).
export const CHAPTER_COUNTS = [
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3,
  2, 14, 4, 28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1, 22
] as const

export function normBook(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/^(1st|first|i)\s+/, '1 ')
    .replace(/^(2nd|second|ii)\s+/, '2 ')
    .replace(/^(3rd|third|iii)\s+/, '3 ')
    .replace(/^([1-3])(?=[a-z])/, '$1 ')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const BOOK_INDEX = new Map<string, number>()
BIBLE_BOOKS.forEach((name, i) => BOOK_INDEX.set(normBook(name), i))
const ALIASES: Record<string, number> = {
  psalm: 18,
  'song of songs': 21,
  canticles: 21,
  gen: 0, exod: 1, ex: 1, lev: 2, num: 3, deut: 4, dt: 4, josh: 5, judg: 6,
  '1 sam': 8, '2 sam': 9, ps: 18, psa: 18, prov: 19, eccl: 20, isa: 23, jer: 24,
  ezek: 25, dan: 26, matt: 39, mt: 39, mk: 40, lk: 41, jn: 42, rom: 44,
  '1 cor': 45, '2 cor': 46, gal: 47, eph: 48, phil: 49, col: 50, heb: 57,
  jas: 58, rev: 65,
  // Single-chapter books' usual abbreviations (A4-N2).
  obad: 30, ob: 30, phlm: 56, philem: 56, phm: 56, jud: 64, jude: 64,
  '1 jn': 61, '2 jn': 62, '3 jn': 63
}
Object.entries(ALIASES).forEach(([k, v]) => BOOK_INDEX.set(normBook(k), v))

export function resolveBook(s: string): number | null {
  const key = normBook(s)
  if (!key) return null
  if (BOOK_INDEX.has(key)) return BOOK_INDEX.get(key) as number
  // Unique prefix fallback ("Phil" is ambiguous; "Philip" is Philippians).
  const matches = [...BOOK_INDEX.entries()].filter(([k]) => k.startsWith(key))
  const uniq = new Set(matches.map(([, v]) => v))
  return uniq.size === 1 ? (matches[0][1] as number) : null
}

/**
 * Typographic dashes ("4:35–41" from Word/Publisher), a minus sign, and the
 * spaces people put around ":" "-" "," all read as the plain form.
 */
export function normalizeReference(input: string): string {
  return input
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*([:\-,])\s*/g, '$1')
    .trim()
}

/** One chapter's worth of a reference. `from`/`to` absent = the whole chapter. */
export interface RefSegment {
  chapter: number
  from?: number
  to?: number
}

export type ParsedReference =
  | { ok: true; bookIndex: number; book: string; segments: RefSegment[] }
  | { ok: false; error: string }

const SPEC = /^\d+(?::\d+)?(?:-\d+(?::\d+)?)?(?:,\d+(?::\d+)?(?:-\d+(?::\d+)?)?)*$/
const PART = /^(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/
const MAX_CHAPTER_SPAN = 30 // "Psalm 1-150" is a typo, not a reading

/**
 * "John 3:16", "Psalm 23", "Mark 4:35–41", "Psalm 23-24", "John 3:35-4:3",
 * "Psalm 23, 24", "John 3:16, 18", "Jude 3" (one-chapter book: a verse).
 */
export function parseScriptureReference(input: string): ParsedReference {
  const ref = normalizeReference(input)
  if (!ref) return { ok: false, error: 'Enter a reference, e.g. "John 3:16".' }
  const m = /^(.+?)\s*(\d[\d:,-]*)?$/.exec(ref)
  if (!m || !/[a-z]/i.test(m[1])) return { ok: false, error: 'Could not read that reference. Try e.g. "John 3:16".' }
  // "1 John" — the lazy book group stops at the first digit run only when what
  // follows is a valid spec, so a leading book number is kept with the name.
  let bookText = m[1]
  let spec = m[2] ?? ''
  if (/^[1-3]$/.test(bookText.trim())) return { ok: false, error: 'Could not read that reference. Try e.g. "John 3:16".' }
  if (spec && !SPEC.test(spec)) return { ok: false, error: `Could not read "${input.trim()}". Try e.g. "John 3:16-18" or "Psalm 23".` }
  bookText = bookText.trim()
  const bookIndex = resolveBook(bookText)
  if (bookIndex == null) return { ok: false, error: `Unknown book "${bookText}".` }
  const book = BIBLE_BOOKS[bookIndex]
  const chapters = CHAPTER_COUNTS[bookIndex]
  const single = chapters === 1

  if (!spec) {
    if (single) return { ok: true, bookIndex, book, segments: [{ chapter: 1 }] }
    return { ok: false, error: `Add a chapter to "${book}", e.g. "${book} 1".` }
  }

  const segments: RefSegment[] = []
  let ctx: number | null = null // chapter a previous "c:v" set; bare numbers after it are verses
  const badChapter = (c: number): string => (single ? `${book} has only one chapter.` : `${book} has no chapter ${c}.`)
  for (const part of spec.split(',')) {
    const p = PART.exec(part)
    if (!p) return { ok: false, error: `Could not read "${input.trim()}".` }
    const a = Number(p[1])
    const b = p[2] != null ? Number(p[2]) : null
    const c = p[3] != null ? Number(p[3]) : null
    const d = p[4] != null ? Number(p[4]) : null
    if (b != null) {
      // c:v, c:v-v2, c:v-c2:v2
      if (a < 1 || a > chapters) return { ok: false, error: badChapter(a) }
      if (b < 1) return { ok: false, error: `${book} ${a} has no verse ${b}.` }
      if (d != null) {
        const c2 = c as number
        if (c2 < a || c2 > chapters) return { ok: false, error: badChapter(c2) }
        if (c2 - a > MAX_CHAPTER_SPAN) return { ok: false, error: `"${input.trim()}" spans too many chapters.` }
        if (c2 === a) {
          if (d < b) return { ok: false, error: `"${input.trim()}" runs backwards.` }
          segments.push({ chapter: a, from: b, to: d })
        } else {
          segments.push({ chapter: a, from: b, to: Number.MAX_SAFE_INTEGER })
          for (let ch = a + 1; ch < c2; ch++) segments.push({ chapter: ch })
          segments.push({ chapter: c2, from: 1, to: d })
        }
        ctx = c2
      } else {
        const to = c ?? b
        if (to < b) return { ok: false, error: `"${input.trim()}" runs backwards.` }
        segments.push({ chapter: a, from: b, to })
        ctx = a
      }
    } else if (d != null) {
      // "3-4:3": chapter 3 through 4:3
      const c2 = c as number
      if (ctx != null || single) return { ok: false, error: `Could not read "${input.trim()}".` }
      if (a < 1 || c2 < a || c2 > chapters) return { ok: false, error: badChapter(c2 > chapters ? c2 : a) }
      if (c2 - a > MAX_CHAPTER_SPAN) return { ok: false, error: `"${input.trim()}" spans too many chapters.` }
      for (let ch = a; ch < c2; ch++) segments.push({ chapter: ch })
      segments.push({ chapter: c2, from: 1, to: d })
      ctx = c2
    } else if (ctx != null || single) {
      // A verse (range) in the current chapter: "John 3:16, 18", "Jude 3", "Jude 20-21".
      const chapter: number = ctx ?? 1
      const to = c ?? a
      if (a < 1 || to < a) return { ok: false, error: `"${input.trim()}" runs backwards.` }
      segments.push({ chapter, from: a, to })
      ctx = chapter
    } else {
      // Whole chapter(s): "Psalm 23", "Psalm 23-24", "Psalm 23, 24".
      const to = c ?? a
      if (a < 1 || a > chapters) return { ok: false, error: badChapter(a) }
      if (to < a || to > chapters) return { ok: false, error: badChapter(to) }
      if (to - a > MAX_CHAPTER_SPAN) return { ok: false, error: `"${input.trim()}" spans too many chapters.` }
      for (let ch = a; ch <= to; ch++) segments.push({ chapter: ch })
    }
  }
  return { ok: true, bookIndex, book, segments }
}

/** Can this reference resolve? (Verse numbers past the end of a chapter are caught by the lookup.) */
export function referenceProblem(input: string): string | null {
  const r = parseScriptureReference(input)
  return r.ok ? null : r.error
}
