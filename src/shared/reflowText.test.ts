import { describe, it, expect } from 'vitest'
import {
  parseReflowText, sectionsToReflowText, reflowSlidesForSection,
  computeReflowSlides, reflowSlideTexts, autoBreakPastedText
} from './reflowText'
import type { SongSection } from './types'

describe('parseReflowText', () => {
  it('recognizes a known-kind label line and starts a new section', () => {
    const sections = parseReflowText('Chorus\nHoly holy holy\nLord God almighty')
    expect(sections).toHaveLength(1)
    expect(sections[0].kind).toBe('chorus')
    expect(sections[0].label).toBe('Chorus')
    expect(sections[0].lyrics).toBe('Holy holy holy\nLord God almighty')
  })

  it('recognizes a known-kind label with a trailing number (e.g. "Verse 1")', () => {
    const sections = parseReflowText('Verse 1\nFirst line\nSecond line')
    expect(sections[0].kind).toBe('verse')
    expect(sections[0].label).toBe('Verse 1')
    expect(sections[0].lyrics).toBe('First line\nSecond line')
  })

  it('treats an unrecognized leading block as plain lyrics (kind=verse, label=null)', () => {
    const sections = parseReflowText('Just a line of lyrics\nAnother line')
    expect(sections[0].kind).toBe('verse')
    expect(sections[0].label).toBeNull()
    expect(sections[0].lyrics).toBe('Just a line of lyrics\nAnother line')
  })

  it('does not treat an overly long line as a label, even when the word (minus trailing number) matches exactly', () => {
    const sections = parseReflowText('chorus            99\nSome lyrics here')
    expect(sections[0].kind).toBe('verse')
    expect(sections[0].label).toBeNull()
    expect(sections[0].lyrics).toBe('chorus            99\nSome lyrics here')
  })

  it('a blank line does NOT start a new section — it stays inside the current section as a slide break', () => {
    const sections = parseReflowText('Verse 1\nFirst line\n\nSecond slide, same verse')
    expect(sections).toHaveLength(1)
    expect(sections[0].lyrics).toBe('First line\n\nSecond slide, same verse')
  })

  it('only a label line starts a new section, even after several blank lines', () => {
    const sections = parseReflowText('First line\n\n\n\nChorus\nHoly holy holy')
    expect(sections).toHaveLength(2)
    expect(sections[0].label).toBeNull()
    expect(sections[0].lyrics).toBe('First line')
    expect(sections[1].label).toBe('Chorus')
    expect(sections[1].lyrics).toBe('Holy holy holy')
  })

  it('assigns sequential ordinals starting at 0', () => {
    const sections = parseReflowText('Verse 1\none\n\nChorus\ntwo\n\nBridge\nthree')
    expect(sections.map((s) => s.ordinal)).toEqual([0, 1, 2])
  })

  it('trims leading and trailing blank lines from a section, but keeps internal ones', () => {
    const sections = parseReflowText('Verse\n\n\nFirst line\n\nSecond slide\n\n\n')
    expect(sections[0].lyrics).toBe('First line\n\nSecond slide')
  })

  it('returns an empty array for empty input', () => {
    expect(parseReflowText('')).toEqual([])
  })

  it('returns an empty array for whitespace-only input', () => {
    expect(parseReflowText('   \n\n   \n')).toEqual([])
  })

  it('creates an empty-lyrics section for a label with nothing after it before the next label', () => {
    const sections = parseReflowText('Chorus\n\nVerse 1\nSomething')
    expect(sections).toHaveLength(2)
    expect(sections[0].label).toBe('Chorus')
    expect(sections[0].lyrics).toBe('')
    expect(sections[1].label).toBe('Verse 1')
  })
})

