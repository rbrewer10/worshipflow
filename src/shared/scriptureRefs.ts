import { normalizeReference, parseScriptureReference } from './scriptureParse'
import type { ScriptureVerse } from './types'

// Parsing for the multi-passage scripture field.
//
// A Scripture item used to hold exactly one reference, so a reading that
// crossed passages meant one service item per passage — add item, select it,
// type a reference, repeat. This lets a single item carry the whole reading
// ("John 3:16-18; Romans 8:1; Psalm 23") and click through it in order.
//
// Pure and in shared/ because both sides need identical results: the main
// process resolves these into slides, and the editor validates the same string
// as it is typed. Two parsers would eventually disagree, and the operator would
// find out on Sunday.

// Semicolons and newlines separate passages. Commas are deliberately NOT
// separators — "Genesis 1:1, 3" is one reference with a verse list in several
// translations' notation, and splitting it would quietly change the reading.
const SEPARATOR = /[;\n]+/

export function parseReferenceList(input: string): string[] {
  const out: string[] = []
  let book: string | null = null
  let chapterContext: number | null = null
  for (const raw of input.split(SEPARATOR)) {
    const part = raw.trim()
    if (!part) continue
    const spec = normalizeReference(part)
    // QA A5-N2: "John 3:16-18; 5:24" — a passage with no book carries the
    // previous one forward (and its chapter, for a bare verse: "John 3:16; 18").
    if (book && /^\d[\d:,-]*$/.test(spec)) {
      const expanded: string = spec.includes(':') || chapterContext == null ? `${book} ${spec}` : `${book} ${chapterContext}:${spec}`
      out.push(expanded)
      chapterContext = lastChapterContext(expanded) ?? chapterContext
      continue
    }
    out.push(part)
    const parsed = parseScriptureReference(part)
    book = parsed.ok ? parsed.book : null
    chapterContext = parsed.ok ? lastChapterContext(part) : null
  }
  return out
}

/** The chapter a following bare number is a verse of: set by the last "c:v", cleared by a whole chapter. */
function lastChapterContext(reference: string): number | null {
  const spec = /(\d[\d:,-]*)$/.exec(normalizeReference(reference))?.[1] ?? ''
  const last = spec.split(',').pop() ?? ''
  const end = last.split('-').pop() ?? ''
  if (end.includes(':')) return Number(end.split(':')[0])
  // "3:16-18": the range's start sets the chapter; "23" / "23-24": whole chapters, no verse context.
  const start = last.split('-')[0]
  if (start.includes(':')) return Number(start.split(':')[0])
  const parsed = parseScriptureReference(reference)
  if (parsed.ok && parsed.segments.length && parsed.segments[parsed.segments.length - 1].from != null) {
    return parsed.segments[parsed.segments.length - 1].chapter // "John 3:16, 18"
  }
  return null
}

// The single stored string for a list of references. Round-trips with
// parseReferenceList so an item edited and re-saved is unchanged.
export function formatReferenceList(refs: string[]): string {
  return refs.join('; ')
}

// True when the field holds more than one passage — the callers that still
// assume a single reference (window titles, summaries) use this to decide
// whether "John 3:16" or "3 passages" is the honest label.
export function isMultiReference(input: string): boolean {
  return parseReferenceList(input).length > 1
}

/** "John 3" from "John 3:16-18" — the book/chapter part a sub-reference reuses. */
export function bookChapter(reference: string): string | null {
  const match = reference.match(/^(.*?)\s*:\s*\d/)
  return match ? match[1].trim() : null
}

/**
 * "Psalms 100" from "Psalms 100" — a whole-chapter reference (an optional
 * book number, a book name, one chapter number, no verse), else null.
 * Called on the lookup's own normalized reference, so a bare number here is
 * always a chapter (a single-chapter book's verse comes back as "Jude 1:3").
 */
