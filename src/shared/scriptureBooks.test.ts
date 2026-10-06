import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { BIBLE_BOOKS, BOOK_ALIASES, CHAPTER_COUNTS, parseScriptureReference, resolveBook } from './scriptureParse'

// QA A5-N1 (High): the alias table had "isa: 23, jer: 24" — one off — so
// "Isa 9:6" put Jeremiah 9:6 on the projector and "Jer 29:11" fell through to
// Lamentations. The chapter-count test couldn't see it. These tests pin the
// book every abbreviation lands on, written out here independently of the
// table in scriptureParse.ts.

// [what a bulletin / operator types, the book it must be]
const EXPECTED: Array<[string, string]> = [
  // QA's repro
  ['Isa', 'Isaiah'], ['Jer', 'Jeremiah'], ['Is', 'Isaiah'], ['Jr', 'Jeremiah'], ['Lam', 'Lamentations'],
  // Old Testament (SBL and common short forms)
  ['Gen', 'Genesis'], ['Gn', 'Genesis'], ['Exod', 'Exodus'], ['Ex', 'Exodus'], ['Exo', 'Exodus'], ['Lev', 'Leviticus'], ['Lv', 'Leviticus'],
  ['Num', 'Numbers'], ['Nm', 'Numbers'], ['Deut', 'Deuteronomy'], ['Dt', 'Deuteronomy'], ['Josh', 'Joshua'], ['Judg', 'Judges'], ['Jdg', 'Judges'],
  ['Ruth', 'Ruth'], ['Ru', 'Ruth'], ['1 Sam', '1 Samuel'], ['2 Sam', '2 Samuel'], ['1Sam', '1 Samuel'], ['I Sam', '1 Samuel'], ['II Samuel', '2 Samuel'],
  ['1 Kgs', '1 Kings'], ['2 Kgs', '2 Kings'], ['1 Kings', '1 Kings'], ['1 Chr', '1 Chronicles'], ['2 Chron', '2 Chronicles'], ['Ezra', 'Ezra'],
  ['Neh', 'Nehemiah'], ['Ne', 'Nehemiah'], ['Esth', 'Esther'], ['Est', 'Esther'], ['Job', 'Job'], ['Jb', 'Job'],
  ['Ps', 'Psalms'], ['Psa', 'Psalms'], ['Psalm', 'Psalms'], ['Pss', 'Psalms'], ['Prov', 'Proverbs'], ['Prv', 'Proverbs'], ['Pr', 'Proverbs'],
  ['Eccl', 'Ecclesiastes'], ['Ecc', 'Ecclesiastes'], ['Qoh', 'Ecclesiastes'], ['Song', 'Song of Solomon'], ['Song of Songs', 'Song of Solomon'],
  ['SOS', 'Song of Solomon'], ['Canticles', 'Song of Solomon'], ['Ezek', 'Ezekiel'], ['Ezk', 'Ezekiel'], ['Dan', 'Daniel'], ['Dn', 'Daniel'],
  ['Hos', 'Hosea'], ['Joel', 'Joel'], ['Jl', 'Joel'], ['Amos', 'Amos'], ['Am', 'Amos'], ['Obad', 'Obadiah'], ['Ob', 'Obadiah'], ['Jonah', 'Jonah'], ['Jon', 'Jonah'],
  ['Mic', 'Micah'], ['Mi', 'Micah'], ['Nah', 'Nahum'], ['Hab', 'Habakkuk'], ['Zeph', 'Zephaniah'], ['Zep', 'Zephaniah'], ['Hag', 'Haggai'],
  ['Zech', 'Zechariah'], ['Zec', 'Zechariah'], ['Mal', 'Malachi'],
  // New Testament
  ['Matt', 'Matthew'], ['Mt', 'Matthew'], ['Mk', 'Mark'], ['Mark', 'Mark'], ['Lk', 'Luke'], ['Luke', 'Luke'], ['Jn', 'John'], ['Jhn', 'John'], ['John', 'John'],
  ['Acts', 'Acts'], ['Rom', 'Romans'], ['Rm', 'Romans'], ['Ro', 'Romans'], ['1 Cor', '1 Corinthians'], ['2 Cor', '2 Corinthians'], ['1Co', '1 Corinthians'],
  ['Gal', 'Galatians'], ['Eph', 'Ephesians'], ['Phil', 'Philippians'], ['Php', 'Philippians'], ['Col', 'Colossians'],
  ['1 Thess', '1 Thessalonians'], ['2 Thess', '2 Thessalonians'], ['1 Th', '1 Thessalonians'], ['1 Tim', '1 Timothy'], ['2 Tim', '2 Timothy'],
  ['Tit', 'Titus'], ['Titus', 'Titus'], ['Phlm', 'Philemon'], ['Philem', 'Philemon'], ['Phm', 'Philemon'], ['Heb', 'Hebrews'], ['Jas', 'James'], ['Jm', 'James'],
  ['1 Pet', '1 Peter'], ['2 Pet', '2 Peter'], ['1 Pt', '1 Peter'], ['1 Jn', '1 John'], ['2 Jn', '2 John'], ['3 Jn', '3 John'], ['1 John', '1 John'],
  ['Jude', 'Jude'], ['Jd', 'Jude'], ['Rev', 'Revelation'], ['Rv', 'Revelation'], ['Re', 'Revelation'], ['Revelations', 'Revelation'],
  // Less common forms
  ['Qoheleth', 'Ecclesiastes'], ['Cant', 'Song of Solomon'], ['SS', 'Song of Solomon'], ['The Revelation', 'Revelation'], ['Psm', 'Psalms'],
  ['Nb', 'Numbers'], ['Jsh', 'Joshua'], ['Jg', 'Judges'], ['Jdgs', 'Judges'], ['Rth', 'Ruth'], ['1 Sm', '1 Samuel'], ['2 Sm', '2 Samuel'],
  ['1 Kg', '1 Kings'], ['2 Kg', '2 Kings'], ['2 Chr', '2 Chronicles'], ['1 Chr', '1 Chronicles'], ['Mrk', 'Mark'], ['Luk', 'Luke'], ['Pp', 'Philippians'],
  ['2 Co', '2 Corinthians'], ['1 Co', '1 Corinthians'], ['2 Th', '2 Thessalonians'], ['2 Pt', '2 Peter'], ['1 Jhn', '1 John'], ['2 Jhn', '2 John'],
  ['3 Jhn', '3 John'], ['Jnh', 'Jonah'],
]

