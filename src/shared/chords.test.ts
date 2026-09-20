import { describe, it, expect } from 'vitest'
import { hasChords, stripChords, formatChordLyric } from './chords'

describe('chords', () => {
  it('strips ChordPro markers for the congregation', () => {
    expect(stripChords('[G]Amazing [C]grace')).toBe('Amazing grace')
    expect(hasChords('[G]Amazing')).toBe(true)
    expect(hasChords('Amazing grace')).toBe(false)
  })

  it('builds a stage chord line above the words', () => {
    const { chordLine, lyricLine } = formatChordLyric('[G]Amazing [C]grace')
    expect(lyricLine).toBe('Amazing grace')
    expect(chordLine.startsWith('G')).toBe(true)
    expect(chordLine).toContain('C')
  })
})
