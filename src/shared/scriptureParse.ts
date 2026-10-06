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

// Verses per chapter, one row per book in BIBLE_BOOKS order, generated from
// resources/kjv.json (scriptureParse.test.ts checks every number against it).
// Lets Review & publish catch "John 3:99" without loading the Bible text into
// the renderer (QA B5-N3).
export const VERSE_COUNTS: readonly (readonly number[])[] = [
  [31, 25, 24, 26, 32, 22, 24, 22, 29, 32, 32, 20, 18, 24, 21, 16, 27, 33, 38, 18, 34, 24, 20, 67, 34, 35, 46, 22, 35, 43, 55, 32, 20, 31, 29, 43, 36, 30, 23, 23, 57, 38, 34, 34, 28, 34, 31, 22, 33, 26],
  [22, 25, 22, 31, 23, 30, 25, 32, 35, 29, 10, 51, 22, 31, 27, 36, 16, 27, 25, 26, 36, 31, 33, 18, 40, 37, 21, 43, 46, 38, 18, 35, 23, 35, 35, 38, 29, 31, 43, 38],
  [17, 16, 17, 35, 19, 30, 38, 36, 24, 20, 47, 8, 59, 57, 33, 34, 16, 30, 37, 27, 24, 33, 44, 23, 55, 46, 34],
  [54, 34, 51, 49, 31, 27, 89, 26, 23, 36, 35, 16, 33, 45, 41, 50, 13, 32, 22, 29, 35, 41, 30, 25, 18, 65, 23, 31, 40, 16, 54, 42, 56, 29, 34, 13],
  [46, 37, 29, 49, 33, 25, 26, 20, 29, 22, 32, 32, 18, 29, 23, 22, 20, 22, 21, 20, 23, 30, 25, 22, 19, 19, 26, 68, 29, 20, 30, 52, 29, 12],
  [18, 24, 17, 24, 15, 27, 26, 35, 27, 43, 23, 24, 33, 15, 63, 10, 18, 28, 51, 9, 45, 34, 16, 33],
  [36, 23, 31, 24, 31, 40, 25, 35, 57, 18, 40, 15, 25, 20, 20, 31, 13, 31, 30, 48, 25],
  [22, 23, 18, 22],
  [28, 36, 21, 22, 12, 21, 17, 22, 27, 27, 15, 25, 23, 52, 35, 23, 58, 30, 24, 42, 15, 23, 29, 22, 44, 25, 12, 25, 11, 31, 13],
  [27, 32, 39, 12, 25, 23, 29, 18, 13, 19, 27, 31, 39, 33, 37, 23, 29, 33, 43, 26, 22, 51, 39, 25],
  [53, 46, 28, 34, 18, 38, 51, 66, 28, 29, 43, 33, 34, 31, 34, 34, 24, 46, 21, 43, 29, 53],
  [18, 25, 27, 44, 27, 33, 20, 29, 37, 36, 21, 21, 25, 29, 38, 20, 41, 37, 37, 21, 26, 20, 37, 20, 30],
  [54, 55, 24, 43, 26, 81, 40, 40, 44, 14, 47, 40, 14, 17, 29, 43, 27, 17, 19, 8, 30, 19, 32, 31, 31, 32, 34, 21, 30],
  [17, 18, 17, 22, 14, 42, 22, 18, 31, 19, 23, 16, 22, 15, 19, 14, 19, 34, 11, 37, 20, 12, 21, 27, 28, 23, 9, 27, 36, 27, 21, 33, 25, 33, 27, 23],
  [11, 70, 13, 24, 17, 22, 28, 36, 15, 44],
  [11, 20, 32, 23, 19, 19, 73, 18, 38, 39, 36, 47, 31],
  [22, 23, 15, 17, 14, 14, 10, 17, 32, 3],
  [22, 13, 26, 21, 27, 30, 21, 22, 35, 22, 20, 25, 28, 22, 35, 22, 16, 21, 29, 29, 34, 30, 17, 25, 6, 14, 23, 28, 25, 31, 40, 22, 33, 37, 16, 33, 24, 41, 30, 24, 34, 17],
  [6, 12, 8, 8, 12, 10, 17, 9, 20, 18, 7, 8, 6, 7, 5, 11, 15, 50, 14, 9, 13, 31, 6, 10, 22, 12, 14, 9, 11, 12, 24, 11, 22, 22, 28, 12, 40, 22, 13, 17, 13, 11, 5, 26, 17, 11, 9, 14, 20, 23, 19, 9, 6, 7, 23, 13, 11, 11, 17, 12, 8, 12, 11, 10, 13, 20, 7, 35, 36, 5, 24, 20, 28, 23, 10, 12, 20, 72, 13, 19, 16, 8, 18, 12, 13, 17, 7, 18, 52, 17, 16, 15, 5, 23, 11, 13, 12, 9, 9, 5, 8, 28, 22, 35, 45, 48, 43, 13, 31, 7, 10, 10, 9, 8, 18, 19, 2, 29, 176, 7, 8, 9, 4, 8, 5, 6, 5, 6, 8, 8, 3, 18, 3, 3, 21, 26, 9, 8, 24, 13, 10, 7, 12, 15, 21, 10, 20, 14, 9, 6],
  [33, 22, 35, 27, 23, 35, 27, 36, 18, 32, 31, 28, 25, 35, 33, 33, 28, 24, 29, 30, 31, 29, 35, 34, 28, 28, 27, 28, 27, 33, 31],
  [18, 26, 22, 16, 20, 12, 29, 17, 18, 20, 10, 14],
  [17, 17, 11, 16, 16, 13, 13, 14],
  [31, 22, 26, 6, 30, 13, 25, 22, 21, 34, 16, 6, 22, 32, 9, 14, 14, 7, 25, 6, 17, 25, 18, 23, 12, 21, 13, 29, 24, 33, 9, 20, 24, 17, 10, 22, 38, 22, 8, 31, 29, 25, 28, 28, 25, 13, 15, 22, 26, 11, 23, 15, 12, 17, 13, 12, 21, 14, 21, 22, 11, 12, 19, 12, 25, 24],
  [19, 37, 25, 31, 31, 30, 34, 22, 26, 25, 23, 17, 27, 22, 21, 21, 27, 23, 15, 18, 14, 30, 40, 10, 38, 24, 22, 17, 32, 24, 40, 44, 26, 22, 19, 32, 21, 28, 18, 16, 18, 22, 13, 30, 5, 28, 7, 47, 39, 46, 64, 34],
  [22, 22, 66, 22, 22],
  [28, 10, 27, 17, 17, 14, 27, 18, 11, 22, 25, 28, 23, 23, 8, 63, 24, 32, 14, 49, 32, 31, 49, 27, 17, 21, 36, 26, 21, 26, 18, 32, 33, 31, 15, 38, 28, 23, 29, 49, 26, 20, 27, 31, 25, 24, 23, 35],
  [21, 49, 30, 37, 31, 28, 28, 27, 27, 21, 45, 13],
  [11, 23, 5, 19, 15, 11, 16, 14, 17, 15, 12, 14, 16, 9],
  [20, 32, 21],
  [15, 16, 15, 13, 27, 14, 17, 14, 15],
  [21],
  [17, 10, 10, 11],
  [16, 13, 12, 13, 15, 16, 20],
  [15, 13, 19],
  [17, 20, 19],
  [18, 15, 20],
  [15, 23],
  [21, 13, 10, 14, 11, 15, 14, 23, 17, 12, 17, 14, 9, 21],
  [14, 17, 18, 6],
  [25, 23, 17, 25, 48, 34, 29, 34, 38, 42, 30, 50, 58, 36, 39, 28, 27, 35, 30, 34, 46, 46, 39, 51, 46, 75, 66, 20],
  [45, 28, 35, 41, 43, 56, 37, 38, 50, 52, 33, 44, 37, 72, 47, 20],
  [80, 52, 38, 44, 39, 49, 50, 56, 62, 42, 54, 59, 35, 35, 32, 31, 37, 43, 48, 47, 38, 71, 56, 53],
  [51, 25, 36, 54, 47, 71, 53, 59, 41, 42, 57, 50, 38, 31, 27, 33, 26, 40, 42, 31, 25],
  [26, 47, 26, 37, 42, 15, 60, 40, 43, 48, 30, 25, 52, 28, 41, 40, 34, 28, 41, 38, 40, 30, 35, 27, 27, 32, 44, 31],
  [32, 29, 31, 25, 21, 23, 25, 39, 33, 21, 36, 21, 14, 23, 33, 27],
  [31, 16, 23, 21, 13, 20, 40, 13, 27, 33, 34, 31, 13, 40, 58, 24],
  [24, 17, 18, 18, 21, 18, 16, 24, 15, 18, 33, 21, 14],
  [24, 21, 29, 31, 26, 18],
  [23, 22, 21, 32, 33, 24],
  [30, 30, 21, 23],
  [29, 23, 25, 18],
  [10, 20, 13, 18, 28],
  [12, 17, 18],
  [20, 15, 16, 16, 25, 21],
  [18, 26, 17, 22],
  [16, 15, 15],
  [25],
  [14, 18, 19, 16, 14, 20, 28, 13, 28, 39, 40, 29, 25],
  [27, 26, 18, 17, 20],
  [25, 25, 22, 19, 14],
  [21, 22, 18],
  [10, 29, 24, 21, 21],
  [13],
  [14],
  [25],
  [20, 29, 22, 11, 14, 17, 17, 13, 21, 11, 19, 17, 18, 20, 8, 21, 18, 24, 21, 15, 27, 21],
]

