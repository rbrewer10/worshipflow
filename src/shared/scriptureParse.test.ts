import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { BIBLE_BOOKS, CHAPTER_COUNTS, normalizeReference, parseScriptureReference, referenceProblem } from './scriptureParse'

const segs = (ref: string): unknown => {
  const r = parseScriptureReference(ref)
  return r.ok ? [r.book, r.segments] : r.error
}

describe('normalizeReference (QA B4-N1)', () => {
  it('reads typographic dashes and stray spaces as the plain form', () => {
    expect(normalizeReference('Mark 4:35–41')).toBe('Mark 4:35-41') // en dash
    expect(normalizeReference('Mark 4:35—41')).toBe('Mark 4:35-41') // em dash
    expect(normalizeReference('Mark 4 : 35 − 41')).toBe('Mark 4:35-41') // minus sign
    expect(normalizeReference('Psalm 23 , 24')).toBe('Psalm 23,24')
  })
})

describe('parseScriptureReference (QA B4-N1, A4-N2)', () => {
  it('single verses, verse ranges and whole chapters as before', () => {
    expect(segs('John 3:16')).toEqual(['John', [{ chapter: 3, from: 16, to: 16 }]])
    expect(segs('John 3:16-18')).toEqual(['John', [{ chapter: 3, from: 16, to: 18 }]])
    expect(segs('Psalm 23')).toEqual(['Psalms', [{ chapter: 23 }]])
    expect(segs('1 Corinthians 13:4-7')).toEqual(['1 Corinthians', [{ chapter: 13, from: 4, to: 7 }]])
    expect(segs('II Timothy 3:16')).toEqual(['2 Timothy', [{ chapter: 3, from: 16, to: 16 }]])
  })
  it('en/em dash ranges', () => {
    expect(segs('Mark 4:35–41')).toEqual(['Mark', [{ chapter: 4, from: 35, to: 41 }]])
    expect(segs('Mark 4:35 — 41')).toEqual(['Mark', [{ chapter: 4, from: 35, to: 41 }]])
  })
  it('chapter ranges', () => {
    expect(segs('Psalm 23-24')).toEqual(['Psalms', [{ chapter: 23 }, { chapter: 24 }]])
    expect(segs('Psalm 23–24')).toEqual(['Psalms', [{ chapter: 23 }, { chapter: 24 }]])
  })
  it('cross-chapter ranges', () => {
    expect(segs('John 3:35-4:3')).toEqual(['John', [{ chapter: 3, from: 35, to: Number.MAX_SAFE_INTEGER }, { chapter: 4, from: 1, to: 3 }]])
    expect(segs('Genesis 1:31-3:2')).toEqual(['Genesis', [{ chapter: 1, from: 31, to: Number.MAX_SAFE_INTEGER }, { chapter: 2 }, { chapter: 3, from: 1, to: 2 }]])
  })
  it('comma lists: chapters after a whole chapter, verses after a chapter:verse', () => {
    expect(segs('Psalm 23, 24')).toEqual(['Psalms', [{ chapter: 23 }, { chapter: 24 }]])
    expect(segs('John 3:16, 18')).toEqual(['John', [{ chapter: 3, from: 16, to: 16 }, { chapter: 3, from: 18, to: 18 }]])
    expect(segs('Romans 12:1-2, 9-13')).toEqual(['Romans', [{ chapter: 12, from: 1, to: 2 }, { chapter: 12, from: 9, to: 13 }]])
    expect(segs('John 3:16, 4:1')).toEqual(['John', [{ chapter: 3, from: 16, to: 16 }, { chapter: 4, from: 1, to: 1 }]])
  })
  it('A4-N2: in a one-chapter book a bare number is a verse', () => {
    expect(segs('Jude 3')).toEqual(['Jude', [{ chapter: 1, from: 3, to: 3 }]])
    expect(segs('Jude 20-21')).toEqual(['Jude', [{ chapter: 1, from: 20, to: 21 }]])
    expect(segs('Philemon 6')).toEqual(['Philemon', [{ chapter: 1, from: 6, to: 6 }]])
    expect(segs('Obadiah 1:15')).toEqual(['Obadiah', [{ chapter: 1, from: 15, to: 15 }]])
    expect(segs('2 John 5')).toEqual(['2 John', [{ chapter: 1, from: 5, to: 5 }]])
    expect(segs('3 John 2-4')).toEqual(['3 John', [{ chapter: 1, from: 2, to: 4 }]])
    expect(segs('Jude')).toEqual(['Jude', [{ chapter: 1 }]]) // the whole letter
    expect(segs('Phlm 4')).toEqual(['Philemon', [{ chapter: 1, from: 4, to: 4 }]])
  })
  it('says why a reference can\'t resolve', () => {
    expect(referenceProblem('Hezekiah 4:1')).toMatch(/Unknown book/)
    expect(referenceProblem('Psalm 151')).toMatch(/no chapter 151/)
    expect(referenceProblem('Psalm 150-151')).toMatch(/no chapter 151/)
    expect(referenceProblem('John 3:18-16')).toMatch(/backwards/)
    expect(referenceProblem('Jude 2:1')).toMatch(/only one chapter/)
    expect(referenceProblem('Romans')).toMatch(/Add a chapter/)
    expect(referenceProblem('Psalm 1-150')).toMatch(/too many chapters/)
    expect(referenceProblem('')).toMatch(/Enter a reference/)
    expect(referenceProblem('Amazing Grace')).toMatch(/Unknown book|Add a chapter|Could not read/)
    expect(referenceProblem('John 3:16')).toBeNull()
  })
  it('the chapter table matches the bundled KJV', () => {
    const raw = readFileSync(join(__dirname, '..', '..', 'resources', 'kjv.json'), 'utf8')
    const data = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw) as { chapters: unknown[] }[]
    expect(data.map((b) => b.chapters.length)).toEqual([...CHAPTER_COUNTS])
    expect(BIBLE_BOOKS).toHaveLength(66)
  })
})
