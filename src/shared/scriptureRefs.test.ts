import { describe, it, expect } from 'vitest'
import { parseReferenceList, formatReferenceList, isMultiReference, subReference, bookChapter, wholeChapter } from './scriptureRefs'

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

  // QA B3-N3: "Psalm 100" put the whole psalm on every slide, so Space looked
  // like it did nothing four times.
  it('narrows a whole-chapter reference to the verses on this slide', () => {
    expect(subReference('Psalm 23', 1, 3)).toBe('Psalm 23:1-3')
    expect(subReference('Psalms 100', 4, 4)).toBe('Psalms 100:4')
    expect(subReference('1 Corinthians 13', 4, 7)).toBe('1 Corinthians 13:4-7')
    expect(subReference('Song of Solomon 2', 1, 2)).toBe('Song of Solomon 2:1-2')
  })

  it('leaves a chapter range or anything unparseable as written', () => {
    expect(subReference('Psalm 23-24', 1, 3)).toBe('Psalm 23-24')
    expect(subReference('Psalm 23 - 24', 1, 3)).toBe('Psalm 23 - 24')
    expect(subReference('Jude', 1, 3)).toBe('Jude')
    expect(subReference('', 1, 3)).toBe('')
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

describe('wholeChapter (QA B3-N3)', () => {
  it('recognises book + chapter only', () => {
    expect(wholeChapter('Psalms 100')).toBe('Psalms 100')
    expect(wholeChapter(' 2 Kings 5 ')).toBe('2 Kings 5')
    expect(wholeChapter('John 3:16')).toBeNull()
    expect(wholeChapter('100')).toBeNull()
    expect(wholeChapter('Psalm 23-24')).toBeNull()
  })
})

describe('rangeReference / verseLines (QA B4-N1: readings across chapters)', () => {
  it('addresses each slide exactly, including across a chapter boundary', async () => {
    const { rangeReference } = await import('./scriptureRefs')
    const r = { reference: 'John 3:35-36, 4:1-3', book: 'John' }
    expect(rangeReference(r, 'x', { from: 35, to: 36, fromC: 3, toC: 3 })).toBe('John 3:35-36')
    expect(rangeReference(r, 'x', { from: 36, to: 2, fromC: 3, toC: 4 })).toBe('John 3:36-4:2')
    expect(rangeReference(r, 'x', { from: 3, to: 3, fromC: 4, toC: 4 })).toBe('John 4:3')
    // no chapters known (an online result without them): old narrowing
    expect(rangeReference({ reference: 'Psalms 100' }, 'Psalm 100', { from: 1, to: 2 })).toBe('Psalms 100:1-2')
  })
  it('prefixes the chapter on verse lines only when a reading spans chapters', async () => {
    const { verseLines } = await import('./scriptureRefs')
    expect(verseLines([{ n: 1, c: 23, text: 'a' }, { n: 2, c: 23, text: 'b' }])).toEqual(['1  a', '2  b'])
    expect(verseLines([{ n: 6, c: 23, text: 'a' }, { n: 1, c: 24, text: 'b' }])).toEqual(['23:6  a', '24:1  b'])
    expect(verseLines([{ n: 16, text: 'only' }])).toEqual(['only'])
  })
  it('numberedVerseLines: each verse as its deck slide shows it (QA B8-N2)', async () => {
    const { numberedVerseLines, deckVerseText } = await import('./scriptureRefs')
    const verses = [{ n: 35, c: 4, text: 'And the same day' }, { n: 36, c: 4, text: 'And when they had sent away' }]
    expect(numberedVerseLines(verses)).toEqual(['4:35 And the same day', '4:36 And when they had sent away'])
    // Identical to a one-verse-per-slide deck, so the deck landing changes nothing on screen.
    expect(numberedVerseLines(verses)).toEqual(verses.map((v) => deckVerseText([v], { alone: false })))
    expect(numberedVerseLines([{ n: 6, c: 23, text: 'a' }, { n: 1, c: 24, text: 'b' }])).toEqual(['23:6 a', '24:1 b'])
    expect(numberedVerseLines([{ n: 16, c: 3, text: 'For God so loved' }])).toEqual(['For God so loved'])
    expect(numberedVerseLines([{ n: 35, text: 'no chapter from the API' }, { n: 36, text: 'x' }])).toEqual(['35 no chapter from the API', '36 x'])
  })
})

describe('parseReferenceList — a passage with no book continues the previous one (QA A5-N2)', () => {
  it.each([
    ['John 3:16-18; 5:24', ['John 3:16-18', 'John 5:24']],
    ['John 3:16-18; 5:24; Romans 8:1', ['John 3:16-18', 'John 5:24', 'Romans 8:1']],
    ['Matthew 5:3-10; 6:9-13', ['Matthew 5:3-10', 'Matthew 6:9-13']],
    ['John 3:16; 18', ['John 3:16', 'John 3:18']], // a bare number after chapter:verse is a verse
    ['John 3:16-18; 20-21', ['John 3:16-18', 'John 3:20-21']],
    ['Psalm 23; 24', ['Psalm 23', 'Psalms 24']], // after a whole chapter, a chapter
    ['1 John 1:9; 2:1-2', ['1 John 1:9', '1 John 2:1-2']],
    ['Jude 3; 20-21', ['Jude 3', 'Jude 1:20-21']],
    ['Isa 9:6; 53:5', ['Isa 9:6', 'Isaiah 53:5']],
    ['John 3:16\n5:24', ['John 3:16', 'John 5:24']],
  ])('%s', (input, want) => {
    expect(parseReferenceList(input)).toEqual(want)
  })
  it('a bookless passage with nothing before it is left alone (the readiness check flags it)', () => {
    expect(parseReferenceList('5:24; John 3:16')).toEqual(['5:24', 'John 3:16'])
  })
  it('an unreadable passage does not lend its "book" to the next one', () => {
    expect(parseReferenceList('Hezekiah 4:1; 5:2')).toEqual(['Hezekiah 4:1', '5:2'])
  })
})

describe('QA B5-N5: deck slides number every verse and mark chapter changes', () => {
  it('numbers every verse, chapter:verse on the first and where the chapter changes', async () => {
    const { deckVerseText } = await import('./scriptureRefs')
    const v = [
      { c: 3, n: 35, text: 'The Father loveth the Son.' },
      { c: 3, n: 36, text: 'He that believeth.' },
      { c: 4, n: 1, text: 'When therefore the Lord knew.' },
    ]
    expect(deckVerseText(v)).toBe('3:35 The Father loveth the Son. 36 He that believeth. 4:1 When therefore the Lord knew.')
    expect(deckVerseText(v.slice(2))).toBe('4:1 When therefore the Lord knew.')
    expect(deckVerseText([{ c: 23, n: 5, text: 'Thou preparest.' }, { c: 23, n: 6, text: 'Surely.' }])).toBe('23:5 Thou preparest. 6 Surely.')
  })
  it('a lone single-verse reading stays plain; a single verse within a longer deck is numbered', async () => {
    const { deckVerseText } = await import('./scriptureRefs')
    expect(deckVerseText([{ c: 3, n: 16, text: 'For God so loved.' }], { alone: true })).toBe('For God so loved.')
    expect(deckVerseText([{ c: 3, n: 16, text: 'For God so loved.' }])).toBe('3:16 For God so loved.')
  })
  it('verses without a chapter (online translations) still get their numbers', async () => {
    const { deckVerseText } = await import('./scriptureRefs')
    expect(deckVerseText([{ n: 1, text: 'A.' }, { n: 2, text: 'B.' }])).toBe('1 A. 2 B.')
  })
  it('loadDeckOnto renders deck scripture through it', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const main = readFileSync(join(__dirname, '..', 'main', 'index.ts'), 'utf8')
    expect(main).toMatch(/deckScripture\.set\(`\$\{i\}:\$\{zoneId\}`, deckVerseText\(result\.verses, \{ alone: slides\.length === 1 \}\)\)/)
    expect(main).not.toMatch(/deckScripture\.set\([^\n]*\.map\(\(v\) => v\.text\)\.join\(' '\)/)
  })
})
