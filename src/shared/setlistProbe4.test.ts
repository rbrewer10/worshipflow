import { describe, expect, it } from 'vitest'
import { parseSetlist } from './setlistImport'
import { SETLIST_PROBE4_CASES } from './setlistProbe4.fixture'
import { SETLIST_PROBE3_CASES } from './setlistProbe3.fixture'

// Same scoring as QA's probe: kind must match, and the expected substring must
// appear in the title(s).
describe('QA B4-N3: retest4 setlist probe (76 fresh bulletin wordings, 61 graded)', () => {
  it('the fixture is QA\'s probe, whole', () => {
    expect(SETLIST_PROBE4_CASES).toHaveLength(76)
    expect(SETLIST_PROBE4_CASES.filter(([, want]) => want !== '?')).toHaveLength(61)
  })
  for (const [line, want, title] of SETLIST_PROBE4_CASES) {
    if (want === '?') continue
    it(`${JSON.stringify(line)} → ${want}${title ? ` "${title}"` : ''}`, () => {
      const r = parseSetlist(line)
      expect(r.length === 0 ? 'skip' : r.map((e) => e.kind).join('+')).toBe(want)
      if (title) expect(r.map((e) => e.title).join(' | ')).toContain(title)
    })
  }

  it('the three Psalm wordings come out as lookup-ready references', () => {
    expect(parseSetlist('Responsive Psalm: Psalm 46')).toEqual([{ kind: 'scripture', title: 'Psalm 46' }])
    expect(parseSetlist('Reading from the Psalter: Psalm 121')).toEqual([{ kind: 'scripture', title: 'Psalm 121' }])
    expect(parseSetlist('Psalm 23 \u2014 Responsive')).toEqual([{ kind: 'scripture', title: 'Psalm 23' }])
  })

  it('a rubric line is skipped, but a "*" bullet in front of an item is still a bullet', () => {
    expect(parseSetlist('* Please stand as you are able\n\u2020 indicates standing\n* Call to Worship\n*Hymn: Amazing Grace')).toEqual([
      { kind: 'element', title: 'Call to Worship' },
      { kind: 'song', title: 'Amazing Grace' },
    ])
  })

  it('the church-name line at the top of a bulletin is not a song', () => {
    expect(parseSetlist('Snow Hill Congregational Methodist Church\nCall to Worship')).toEqual([{ kind: 'element', title: 'Call to Worship' }])
    expect(parseSetlist('Build My Church')[0]?.kind).toBe('song')
  })

  it('songs that look like the new element words stay songs', () => {
    for (const line of ['Light of the World', 'Peace Be Still', 'Here I Am to Worship', 'Celebrate Jesus', 'Holy Spirit', 'The Proclamation']) {
      expect(parseSetlist(line)[0]?.kind, line).toBe('song')
    }
  })

  it('retest3\'s 65 still pass', () => {
    for (const [line, want, title] of SETLIST_PROBE3_CASES) {
      if (want === '?') continue
      const r = parseSetlist(line)
      expect(r.length === 0 ? 'skip' : r.map((e) => e.kind).join('+'), line).toBe(want)
      if (title) expect(r.map((e) => e.title).join(' | '), line).toContain(title)
    }
  })
})
