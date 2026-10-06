import { describe, expect, it, vi } from 'vitest'
import { join } from 'path'

// The real bundled KJV, not a stub.
vi.mock('electron', () => ({ app: { getAppPath: () => join(__dirname, '..', '..') } }))
const { lookupScripture } = await import('./scripture')

const look = (ref: string): { ok: boolean; reference?: string; count: number; first?: string; chapters: number[]; error?: string } => {
  const r = lookupScripture(ref)
  return { ok: r.ok, reference: r.reference, count: r.verses?.length ?? 0, first: r.verses?.[0] ? `${r.verses[0].c}:${r.verses[0].n}` : undefined, chapters: [...new Set((r.verses ?? []).map((v) => v.c ?? 0))], error: r.error }
}

describe('lookupScripture on the bundled KJV (QA B4-N1)', () => {
  it('Mark 4:35–41 with an en dash resolves like the hyphen form', () => {
    expect(look('Mark 4:35–41')).toMatchObject({ ok: true, reference: 'Mark 4:35-41', count: 7, first: '4:35' })
    expect(look('Mark 4:35-41')).toMatchObject({ ok: true, count: 7 })
  })
  it('Psalm 23-24: both chapters', () => {
    expect(look('Psalm 23-24')).toMatchObject({ ok: true, reference: 'Psalms 23-24', count: 6 + 10, chapters: [23, 24] })
  })
  it('John 3:35-4:3: across the chapter boundary', () => {
    expect(look('John 3:35-4:3')).toMatchObject({ ok: true, reference: 'John 3:35-36, 4:1-3', count: 5, first: '3:35', chapters: [3, 4] })
  })
  it('Psalm 23, 24: a comma list of chapters', () => {
    expect(look('Psalm 23, 24')).toMatchObject({ ok: true, reference: 'Psalms 23-24', count: 16 })
  })
  it('verse lists merge when they touch', () => {
    expect(look('John 3:16, 17')).toMatchObject({ ok: true, reference: 'John 3:16-17', count: 2 })
    expect(look('John 3:16, 18')).toMatchObject({ ok: true, reference: 'John 3:16, 18', count: 2 })
  })
  it('unchanged: verse, range, whole chapter', () => {
    expect(look('John 3:16')).toMatchObject({ ok: true, reference: 'John 3:16', count: 1 })
    expect(look('Psalm 100')).toMatchObject({ ok: true, reference: 'Psalms 100', count: 5 })
  })
  it('a canonical reference reads back to the same verses', () => {
    for (const ref of ['John 3:35-4:3', 'Psalm 23, 24', 'Jude', 'Romans 12:1-2, 9-13']) {
      const once = lookupScripture(ref)
      const twice = lookupScripture(once.reference as string)
      expect(twice.verses?.map((v) => `${v.c}:${v.n}`), ref).toEqual(once.verses?.map((v) => `${v.c}:${v.n}`))
    }
  })
  it('a verse past the end of a chapter is an error, a range end is clamped', () => {
    expect(look('John 3:40')).toMatchObject({ ok: false })
    expect(look('John 3:35-99')).toMatchObject({ ok: true, count: 2 })
  })
})

describe('A4-N2: single-chapter books', () => {
  it.each([
    ['Jude 3', 'Jude 1:3', 1],
    ['Jude 20-21', 'Jude 1:20-21', 2],
    ['Philemon 6', 'Philemon 1:6', 1],
    ['Obadiah 15', 'Obadiah 1:15', 1],
    ['2 John 5', '2 John 1:5', 1],
    ['3 John 2-4', '3 John 1:2-4', 3],
  ])('%s → %s', (ref, canonical, count) => {
    expect(look(ref)).toMatchObject({ ok: true, reference: canonical, count })
  })
  it('the whole letter is written as its verse range, never read back as verse 1', () => {
    expect(look('Jude')).toMatchObject({ ok: true, reference: 'Jude 1:1-25', count: 25 })
  })
})

describe('verse text on screen (found while testing B4-N1)', () => {
  it('keeps the KJV\'s italic supplied words and drops margin notes', () => {
    const v = lookupScripture('Psalm 23').verses!
    expect(v[0].text).toBe('A Psalm of David. The LORD is my shepherd; I shall not want.')
    expect(v[5].text).toBe('Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever.')
    expect(lookupScripture('3 John 1:14').verses![0].text).toMatch(/Peace be to thee\. Our friends salute thee\. Greet the friends by name\.$/)
    expect(lookupScripture('Hebrews 10:34').verses![0].text).toMatch(/an enduring substance\.$/)
    expect(lookupScripture('Romans 16:27').verses![0].text).toBe('To God only wise, be glory through Jesus Christ for ever. Amen.')
    expect(lookupScripture('Micah 7:12').verses![0].text).toMatch(/from mountain to mountain\.$/)
  })
  it('no verse anywhere shows a brace or a "Heb." note', async () => {
    const { cleanVerse } = await import('./scripture')
    const { readFileSync } = await import('fs')
    const raw = readFileSync(join(__dirname, '..', '..', 'resources', 'kjv.json'), 'utf8')
    const data = JSON.parse(raw.replace(/^\uFEFF/, '')) as { chapters: string[][] }[]
    const bad = data.flatMap((b) => b.chapters.flat()).map(cleanVerse).filter((t) => /[{}[\]«»]|\bHeb\.|\bGr\./.test(t))
    expect(bad).toEqual([])
  })
  it('the six Gospel verses missing from the bundled text are back, and the verses after them line up', () => {
    expect(look('Mark 4:40')).toMatchObject({ ok: true })
    expect(lookupScripture('Mark 4:40').verses![0].text).toBe('And he said unto them, Why are ye so fearful? how is it that ye have no faith?')
    expect(lookupScripture('Mark 4:41').verses![0].text).toMatch(/^And they feared exceedingly/)
    expect(lookupScripture('Matthew 2:16').verses![0].text).toMatch(/^Then Herod, when he saw that he was mocked/)
    expect(lookupScripture('Matthew 22:1').verses![0].text).toBe('And Jesus answered and spake unto them again by parables, and said,')
    expect(lookupScripture('Matthew 26:38').verses![0].text).toMatch(/^Then saith he unto them, My soul is exceeding sorrowful/)
    expect(lookupScripture('Mark 7:11').verses![0].text).toMatch(/^But ye say, If a man shall say to his father or mother, It is Corban/)
    expect(lookupScripture('Mark 8:8').verses![0].text).toMatch(/^So they did eat, and were filled/)
    expect(lookupScripture('Matthew 26:75').verses![0].text).toMatch(/^And Peter remembered the word of Jesus/)
  })
})

