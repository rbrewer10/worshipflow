import { describe, expect, it } from 'vitest'
import { parseSetlist } from './setlistImport'
import { SETLIST_PROBE3_CASES } from './setlistProbe3.fixture'

// Same scoring as QA's probe: kind must match, and the expected substring must
// appear in the title(s).
describe('QA B3-N6: retest3 setlist probe (65 fresh bulletin wordings)', () => {
  for (const [line, want, title] of SETLIST_PROBE3_CASES) {
    if (want === '?') continue
    it(`${JSON.stringify(line)} → ${want}${title ? ` "${title}"` : ''}`, () => {
      const r = parseSetlist(line)
      expect(r.length === 0 ? 'skip' : r.map((e) => e.kind).join('+')).toBe(want)
      if (title) expect(r.map((e) => e.title).join(' | ')).toContain(title)
    })
  }

  it('a line holding a chapter:verse reference never becomes a song placeholder', () => {
    for (const line of ['Scripture Lesson: Luke 2:1-20', 'Old Testament Lesson – Isaiah 9:2-7', 'John 3:16 (KJV)', 'Epistle Lesson ~ Romans 12:1-2', 'Responsive Psalm 95:1-7']) {
      expect(parseSetlist(line)[0]?.kind, line).not.toBe('song')
    }
  })

  it('titles come out lookup-ready: translation and markup stripped', () => {
    expect(parseSetlist('John 3:16 (KJV)')).toEqual([{ kind: 'scripture', title: 'John 3:16' }])
    expect(parseSetlist('Scripture Lesson: Luke 2:1-20')).toEqual([{ kind: 'scripture', title: 'Luke 2:1-20' }])
    expect(parseSetlist('Amazing Grace*')).toEqual([{ kind: 'song', title: 'Amazing Grace' }])
    expect(parseSetlist('Opening Hymn #89 \u2013 Joyful, Joyful')).toEqual([{ kind: 'song', title: 'Joyful, Joyful' }])
    expect(parseSetlist('Hymn of Praise\tNo. 89\tJoyful, Joyful, We Adore Thee')).toEqual([{ kind: 'song', title: 'Joyful, Joyful, We Adore Thee' }])
    expect(parseSetlist('Sermon Series: Hope')).toEqual([{ kind: 'sermon', title: 'Hope' }])
  })

  it('the stricter rules keep real songs as songs', () => {
    for (const line of ['Joy to the World!', 'Praise to the Lord, the Almighty', 'Worthy of Worship', 'Hosanna (Praise Is Rising)', 'This Is Amazing Grace', 'Holy Spirit (Live)']) {
      expect(parseSetlist(line)[0]?.kind, line).toBe('song')
    }
  })
})
