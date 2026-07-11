import { describe, it, expect } from 'vitest'
import {
  parseChordLine,
  extractChords,
  renderChordsWithLyrics,
  isValidChord,
  formatChord,
  transposeChord,
  transposeLyrics
} from './chordUtils'

describe('extractChords', () => {
  it('extracts a single chord and its lyric position', () => {
    const { line, chords } = extractChords('[G]Amazing grace')
    expect(line).toBe('Amazing grace')
    expect(chords).toEqual([{ pos: 0, chord: 'G' }])
  })

  it('extracts multiple distinct chords at correct lyric-relative positions', () => {
    const { line, chords } = extractChords('[G]Amazing [D]grace how [Em]sweet')
    expect(line).toBe('Amazing grace how sweet')
    expect(chords).toEqual([
      { pos: 0, chord: 'G' },
      { pos: 8, chord: 'D' },
      { pos: 18, chord: 'Em' }
    ])
  })

  it('returns no chords and the original (trimmed) text when there are no brackets', () => {
    const { line, chords } = extractChords('just plain lyrics')
    expect(line).toBe('just plain lyrics')
    expect(chords).toEqual([])
  })

  it('handles a chord with nothing after it (trailing chord marker)', () => {
    const { line, chords } = extractChords('word[G]')
    expect(line).toBe('word')
    expect(chords).toEqual([{ pos: 4, chord: 'G' }])
  })

  // --- Repeated-chord position tracking ---
  //
  // Regression tests for a fixed bug: extractChords() used to compute each chord's
  // `pos` against the untrimmed intermediate `line`, but returned `line.trim()` —
  // when the untrimmed line had leading whitespace, trim() shifted every character's
  // real index left, desyncing every reported `pos` from the line actually returned.
  // Fixed by subtracting the trimmed leading-whitespace length from every chord pos.
  it('keeps chord position aligned with the trimmed line when input has leading whitespace', () => {
    // Input starts with a literal space, then a chord, then lyrics.
    const { line, chords } = extractChords(' [G]word')

    // After trimming, "word" starts at index 0, so the chord (which sits immediately
    // before "word") should be reported at pos 0.
    expect(line).toBe('word')
    expect(chords).toEqual([{ pos: 0, chord: 'G' }])
  })

  it('keeps repeated identical chords aligned when combined with leading whitespace', () => {
    const { line, chords } = extractChords('  [G]word[G]word')

    // Trimmed line is "wordword" (8 chars). First chord sits at position 0 (before
    // the first "word"), second at position 4 (before the second).
    expect(line).toBe('wordword')
    expect(chords).toEqual([
      { pos: 0, chord: 'G' },
      { pos: 4, chord: 'G' }
    ])
  })

  it('does not corrupt positions for repeated identical chords when there is no leading whitespace', () => {
    // Sanity check: the specific "[G]word[G]word" shape called out for review does NOT
    // actually mis-track positions on its own (String.replace always removes the
    // leftmost remaining occurrence, which — since matches are processed in left-to-right
    // order — is always the occurrence currently being processed). The real bug is the
    // leading-whitespace/trim() desync documented above, not repetition by itself.
    const { line, chords } = extractChords('[G]word[G]word')
    expect(line).toBe('wordword')
    expect(chords).toEqual([
      { pos: 0, chord: 'G' },
      { pos: 4, chord: 'G' }
    ])
  })
})

describe('parseChordLine', () => {
  it('parses inline chord/lyric pairs into positions and combined lyrics', () => {
    const { chords, lyrics } = parseChordLine('[G] Amazing [D] grace')
    expect(lyrics).toBe('Amazing  grace')
    expect(chords).toEqual([
      { pos: 0, chord: 'G' },
      { pos: 9, chord: 'D' }
    ])
  })

  it('returns empty chords for lyric-only text', () => {
    const { chords, lyrics } = parseChordLine('no chords in this line')
    expect(chords).toEqual([])
    expect(lyrics).toBe('no chords in this line')
  })
})

