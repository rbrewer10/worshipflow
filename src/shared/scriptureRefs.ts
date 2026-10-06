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
  return input
    .split(SEPARATOR)
    .map((ref) => ref.trim())
    .filter((ref) => ref.length > 0)
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
