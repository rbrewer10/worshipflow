// A sermon's live "deck": an intro slide followed by one slide per verse the
// pastor preaches through, each carrying his own notes. Kept pure (a lookup
// function is passed in, never imported) so it's testable without Electron —
// see the matching comment convention in src/main/backgroundFolders.ts.

export interface SermonVerse {
  reference: string
  notes: string
}

export interface SermonSlide {
  text: string
  reference: string | null
  notes: string | null
}

export interface ScriptureLookupResult {
  ok: boolean
  verses?: { n: number; text: string }[]
}

export function buildSermonSlides(
  introLine: string,
  verses: SermonVerse[],
  lookup: (reference: string) => ScriptureLookupResult
): SermonSlide[] {
  const slides: SermonSlide[] = [{ text: introLine, reference: null, notes: null }]
  for (const verse of verses) {
    const result = lookup(verse.reference)
    const text = result.ok && result.verses && result.verses.length > 0
      ? result.verses.map((v) => v.text).join(' ')
      : `(couldn't find ${verse.reference})`
    slides.push({ text, reference: verse.reference, notes: verse.notes })
  }
  return slides
}
