// Auto-fit splitting for zone decks. Pure: no I/O, no Electron.
//
// The rule that matters is what we never do — never split a verse, never split a
// sentence. A screen holding half a thought reads worse than a screen holding
// slightly too much, so a unit longer than the budget gets its own slide rather
// than being cut.

import type { ScriptureVerse } from './types'

export interface VerseRange {
  from: number
  to: number
}

/** Group whole verses into ranges that fit `budget` characters. */
export function chunkVerses(verses: ScriptureVerse[], budget: number): VerseRange[] {
  const out: VerseRange[] = []
  let start: ScriptureVerse | null = null
  let end: ScriptureVerse | null = null
  let length = 0

  const flush = (): void => {
    if (start && end) out.push({ from: start.n, to: end.n })
    start = null
    end = null
    length = 0
  }

  for (const verse of verses) {
    const size = verse.text.length
    // Start a new chunk when this verse would overflow the current one. An
    // over-long verse lands alone because the chunk before it is flushed and the
    // one after it overflows immediately.
    if (start && length + size > budget) flush()
    if (!start) start = verse
    end = verse
    length += size
  }
  flush()
  return out
}

const SENTENCE_END = /(?<=[.!?])\s+/

/** Split prose into chunks that fit `budget`, breaking at paragraphs then sentences. */
export function chunkProse(text: string, budget: number): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const out: string[] = []

  for (const paragraph of paragraphs) {
    if (paragraph.length <= budget) {
      out.push(paragraph)
      continue
    }
    let current = ''
    for (const sentence of paragraph.split(SENTENCE_END)) {
      const piece = sentence.trim()
      if (!piece) continue
      if (current && current.length + 1 + piece.length > budget) {
        out.push(current)
        current = piece
      } else {
        current = current ? `${current} ${piece}` : piece
      }
    }
    if (current) out.push(current)
  }
  return out
}
