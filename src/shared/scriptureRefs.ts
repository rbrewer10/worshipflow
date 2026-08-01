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
