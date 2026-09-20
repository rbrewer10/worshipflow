import { describe, it, expect } from 'vitest'
import { parseSetlist, matchSongTitle } from './setlistImport'

describe('parseSetlist', () => {
  it('maps a Planning Center / pasted order into songs, scripture, and sermon', () => {
    const items = parseSetlist(`Sunday Setlist
1. Amazing Grace
2. How Great Thou Art
John 3:16
Sermon: The Cross
`)
    expect(items.map((i) => i.kind)).toEqual(['song', 'song', 'scripture', 'sermon'])
    expect(items[2].title).toBe('John 3:16')
    expect(items[3].title).toBe('The Cross')
  })

  it('matches library titles case-insensitively', () => {
    const lib = [{ id: 7, title: 'Amazing Grace' }]
    expect(matchSongTitle('amazing grace', lib)).toBe(7)
    expect(matchSongTitle('Unknown Hymn', lib)).toBeNull()
  })
})
