import { describe, it, expect } from 'vitest'
import { audienceKind, textCardSlides, tickerLine } from './liveDisplay'

describe('audienceKind (QA A-C1: untitled text slides must not render as a ticker)', () => {
  it('an untitled / PowerPoint-imported text slide is a normal lyric slide', () => {
    expect(audienceKind({ mode: 'lyrics' })).toBe('lyrics')
    expect(audienceKind({ mode: 'lyrics', isTicker: false })).toBe('lyrics')
  })
  it('only an explicitly flagged ticker announcement renders as a ticker', () => {
    expect(audienceKind({ mode: 'lyrics', isTicker: true })).toBe('ticker')
  })
  it('countdown and announcement modes are unaffected', () => {
    expect(audienceKind({ mode: 'countdown', isTicker: true })).toBe('countdown')
    expect(audienceKind({ mode: 'announcement' })).toBe('announcement')
    expect(audienceKind({ mode: 'black' })).toBe('other')
  })
})

describe('textCardSlides', () => {
  it('untitled card: one slide per paragraph, no "Announcement" title slide', () => {
    expect(textCardSlides('', 'Welcome to Snow Hill Church\n\nPlease silence your phones')).toEqual([
      'Welcome to Snow Hill Church',
      'Please silence your phones'
    ])
  })
  it('titled card: title slide first', () => {
    expect(textCardSlides('Welcome', 'Line one\n\nLine two')).toEqual(['Welcome', 'Line one', 'Line two'])
  })
  it('empty card still has one (blank) slide', () => {
    expect(textCardSlides('', '')).toEqual([''])
  })
})

describe('tickerLine (QA A-H2: the ticker scrolls the body, not the word "Announcement")', () => {
  it('collapses the body to one line', () => {
    expect(tickerLine('Potluck after service!\n\nBring a dish.')).toBe('Potluck after service! Bring a dish.')
  })
})