export function wholeChapter(reference: string): string | null {
  const match = reference.trim().match(/^((?:[1-3]\s*)?[a-z][a-z .']*?)\s+(\d+)$/i)
  return match ? `${match[1].trim()} ${match[2]}` : null
}

// "John 3:16-18" + verses 16..17 -> "John 3:16-17". A whole-chapter reference
// is narrowed too: "Psalm 100" + verses 1..3 -> "Psalm 100:1-3". Returning the
// whole chapter for every chunk (the old behaviour) put the entire psalm on
// every slide, so Space looked like it did nothing four times (QA B3-N3).
// Anything else with no chapter:verse shape (a chapter range "Psalm 23-24")
// is left as written.
export function subReference(reference: string, from: number, to: number): string {
  const base = bookChapter(reference) ?? wholeChapter(reference)
  if (!base) return reference
  return from === to ? `${base}:${from}` : `${base}:${from}-${to}`
}

/**
 * The reference for one slide's verses. When the lookup gave chapters (KJV
 * always does; bible-api.com too) the slide is addressed exactly, even across
 * a chapter boundary ("John 3:36-4:2"); otherwise it falls back to narrowing
 * the passage's own reference (subReference).
 */
export function rangeReference(
  result: { reference?: string; book?: string },
  fallbackReference: string,
  range: { from: number; to: number; fromC?: number; toC?: number }
): string {
  if (result.book && range.fromC != null && range.toC != null) {
    if (range.fromC === range.toC) {
      return range.from === range.to ? `${result.book} ${range.fromC}:${range.from}` : `${result.book} ${range.fromC}:${range.from}-${range.to}`
    }
    return `${result.book} ${range.fromC}:${range.from}-${range.toC}:${range.to}`
  }
  return subReference(result.reference ?? fallbackReference, range.from, range.to)
}

/** "16  For God so loved…", or "24:1  The earth is…" when a reading spans chapters. */
export function verseLines(verses: Array<{ n: number; c?: number; text: string }>): string[] {
  if (verses.length === 1) return [verses[0].text]
  const multiChapter = new Set(verses.map((v) => v.c ?? 0)).size > 1
  return verses.map((v) => `${multiChapter && v.c != null ? `${v.c}:` : ''}${v.n}  ${v.text}`)
}

/**
 * One deck slide's verses as the projector, stage and zones show them (QA B5-N5).
 *
 * Deck slides used to join the verse texts with no numbers at all, so a
 * reading showed "35  He that believeth…" on slide 1 only (the flat verse list
 * that is live for a moment before the deck loads) and nothing after it, and
 * nothing marked Psalm 24:1 or John 4:1. Now every verse carries its number,
 * and chapter:verse marks where each slide starts and wherever the chapter
 * changes: "3:35 The Father loveth… 36 He that believeth… 4:1 When therefore…".
 * A reading that is a single verse on a single slide ("John 3:16") stays plain,
 * as verseLines has it.
 */
export function deckVerseText(verses: Array<{ n: number; c?: number; text: string }>, opts: { alone?: boolean } = {}): string {
  if (opts.alone && verses.length === 1) return verses[0].text
  let prevChapter: number | undefined
  return verses
    .map((v, i) => {
      const markChapter = v.c != null && (i === 0 || v.c !== prevChapter)
      prevChapter = v.c
      return `${markChapter ? `${v.c}:` : ''}${v.n} ${v.text}`
    })
    .join(' ')
}

/**
 * A reading as one line per verse, each numbered the way deckVerseText numbers
 * a deck slide that starts on it ("4:35 And the same day…") — so when a
 * one-verse-per-slide deck replaces this list, nothing on screen changes (QA
 * B8-N2). A reading that is a single verse stays plain, as on its deck.
 */
export function numberedVerseLines(verses: ScriptureVerse[]): string[] {
  return verses.map((v) => deckVerseText([v], { alone: verses.length === 1 }))
}
