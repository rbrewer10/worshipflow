import { describe, expect, it } from 'vitest'
import { parseSetlist } from './setlistImport'
import { SETLIST_PROBE6_CASES } from './setlistProbe6.fixture'
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
describe('QA B6-N2: retest6 setlist probe (54 fresh bulletin wordings, 51 graded)', () => {
  it('the fixture is QA\'s probe, whole', () => {
    expect(SETLIST_PROBE6_CASES).toHaveLength(54)
    expect(SETLIST_PROBE6_CASES.filter(([, want]) => want !== '?')).toHaveLength(51)
  })
  for (const [line, want, title] of SETLIST_PROBE6_CASES) {
    if (want === '?') continue
    it(`${JSON.stringify(line)} → ${want}${title ? ` "${title}"` : ''}`, () => {
      const r = parseSetlist(line)
      expect(r.length === 0 ? 'skip' : r.map((e) => e.kind).join('+')).toBe(want)
      if (title) expect(r.map((e) => e.title).join(' | ')).toContain(title)
    })
  }
  it('retest5\'s 62, retest4\'s 61 and retest3\'s 65 still pass', () => {
    expect(score(SETLIST_PROBE5_CASES)).toEqual([])
    expect(score(SETLIST_PROBE4_CASES)).toEqual([])
    expect(score(SETLIST_PROBE3_CASES)).toEqual([])
  })
  it('no retest6 line becomes a song placeholder unless it is a song', () => {
    const placeholders = SETLIST_PROBE6_CASES
      .filter(([, want]) => want !== 'song' && want !== '?')
      .filter(([line]) => parseSetlist(line).some((e) => e.kind === 'song'))
    expect(placeholders).toEqual([])
  })
  it('titles come out clean', () => {
    expect(parseSetlist('Sermon ............ \u201cA Lamp Unto My Feet\u201d ............ Rev. Kim')).toEqual([{ kind: 'sermon', title: 'A Lamp Unto My Feet' }])
    expect(parseSetlist('Preaching: \u201cWhen the Wine Runs Out\u201d')).toEqual([{ kind: 'sermon', title: 'When the Wine Runs Out' }])
    expect(parseSetlist('Sermon Series \u201cOrdinary Saints\u201d \u2014 Part 3: Ruth')).toEqual([{ kind: 'sermon', title: 'Ordinary Saints \u2014 Part 3: Ruth' }])
    expect(parseSetlist('Sermon ......... Rev. Kim')).toEqual([{ kind: 'sermon', title: 'Sermon' }])
  })
  it('generalises beyond the exact probe wording', () => {
    const kinds = (line: string): string => parseSetlist(line).map((e) => e.kind).join('+') || 'skip'
    for (const el of ['Act of Confession', 'Quiet Reflection', 'Baptism of Children', 'Receiving New Members', 'Prayer Before Communion',
      'Words of Forgiveness', 'Mission Moment', 'Postlude \u2014 \u201cToccata\u201d (Widor)', 'Call to Worship (Psalm 95:1-7)', 'Anthem: \u201cTotal Praise\u201d']) {
      expect(kinds(el), el).toBe('element')
    }
    for (const skip of ['Greeters will welcome visitors at the door', 'Children may leave for Kids Church at this time.', 'https://snowhill.church/give',
      'office@snowhillchurch.org', 'snowhillchurch.org', 'Sunday, Oct. 4 \u2022 9:00 AM', 'October 4, 2026 at 10:30 a.m.', 'Organist: Tom Hart', 'Liturgist \u2014 Rev. Ann Lee']) {
      expect(kinds(skip), skip).toBe('skip')
    }
    // Songs stay songs — including ones that share words with the new patterns.
    for (const song of ['Silent Night', 'Offering - Paul Baloche', 'Prelude', 'Breathe', 'Here I Am to Worship', 'The Preaching of the Cross',
      'Sermon on the Mount', 'Act Justly', 'Grace Alone', 'Welcome', 'Communion']) {
      expect(kinds(song), song).toMatch(/song|element/)
    }
    expect(kinds('Silent Night')).toBe('song')
    expect(kinds('Offering - Paul Baloche')).toBe('song')
    expect(kinds('Sermon on the Mount')).toBe('song')
    expect(kinds('Act Justly')).toBe('song')
    // A reader with a reading still reads as the scripture.
    expect(parseSetlist('Lector: Ruth 1:16-17')).toEqual([{ kind: 'scripture', title: 'Ruth 1:16-17' }])
  })
})
