import { describe, it, expect } from 'vitest'
import { chunkVerses, chunkProse } from './chunkText'
import type { ScriptureVerse } from './types'

const v = (n: number, text: string): ScriptureVerse => ({ n, text })

describe('chunkVerses', () => {
  it('groups whole verses up to the budget', () => {
    const verses = [v(1, 'aaaa'), v(2, 'bbbb'), v(3, 'cccc')]
    // 'aaaa' + 'bbbb' = 8 fits in 10; adding 'cccc' would be 12, so it starts a new chunk.
    expect(chunkVerses(verses, 10)).toEqual([{ from: 1, to: 2 }, { from: 3, to: 3 }])
  })

  it('never splits a verse, even one longer than the budget', () => {
    const verses = [v(1, 'x'.repeat(50))]
    expect(chunkVerses(verses, 10)).toEqual([{ from: 1, to: 1 }])
  })

  it('puts an over-long verse in its own chunk without swallowing neighbours', () => {
    const verses = [v(1, 'aa'), v(2, 'x'.repeat(50)), v(3, 'bb')]
    expect(chunkVerses(verses, 10)).toEqual([
      { from: 1, to: 1 }, { from: 2, to: 2 }, { from: 3, to: 3 }
    ])
  })

  it('covers every verse exactly once, contiguously', () => {
    const verses = Array.from({ length: 12 }, (_, i) => v(i + 1, 'word '.repeat(10)))
    const chunks = chunkVerses(verses, 120)
    expect(chunks[0].from).toBe(1)
    expect(chunks[chunks.length - 1].to).toBe(12)
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].from).toBe(chunks[i - 1].to + 1)
    }
  })

  it('returns nothing for no verses', () => {
    expect(chunkVerses([], 100)).toEqual([])
  })

  it('uses real verse numbers, not array positions', () => {
    const verses = [v(16, 'aaaa'), v(17, 'bbbb')]
    expect(chunkVerses(verses, 100)).toEqual([{ from: 16, to: 17 }])
  })
})

describe('chunkProse', () => {
  it('keeps short text as one chunk', () => {
    expect(chunkProse('Potluck is Sunday.', 100)).toEqual(['Potluck is Sunday.'])
  })

  it('splits on paragraph breaks first', () => {
    const text = 'First para.\n\nSecond para.'
    expect(chunkProse(text, 20)).toEqual(['First para.', 'Second para.'])
  })

  it('never splits mid-sentence', () => {
    const text = 'One two three. Four five six. Seven eight nine.'
    for (const chunk of chunkProse(text, 20)) {
      expect(chunk.trim()).toMatch(/[.!?]$/)
    }
  })

  it('puts an over-long sentence in its own chunk rather than cutting it', () => {
    const long = 'word '.repeat(40).trim() + '.'
    expect(chunkProse(long, 20)).toEqual([long])
  })

  it('returns nothing for empty or whitespace-only text', () => {
    expect(chunkProse('', 100)).toEqual([])
    expect(chunkProse('   \n  ', 100)).toEqual([])
  })
})
