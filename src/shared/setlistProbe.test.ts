import { describe, expect, it } from 'vitest'
import { matchSongTitle, parseSetlist } from './setlistImport'
import { SETLIST_PROBE_BULLETIN, SETLIST_PROBE_CASES } from './setlistProbe.fixture'

const kindOf = (line: string): string => parseSetlist(line).map((e) => e.kind).join('+') || '(skipped)'

describe('QA B2-N6: retest2 setlist probe (106 bulletin lines)', () => {
  for (const [line, want] of SETLIST_PROBE_CASES) {
    if (want === '?') continue
    it(`${JSON.stringify(line)} → ${want}`, () => expect(kindOf(line)).toBe(want))
  }

  it('titles are cleaned: no trailing colon, &amp; decoded, reference kept for dash-separated readings', () => {
    expect(parseSetlist('Offering:')).toEqual([{ kind: 'element', title: 'Offering' }])
    expect(parseSetlist('Tithes &amp; Offerings')).toEqual([{ kind: 'element', title: 'Tithes & Offerings' }])
    expect(parseSetlist('Scripture Reading – John 3:16')).toEqual([{ kind: 'scripture', title: 'John 3:16' }])
    expect(parseSetlist('Scripture Reading — Romans 8:28')).toEqual([{ kind: 'scripture', title: 'Romans 8:28' }])
    expect(parseSetlist('Scripture Reading (Romans 8)')).toEqual([{ kind: 'scripture', title: 'Romans 8' }])
    expect(parseSetlist('Scripture Reading:')).toEqual([{ kind: 'element', title: 'Scripture Reading' }])
    expect(parseSetlist('10:30 Call to Worship')).toEqual([{ kind: 'element', title: 'Call to Worship' }])
    expect(parseSetlist('a. Call to Worship')).toEqual([{ kind: 'element', title: 'Call to Worship' }])
    expect(parseSetlist('Call to Worship ......... Pastor Jim')).toEqual([{ kind: 'element', title: 'Call to Worship — Pastor Jim' }])
    expect(parseSetlist('Call to Worship\t\tPastor Jim')).toEqual([{ kind: 'element', title: 'Call to Worship — Pastor Jim' }])
    expect(parseSetlist('Children\u2019s Moment')).toEqual([{ kind: 'element', title: "Children's Moment" }])
  })

  it('a reading label with the reference after a leader is scripture', () => {
    expect(parseSetlist('Scripture Reading ........ John 3:16')).toEqual([{ kind: 'scripture', title: 'John 3:16' }])
  })

  it('a song keeps its library-matchable title (credits after a leader dropped; hymn labels stripped)', () => {
    expect(parseSetlist('Amazing Grace ....... Congregation')).toEqual([{ kind: 'song', title: 'Amazing Grace' }])
    expect(parseSetlist('Opening Hymn: Holy, Holy, Holy')).toEqual([{ kind: 'song', title: 'Holy, Holy, Holy' }])
    expect(parseSetlist('Hymn of Invitation: Just As I Am')).toEqual([{ kind: 'song', title: 'Just As I Am' }])
    expect(parseSetlist('Hymn 301')[0].kind).toBe('song') // a hymnal number, not a Bible book
    expect(parseSetlist('Hymn #301')[0].kind).toBe('song')
    // an element word that is also a song title, with an artist: still a song, and it matches the library
    expect(parseSetlist('Offering - Paul Baloche')[0].kind).toBe('song')
    expect(matchSongTitle('Offering - Paul Baloche', [{ id: 3, title: 'Offering' }])).toBe(3)
    expect(parseSetlist('Offering - Pastor Jim')[0].kind).toBe('element')
  })

  it('the whole bulletin paste: no title/date lines, no "Song: Prelude" placeholder', () => {
    expect(parseSetlist(SETLIST_PROBE_BULLETIN)).toEqual([
      { kind: 'element', title: 'Prelude' },
      { kind: 'element', title: 'Call to Worship' },
      { kind: 'song', title: 'Holy, Holy, Holy' },
      { kind: 'element', title: 'Welcome & Announcements' },
      { kind: 'element', title: 'Tithes & Offerings' },
      { kind: 'song', title: 'Doxology' }, // Ryan's decision #6: a song like any other (doxologyIsSong.test.ts)
      { kind: 'scripture', title: 'Romans 8:28-39' },
      { kind: 'sermon', title: 'More Than Conquerors' },
      { kind: 'song', title: 'Just As I Am' },
      { kind: 'element', title: 'Benediction' },
      { kind: 'element', title: 'Postlude' },
    ])
  })
})