describe('sectionsToReflowText', () => {
  it('always emits an explicit label line, computing a default when label is null', () => {
    const sections: SongSection[] = [
      { kind: 'verse', label: null, ordinal: 0, lyrics: 'Plain verse text' }
    ]
    expect(sectionsToReflowText(sections)).toBe('Verse\nPlain verse text')
  })

  it('numbers a computed label only when there is more than one section of that kind', () => {
    const sections: SongSection[] = [
      { kind: 'verse', label: null, ordinal: 0, lyrics: 'first' },
      { kind: 'verse', label: null, ordinal: 1, lyrics: 'second' }
    ]
    expect(sectionsToReflowText(sections)).toBe('Verse 1\nfirst\n\nVerse 2\nsecond')
  })

  it('uses the explicit label when one is set, ignoring the computed default', () => {
    const sections: SongSection[] = [
      { kind: 'chorus', label: 'Chorus', ordinal: 0, lyrics: 'Holy holy holy' }
    ]
    expect(sectionsToReflowText(sections)).toBe('Chorus\nHoly holy holy')
  })

  it('never synthesizes a label that collides with an explicit label already in use', () => {
    const sections: SongSection[] = [
      { kind: 'verse', label: null, ordinal: 0, lyrics: 'Some intro lyrics without a label' },
      { kind: 'verse', label: 'Verse 1', ordinal: 1, lyrics: 'More lyrics' }
    ]
    expect(sectionsToReflowText(sections)).toBe(
      'Verse 2\nSome intro lyrics without a label\n\nVerse 1\nMore lyrics'
    )
  })

  it('sorts sections by ordinal before joining, regardless of input order', () => {
    const sections: SongSection[] = [
      { kind: 'verse', label: 'Verse 2', ordinal: 1, lyrics: 'second' },
      { kind: 'verse', label: 'Verse 1', ordinal: 0, lyrics: 'first' }
    ]
    expect(sectionsToReflowText(sections)).toBe('Verse 1\nfirst\n\nVerse 2\nsecond')
  })

  it('returns empty string for no sections', () => {
    expect(sectionsToReflowText([])).toBe('')
  })
})

describe('round-trip: parseReflowText -> sectionsToReflowText', () => {
  it('reproduces the original text when every section already has an explicit label', () => {
    const original = 'Verse 1\nFirst line\nSecond line\n\nChorus\nHoly holy holy\nLord God almighty'
    const sections = parseReflowText(original)
    expect(sectionsToReflowText(sections)).toBe(original)
  })

  it('is stable under a second parse/serialize pass (idempotent) even for an unlabeled section', () => {
    const original = 'Just some lyrics\nacross two lines'
    const once = sectionsToReflowText(parseReflowText(original))
    const twice = sectionsToReflowText(parseReflowText(once))
    expect(twice).toBe(once)
  })

  it('preserves an internal slide-break blank line across a full round-trip', () => {
    const original = 'Verse\nFirst slide\n\nSecond slide'
    const sections = parseReflowText(original)
    expect(sectionsToReflowText(sections)).toBe(original)
  })
})

describe('reflowSlidesForSection', () => {
  it('returns the whole lyrics as one slide when there are no blank lines', () => {
    expect(reflowSlidesForSection('line one\nline two')).toEqual(['line one\nline two'])
  })

  it('splits into multiple slides on a blank line', () => {
    expect(reflowSlidesForSection('slide one\n\nslide two')).toEqual(['slide one', 'slide two'])
  })

  it('collapses multiple consecutive blank lines into a single break', () => {
    expect(reflowSlidesForSection('slide one\n\n\n\nslide two')).toEqual(['slide one', 'slide two'])
  })

  it('ignores leading and trailing blank lines', () => {
    expect(reflowSlidesForSection('\n\nslide one\n\nslide two\n\n')).toEqual(['slide one', 'slide two'])
  })

  it('returns an empty array for empty lyrics', () => {
    expect(reflowSlidesForSection('')).toEqual([])
  })
})