const bookOf = (typed: string): string | null => {
  const r = parseScriptureReference(`${typed} 1:1`)
  return r.ok ? r.book : null
}

describe('QA A5-N1: every abbreviation lands on the right book', () => {
  it.each(EXPECTED)('%s → %s', (typed, book) => {
    expect(bookOf(typed)).toBe(book)
    expect(bookOf(`${typed}.`)).toBe(book) // "Isa." as printed
  })

  it('every entry in the alias table is in the expected list above, with the same book', () => {
    const expected = new Map(EXPECTED.map(([t, b]) => [t.toLowerCase().replace(/^([1-3])(?=[a-z])/, '$1 '), b]))
    const unlisted: string[] = []
    for (const [alias, book] of Object.entries(BOOK_ALIASES)) {
      expect(bookOf(alias), alias).toBe(book) // through the parser, not the table
      if (expected.has(alias)) expect(expected.get(alias), alias).toBe(book)
      else unlisted.push(alias)
    }
    expect(unlisted, 'add these to EXPECTED with the book they must be').toEqual([])
  })

  it('every alias is a subsequence of its book\'s letters or a listed alternative name (catches a pasted wrong book)', () => {
    const letters = (s: string): string => s.toLowerCase().replace(/[^a-z1-3]/g, '')
    const isSubsequence = (a: string, b: string): boolean => { let j = 0; for (const ch of b) if (ch === a[j]) j++; return j === a.length }
    const ALTERNATIVE_NAMES = new Set(['qoh', 'qoheleth', 'canticles', 'cant', 'song of songs', 'the revelation', 'revelations'])
    for (const [alias, book] of Object.entries(BOOK_ALIASES)) {
      expect(ALTERNATIVE_NAMES.has(alias) || isSubsequence(letters(alias), letters(book)), `${alias} → ${book}`).toBe(true)
    }
  })

  it('ambiguous short forms resolve to nothing rather than a guess', () => {
    for (const typed of ['Jud', 'Jo', 'Hb', 'Ph', 'Ma', 'J']) expect(bookOf(typed), typed).toBeNull()
  })

  it('a full name always beats a prefix, and every name prefix of 4+ letters that names one book lands on it', () => {
    BIBLE_BOOKS.forEach((name, i) => {
      expect(resolveBook(name), name).toBe(i)
      const key = name.toLowerCase()
      for (let n = 4; n <= key.length; n++) {
        const prefix = key.slice(0, n)
        const owners = BIBLE_BOOKS.filter((b) => b.toLowerCase().startsWith(prefix))
        if (owners.length === 1) expect(resolveBook(prefix), prefix).toBe(i)
      }
    })
  })
})

describe('book table vs the bundled KJV', () => {
  const raw = readFileSync(join(__dirname, '..', '..', 'resources', 'kjv.json'), 'utf8')
  const data = JSON.parse(raw.replace(/^\uFEFF/, '')) as { name: string; chapters: string[][] }[]

  it('same 66 books in the same order, by name', () => {
    expect(data.map((b) => b.name)).toEqual([...BIBLE_BOOKS])
  })
  it('each KJV book name resolves to its own position', () => {
    data.forEach((b, i) => expect(resolveBook(b.name), b.name).toBe(i))
  })
  it('chapter counts agree', () => {
    expect(data.map((b) => b.chapters.length)).toEqual([...CHAPTER_COUNTS])
  })
})
