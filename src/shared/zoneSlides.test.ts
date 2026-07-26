import { describe, it, expect } from 'vitest'
import { parseZoneSlides, validateZoneSlides, resolveSlot, slideSummary } from './zoneSlides'
import type { ZoneSlide } from './zoneSlides'

const deck: ZoneSlide[] = [
  { zones: { 1: { kind: 'text', text: 'He Is Risen' }, 2: { kind: 'scripture', reference: 'John 3:16' }, 3: { kind: 'logo' }, 4: { kind: 'black' } } },
  { zones: { 1: { kind: 'same' }, 2: { kind: 'scripture', reference: 'John 3:17' }, 3: { kind: 'same' }, 4: { kind: 'black' } } },
  { zones: { 1: { kind: 'same' }, 2: { kind: 'slide', index: 2 }, 3: { kind: 'same' }, 4: { kind: 'black' } } },
]

const source = ['verse one', 'verse two', 'verse three']

describe('resolveSlot', () => {
  it('returns the slot directly when it is not "same"', () => {
    expect(resolveSlot(deck, 0, 1)).toEqual({ kind: 'text', text: 'He Is Risen' })
    expect(resolveSlot(deck, 1, 2)).toEqual({ kind: 'scripture', reference: 'John 3:17' })
    expect(resolveSlot(deck, 2, 2)).toEqual({ kind: 'slide', index: 2 })
  })
  it('walks "same" back across several slides to the originating slot', () => {
    expect(resolveSlot(deck, 2, 1)).toEqual({ kind: 'text', text: 'He Is Risen' })
    expect(resolveSlot(deck, 2, 3)).toEqual({ kind: 'logo' })
  })
  it('resolves each zone independently at the same index', () => {
    expect(resolveSlot(deck, 1, 1)).toEqual({ kind: 'text', text: 'He Is Risen' })
    expect(resolveSlot(deck, 1, 2)).toEqual({ kind: 'scripture', reference: 'John 3:17' })
  })
  it('falls back to black when slide 1 is "same" with nothing before it', () => {
    const orphan: ZoneSlide[] = [{ zones: { 1: { kind: 'same' }, 2: { kind: 'black' }, 3: { kind: 'black' }, 4: { kind: 'black' } } }]
    expect(resolveSlot(orphan, 0, 1)).toEqual({ kind: 'black' })
  })
  it('falls back to black for an out-of-range index', () => {
    expect(resolveSlot(deck, 99, 1)).toEqual({ kind: 'black' })
    expect(resolveSlot(deck, -1, 1)).toEqual({ kind: 'black' })
  })
})

describe('slideSummary', () => {
  it('prefers zone 3 text', () => {
    expect(slideSummary({ zones: { 1: { kind: 'text', text: 'one' }, 2: { kind: 'text', text: 'two' }, 3: { kind: 'text', text: 'three' }, 4: { kind: 'black' } } })).toBe('three')
  })
  it('falls back to the first renderable zone', () => {
    expect(slideSummary(deck[0])).toBe('He Is Risen')
  })
  it('uses a scripture reference when that is all there is', () => {
    expect(slideSummary({ zones: { 1: { kind: 'logo' }, 2: { kind: 'scripture', reference: 'Ps 23' }, 3: { kind: 'logo' }, 4: { kind: 'black' } } })).toBe('Ps 23')
  })
  it('resolves a slide slot against the supplied source slides', () => {
    const s: ZoneSlide = { zones: { 1: { kind: 'logo' }, 2: { kind: 'slide', index: 1 }, 3: { kind: 'logo' }, 4: { kind: 'black' } } }
    expect(slideSummary(s, source)).toBe('verse two')
  })
  it('returns empty string for a slide slot with no source available', () => {
    const s: ZoneSlide = { zones: { 1: { kind: 'logo' }, 2: { kind: 'slide', index: 1 }, 3: { kind: 'logo' }, 4: { kind: 'black' } } }
    expect(slideSummary(s)).toBe('')
  })
  it('returns empty string for an all-logo slide', () => {
    expect(slideSummary({ zones: { 1: { kind: 'logo' }, 2: { kind: 'logo' }, 3: { kind: 'logo' }, 4: { kind: 'black' } } })).toBe('')
  })
})

describe('parseZoneSlides / validateZoneSlides', () => {
  it('returns null for null, malformed JSON, and non-arrays', () => {
    expect(parseZoneSlides(null)).toBeNull()
    expect(parseZoneSlides('not json{{')).toBeNull()
    expect(parseZoneSlides('{"nope":1}')).toBeNull()
  })
  it('returns null for an empty deck', () => {
    expect(parseZoneSlides('[]')).toBeNull()
  })
  it('rejects an unknown slot kind', () => {
    expect(validateZoneSlides([{ zones: { 1: { kind: 'nope' }, 2: { kind: 'logo' }, 3: { kind: 'logo' }, 4: { kind: 'black' } } }])).toBe(false)
  })
  it('rejects a slide missing a zone', () => {
    expect(validateZoneSlides([{ zones: { 1: { kind: 'logo' }, 2: { kind: 'logo' }, 3: { kind: 'logo' } } }])).toBe(false)
  })
  it('accepts the slide kind', () => {
    expect(validateZoneSlides(deck)).toBe(true)
  })
  it('round-trips a valid deck', () => {
    expect(parseZoneSlides(JSON.stringify(deck))).toEqual(deck)
  })
})
