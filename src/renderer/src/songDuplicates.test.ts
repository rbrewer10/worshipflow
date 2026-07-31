import { describe, it, expect } from 'vitest'
import { findDuplicateSongTitles } from './songDuplicates'

describe('findDuplicateSongTitles', () => {
  it('returns nothing when every title is unique', () => {
    const songs = [{ id: 1, title: 'Amazing Grace' }, { id: 2, title: 'How Great Thou Art' }]
    expect(findDuplicateSongTitles(songs)).toEqual([])
  })

  it('groups an exact-duplicate title', () => {
    const songs = [{ id: 1, title: 'Amazing Grace' }, { id: 2, title: 'Amazing Grace' }, { id: 3, title: 'Holy Ground' }]
    const groups = findDuplicateSongTitles(songs)
    expect(groups).toHaveLength(1)
    expect(groups[0].songs.map((s) => s.id)).toEqual([1, 2])
  })

  it('matches case-insensitively and ignores surrounding/repeated whitespace', () => {
    const songs = [{ id: 1, title: 'amazing grace' }, { id: 2, title: '  Amazing   Grace ' }]
    const groups = findDuplicateSongTitles(songs)
    expect(groups).toHaveLength(1)
    expect(groups[0].songs).toHaveLength(2)
  })

  it('does not treat a merely similar title (extra word) as a duplicate', () => {
    const songs = [{ id: 1, title: 'Amazing Grace' }, { id: 2, title: 'Amazing Grace 2' }]
    expect(findDuplicateSongTitles(songs)).toEqual([])
  })

  it('sorts groups alphabetically by normalized title', () => {
    const songs = [
      { id: 1, title: 'Zion' }, { id: 2, title: 'Zion' },
      { id: 3, title: 'Amazing Grace' }, { id: 4, title: 'Amazing Grace' }
    ]
    const groups = findDuplicateSongTitles(songs)
    expect(groups.map((g) => g.normalizedTitle)).toEqual(['amazing grace', 'zion'])
  })
})