describe('QA A5-N1: abbreviations put the right passage on screen (real KJV)', () => {
  it.each([
    ['Isa 9:6', 'Isaiah 9:6', /^For unto us a child is born/],
    ['Isa. 53:5', 'Isaiah 53:5', /^But he was wounded for our transgressions/],
    ['Is 40:31', 'Isaiah 40:31', /^But they that wait upon the LORD/],
    ['Jer 29:11', 'Jeremiah 29:11', /^For I know the thoughts that I think toward you/],
    ['Lam 3:22-23', 'Lamentations 3:22-23', /^It is of the LORD'S mercies that we are not consumed/],
    ['Ezek 37:4', 'Ezekiel 37:4', /^Again he said unto me, Prophesy upon these bones/],
    ['Mic 6:8', 'Micah 6:8', /^He hath shewed thee, O man, what is good/],
    ['Jn 3:16', 'John 3:16', /^For God so loved the world/],
    ['1 Kgs 19:12', '1 Kings 19:12', /still small voice/],
    ['Phil 4:13', 'Philippians 4:13', /^I can do all things through Christ/],
    ['Jas 1:22', 'James 1:22', /^But be ye doers of the word/],
  ])('%s → %s', (typed, canonical, text) => {
    const r = lookupScripture(typed)
    expect(r.ok, r.error).toBe(true)
    expect(r.reference).toBe(canonical)
    expect(r.verses![0].text).toMatch(text)
  })
  it('every alias reads the same verse as the full book name', async () => {
    const { BOOK_ALIASES } = await import('../shared/scriptureParse')
    for (const [alias, book] of Object.entries(BOOK_ALIASES)) {
      const a = lookupScripture(`${alias} 1:1`)
      const b = lookupScripture(`${book} 1:1`)
      expect(a.reference, alias).toBe(b.reference)
      expect(a.verses?.[0].text, alias).toBe(b.verses?.[0].text)
    }
  })
})

describe('QA A5-N4: verse numbers match a printed KJV', () => {
  it('1 Samuel 20, 1 Kings 22, 3 John and Revelation 12 have the printed verse counts, and the text is all there', () => {
    expect(look('1 Samuel 20')).toMatchObject({ count: 42 })
    expect(lookupScripture('1 Samuel 20:42').verses![0].text).toMatch(/for ever\. And he arose and departed: and Jonathan went into the city\.$/)
    expect(look('1 Kings 22')).toMatchObject({ count: 53 })
    expect(lookupScripture('1 Kings 22:43').verses![0].text).toMatch(/in the eyes of the LORD: nevertheless the high places were not taken away; for the people/)
    expect(lookupScripture('1 Kings 22:53').verses![0].text).toMatch(/according to all that his father had done\.$/)
    expect(look('3 John')).toMatchObject({ reference: '3 John 1:1-14', count: 14 })
    expect(lookupScripture('3 John 1:14').verses![0].text).toBe('But I trust I shall shortly see thee, and we shall speak face to face. Peace be to thee. Our friends salute thee. Greet the friends by name.')
    expect(look('Revelation 12')).toMatchObject({ count: 17 })
    expect(lookupScripture('Revelation 13:1').verses![0].text).toMatch(/^And I stood upon the sand of the sea, and saw a beast rise up out of the sea/)
  })
  it('the whole Bible has the printed 31,102 verses', async () => {
    const { readFileSync } = await import('fs')
    const raw = readFileSync(join(__dirname, '..', '..', 'resources', 'kjv.json'), 'utf8')
    const data = JSON.parse(raw.replace(/^\uFEFF/, '')) as { chapters: string[][] }[]
    expect(data.reduce((n, b) => n + b.chapters.reduce((m, c) => m + c.length, 0), 0)).toBe(31102)
  })
})

describe('QA A5-N3: Psalm titles without the brackets', () => {
  it('shows the title as text, never "[" or "]"', () => {
    expect(lookupScripture('Psalm 100:1').verses![0].text).toBe('A Psalm of praise. Make a joyful noise unto the LORD, all ye lands.')
    expect(lookupScripture('Psalm 3:1').verses![0].text).toMatch(/^A Psalm of David, when he fled from Absalom his son\. LORD, how are they increased/)
  })
})
