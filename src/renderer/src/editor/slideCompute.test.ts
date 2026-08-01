import { describe, it, expect } from 'vitest'
import { computeEditorSlides, deleteSlideFromSong } from './slideCompute'
import type { SongFull } from '../../../shared/types'

// A verse of 4 lines at 2 lines per slide is 2 slides — the shape that made the
// original bug visible: deleting one slide took the whole verse with it.
const song = (over: Partial<SongFull> = {}): SongFull => ({
  id: 1,
  title: 'Test',
  author: null,
  ccli: null,
  copyright: null,
  publisher: null,
  background: null,
  sections: [
    { kind: 'verse', ordinal: 1, lyrics: 'v1 a\nv1 b\nv1 c\nv1 d' },
    { kind: 'chorus', ordinal: 2, lyrics: 'c a\nc b' }
  ],
  arrangement: null,
  linesPerSlide: 2,
  fontScale: null,
  bgMotion: null,
  textColor: null,
  font: null,
  blurBehindText: null,
  ...over
} as SongFull)

describe('deleteSlideFromSong', () => {
  it('removes only the slide’s own lines, leaving the rest of the section', () => {
    const s = song()
    const slides = computeEditorSlides(s)
    const result = deleteSlideFromSong(s, slides[0])
    expect(result.sections).toHaveLength(2)
    expect(result.sections[0].lyrics).toBe('v1 c\nv1 d')
  })

  it('leaves every other section untouched', () => {
    const s = song()
    const slides = computeEditorSlides(s)
    const result = deleteSlideFromSong(s, slides[0])
    expect(result.sections[1].lyrics).toBe('c a\nc b')
  })

  it('deletes the second slide of a section without touching the first', () => {
    const s = song()
    const slides = computeEditorSlides(s)
    const result = deleteSlideFromSong(s, slides[1])
    expect(result.sections[0].lyrics).toBe('v1 a\nv1 b')
  })

  it('drops the whole section once its last line is deleted', () => {
    const s = song({ sections: [
      { kind: 'verse', ordinal: 1, lyrics: 'only line' },
      { kind: 'chorus', ordinal: 2, lyrics: 'c a\nc b' }
    ] } as Partial<SongFull>)
    const slides = computeEditorSlides(s)
    const result = deleteSlideFromSong(s, slides[0])
    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].kind).toBe('chorus')
  })

  it('refuses to empty the song entirely', () => {
    const s = song({ sections: [{ kind: 'verse', ordinal: 1, lyrics: 'only line' }] } as Partial<SongFull>)
    const slides = computeEditorSlides(s)
    const result = deleteSlideFromSong(s, slides[0])
    expect(result.sections).toHaveLength(1)
  })

  it('shifts arrangement indices down when a section is removed', () => {
    const s = song({
      sections: [
        { kind: 'verse', ordinal: 1, lyrics: 'gone' },
        { kind: 'chorus', ordinal: 2, lyrics: 'c a' },
        { kind: 'verse', ordinal: 3, lyrics: 'v2 a' }
      ],
      arrangement: [0, 1, 2, 1]
    } as Partial<SongFull>)
    const slides = computeEditorSlides(s)
    const result = deleteSlideFromSong(s, slides[0])
    // index 0 is gone; 1 and 2 slide down to 0 and 1
    expect(result.arrangement).toEqual([0, 1, 0])
  })

  it('leaves arrangement alone when the section survives', () => {
    const s = song({ arrangement: [0, 1, 0] })
    const slides = computeEditorSlides(s)
    const result = deleteSlideFromSong(s, slides[0])
    expect(result.arrangement).toEqual([0, 1, 0])
  })

  it('is a no-op for a slide whose section no longer exists', () => {
    const s = song()
    const result = deleteSlideFromSong(s, {
      key: 'x', sectionOrdinal: 99, sectionLabel: 'Gone', text: '', lineStart: 0, lineCount: 1
    })
    expect(result.sections).toEqual(s.sections)
  })

  it('reduces the slide count by exactly one', () => {
    const s = song()
    const before = computeEditorSlides(s).length
    const result = deleteSlideFromSong(s, computeEditorSlides(s)[0])
    const after = computeEditorSlides({ ...s, ...result }).length
    expect(after).toBe(before - 1)
  })
})
