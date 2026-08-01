import { describe, it, expect } from 'vitest'
import { parseReferenceList, formatReferenceList, isMultiReference, subReference, bookChapter } from './scriptureRefs'

describe('parseReferenceList', () => {
  it('returns a single reference unchanged', () => {
    expect(parseReferenceList('John 3:16')).toEqual(['John 3:16'])
  })

  it('splits on semicolons', () => {
    expect(parseReferenceList('John 3:16; Romans 8:1')).toEqual(['John 3:16', 'Romans 8:1'])
  })

  it('splits on newlines, so a pasted list works', () => {
    expect(parseReferenceList('John 3:16\nRomans 8:1\nPsalm 23')).toEqual(['John 3:16', 'Romans 8:1', 'Psalm 23'])
  })

  it('does NOT split on commas — "Genesis 1:1, 3" is one reference', () => {
    expect(parseReferenceList('Genesis 1:1, 3')).toEqual(['Genesis 1:1, 3'])
  })

  it('trims whitespace around each reference', () => {
    expect(parseReferenceList('  John 3:16  ;   Romans 8:1 ')).toEqual(['John 3:16', 'Romans 8:1'])
  })

  it('drops empty entries from trailing or doubled separators', () => {
    expect(parseReferenceList('John 3:16;;')).toEqual(['John 3:16'])
    expect(parseReferenceList('John 3:16\n\n\nRomans 8:1')).toEqual(['John 3:16', 'Romans 8:1'])
  })

  it('returns nothing for an empty or whitespace-only field', () => {
    expect(parseReferenceList('')).toEqual([])
    expect(parseReferenceList('   \n  ')).toEqual([])
  })

  it('preserves ranges and multi-word book names', () => {
    expect(parseReferenceList('1 Corinthians 13:4-7; Song of Solomon 2:1')).toEqual([
      '1 Corinthians 13:4-7',
      'Song of Solomon 2:1'
    ])
  })
})

describe('formatReferenceList', () => {
  it('round-trips with parseReferenceList', () => {
    const refs = ['John 3:16', 'Romans 8:1', 'Psalm 23']
    expect(parseReferenceList(formatReferenceList(refs))).toEqual(refs)
  })

  it('leaves a single reference as a bare string', () => {
    expect(formatReferenceList(['John 3:16'])).toBe('John 3:16')
  })
})

describe('isMultiReference', () => {
  it('is false for one or zero references', () => {
    expect(isMultiReference('John 3:16')).toBe(false)
    expect(isMultiReference('')).toBe(false)
  })

  it('is true once there are two', () => {
    expect(isMultiReference('John 3:16; Romans 8:1')).toBe(true)
  })
})

describe('subReference', () => {
  it('narrows a range to the verses actually on this slide', () => {
    expect(subReference('John 3:16-18', 16, 17)).toBe('John 3:16-17')
  })

  it('collapses a single verse to one number', () => {
    expect(subReference('John 3:16-18', 18, 18)).toBe('John 3:18')
  })

  it('keeps multi-word book names intact', () => {
    expect(subReference('1 Corinthians 13:4-7', 4, 5)).toBe('1 Corinthians 13:4-5')
  })

  it('returns a whole-chapter reference unchanged — nothing to narrow to', () => {
    expect(subReference('Psalm 23', 1, 3)).toBe('Psalm 23')
  })
})

describe('bookChapter', () => {
  it('takes the book and chapter off a verse reference', () => {
    expect(bookChapter('John 3:16-18')).toBe('John 3')
    expect(bookChapter('1 Corinthians 13:4')).toBe('1 Corinthians 13')
  })

  it('is null when there is no verse part', () => {
    expect(bookChapter('Psalm 23')).toBeNull()
  })
})
