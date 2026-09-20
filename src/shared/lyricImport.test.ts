import { describe, it, expect } from 'vitest'
import { importLyrics } from './lyricImport'

describe('importLyrics', () => {
  it('returns null for empty paste', () => {
    expect(importLyrics('   ')).toBeNull()
  })

  it('reads ChordPro title, author, and chorus markers', () => {
    const song = importLyrics(`{title: Amazing Grace}
{artist: John Newton}
{start_of_chorus}
[G]Amazing [C]grace
{end_of_chorus}
Verse 1
How sweet the sound`)
    expect(song?.source).toBe('chordpro')
    expect(song?.title).toBe('Amazing Grace')
    expect(song?.author).toBe('John Newton')
    expect(song?.sections.length).toBeGreaterThan(0)
    expect(song?.sections.some((s) => s.kind === 'chorus')).toBe(true)
  })

  it('reads a CCLI SongSelect paste', () => {
    const song = importLyrics(`Amazing Grace (My Chains Are Gone)
Chris Tomlin | John Newton
Verse 1
Amazing grace how sweet the sound
Chorus
My chains are gone
CCLI Song # 4768151
© 2006 sixsteps Music`)
    expect(song?.source).toBe('ccli')
    expect(song?.title).toContain('Amazing Grace')
    expect(song?.ccli).toBe('4768151')
    expect(song?.author).toContain('Tomlin')
  })

  it('reads plain labeled lyrics', () => {
    const song = importLyrics(`How Great Thou Art
Verse
O Lord my God
Chorus
Then sings my soul`)
    expect(song?.source).toBe('plain')
    expect(song?.sections.some((s) => s.kind === 'chorus')).toBe(true)
  })
})
