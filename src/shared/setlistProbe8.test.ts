import { describe, expect, it } from 'vitest'
import { matchSongTitle, parseSetlist, parseSetlistDetailed } from './setlistImport'
import { SETLIST_PROBE8_CASES, SONG_ARTIST_SERVING_NOUN } from './setlistProbe8.fixture'
import { SETLIST_PROBE7_CASES } from './setlistProbe7.fixture'
import { SETLIST_PROBE6_CASES } from './setlistProbe6.fixture'
import { SETLIST_PROBE5_CASES } from './setlistProbe5.fixture'
import { SETLIST_PROBE4_CASES } from './setlistProbe4.fixture'
import { SETLIST_PROBE3_CASES } from './setlistProbe3.fixture'

const score = (cases: [string, string, string?][], except: string[] = []): string[] =>
  cases.flatMap(([line, want, title]) => {
    if (want === '?' || except.includes(line)) return []
    const r = parseSetlist(line)
    const got = r.length === 0 ? 'skip' : r.map((e) => e.kind).join('+')
    const ok = got === want && (!title || r.map((e) => e.title).join(' | ').includes(title))
    return ok ? [] : [`${line} -> ${got} [${r.map((e) => e.title).join(' | ')}]`]
  })
const kinds = (line: string): string => parseSetlist(line).map((e) => e.kind).join('+') || 'skip'