/** Verses in a chapter (1-based chapter), or 0 when the chapter doesn't exist. */
export function verseCount(bookIndex: number, chapter: number): number {
  return VERSE_COUNTS[bookIndex]?.[chapter - 1] ?? 0
}

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

export type BookName = (typeof BIBLE_BOOKS)[number]

// Abbreviations and other names, keyed by the BOOK NAME, never by a hand-typed
// index: QA A5-N1 was "isa: 23, jer: 24" (one off), which put Jeremiah 9:6 on
// screen for "Isa 9:6". Anything that is already a unique prefix of a book
// name ("Gen", "Neh", "1 Thess") resolves without an entry here; these are the
// SBL-style and common short forms that aren't. Deliberately absent, because
// they mean different books in different systems: "Jud" (Judges or Jude),
// "Jo" (Joshua/Job/Joel/John/Jonah), "Hb" (Habakkuk or Hebrews), "Ph".
export const BOOK_ALIASES: Readonly<Record<string, BookName>> = {
  gn: 'Genesis',
  exod: 'Exodus', ex: 'Exodus', exo: 'Exodus',
  lv: 'Leviticus',
  nm: 'Numbers', nb: 'Numbers',
  dt: 'Deuteronomy',
  jsh: 'Joshua',
  judg: 'Judges', jdg: 'Judges', jg: 'Judges', jdgs: 'Judges',
  rth: 'Ruth', ru: 'Ruth',
  '1 sm': '1 Samuel', '2 sm': '2 Samuel',
  '1 kgs': '1 Kings', '2 kgs': '2 Kings', '1 kg': '1 Kings', '2 kg': '2 Kings',
  '1 chr': '1 Chronicles', '2 chr': '2 Chronicles',
  ne: 'Nehemiah',
  est: 'Esther', esth: 'Esther',
  jb: 'Job',
  psalm: 'Psalms', ps: 'Psalms', psa: 'Psalms', pss: 'Psalms', psm: 'Psalms',
  prv: 'Proverbs', pr: 'Proverbs',
  eccl: 'Ecclesiastes', ecc: 'Ecclesiastes', qoh: 'Ecclesiastes', qoheleth: 'Ecclesiastes',
  song: 'Song of Solomon', 'song of songs': 'Song of Solomon', canticles: 'Song of Solomon', sos: 'Song of Solomon', ss: 'Song of Solomon', cant: 'Song of Solomon',
  isa: 'Isaiah', is: 'Isaiah',
  jer: 'Jeremiah', jr: 'Jeremiah',
  lam: 'Lamentations',
  ezek: 'Ezekiel', ezk: 'Ezekiel',
  dan: 'Daniel', dn: 'Daniel',
  hos: 'Hosea',
  jl: 'Joel',
  am: 'Amos',
  obad: 'Obadiah', ob: 'Obadiah',
  jnh: 'Jonah',
  mic: 'Micah', mi: 'Micah',
  nah: 'Nahum',
  hab: 'Habakkuk',
  zeph: 'Zephaniah', zep: 'Zephaniah',
  hag: 'Haggai',
  zech: 'Zechariah', zec: 'Zechariah',
  mal: 'Malachi',
  matt: 'Matthew', mt: 'Matthew',
  mk: 'Mark', mrk: 'Mark',
  lk: 'Luke', luk: 'Luke',
  jn: 'John', jhn: 'John',
  rom: 'Romans', rm: 'Romans', ro: 'Romans',
  '1 cor': '1 Corinthians', '2 cor': '2 Corinthians', '1 co': '1 Corinthians', '2 co': '2 Corinthians',
  gal: 'Galatians',
  eph: 'Ephesians',
  phil: 'Philippians', php: 'Philippians', pp: 'Philippians',
  col: 'Colossians',
  '1 thess': '1 Thessalonians', '2 thess': '2 Thessalonians', '1 th': '1 Thessalonians', '2 th': '2 Thessalonians',
  '1 tim': '1 Timothy', '2 tim': '2 Timothy',
  tit: 'Titus',
  phlm: 'Philemon', philem: 'Philemon', phm: 'Philemon',
  heb: 'Hebrews',
  jas: 'James', jm: 'James',
  '1 pet': '1 Peter', '2 pet': '2 Peter', '1 pt': '1 Peter', '2 pt': '2 Peter',
  '1 jn': '1 John', '2 jn': '2 John', '3 jn': '3 John', '1 jhn': '1 John', '2 jhn': '2 John', '3 jhn': '3 John',
  jude: 'Jude', jd: 'Jude',
  rev: 'Revelation', rv: 'Revelation', re: 'Revelation', revelations: 'Revelation', 'the revelation': 'Revelation',
}

