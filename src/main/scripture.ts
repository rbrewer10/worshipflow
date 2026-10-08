import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import type { ScriptureResult, ScriptureVerse } from '../shared/types'
import { BIBLE_BOOKS, parseScriptureReference, type RefSegment } from '../shared/scriptureParse'

// KJV scripture lookup (Phase 1 ③). Public-domain KJV bundled in resources/.
// Parses references like "John 3:16", "Psalm 23", "1 John 1:9", "Romans 8:1-4".

interface Book {
  abbrev: string
  chapters: string[][]
  name?: string
}

// Book table, aliases and the reference grammar are shared with the setlist
// importer and the readiness check (QA B4-N1), so all three agree.
let DATA: Book[] | null = null
function data(): Book[] {
  if (!DATA) {
    // app path in a packaged build (app.asar) and `npm run dev`; the second
    // candidate is the same file relative to out/main, which is what the e2e
    // harness's `electron out/main/index.js` sees as its app path.
    const candidates = [join(app.getAppPath(), 'resources', 'kjv.json'), join(__dirname, '..', '..', 'resources', 'kjv.json')]
    const p = candidates.find((c) => existsSync(c)) ?? candidates[0]
    const raw = readFileSync(p, 'utf8')
    DATA = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw) as Book[]
  }
  return DATA
}

// Braces in this KJV text mark two different things: translator/margin notes
// ("{for ever: Heb. to length of days}", "{sickle; or, scythe}",
// "{Written from Rome to Philemon…}") and the KJV's italic supplied words
// ("The LORD {is} my shepherd"). Notes go entirely; supplied words are part of
// the verse and stay (only the braces go). Dropping both used to put
// "The LORD my shepherd" on screen.
//
// Case-sensitive and anchored to the real margin-note markup: with /i,
// "^The first" also caught the italic {the first} in Ex 28:17, Ex 39:10 and
// 1 Chr 24:23 and dropped it from the verse (QA B5-N6). The capitalised
// subscriptions it was written for ("{The first epistle}", "{The second
// epistle}", "{The first to Timothy was written…}") are all that match now.
const NOTE_MARKER = /\b(?:Heb|Gr|Chald|Syr|Arab)\.|(?:^|[;\s])or,|^(?:Written|The (?:first|second) (?:epistle|to)\b|It was written|many ancient copies|this verse is not)/

// A colon on its own ("{Babel: that is, Confusion}") marks a margin note only
// where notes sit, after the verse text. Mid-verse, a colon is the KJV's own
// punctuation inside italic words: "{tarry: for} I have learned",
// "{therein: it shall be} a statute", "{them: even} unto the LORD" — the
// re-run of the whole-Bible comparison for B5-N6 found seven verses that had
// lost those words (Gen 30:27, Gen 42:34, Lev 23:21, Job 36:5, Ps 18:41,
// Isa 6:13, Jer 22:16).
function onlyNotesAfter(rest: string): boolean {
  let r = rest
  for (let prev = ''; prev !== r; ) {
    prev = r
    r = r.replace(/\{[^{}]*\}/g, '')
  }
  return !/[A-Za-z0-9]/.test(r)
}

function isNote(inner: string, rest: string): boolean {
  return NOTE_MARKER.test(inner) || (inner.includes(':') && onlyNotesAfter(rest))
}

export function cleanVerse(t: string): string {
  // «…» is an epistle's postscript ("Written from Rome…"), not verse text.
  let out = t.replace(/«[^»]*»?/g, '')
  // One note in the source closes twice ("{in yourselves...: or, … for} yourselves}").
  out = out.replace(/\{[^{}]*:[^{}]*\}\s*[^{}\s]+\}/g, '')
  // Innermost first, so "{{and from} the cities: or, …}" reads as one note.
  for (let prev = ''; prev !== out; ) {
    prev = out
    out = out.replace(/\{([^{}]*)\}/g, (m: string, inner: string, offset: number, whole: string) =>
      isNote(inner, whole.slice(offset + m.length)) ? '' : inner
    )
  }
  // QA A5-N3: the Psalm titles are in square brackets in this text
  // ("[A Psalm of David.] The LORD is my shepherd"). Like the italic supplied
  // words, the title stays and only the brackets go.
  out = out.replace(/\[([^\]]*)\]/g, '$1')
  return out
    .replace(/[{}[\]]/g, '')
    .replace(/\s+([,.;:?!])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
const clean = cleanVerse

/**
 * "John 3:16" with consecutive same-chapter segments merged and the chapter
 * left off a segment that continues the previous one's chapter.
 */
export function formatSegments(book: string, segs: RefSegment[]): string {
  const merged: RefSegment[] = []
  for (const s of segs) {
    const prev = merged[merged.length - 1]
    if (prev && prev.chapter === s.chapter && prev.to != null && s.from != null && s.to != null && prev.to + 1 >= s.from) {
      prev.to = Math.max(prev.to, s.to)
    } else merged.push({ ...s })
  }
  // Whole consecutive chapters read as a chapter range: "Psalms 23-24".
  if (merged.length > 1 && merged.every((s, i) => s.from == null && (i === 0 || s.chapter === merged[i - 1].chapter + 1))) {
    return `${book} ${merged[0].chapter}-${merged[merged.length - 1].chapter}`
  }
  let prevChapter: number | null = null
  const parts = merged.map((s) => {
    let out: string
    if (s.from == null) out = `${s.chapter}`
    else {
      const verses = s.from === s.to ? `${s.from}` : `${s.from}-${s.to}`
      out = prevChapter === s.chapter ? verses : `${s.chapter}:${verses}`
    }
    prevChapter = s.from == null ? null : s.chapter
    return out
  })
  return `${book} ${parts.join(', ')}`
}

export function lookupScripture(input: string): ScriptureResult {
  try {
    const parsed = parseScriptureReference(input)
    if (!parsed.ok) return { ok: false, error: parsed.error }
    const bookData = data()[parsed.bookIndex]
    const book = BIBLE_BOOKS[parsed.bookIndex]
    const single = bookData.chapters.length === 1

    const out: ScriptureVerse[] = []
    const resolved: RefSegment[] = []
    for (const seg of parsed.segments) {
      const verses = bookData.chapters[seg.chapter - 1]
      if (!verses) return { ok: false, error: `${book} has no chapter ${seg.chapter}.` }
      const from = seg.from ?? 1
      const to = Math.min(seg.to ?? verses.length, verses.length)
      if (from > verses.length) return { ok: false, error: `${book} ${seg.chapter} has no verse ${from}.` }
      for (let v = from; v <= to; v++) out.push({ n: v, c: seg.chapter, text: clean(verses[v - 1]) })
      // A whole one-chapter book is written as its verse range so the label is
      // never read back as "verse 1" (A4-N2: a bare number there is a verse).
      resolved.push(seg.from == null && !single ? { chapter: seg.chapter } : { chapter: seg.chapter, from, to })
    }
    if (out.length === 0) return { ok: false, error: `Nothing found for "${input.trim()}".` }
    return { ok: true, reference: formatSegments(book, resolved), book, verses: out }
  } catch (err) {
    console.error('[scripture] lookup failed:', err)
    return { ok: false, error: `Internal error: ${err instanceof Error ? err.message : String(err)}` }
  }
}