describe('QA B8-N1: song–artist lines are never taken for who\'s serving', () => {
  it('QA\'s 12 breadth lines are songs, with or without the song in the library', () => {
    for (const line of SONG_ARTIST_SERVING_NOUN) expect(kinds(line), line).toBe('song')
    const lib = [{ id: 1, title: 'Lord of Hosts' }, { id: 2, title: 'Promise Keeper' }, { id: 3, title: 'Covenant Keeper' },
      { id: 4, title: 'Burden Bearer' }, { id: 5, title: 'My Keeper' }, { id: 6, title: 'Heavenly Host' }, { id: 7, title: 'Soul Keeper' }]
    for (const line of SONG_ARTIST_SERVING_NOUN) {
      const r = parseSetlist(line, { library: lib })
      expect(r.map((e) => e.kind), line).toEqual(['song'])
      // The title-before-the-credit is what the import matches the library with.
      const left = line.split(/\s+[-–—]\s+|:\s+/)[0]
      expect(matchSongTitle(r[0].title, lib) ?? matchSongTitle(left, lib), line).toBe(lib.find((s) => s.title === left)?.id)
    }
  })
  it('real who\'s-serving lines still skip — the whole label must be a known role', () => {
    for (const line of ['Worship Leader \u2013 Al Fry', 'Song Leader: Bo Dee', 'Head Usher \u2014 Cy Long', 'Sound Tech: Ed Moss',
      'Usher: Al Fry', 'Greeter: Bo Dee', 'Scripture Reader: Cy Long', 'Communion Stewards: Ed and Fay Moss', 'Counters: Al & Bo Fry',
      'Deacon of the Month: Cy Long', 'Camera Operator: Lee Park', 'Video Tech: Sam Ruiz', 'Offering Counters \u2014 Jan & Bob Wells']) {
      expect(kinds(line), line).toBe('skip')
    }
    // Ends in a serving noun but isn't a role: a song.
    for (const line of ['Mercy Reader - Test', 'The Great Physician - Leader', 'Faithful Steward \u2013 Some Artist', 'Shepherd and Keeper: Band Name']) {
      expect(kinds(line), line).toBe('song')
    }
  })
  it('a skipped-looking line whose song part is in the library comes in as that song', () => {
    const lib = [{ id: 9, title: 'Sound Tech' }, { id: 10, title: 'Head Usher' }]
    expect(parseSetlist('Sound Tech: Ed Moss')).toEqual([])
    expect(parseSetlist('Sound Tech: Ed Moss', { library: lib })).toEqual([{ kind: 'song', title: 'Sound Tech' }])
    expect(parseSetlist('Head Usher \u2014 Cy Long', { library: lib })).toEqual([{ kind: 'song', title: 'Head Usher \u2014 Cy Long' }])
    // Not for the bulletin's own key.
    expect(parseSetlist('* Please stand as you are able', { library: [{ id: 1, title: 'Please stand as you are able' }] })).toEqual([])
  })
  it('every skipped line is reported, with why', () => {
    const r = parseSetlistDetailed([
      'Mill Creek Congregational Methodist Church', 'Sunday, November 8, 2026 \u2014 10:30 AM', 'Prelude', '* Please stand if you are able',
      'Promise Keeper \u2013 Danny Gokey', 'Nursery is available', 'Serving Today', 'Usher: Al Fry', 'millcreekchurch.org',
    ].join('\n'))
    expect(r.entries).toEqual([{ kind: 'element', title: 'Prelude' }, { kind: 'song', title: 'Promise Keeper \u2013 Danny Gokey' }])
    expect(r.skipped).toEqual([
      { line: 'Mill Creek Congregational Methodist Church', reason: 'heading' },
      { line: 'Sunday, November 8, 2026 \u2014 10:30 AM', reason: 'date' },
      { line: 'Please stand if you are able', reason: 'rubric' },
      { line: 'Nursery is available', reason: 'notice' },
      { line: 'Serving Today', reason: 'heading' },
      { line: 'Usher: Al Fry', reason: 'serving' },
      { line: 'millcreekchurch.org', reason: 'notice' },
    ])
  })
  it('QA\'s 72-song-artist-paste setlist: 13 lines, 13 items, the library songs all match', () => {
    const lib = ['Lord of Hosts', 'Promise Keeper', 'Way Maker', 'Covenant Keeper', 'Burden Bearer', 'Goodness of God', 'Holy, Holy, Holy']
      .map((title, i) => ({ id: i + 1, title }))
    const setlist = ['Prelude', 'Lord of Hosts \u2013 Shane & Shane', 'Welcome & Announcements', 'Promise Keeper \u2013 Danny Gokey',
      'Way Maker \u2013 Leeland', 'Covenant Keeper \u2013 Joe Pace', 'Scripture Reading: Psalm 46:1-3', 'Burden Bearer - Jason Crabb',
      'Goodness of God \u2013 Bethel Music', 'Holy, Holy, Holy (Leader: Jim Price)', 'Sermon: Be Still', 'Heavenly Host \u2013 Chancel Choir', 'Benediction'].join('\n')
    const r = parseSetlistDetailed(setlist, { library: lib })
    expect(r.skipped).toEqual([])
    expect(r.entries.map((e) => e.kind)).toEqual(['element', 'song', 'element', 'song', 'song', 'song', 'scripture', 'song', 'song', 'song', 'sermon', 'song', 'element'])
    const songs = r.entries.filter((e) => e.kind === 'song').map((e) => matchSongTitle(e.title, lib))
    // Heavenly Host isn't in this library: a placeholder, as on 57bc.
    expect(songs).toEqual([1, 2, 3, 4, 5, 6, 7, null])
  })
  it('a "(Leader: …)" note comes off the title, so it matches the library', () => {
    const lib = [{ id: 1, title: 'Holy, Holy, Holy' }, { id: 2, title: 'Way Maker' }]
    expect(parseSetlist('Holy, Holy, Holy (Leader: Jim Price)')).toEqual([{ kind: 'song', title: 'Holy, Holy, Holy' }])
    expect(matchSongTitle('Holy, Holy, Holy (Leader: Jim Price)', lib)).toBe(1)
    expect(matchSongTitle('Way Maker (Song Leader: Ann Lee)', lib)).toBe(2)
    expect(matchSongTitle('Way Maker (Worship Leader \u2013 Ann)', lib)).toBe(2)
    // …but not a note that is part of the name.
    expect(parseSetlist('Psalm 23 (I Am Not Alone)').map((e) => e.title)).not.toContain('Psalm 23')
  })
  it('a number that belongs to the title stays', () => {
    expect(parseSetlist('Symphony No. 9')).toEqual([{ kind: 'song', title: 'Symphony No. 9' }])
    expect(parseSetlist('Be Thou My Vision, No. 451')).toEqual([{ kind: 'song', title: 'Be Thou My Vision' }])
    expect(parseSetlist('Doxology #95')).toEqual([{ kind: 'song', title: 'Doxology' }])
  })
})

describe('QA retest8 setlist probe (53 fresh bulletin wordings)', () => {
  it('the fixture is QA\'s probe, whole', () => {
    expect(SETLIST_PROBE8_CASES).toHaveLength(53)
  })
  for (const [line, want, title] of SETLIST_PROBE8_CASES) {
    if (want === '?') continue
    it(`${JSON.stringify(line)} → ${want}${title ? ` "${title}"` : ''}`, () => {
      const r = parseSetlist(line)
      expect(r.length === 0 ? 'skip' : r.map((e) => e.kind).join('+')).toBe(want)
      if (title) expect(r.map((e) => e.title).join(' | ')).toContain(title)
    })
  }
  it('retest7\'s, retest6\'s, retest5\'s, retest4\'s and retest3\'s still pass', () => {
    expect(score(SETLIST_PROBE7_CASES, ['Gloria Patri'])).toEqual([])
    expect(score(SETLIST_PROBE6_CASES)).toEqual([])
    expect(score(SETLIST_PROBE5_CASES)).toEqual([])
    expect(score(SETLIST_PROBE4_CASES)).toEqual([])
    expect(score(SETLIST_PROBE3_CASES)).toEqual([])
  })
})
