import { describe, expect, it } from 'vitest'
import { matchSongTitle, parseSetlist } from './setlistImport'
import { SETLIST_PROBE7_CASES } from './setlistProbe7.fixture'
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
// QA's probe skips 'Gloria Patri' as already seen (earlier probes leave it
// '?'); it is sung, like the Doxology the 106-line probe wants as a song, so it
// stays a song and can match the library.
const SUNG = new Set(['Gloria Patri'])
const graded = SETLIST_PROBE7_CASES.filter(([line, want]) => want !== '?' && !SUNG.has(line))
const kinds = (line: string): string => parseSetlist(line).map((e) => e.kind).join('+') || 'skip'

// Same scoring as QA's probe: kind must match, and the expected substring must
// appear in the title(s).
describe('QA B7-N2: retest7 setlist probe (49 fresh bulletin wordings, 45 graded)', () => {
  it('the fixture is QA\'s probe, whole', () => {
    expect(SETLIST_PROBE7_CASES).toHaveLength(49)
    expect(SETLIST_PROBE7_CASES.filter(([, want]) => want !== '?')).toHaveLength(46)
    expect(graded).toHaveLength(45)
    expect(kinds('Gloria Patri')).toBe('song')
  })
  for (const [line, want, title] of graded) {
    it(`${JSON.stringify(line)} → ${want}${title ? ` "${title}"` : ''}`, () => {
      const r = parseSetlist(line)
      expect(r.length === 0 ? 'skip' : r.map((e) => e.kind).join('+')).toBe(want)
      if (title) expect(r.map((e) => e.title).join(' | ')).toContain(title)
    })
  }
  it('retest6\'s 51, retest5\'s 62, retest4\'s 61 and retest3\'s 65 still pass', () => {
    expect(score(SETLIST_PROBE6_CASES)).toEqual([])
    expect(score(SETLIST_PROBE5_CASES)).toEqual([])
    expect(score(SETLIST_PROBE4_CASES)).toEqual([])
    expect(score(SETLIST_PROBE3_CASES)).toEqual([])
  })
  it('no retest7 line becomes a song placeholder unless it is a song', () => {
    const placeholders = graded
      .filter(([, want]) => want !== 'song')
      .filter(([line]) => parseSetlist(line).some((e) => e.kind === 'song'))
    expect(placeholders).toEqual([])
  })
  it('the whole bulletin paste leaves no junk: the serving block, its heading and the notices are skipped', () => {
    const bulletin = [
      'Snow Hill Congregational Methodist Church', 'Sunday, October 11, 2026 \u2014 11:00 AM', 'Prelude', 'Welcome & Announcements',
      '*Opening Hymn \u2014 \u201cHoly, Holy, Holy\u201d (No. 1)', 'Call to Worship (Psalm 95:1-7)', 'Pastoral Prayer', 'Gloria Patri',
      'Tithes and Offerings', 'Doxology', 'Scripture Lesson: Luke 15:11-32',
      'Sermon \u2026\u2026\u2026\u2026 \u201cThe Waiting Father\u201d \u2026\u2026\u2026\u2026 Rev. Ryan Brewer', '*Hymn of Invitation: \u201cJust As I Am\u201d',
      'Benediction', '* Please stand as you are able', 'Nursery available', 'Fellowship lunch to follow', 'SERVING TODAY',
      'Ushers: Tom Baker, Bill Ray', 'Greeters: The Johnson Family', 'Acolyte: Emma Lane', 'Nursery: Linda Fox', 'Sound: Ryan Brewer', 'snowhillchurch.net',
    ].join('\n')
    expect(parseSetlist(bulletin)).toEqual([
      { kind: 'element', title: 'Prelude' },
      { kind: 'element', title: 'Welcome & Announcements' },
      { kind: 'song', title: 'Holy, Holy, Holy' },
      { kind: 'element', title: 'Call to Worship (Psalm 95:1-7)' },
      { kind: 'element', title: 'Pastoral Prayer' },
      { kind: 'song', title: 'Gloria Patri' },
      { kind: 'element', title: 'Tithes and Offerings' },
      { kind: 'song', title: 'Doxology' },
      { kind: 'scripture', title: 'Luke 15:11-32' },
      { kind: 'sermon', title: 'The Waiting Father' },
      { kind: 'song', title: 'Just As I Am' },
      { kind: 'element', title: 'Benediction' },
    ])
  })
  it('a hymn line keeps just the song\'s name, and matches the library', () => {
    const lib = [{ id: 1, title: 'Holy, Holy, Holy' }, { id: 2, title: 'Joyful, Joyful, We Adore Thee' }, { id: 3, title: 'Doxology' },
      { id: 4, title: 'Just As I Am' }, { id: 5, title: 'Amazing Grace' }]
    const title = (line: string): string => parseSetlist(line).map((e) => e.title).join(' | ')
    expect(title('Opening Hymn \u2014 \u201cHoly, Holy, Holy\u201d (UMH 64)')).toBe('Holy, Holy, Holy')
    expect(title('Hymn of Praise #89 \u201cJoyful, Joyful, We Adore Thee\u201d')).toBe('Joyful, Joyful, We Adore Thee')
    expect(title('Doxology (UMH 95)')).toBe('Doxology')
    expect(title('UMH 378 Amazing Grace')).toBe('Amazing Grace')
    // matchSongTitle itself strips quotes, hymnal numbers and hymn labels too.
    expect(matchSongTitle('"Holy, Holy, Holy" (UMH 64)', lib)).toBe(1)
    expect(matchSongTitle('"Holy, Holy, Holy" (No. 1)', lib)).toBe(1)
    expect(matchSongTitle('Hymn of Praise #89 "Joyful, Joyful, We Adore Thee"', lib)).toBe(2)
    expect(matchSongTitle('Doxology #95', lib)).toBe(3)
    expect(matchSongTitle('"Just As I Am"', lib)).toBe(4)
    expect(matchSongTitle('"Unknown Hymn" (UMH 1)', lib)).toBeNull()
    // A bare hymnal number stays what it was.
    expect(title('Hymn No. 301')).toBe('Hymn No. 301')
    expect(title('Hymn 301')).toBe('Hymn 301')
  })
  it('generalises beyond the exact probe wording', () => {
    for (const skip of ['Usher: Al Grant', 'Head Ushers \u2014 Al & Bo Grant', 'Greeter \u2013 Kay Long', 'Video Tech: Sam Ruiz', 'Camera Operator: Lee Park',
      'Sound Technician \u2014 Jo Hale', 'Gospel Reader: Pat Kim', 'Elder of the Week: Ann Fry', 'Money Counters: the Hales', 'Communion Servers: Bo and Kay Lane',
      'Chancel Flowers \u2014 in honor of the Smiths', 'Serving This Morning: Ushers \u2013 Al Grant; Greeters \u2013 Kay Long', 'Those Serving Today', 'Serving Today:',
      'November 1, 2026 \u2022 8:30, 9:45 & 11:00 a.m.', 'Sunday Evening, November 1, 2026', 'All Saints Sunday \u2014 November 1, 2026',
      'Third Sunday of Advent, December 13, 2026', 'Reformation Sunday | October 25, 2026', 'Nursery care is available for ages 0\u20134',
      'Potluck lunch will follow in the fellowship hall', 'Coffee hour follows the service']) {
      expect(kinds(skip), skip).toBe('skip')
    }
    // Not roles: element and sermon labels, readings and the songs that share words with the new patterns.
    expect(kinds('Scripture: John 3:16')).toBe('scripture')
    expect(parseSetlist('Scripture Reader: John 3:16')).toEqual([{ kind: 'scripture', title: 'John 3:16' }])
    expect(kinds('Sermon: Grace Upon Grace')).toBe('sermon')
    expect(kinds('Call to Worship: Pastor Jim')).toBe('element')
    expect(kinds('Hymn of the Day: A Mighty Fortress Is Our God')).toBe('song')
    for (const song of ['Shepherd of My Soul', 'Lead Me to the Cross', 'Servant King', 'Follow You', 'I Have Decided to Follow Jesus', 'Sunday Morning',
      'This Is the Day', 'Morning Has Broken', 'Holy Spirit: Living Breath of God', 'Ancient of Days']) {
      expect(kinds(song), song).toBe('song')
    }
  })
})
