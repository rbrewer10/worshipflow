import { describe, expect, it } from 'vitest'
import { matchSongTitle, parseSetlist, parseSetlistDetailed } from './setlistImport'
import { PROBE9_LIBRARY as lib, PROBE9_SECTIONS } from './setlistProbe9.fixture'

const section = (letter: string): string[] => PROBE9_SECTIONS.find(([h]) => h.startsWith(`${letter}.`))![1]
const kinds = (line: string, library?: typeof lib): string =>
  parseSetlist(line, library ? { library } : {}).map((e) => e.kind).join('+') || 'skip'
const libId = (title: string): number => lib.find((s) => s.title === title)!.id

describe('QA B9-N1: who\'s serving — a qualifier or two before a serving noun', () => {
  it('all of probe9\'s personnel lines skip, with and without a library', () => {
    for (const line of section('B')) {
      expect(kinds(line), line).toBe('skip')
      expect(kinds(line, lib), line).toBe('skip')
    }
  })
  it('the 26 lines 8be25a7 turned into placeholders are reported as serving', () => {
    const r = parseSetlistDetailed(section('B').join('\n'))
    expect(r.entries).toEqual([])
    expect(new Set(r.skipped.map((s) => s.reason))).toEqual(new Set(['serving']))
  })
  it('song titles that start with or end in a role word stay songs (B8-N1 kept)', () => {
    // Role-labelled lines that already skipped on d984 and 8be25a7, no library title on the left.
    const roleLabelled = ['Pastor \u2013 Rev. Smith Band', 'Sound \u2013 Jesus Culture', 'Lector \u2013 Taiz\u00e9',
      'Cantor: Kyrie Eleison', 'Organist: Prelude in C (Bach)']
    for (const line of section('A')) {
      if (roleLabelled.includes(line)) continue
      expect(kinds(line, lib), line).toBe('song')
    }
    for (const line of ['Lord of Hosts \u2013 Shane & Shane', 'Promise Keeper - Danny Gokey', 'Burden Bearer \u2013 Jason Crabb',
      'Heavenly Host \u2013 Chancel Choir', 'Covenant Keeper \u2013 Joe Pace', 'My Keeper - arr. Mark Hayes', 'Soul Keeper \u2013 arr. Smith',
      'Lord of Hosts: Shane & Shane', 'Follow the Leader \u2013 Some Band', 'Shepherd and Leader \u2013 Some Band']) {
      expect(kinds(line), line).toBe('song')
    }
  })
  it('the wide label needs a name on the right', () => {
    expect(kinds('Choir Leader: Ida Ross')).toBe('skip')
    expect(kinds('Music: Amazing Grace')).toBe('song')
    expect(kinds('Prayer: The Lord\u2019s Prayer')).not.toBe('skip')
  })
})

describe('QA B9-N2: a hymnal number after the title links when the rest is a library song', () => {
  it('No. / p. / pg. / Hymn / (n) tails', () => {
    for (const line of ['Amazing Grace No. 378', 'Amazing Grace p. 378', 'Amazing Grace pg. 378', 'Amazing Grace Hymn 378',
      'Amazing Grace (378)', 'Amazing Grace, No. 378', 'Amazing Grace #378', 'Amazing Grace UMH 378']) {
      const r = parseSetlist(line, { library: lib })
      expect(r.map((e) => e.kind), line).toEqual(['song'])
      expect(matchSongTitle(r[0].title, lib), line).toBe(libId('Amazing Grace'))
    }
  })
  it('keeps the Symphony No. 9 fix: no library match, the title is kept whole', () => {
    expect(parseSetlist('Symphony No. 9', { library: lib })).toEqual([{ kind: 'song', title: 'Symphony No. 9' }])
    expect(matchSongTitle('Symphony No. 9', lib)).toBeNull()
    expect(matchSongTitle('Symphony No. 9', [{ id: 99, title: 'Symphony' }])).toBe(99)
    expect(parseSetlist('Mass No. 2 in G')).toEqual([{ kind: 'song', title: 'Mass No. 2 in G' }])
  })
})

describe('QA B9-N3: a colon credit links', () => {
  it('"<title>: <artist>" matches the title', () => {
    const songs = [{ id: 1, title: 'Promise Keeper' }, { id: 2, title: 'Lord of Hosts' }, { id: 3, title: 'Amazing Grace' }]
    expect(matchSongTitle('Promise Keeper: Danny Gokey', songs)).toBe(1)
    expect(matchSongTitle('Lord of Hosts: Shane & Shane', songs)).toBe(2)
    expect(matchSongTitle('Amazing Grace: arr. Dan Forrest', songs)).toBe(3)
    expect(matchSongTitle('Amazing Grace: Chancel Choir', songs)).toBe(3)
    // Not a credit: the colon is part of a longer title.
    expect(matchSongTitle('Amazing Grace: My Chains Are Gone', songs)).toBeNull()
  })
})

describe('QA B9-N4: dates, headings and colon roles are not rescued as library songs', () => {
  it('probe9 section C', () => {
    // The dash form keeps B8-N1's song–artist reading when the right side is a
    // plain name; a date, a time or a titled name still makes it a skip.
    const songArtist = ['Prayer Team \u2013 The Elders', 'Worship Leader \u2013 Jim Price']
    for (const line of section('C')) {
      expect(kinds(line, lib), line).toBe(songArtist.includes(line) ? 'song' : 'skip')
    }
    expect(kinds('Worship Leader \u2014 Rev. Jo Park', lib)).toBe('skip')
    expect(kinds('Security \u2013 April 5', lib)).toBe('skip')
  })
  it('reasons are still reported', () => {
    const r = parseSetlistDetailed(section('C').slice(0, 5).join('\n'), { library: lib })
    expect(r.skipped.map((s) => s.reason)).toEqual(['date', 'date', 'date', 'heading', 'serving'])
  })
})
