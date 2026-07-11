// Chord notation parsing and rendering utilities

export interface ChordLine {
  chords: Array<{ pos: number; chord: string }> // chord symbols at each position
  lyrics: string                                  // the actual lyrics line
}

// Parse a line that may contain chords in brackets
// Format: "[G] Amazing [D] grace"
export function parseChordLine(text: string): ChordLine {
  const chords: Array<{ pos: number; chord: string }> = []
  let lyrics = ''
  let currentChordPos = 0

  // Match pattern: [CHORD] or just lyrics
  const pattern = /\[([^\]]+)\]|([^\[\n]+)/g
  let match

  while ((match = pattern.exec(text)) !== null) {
    if (match[1]) {
      // This is a chord
      chords.push({ pos: currentChordPos, chord: match[1] })
    } else if (match[2]) {
      // This is lyrics
      const lyricPart = match[2]
      lyrics += lyricPart
      currentChordPos += lyricPart.length
    }
  }

  return { chords, lyrics: lyrics.trim() }
}

// Format chords for display: convert "[G]" format to displayable format
export function extractChords(text: string): { line: string; chords: Array<{ pos: number; chord: string }> } {
  const chords: Array<{ pos: number; chord: string }> = []
  let line = text
  let offset = 0

  // Find all [CHORD] patterns
  const chordPattern = /\[([^\]]+)\]/g
  let match

  while ((match = chordPattern.exec(text)) !== null) {
    chords.push({ pos: match.index - offset, chord: match[1] })
    offset += match[0].length
    line = line.replace(match[0], '')
  }

  // Trimming shifts every remaining character left by however much leading
  // whitespace is removed — chord positions must shift by the same amount or
  // they desync from the lyric text actually returned.
  const leadingWhitespace = line.length - line.trimStart().length
  const trimmedChords = chords.map((c) => ({ ...c, pos: Math.max(0, c.pos - leadingWhitespace) }))

  return { line: line.trim(), chords: trimmedChords }
}

// Render lyrics with chord annotations above
export function renderChordsWithLyrics(
  line: string,
  chords: Array<{ pos: number; chord: string }>
): Array<{ type: 'chord' | 'lyric'; content: string; pos: number }> {
  if (chords.length === 0) {
    return [{ type: 'lyric', content: line, pos: 0 }]
  }

  const result: Array<{ type: 'chord' | 'lyric'; content: string; pos: number }> = []
  let lastPos = 0

  // Sort chords by position
  const sortedChords = [...chords].sort((a, b) => a.pos - b.pos)

  for (const chordInfo of sortedChords) {
    // Add lyrics before this chord
    if (chordInfo.pos > lastPos) {
      result.push({
        type: 'lyric',
        content: line.substring(lastPos, chordInfo.pos),
        pos: lastPos
      })
    }

    // Add the chord
    result.push({
      type: 'chord',
      content: chordInfo.chord,
      pos: chordInfo.pos
    })

    lastPos = chordInfo.pos
  }

  // Add remaining lyrics
  if (lastPos < line.length) {
    result.push({
      type: 'lyric',
      content: line.substring(lastPos),
      pos: lastPos
    })
  }

  return result
}

// Chromatic scale using the spelling convention common on worship/lead-sheet
// chord charts (sharps for C#/F#, flats for Eb/Ab/Bb — matches Nashville Number
// System charts) so transposed output looks like something a musician wrote.
const CHROMATIC = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

const NOTE_TO_INDEX: Record<string, number> = {
  C: 0, 'B#': 0,
  'C#': 1, Db: 1,
  D: 2,
  'D#': 3, Eb: 3,
  E: 4, Fb: 4,
  'E#': 5, F: 5,
  'F#': 6, Gb: 6,
  G: 7,
  'G#': 8, Ab: 8,
  A: 9,
  'A#': 10, Bb: 10,
  B: 11, Cb: 11
}

