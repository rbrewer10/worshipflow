/**
 * Which deck slide shows verse `verseIndex` (0-based) of a reading, given how
 * many new verses each slide shows. Used when a scripture item's deck lands
 * after the operator already moved through the one-line-per-verse list that
 * was on screen while it loaded (QA retest8): the deck keeps their place
 * instead of jumping back to slide 1.
 *
 * Past the end it stays on the last slide with verses; a deck with no verse
 * counts at all (nothing resolved) starts at slide 1, as it always did.
 */
export function deckIndexForVerse(versesPerSlide: number[], verseIndex: number): number {
  if (verseIndex <= 0) return 0
  let seen = 0
  let lastWithVerses = 0
  for (let i = 0; i < versesPerSlide.length; i++) {
    const n = versesPerSlide[i] ?? 0
    if (n <= 0) continue
    seen += n
    lastWithVerses = i
    if (verseIndex < seen) return i
  }
  return lastWithVerses
}
