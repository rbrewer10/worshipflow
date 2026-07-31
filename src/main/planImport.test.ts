import { describe, it, expect } from 'vitest'
import { mapPlanItems } from './planImport'

// A stand-in song library keyed by lowercase title.
const library = new Map<string, number>([
  ['amazing grace', 10],
  ['how great thou art', 11]
])
const findSongId = (title: string): number | null => library.get(title.toLowerCase()) ?? null

describe('mapPlanItems', () => {
  it('matches a song to the library by title (case-insensitive) and keeps notes', () => {
    const r = mapPlanItems([{ type: 'song', title: 'Amazing Grace', leader: 'Kathy', detail: 'Key of G' }], findSongId)
    expect(r.matched).toBe(1)
    expect(r.missing).toEqual([])
    expect(r.mapped[0]).toMatchObject({ type: 'song', ref_id: 10 })
    expect(r.mapped[0].notes).toBe('Led by Kathy · Key of G')
  })

  it('flags an unmatched song as a labeled placeholder', () => {
    const r = mapPlanItems([{ type: 'song', title: 'Unknown Hymn' }], findSongId)
    expect(r.matched).toBe(0)
    expect(r.missing).toEqual(['Unknown Hymn'])
    expect(r.mapped[0]).toMatchObject({ type: 'placeholder', ref_id: null, payload: { label: 'Song: Unknown Hymn' } })
  })

  it('maps scripture and sermon to their real WorshipFlow types', () => {
    const r = mapPlanItems(
      [
        { type: 'scripture', title: 'John 3:16-21' },
        { type: 'sermon', title: 'Grace that saves', leader: 'Pastor Archie' }
      ],
      findSongId
    )
    expect(r.mapped[0]).toMatchObject({ type: 'scripture', payload: { reference: 'John 3:16-21' } })
    expect(r.mapped[1]).toMatchObject({ type: 'sermon', payload: { title: 'Grace that saves', speaker: 'Pastor Archie' } })
  })

  it('maps other item types to labeled placeholders', () => {
    const r = mapPlanItems([{ type: 'offering', title: 'Tithes & Offerings', detail: 'Ushers' }], findSongId)
    expect(r.mapped[0]).toMatchObject({ type: 'placeholder', payload: { label: 'Tithes & Offerings' } })
    expect(r.mapped[0].notes).toBe('Ushers')
  })

  it('preserves order and counts a whole plan', () => {
    const r = mapPlanItems(
      [
        { type: 'welcome', title: 'Welcome' },
        { type: 'song', title: 'How Great Thou Art' },
        { type: 'scripture', title: 'Psalm 100' },
        { type: 'song', title: 'Nope Not Here' },
        { type: 'sermon', title: 'Thanks' }
      ],
      findSongId
    )
    expect(r.mapped.map((m) => m.type)).toEqual(['placeholder', 'song', 'scripture', 'placeholder', 'sermon'])
    expect(r.matched).toBe(1)
    expect(r.missing).toEqual(['Nope Not Here'])
  })
})
