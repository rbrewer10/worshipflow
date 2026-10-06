import { describe, it, expect } from 'vitest'
import { importLyrics } from './lyricImport'
import { songFileProblem } from './songFileCheck'

describe('songFileProblem (QA M4)', () => {
  it('empty text', () => { expect(songFileProblem(importLyrics('  \n '))).toBe('empty') })
  it('title-only .usr has no lyrics', () => {
    expect(songFileProblem(importLyrics('[File]\nType=WorshipSongs\n[S A1]\nTitle=X\n[V1]\n\n'))).toBe('no-lyrics')
  })
  it('a real song is fine', () => {
    expect(songFileProblem(importLyrics('[File]\nType=WorshipSongs\n[S A1]\nTitle=X\n[V1]\nAmazing grace\n'))).toBeNull()
  })
})
