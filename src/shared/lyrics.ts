// Lyric line normalization.
//
// Some songs are entered (or imported) with a whole verse crammed onto a single
// line, phrases separated only by commas/semicolons. Displayed that way the slide
// overflows. splitLyricLines breaks any over-long line at its natural clause
// punctuation so a verse becomes several short lines — which then group into
// several readable, larger-text slides instead of one oversized block.
//
// It is idempotent: lines already within the target length are left untouched, so
// running it repeatedly (or over an already-well-formatted song) changes nothing.

// Target visual line length. Phrases up to this stay on one line; longer lines are
// broken. Chosen generously so natural worship phrases (~45–55 chars) stay intact.
const TARGET = 50
// A single phrase longer than this (no interior punctuation to break on) is
// word-wrapped as a last resort so nothing stays absurdly long.
const HARD = 64

export function splitLyricLines(lyrics: string): string {
  return lyrics
    .split('\n')
    .flatMap((line) => {
      const trimmed = line.trim()
      // A blank line is a meaningful slide break in the Reflow model — keep it
      // exactly as one blank line rather than running it through splitLine
      // (which would otherwise collapse it away, same as it always has).
      return trimmed === '' ? [''] : splitLine(trimmed)
    })
    .join('\n')
}

function splitLine(line: string): string[] {
  if (line.length <= TARGET) return line ? [line] : []
  // Break after clause punctuation followed by whitespace, keeping the mark with
  // its phrase.
  const phrases = line
    .split(/(?<=[,;:.?!])\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
  // Greedily pack phrases so each output line is as full as possible without
  // exceeding the target, while preserving natural phrase boundaries.
  const out: string[] = []
  let cur = ''
  for (const p of phrases) {
    if (!cur) cur = p
    else if (cur.length + 1 + p.length <= TARGET) cur += ' ' + p
    else {
      out.push(cur)
      cur = p
    }
  }
  if (cur) out.push(cur)
  // A lone phrase with no interior punctuation may still exceed HARD — wrap on words.
  return out.flatMap((seg) => (seg.length <= HARD ? [seg] : wrapWords(seg)))
}

function wrapWords(seg: string): string[] {
  const words = seg.split(/\s+/)
  const out: string[] = []
  let cur = ''
  for (const w of words) {
    if (!cur) cur = w
    else if (cur.length + 1 + w.length <= TARGET) cur += ' ' + w
    else {
      out.push(cur)
      cur = w
    }
  }
  if (cur) out.push(cur)
  return out
}
