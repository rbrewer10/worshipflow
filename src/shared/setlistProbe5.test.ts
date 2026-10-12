import { describe, expect, it } from 'vitest'
import { parseSetlist } from './setlistImport'
import { SETLIST_PROBE5_CASES } from './setlistProbe5.fixture'
import { SETLIST_PROBE4_CASES } from './setlistProbe4.fixture'
import { SETLIST_PROBE3_CASES } from './setlistProbe3.fixture'

const score = (cases: [string, string, string?][]): string[] =>
  cases.flatMap(([line, want, title]) => {
    if (want === '?') return []
    const r = parseSetlist(line)
    const got = r.length === 0 ? 'skip' : r.map((e) => e.kind).join('+')
    const ok = got === want && (!title || r.map((e) => e.title).join(' | ').includes(title))
    return ok ? [] : [`${line} -> ${got} [${r.map((e) => e.title).join(' | ')}]`]
  })

// Same scoring as QA's probe: kind must match, and the expected substring must
// appear in the title(s).
describe('QA B5-N7: retest5 setlist probe (67 fresh bulletin wordings, 62 graded)', () => {
  it('the fixture is QA\'s probe, whole', () => {
    expect(SETLIST_PROBE5_CASES).toHaveLength(67)
    expect(SETLIST_PROBE5_CASES.filter(([, want]) => want !== '?')).toHaveLength(62)
  })
  for (const [line, want, title] of SETLIST_PROBE5_CASES) {
    if (want === '?') continue
    it(`${JSON.stringify(line)} → ${want}${title ? ` "${title}"` : ''}`, () => {
      const r = parseSetlist(line)
      expect(r.length === 0 ? 'skip' : r.map((e) => e.kind).join('+')).toBe(want)
      if (title) expect(r.map((e) => e.title).join(' | ')).toContain(title)
    })
  }
  it('retest4\'s 61 and retest3\'s 65 still pass', () => {
    expect(score(SETLIST_PROBE4_CASES)).toEqual([])
    expect(score(SETLIST_PROBE3_CASES)).toEqual([])
  })
  it('the sermon and reading titles come out clean', () => {
    expect(parseSetlist('Sermon Title: \u201cLiving Water\u201d')).toEqual([{ kind: 'sermon', title: 'Living Water' }])
    expect(parseSetlist('Sermon (Luke 15:11-32) \u201cThe Waiting Father\u201d')).toEqual([{ kind: 'sermon', title: 'The Waiting Father' }])
    expect(parseSetlist('Responsorial Psalm 98')).toEqual([{ kind: 'scripture', title: 'Psalm 98' }])
    expect(parseSetlist('Psalter Reading: Psalm 103:1-5 (UMH 824)')).toEqual([{ kind: 'scripture', title: 'Psalm 103:1-5' }])
  })
  it('the small print of a bulletin is skipped, but a song with a colon or "print" in it is not', () => {
    for (const line of ['Shout to the Lord', 'Leader of the Band', 'People Need the Lord', 'All: Creatures of Our God and King', 'Footprints']) {
      expect(parseSetlist(line)[0]?.kind, line).not.toBeUndefined()
    }
  })
})

describe('QA B5-N4: Paste setlist reads references with the shared grammar', () => {
  it.each([
    ['Mark 4:35\u201441', 'Mark 4:35\u201441'],
    ['Mark 4:35\u201341', 'Mark 4:35\u201341'],
    ['Mark 4:35-41', 'Mark 4:35-41'],
    ['Psalm 23-24', 'Psalm 23-24'],
    ['Psalm 23\u201324', 'Psalm 23\u201324'],
    ['Psalms 23-24', 'Psalms 23-24'],
    ['Psalm 23\u201424', 'Psalm 23\u201424'],
    ['John 3:35\u20144:3', 'John 3:35\u20144:3'],
    ['John 3:35-4:3', 'John 3:35-4:3'],
    ['Isa 40:28\u201331', 'Isa 40:28\u201331'],
    ['1 Cor 13:4\u20147', '1 Cor 13:4\u20147'],
  ])('a bare %s is the whole reading, not one verse or a song', (line, title) => {
    expect(parseSetlist(line)).toEqual([{ kind: 'scripture', title }])
  })
  it('every imported reference resolves to the same passage the lookup reads', async () => {
    const { parseScriptureReference } = await import('./scriptureParse')
    const r = parseScriptureReference(parseSetlist('Mark 4:35\u201441')[0].title)
    expect(r.ok && r.segments).toEqual([{ chapter: 4, from: 35, to: 41 }])
    const p = parseScriptureReference(parseSetlist('Psalms 23-24')[0].title)
    expect(p.ok && p.segments).toEqual([{ chapter: 23 }, { chapter: 24 }])
  })
  it('a labelled em-dash reading keeps the range too, and a non-book is not scripture', () => {
    expect(parseSetlist('Gospel Lesson: Mark 4:35\u201441')).toEqual([{ kind: 'scripture', title: 'Mark 4:35\u201441' }])
    expect(parseSetlist('Hezekiah 4:1')[0]?.kind).toBe('song')
    expect(parseSetlist('Psalm 23, Responsive')).toEqual([{ kind: 'scripture', title: 'Psalm 23' }])
    expect(parseSetlist('John 3:16 & Romans 8:28')).toEqual([{ kind: 'scripture', title: 'John 3:16; Romans 8:28' }])
    expect(parseSetlist('John 99:1')).toEqual([{ kind: 'scripture', title: 'John 99:1' }]) // flagged by Review, not hidden as a song
  })
})
