import { describe, it, expect } from 'vitest'
import { parseSections, sectionsToText } from './songText'
import type { SongFull } from '../../shared/types'

// Helper: wrap parsed sections into a minimal SongFull for sectionsToText round-trips.
function toSongFull(sections: ReturnType<typeof parseSections>): SongFull {
  return {
    id: 1,
    title: 'Test Song',
    author: null,
    background: null,
    ccli: null,
    copyright: null,
    publisher: null,
    sections,
    arrangement: null,
    fontScale: null,
    linesPerSlide: null,
    bgMotion: null,
    textColor: null,
    font: null
  }
}

describe('parseSections', () => {
  it('splits blank-line-separated blocks into sections', () => {
    const text = 'Amazing grace\nhow sweet the sound\n\nThat saved a wretch\nlike me'
    const sections = parseSections(text)
    expect(sections).toHaveLength(2)
    expect(sections[0].lyrics).toBe('Amazing grace\nhow sweet the sound')
    expect(sections[1].lyrics).toBe('That saved a wretch\nlike me')
  })

  it('assigns sequential ordinals starting at 0', () => {
    const text = 'one\n\ntwo\n\nthree'
    const sections = parseSections(text)
    expect(sections.map((s) => s.ordinal)).toEqual([0, 1, 2])
  })

  it('recognizes a known-kind first line as a label and strips it from lyrics', () => {
    const text = 'Chorus\nHoly holy holy\nLord God almighty'
    const sections = parseSections(text)
    expect(sections).toHaveLength(1)
    expect(sections[0].kind).toBe('chorus')
    expect(sections[0].label).toBe('Chorus')
    expect(sections[0].lyrics).toBe('Holy holy holy\nLord God almighty')
  })

  it('recognizes a known-kind label with a trailing number (e.g. "Verse 1")', () => {
    const text = 'Verse 1\nFirst line\nSecond line'
    const sections = parseSections(text)
    expect(sections[0].kind).toBe('verse')
    expect(sections[0].label).toBe('Verse 1')
    expect(sections[0].lyrics).toBe('First line\nSecond line')
  })

  it('treats an unrecognized first line as plain lyrics (kind=verse, label=null)', () => {
    const text = 'Just a line of lyrics\nAnother line'
    const sections = parseSections(text)
    expect(sections[0].kind).toBe('verse')
    expect(sections[0].label).toBeNull()
    expect(sections[0].lyrics).toBe('Just a line of lyrics\nAnother line')
  })

  it('does not treat an overly long first line as a label, even when the word (minus trailing number) matches exactly', () => {
    // "chorus            99" strips to word==="chorus" (an exact KNOWN match), but the
    // untouched first line is 20 chars — past the `first.length <= 14` guard — so it
    // must fall through to plain verse/null rather than being treated as a label.
    const text = 'chorus            99\nSome lyrics here'
    const sections = parseSections(text)
    expect(sections[0].kind).toBe('verse')
    expect(sections[0].label).toBeNull()
    expect(sections[0].lyrics).toBe('chorus            99\nSome lyrics here')
  })

  it('returns an empty array for empty input', () => {
    expect(parseSections('')).toEqual([])
  })

  it('returns an empty array for whitespace-only input', () => {
    expect(parseSections('   \n\n   \n')).toEqual([])
  })

  it('handles a single section with no blank-line separator', () => {
    const text = 'Only one block\nwith two lines'
    const sections = parseSections(text)
    expect(sections).toHaveLength(1)
    expect(sections[0].lyrics).toBe('Only one block\nwith two lines')
  })

  it('trims surrounding whitespace from the whole input and each block', () => {
    const text = '\n\n  Verse text here  \n\n\n  Chorus text here  \n\n'
    const sections = parseSections(text)
    expect(sections).toHaveLength(2)
    expect(sections[0].lyrics).toBe('Verse text here')
    expect(sections[1].lyrics).toBe('Chorus text here')
  })

  it('collapses multiple consecutive blank lines into a single split boundary', () => {
    const text = 'First\n\n\n\n\nSecond'
    const sections = parseSections(text)
    expect(sections).toHaveLength(2)
    expect(sections[0].lyrics).toBe('First')
    expect(sections[1].lyrics).toBe('Second')
  })
})

describe('sectionsToText', () => {
  it('joins sections with blank lines, prefixing label when present', () => {
    const song = toSongFull([
      { kind: 'chorus', label: 'Chorus', ordinal: 0, lyrics: 'Holy holy holy' },
      { kind: 'verse', label: null, ordinal: 1, lyrics: 'Plain verse text' }
    ])
    const text = sectionsToText(song)
    expect(text).toBe('Chorus\nHoly holy holy\n\nPlain verse text')
  })

  it('sorts sections by ordinal before joining, regardless of input order', () => {
    const song = toSongFull([
      { kind: 'verse', label: null, ordinal: 1, lyrics: 'second' },
      { kind: 'verse', label: null, ordinal: 0, lyrics: 'first' }
    ])
    expect(sectionsToText(song)).toBe('first\n\nsecond')
  })

  it('returns empty string for a song with no sections', () => {
    const song = toSongFull([])
    expect(sectionsToText(song)).toBe('')
  })
})

describe('round-trip: parseSections -> sectionsToText', () => {
  it('reproduces the original text for a simple labeled multi-section song', () => {
    const original = 'Verse 1\nFirst line\nSecond line\n\nChorus\nHoly holy holy\nLord God almighty'
    const sections = parseSections(original)
    const roundTripped = sectionsToText(toSongFull(sections))
    expect(roundTripped).toBe(original)
  })

  it('reproduces the original text for unlabeled sections', () => {
    const original = 'Just some lyrics\nacross two lines\n\nAnd a second block\nof lyrics'
    const sections = parseSections(original)
    const roundTripped = sectionsToText(toSongFull(sections))
    expect(roundTripped).toBe(original)
  })

  it('is stable under a second parse/serialize pass (idempotent)', () => {
    const original = 'Verse\nSome lyrics\n\nChorus\nMore lyrics'
    const once = sectionsToText(toSongFull(parseSections(original)))
    const twice = sectionsToText(toSongFull(parseSections(once)))
    expect(twice).toBe(once)
  })
})
