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

describe('QA B-N3: more service elements become headers, not "Song:" placeholders', () => {
  for (const line of ['Tithes & Offerings', 'Tithes and Offerings', 'Offerings', 'Call to Worship', 'Scripture Reading']) {
    it(line, () => expect(parseSetlist(line)).toEqual([{ kind: 'element', title: line }]))
  }
  it('a reading with a reference is still scripture', () => {
    expect(parseSetlist('Scripture Reading: John 3:16')[0].kind).toBe('scripture')
    expect(parseSetlist('Reading: John 3:16')[0]).toEqual({ kind: 'scripture', title: 'John 3:16' })
  })
  it('songs with those words in the title stay songs', () => {
    expect(parseSetlist('Doxology')[0].kind).toBe('song') // sung — matched against the library
    expect(parseSetlist('Offering (Paul Baloche)')[0].kind).toBe('song')
  })
})
