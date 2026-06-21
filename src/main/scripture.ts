import { app } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import type { ScriptureResult } from '../shared/types'

// KJV scripture lookup (Phase 1 ③). Public-domain KJV bundled in resources/.
// Parses references like "John 3:16", "Psalm 23", "1 John 1:9", "Romans 8:1-4".

interface Book {
  abbrev: string
  chapters: string[][]
  name?: string
}

// Canonical 66-book order (matches the data file's order).
const BOOKS = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth',
  '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra',
  'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon',
  'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah',
  'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians',
  '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians',
  '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James',
  '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation'
]

function normBook(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/^(1st|first|i)\s+/, '1 ')
    .replace(/^(2nd|second|ii)\s+/, '2 ')
    .replace(/^(3rd|third|iii)\s+/, '3 ')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const BOOK_INDEX = new Map<string, number>()
BOOKS.forEach((name, i) => BOOK_INDEX.set(normBook(name), i))
// Aliases / common forms.
const ALIASES: Record<string, number> = {
  psalm: 18,
  'song of songs': 21,
  canticles: 21,
  gen: 0, exod: 1, ex: 1, lev: 2, num: 3, deut: 4, dt: 4, josh: 5, judg: 6,
  '1 sam': 8, '2 sam': 9, ps: 18, psa: 18, prov: 19, eccl: 20, isa: 23, jer: 24,
  ezek: 25, dan: 26, matt: 39, mt: 39, mk: 40, lk: 41, jn: 42, rom: 44,
  '1 cor': 45, '2 cor': 46, gal: 47, eph: 48, phil: 49, col: 50, heb: 57,
  jas: 58, rev: 65
}
Object.entries(ALIASES).forEach(([k, v]) => BOOK_INDEX.set(normBook(k), v))

let DATA: Book[] | null = null
function data(): Book[] {
  if (!DATA) {
    const p = join(app.getAppPath(), 'resources', 'kjv.json')
    const raw = readFileSync(p, 'utf8')
    DATA = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw) as Book[]
  }
  return DATA
}

function resolveBook(s: string): number | null {
  const key = normBook(s)
  if (BOOK_INDEX.has(key)) return BOOK_INDEX.get(key) as number
  // Unique prefix fallback.
  const matches = [...BOOK_INDEX.entries()].filter(([k]) => k.startsWith(key))
  const uniq = new Set(matches.map(([, v]) => v))
  return uniq.size === 1 ? (matches[0][1] as number) : null
}

function clean(t: string): string {
  return t.replace(/[{}]/g, '').trim()
}

export function lookupScripture(input: string): ScriptureResult {
  try {
    const m = input.trim().match(/^(.+?)\s+(\d+)(?::\s*(\d+)(?:\s*-\s*(\d+))?)?\s*$/)
    if (!m) return { ok: false, error: 'Could not read that reference. Try e.g. "John 3:16".' }

    const bi = resolveBook(m[1])
    if (bi == null) return { ok: false, error: `Unknown book "${m[1].trim()}".` }

    const chapter = parseInt(m[2], 10)
    const book = data()[bi]
    if (chapter < 1 || chapter > book.chapters.length)
      return { ok: false, error: `${BOOKS[bi]} has no chapter ${chapter}.` }

    const verses = book.chapters[chapter - 1]
    const v1 = m[3] ? parseInt(m[3], 10) : null
    const v2 = m[4] ? parseInt(m[4], 10) : null

    const out: { n: number; text: string }[] = []
    if (v1 == null) {
      verses.forEach((t, i) => out.push({ n: i + 1, text: clean(t) }))
    } else {
      const end = v2 ?? v1
      for (let v = v1; v <= end; v++) {
        if (verses[v - 1] != null) out.push({ n: v, text: clean(verses[v - 1]) })
      }
      if (out.length === 0) return { ok: false, error: `${BOOKS[bi]} ${chapter} has no verse ${v1}.` }
    }

    const ref = `${BOOKS[bi]} ${chapter}${v1 ? ':' + v1 + (v2 ? '-' + v2 : '') : ''}`
    return { ok: true, reference: ref, verses: out }
  } catch (err) {
    console.error('[scripture] lookup failed:', err)
    return { ok: false, error: `Internal error: ${err instanceof Error ? err.message : String(err)}` }
  }
}