const ROOT_NOTE_RE = /^([A-Ga-g])([#b]?)/

// Guards transposition: the app's [..] bracket syntax is also used for non-chord
// annotations typed directly into the lyrics textarea (e.g. "[Capo 2]", "[Bridge]",
// "[Chorus]") — without this, transposeChord would treat their leading letter as a
// root note and mangle the rest ("Capo 2" -> "C#apo 2"). Only bracket contents that
// are actually shaped like a chord symbol get transposed; everything else passes
// through untouched.
const CHORD_SHAPE_RE = /^[A-Ga-g][#b]?(?:maj|min|dim|aug|sus|add|m)?\d{0,2}(?:[#b]\d{1,2})*(?:\/[A-Ga-g][#b]?)?$/

// Shift one root-note part (letter + optional accidental) by N semitones.
// Anything after the note (chord quality suffix like "m7", "sus4") is left
// untouched and re-appended by the caller.
function transposeRootPart(part: string, semitones: number): string {
  const match = part.match(ROOT_NOTE_RE)
  if (!match) return part
  const noteKey = match[1].toUpperCase() + match[2]
  const index = NOTE_TO_INDEX[noteKey]
  if (index == null) return part
  const shifted = ((index + semitones) % 12 + 12) % 12
  return CHROMATIC[shifted] + part.slice(match[0].length)
}

// Transpose a single chord symbol by N semitones, e.g. "G" -> "A", "F#m7" -> "G#m7".
// Handles slash chords ("G/B" -> "A/C#") by transposing both notes. Leaves anything
// that isn't shaped like a chord (section labels, "Capo 2", etc.) untouched.
export function transposeChord(chord: string, semitones: number): string {
  if (semitones === 0) return chord
  if (!CHORD_SHAPE_RE.test(chord.trim())) return chord
  const slashIndex = chord.indexOf('/')
  if (slashIndex === -1) return transposeRootPart(chord, semitones)
  const root = chord.slice(0, slashIndex)
  const bass = chord.slice(slashIndex + 1)
  return `${transposeRootPart(root, semitones)}/${transposeRootPart(bass, semitones)}`
}

// Transpose every [Chord] in a full lyrics blob (the app's inline bracket
// notation) by N semitones, leaving the lyric text untouched.
export function transposeLyrics(lyrics: string, semitones: number): string {
  if (semitones === 0) return lyrics
  return lyrics.replace(/\[([^\]]+)\]/g, (_all, chord: string) => `[${transposeChord(chord, semitones)}]`)
}

// Common chord patterns for chord suggestion
export const COMMON_CHORDS = [
  'C', 'Cm', 'C7', 'Cmaj7', 'Cm7',
  'D', 'Dm', 'D7', 'Dmaj7', 'Dm7',
  'E', 'Em', 'E7', 'Emaj7', 'Em7',
  'F', 'Fm', 'F7', 'Fmaj7', 'Fm7',
  'G', 'Gm', 'G7', 'Gmaj7', 'Gm7',
  'A', 'Am', 'A7', 'Amaj7', 'Am7',
  'B', 'Bm', 'B7', 'Bmaj7', 'Bm7',
  'Bb', 'Bbm', 'Bb7', 'Bbmaj7',
  'Eb', 'Ebm', 'Eb7', 'Ebmaj7',
  'Ab', 'Abm', 'Ab7', 'Abmaj7',
  'Db', 'Dbm', 'Db7', 'Dbmaj7',
  'Gb', 'Gbm', 'Gb7', 'Gbmaj7',
  'F#', 'F#m', 'F#7', 'F#maj7',
  'C#', 'C#m', 'C#7', 'C#maj7',
  'G#', 'G#m', 'G#7', 'G#maj7',
  'A#', 'A#m', 'A#7', 'A#maj7',
  'D#', 'D#m', 'D#7', 'D#maj7',
  'E#', 'E#m',
]

// Validate if a string is a valid chord
export function isValidChord(text: string): boolean {
  const normalized = text.trim().toUpperCase()
  return COMMON_CHORDS.some((chord) => chord.toUpperCase() === normalized)
}

// Format chord for display (capitalize, clean up)
export function formatChord(chord: string): string {
  return chord.trim().toUpperCase()
}
