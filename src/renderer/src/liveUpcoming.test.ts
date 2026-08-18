import { describe, it, expect } from 'vitest'
import { resolveUpcoming } from './liveUpcoming'
import type { ServiceItem } from '../../shared/types'

function item(overrides: Partial<ServiceItem>): ServiceItem {
  return {
    id: 1, ordinal: 0, type: 'song', ref_id: 1, payload: {}, title: 'x',
    notes: null, style: null, zoneRouting: null, track: 'main', ...overrides
  } as ServiceItem
}

describe('resolveUpcoming', () => {
  const items = [
    item({ id: 1, title: 'Welcome Song', type: 'song', ref_id: 1 }),
    item({ id: 2, title: 'Scripture Reading', type: 'scripture', ref_id: null, payload: { reference: 'John 3:16' } }),
    item({ id: 3, title: 'Sermon', type: 'sermon' }),
  ]
  const slides = {
    1: ['Welcome slide 1', 'Welcome slide 2'],
    2: ['John 3:16 text'],
    3: ['Sermon title', 'Sermon point 1'],
  }

  it('returns the first two slides when nothing is live yet', () => {
    const { next, afterNext } = resolveUpcoming(items, 'main', slides, null, 0)
    expect(next).toEqual({ itemId: 1, itemTitle: 'Welcome Song', slideIndex: 0, text: 'Welcome slide 1' })
    expect(afterNext).toEqual({ itemId: 1, itemTitle: 'Welcome Song', slideIndex: 1, text: 'Welcome slide 2' })
  })

  it('looks ahead within the same item when not at its last slide', () => {
    const { next, afterNext } = resolveUpcoming(items, 'main', slides, 1, 0)
    expect(next).toEqual({ itemId: 1, itemTitle: 'Welcome Song', slideIndex: 1, text: 'Welcome slide 2' })
    expect(afterNext).toEqual({ itemId: 2, itemTitle: 'Scripture Reading', slideIndex: 0, text: 'John 3:16 text' })
  })

  it('crosses an item boundary for next when at the last slide of the current item', () => {
    const { next, afterNext } = resolveUpcoming(items, 'main', slides, 1, 1)
    expect(next).toEqual({ itemId: 2, itemTitle: 'Scripture Reading', slideIndex: 0, text: 'John 3:16 text' })
    expect(afterNext).toEqual({ itemId: 3, itemTitle: 'Sermon', slideIndex: 0, text: 'Sermon title' })
  })

  it('crosses TWO item boundaries when the next item has only one slide', () => {
    const { next, afterNext } = resolveUpcoming(items, 'main', slides, 2, 0)
    expect(next).toEqual({ itemId: 3, itemTitle: 'Sermon', slideIndex: 0, text: 'Sermon title' })
    expect(afterNext).toEqual({ itemId: 3, itemTitle: 'Sermon', slideIndex: 1, text: 'Sermon point 1' })
  })

  it('returns null for both at the end of the service', () => {
    const { next, afterNext } = resolveUpcoming(items, 'main', slides, 3, 1)
    expect(next).toBeNull()
    expect(afterNext).toBeNull()
  })

  it('returns null for afterNext but a real next one slide before the end', () => {
    const { next, afterNext } = resolveUpcoming(items, 'main', slides, 3, 0)
    expect(next).toEqual({ itemId: 3, itemTitle: 'Sermon', slideIndex: 1, text: 'Sermon point 1' })
    expect(afterNext).toBeNull()
  })

  it('excludes items on a different track', () => {
    const mixed = [...items, item({ id: 4, title: 'Second track song', track: 'second' })]
    const { next } = resolveUpcoming(mixed, 'main', slides, null, 0)
    expect(next?.itemId).not.toBe(4)
  })

  it('excludes items that cannot go live (e.g. an empty scripture reference)', () => {
    const withUnready = [item({ id: 1, title: 'Ready', type: 'song', ref_id: 1 }), item({ id: 2, title: 'Not ready', type: 'scripture', payload: {} })]
    const { next } = resolveUpcoming(withUnready, 'main', { 1: ['a'] }, null, 0)
    expect(next?.itemId).toBe(1)
  })

  it('returns null/null when the live position is not found in the eligible sequence', () => {
    const { next, afterNext } = resolveUpcoming(items, 'main', slides, 999, 0)
    expect(next).toBeNull()
    expect(afterNext).toBeNull()
  })
})