describe('renderChordsWithLyrics', () => {
  it('returns a single lyric segment when there are no chords', () => {
    const result = renderChordsWithLyrics('plain lyrics', [])
    expect(result).toEqual([{ type: 'lyric', content: 'plain lyrics', pos: 0 }])
  })

  it('interleaves chord and lyric segments in position order', () => {
    const result = renderChordsWithLyrics('Amazing grace', [
      { pos: 0, chord: 'G' },
      { pos: 8, chord: 'D' }
    ])
    expect(result).toEqual([
      { type: 'chord', content: 'G', pos: 0 },
      { type: 'lyric', content: 'Amazing ', pos: 0 },
      { type: 'chord', content: 'D', pos: 8 },
      { type: 'lyric', content: 'grace', pos: 8 }
    ])
  })

  it('sorts out-of-order chords by position before rendering', () => {
    const result = renderChordsWithLyrics('Amazing grace', [
      { pos: 8, chord: 'D' },
      { pos: 0, chord: 'G' }
    ])
    expect(result[0]).toEqual({ type: 'chord', content: 'G', pos: 0 })
  })
})

describe('isValidChord', () => {
  it('accepts a chord from the common chord list regardless of case', () => {
    expect(isValidChord('g')).toBe(true)
    expect(isValidChord('Gm7')).toBe(true)
    expect(isValidChord('F#')).toBe(true)
  })

  it('rejects a string that is not a known chord', () => {
    expect(isValidChord('Xyz')).toBe(false)
    expect(isValidChord('')).toBe(false)
  })
})

describe('formatChord', () => {
  it('trims and uppercases the chord text', () => {
    expect(formatChord('  gm7 ')).toBe('GM7')
  })
})

describe('transposeChord', () => {
  it('shifts a plain root note by N semitones', () => {
    // The app's chromatic spelling table uses flats at this scale degree.
    expect(transposeChord('G', 1)).toBe('Ab')
  })

  it('preserves a chord quality suffix while shifting the root', () => {
    expect(transposeChord('Am7', 2)).toBe('Bm7')
  })

  it('shifts both notes of a slash chord independently', () => {
    expect(transposeChord('G/B', 1)).toBe('Ab/C')
  })

  it('returns to the exact original spelling on a round trip', () => {
    expect(transposeChord(transposeChord('F#', 3), -3)).toBe('F#')
  })

  it('returns the chord unchanged when semitones is 0', () => {
    expect(transposeChord('Dm', 5)).not.toBe('Dm')
    expect(transposeChord('Dm', 0)).toBe('Dm')
  })

  // --- Regression: non-chord bracket annotations must not be mangled ---
  //
  // The app's [..] bracket syntax is shared by real chords AND free-text
  // annotations typed directly into the lyrics textarea (capo notes, section
  // labels). Before the CHORD_SHAPE_RE guard, transposeChord treated any
  // leading A-G letter as a root note and mangled the rest of the string.
  it('leaves a capo annotation untouched instead of treating its leading letter as a root note', () => {
    expect(transposeChord('Capo 2', 1)).toBe('Capo 2')
  })

  it('leaves common section-label annotations untouched', () => {
    for (const label of ['Bridge', 'Chorus', 'Fade', 'Drums in', 'Ad-lib', 'Guitar solo', 'End']) {
      expect(transposeChord(label, 1)).toBe(label)
    }
  })

  it('leaves a "no chord" marker untouched', () => {
    expect(transposeChord('N.C.', 1)).toBe('N.C.')
  })
})

describe('transposeLyrics', () => {
  it('transposes every bracketed chord in a lyrics blob', () => {
    expect(transposeLyrics('[G]Amazing [D]grace', 1)).toBe('[Ab]Amazing [Eb]grace')
  })

  it('transposes real chords while leaving a mixed-in capo annotation intact', () => {
    const input = '[Capo 2] [G]Amazing [D]grace'
    expect(transposeLyrics(input, 1)).toBe('[Capo 2] [Ab]Amazing [Eb]grace')
  })

  it('passes empty or whitespace-only lyrics through unchanged', () => {
    expect(transposeLyrics('', 1)).toBe('')
    expect(transposeLyrics('   ', 1)).toBe('   ')
  })

  it('passes lyrics with no chords through unchanged', () => {
    expect(transposeLyrics('just plain words', 1)).toBe('just plain words')
  })
})