describe('computeReflowSlides', () => {
  it('produces one slide per section when there are no internal blank lines', () => {
    const sections: SongSection[] = [
      { kind: 'verse', label: 'Verse 1', ordinal: 0, lyrics: 'a\nb' },
      { kind: 'chorus', label: 'Chorus', ordinal: 1, lyrics: 'c\nd' }
    ]
    const slides = computeReflowSlides(sections, null)
    expect(slides.map((s) => s.text)).toEqual(['a\nb', 'c\nd'])
    expect(slides.map((s) => s.sectionLabel)).toEqual(['Verse 1', 'Chorus'])
  })

  it('produces multiple slides for a section with internal blank lines', () => {
    const sections: SongSection[] = [
      { kind: 'verse', label: 'Verse 1', ordinal: 0, lyrics: 'a\nb\n\nc\nd' }
    ]
    const slides = computeReflowSlides(sections, null)
    expect(slides.map((s) => s.text)).toEqual(['a\nb', 'c\nd'])
    expect(slides.every((s) => s.sectionLabel === 'Verse 1')).toBe(true)
  })

  it('applies arrangement to reorder sections before computing slides', () => {
    const sections: SongSection[] = [
      { kind: 'verse', label: 'Verse 1', ordinal: 0, lyrics: 'first' },
      { kind: 'chorus', label: 'Chorus', ordinal: 1, lyrics: 'second' }
    ]
    const slides = computeReflowSlides(sections, [1, 0])
    expect(slides.map((s) => s.text)).toEqual(['second', 'first'])
  })

  it('computes a default label when a section has none, numbering only when needed', () => {
    const sections: SongSection[] = [
      { kind: 'verse', label: null, ordinal: 0, lyrics: 'a' },
      { kind: 'verse', label: null, ordinal: 1, lyrics: 'b' }
    ]
    const slides = computeReflowSlides(sections, null)
    expect(slides.map((s) => s.sectionLabel)).toEqual(['Verse 1', 'Verse 2'])
  })

  it('never synthesizes a label that collides with an explicit label already in use', () => {
    const sections: SongSection[] = [
      { kind: 'verse', label: null, ordinal: 0, lyrics: 'Some intro lyrics without a label' },
      { kind: 'verse', label: 'Verse 1', ordinal: 1, lyrics: 'More lyrics' }
    ]
    const slides = computeReflowSlides(sections, null)
    expect(slides.map((s) => s.sectionLabel)).toEqual(['Verse 2', 'Verse 1'])
  })

  it('returns an empty array for no sections', () => {
    expect(computeReflowSlides([], null)).toEqual([])
  })
})

describe('reflowSlideTexts', () => {
  it('returns just the slide text strings, in order', () => {
    const sections: SongSection[] = [
      { kind: 'verse', label: 'Verse 1', ordinal: 0, lyrics: 'a\n\nb' }
    ]
    expect(reflowSlideTexts(sections, null)).toEqual(['a', 'b'])
  })
})

describe('autoBreakPastedText', () => {
  it('inserts a blank line every 2 non-blank lines when the pasted text has none yet', () => {
    const pasted = 'line one\nline two\nline three\nline four'
    expect(autoBreakPastedText(pasted)).toBe('line one\nline two\n\nline three\nline four')
  })

  it('leaves text with an odd number of lines with a shorter final group', () => {
    const pasted = 'one\ntwo\nthree'
    expect(autoBreakPastedText(pasted)).toBe('one\ntwo\n\nthree')
  })

  it('does not touch text that already contains a blank line', () => {
    const pasted = 'one\ntwo\n\nthree\nfour'
    expect(autoBreakPastedText(pasted)).toBe(pasted)
  })

  it('leaves short pastes (2 lines or fewer) untouched', () => {
    expect(autoBreakPastedText('one\ntwo')).toBe('one\ntwo')
  })

  it('leaves a single-line paste untouched', () => {
    expect(autoBreakPastedText('just one line')).toBe('just one line')
  })
})