const BOOK_INDEX = new Map<string, number>()
BIBLE_BOOKS.forEach((name, i) => BOOK_INDEX.set(normBook(name), i))
for (const [alias, name] of Object.entries(BOOK_ALIASES)) {
  const i = BIBLE_BOOKS.indexOf(name)
  // Unreachable while BookName is checked by the compiler; kept so a bad
  // edit can never silently map to the wrong book at runtime.
  if (i < 0) throw new Error(`scripture alias "${alias}" names no book "${name}"`)
  BOOK_INDEX.set(normBook(alias), i)
}

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

/**
 * Can this reference resolve? Same answer as the lookup at Go Live: a chapter
 * that doesn't exist, or a verse (or a range that starts) past the end of its
 * chapter, is a problem — "John 3:99" used to pass review and only toast when
 * it went live (QA B5-N3). The message matches the lookup's.
 */
export function referenceProblem(input: string): string | null {
  const r = parseScriptureReference(input)
  if (!r.ok) return r.error
  for (const seg of r.segments) {
    if (seg.from != null && seg.from > verseCount(r.bookIndex, seg.chapter)) return `${r.book} ${seg.chapter} has no verse ${seg.from}.`
  }
  return null
}

/**
 * A reference that resolves but not as written: a range that runs past the end
 * of its chapter ("John 3:16-40") is shortened to the chapter's last verse by
 * the lookup. Worth a warning, since it is usually a typo for a smaller number.
 */
export function referenceWarning(input: string): string | null {
  const r = parseScriptureReference(input)
  if (!r.ok) return null
  for (const seg of r.segments) {
    const last = verseCount(r.bookIndex, seg.chapter)
    if (seg.to != null && seg.to !== Number.MAX_SAFE_INTEGER && seg.to > last && (seg.from ?? 1) <= last) {
      return `${r.book} ${seg.chapter} ends at verse ${last}, so only ${seg.chapter}:${seg.from ?? 1}-${last} will show.`
    }
  }
  return null
}
