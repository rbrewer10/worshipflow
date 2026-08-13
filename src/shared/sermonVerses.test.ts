import { describe, it, expect } from 'vitest'
import { buildSermonSlides } from './sermonVerses'

describe('buildSermonSlides', () => {
  it('always starts with the intro slide, no reference or notes', () => {
    const slides = buildSermonSlides('He\'s Alive\nJohn 3:16-22', [], () => ({ ok: false }))
    expect(slides).toEqual([{ text: 'He\'s Alive\nJohn 3:16-22', reference: null, notes: null }])
  })

  it('resolves a verse reference into slide text via the lookup function', () => {
    const lookup = (ref: string) => ref === 'John 3:16'
      ? { ok: true, verses: [{ n: 16, text: 'For God so loved the world...' }] }
      : { ok: false }
    const slides = buildSermonSlides('Intro', [{ reference: 'John 3:16', notes: 'Point one' }], lookup)
    expect(slides).toEqual([
      { text: 'Intro', reference: null, notes: null },
      { text: 'For God so loved the world...', reference: 'John 3:16', notes: 'Point one' }
    ])
  })

  it('joins multiple verses from one reference into a single slide of text', () => {
    const lookup = () => ({
      ok: true,
      verses: [{ n: 16, text: 'Verse sixteen.' }, { n: 17, text: 'Verse seventeen.' }]
    })
    const slides = buildSermonSlides('Intro', [{ reference: 'John 3:16-17', notes: '' }], lookup)
    expect(slides[1].text).toBe('Verse sixteen. Verse seventeen.')
  })

  it('falls back to a readable placeholder when a reference fails to resolve', () => {
    const lookup = () => ({ ok: false })
    const slides = buildSermonSlides('Intro', [{ reference: 'Not A Real Book 1:1', notes: '' }], lookup)
    expect(slides[1].text).toBe("(couldn't find Not A Real Book 1:1)")
  })

  it('falls back to the placeholder when lookup succeeds but returns no verses', () => {
    const lookup = () => ({ ok: true, verses: [] })
    const slides = buildSermonSlides('Intro', [{ reference: 'Empty 1:1', notes: '' }], lookup)
    expect(slides[1].text).toBe("(couldn't find Empty 1:1)")
  })

  it('preserves verse order and keeps notes attached to the right slide', () => {
    const lookup = (ref: string) => ({ ok: true, verses: [{ n: 1, text: ref }] })
    const slides = buildSermonSlides('Intro', [
      { reference: 'A', notes: 'first' },
      { reference: 'B', notes: 'second' }
    ], lookup)
    expect(slides[1]).toEqual({ text: 'A', reference: 'A', notes: 'first' })
    expect(slides[2]).toEqual({ text: 'B', reference: 'B', notes: 'second' })
  })
})
