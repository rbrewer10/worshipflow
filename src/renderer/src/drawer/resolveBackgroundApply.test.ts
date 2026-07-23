import { describe, it, expect } from 'vitest'
import { resolveBackgroundApply } from './resolveBackgroundApply'
import type { ServiceItem } from '../../../shared/types'

function makeItem(overrides: Partial<ServiceItem>): ServiceItem {
  return {
    id: 1, ordinal: 0, type: 'text', ref_id: null, payload: {}, title: 'x',
    notes: null, style: null, zoneRouting: null, ...overrides
  }
}

describe('resolveBackgroundApply', () => {
  it('targets the song record for a song item', () => {
    const item = makeItem({ type: 'song', ref_id: 42 })
    expect(resolveBackgroundApply(item, '/bg/a.jpg')).toEqual({ kind: 'song', songId: 42, path: '/bg/a.jpg' })
  })

  it('targets the item payload for a text item, preserving existing fields', () => {
    const item = makeItem({ type: 'text', payload: { title: 'Welcome', body: 'Hi' } })
    expect(resolveBackgroundApply(item, '/bg/b.jpg')).toEqual({
      kind: 'text',
      itemId: item.id,
      payload: { title: 'Welcome', body: 'Hi', background: '/bg/b.jpg' },
      path: '/bg/b.jpg'
    })
  })

  it('is unsupported for a song item with no ref_id', () => {
    const item = makeItem({ type: 'song', ref_id: null })
    expect(resolveBackgroundApply(item, '/bg/c.jpg')).toEqual({ kind: 'unsupported', itemType: 'song' })
  })

  it('is unsupported for item types with no background concept', () => {
    const item = makeItem({ type: 'scripture' })
    expect(resolveBackgroundApply(item, '/bg/d.jpg')).toEqual({ kind: 'unsupported', itemType: 'scripture' })
  })
})
