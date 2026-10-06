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

describe('nextPreview — the NEXT line names the next announcement in a block (QA B5-N1)', () => {
  it('leads with the next slide\'s title when it differs from the current one', async () => {
    const { nextPreview } = await import('./liveDisplay')
    expect(nextPreview({ songTitle: 'Potluck Sunday', next: 'Wednesday 7 PM', nextTitle: 'Choir Practice' })).toBe('Choir Practice — Wednesday 7 PM')
    expect(nextPreview({ songTitle: 'Potluck Sunday', next: 'part two', nextTitle: 'Potluck Sunday' })).toBe('part two')
    expect(nextPreview({ songTitle: 'Amazing Grace', next: 'Through many dangers', nextTitle: undefined })).toBe('Through many dangers')
    expect(nextPreview({ songTitle: 'X', next: '', nextTitle: 'Y' })).toBe('')
  })
})
