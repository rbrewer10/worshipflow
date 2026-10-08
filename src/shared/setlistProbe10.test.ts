import { describe, expect, it } from 'vitest'
import { matchSongTitle, parseSetlist, parseSetlistDetailed } from './setlistImport'
import { PROBE9_LIBRARY, PROBE9_SECTIONS } from './setlistProbe9.fixture'

// QA retest10 B10-N1: a song title made of a describing word and a role noun
// ("Peace Speaker", "Story Teller"), with its credit after a colon or a titled
// name after a dash, was skipped as who's serving even with the song in the
// library. The library title now wins over the generic role label.
const lib = ['Peace Speaker', 'Story Teller', 'Lamp Lighter', 'Bell Ringer', 'Faithful Servant', 'Amazing Grace']
  .map((title, i) => ({ id: i + 1, title }))
const id = (title: string): number => lib.find((s) => s.title === title)!.id
const kinds = (line: string, library?: typeof lib): string =>
  parseSetlist(line, library ? { library } : {}).map((e) => e.kind).join('+') || 'skip'
const linked = (line: string, library = lib): number | null => {
  const e = parseSetlist(line, { library })
  return e.length === 1 && e[0].kind === 'song' ? matchSongTitle(e[0].title, library) : null
}

describe('QA B10-N1: a library title beats the generic role label', () => {
  it('the three lines from retest10 are linked library songs', () => {
    expect(linked('Peace Speaker: Geron Davis')).toBe(id('Peace Speaker'))
    expect(linked('Story Teller: Morgan Cryar')).toBe(id('Story Teller'))
    expect(linked('Peace Speaker \u2013 Dr. Geron Davis')).toBe(id('Peace Speaker'))
  })
  it('the other credit forms stay linked', () => {
    for (const line of ['Peace Speaker \u2013 Geron Davis', 'Peace Speaker - Geron Davis', 'Peace Speaker', 'Lamp Lighter \u2013 Ray Boltz',
      'Bell Ringer: Ann Lee', 'Story Teller \u2014 Rev. Morgan Cryar', 'Lamp Lighter: arr. Ray Boltz']) {
      expect(linked(line), line).not.toBeNull()
    }
  })
  it('without a library they are still skipped as who\'s serving (nothing to tell them apart)', () => {
    const r = parseSetlistDetailed(['Peace Speaker: Geron Davis', 'Story Teller: Morgan Cryar', 'Peace Speaker \u2013 Dr. Geron Davis'].join('\n'))
    expect(r.entries).toEqual([])
    expect(r.skipped.map((s) => s.reason)).toEqual(['serving', 'serving', 'serving'])
  })
  it('the same shape with a title that is not in the library is still skipped', () => {
    for (const line of ['Freedom Speaker \u2013 Jim Price', 'Truth Teller \u2013 Ann Lee', 'Soul Leader: Jim Price', 'Choir Leader: Ida Ross',
      'Guest Speaker: Dr. Ann Lee', 'Usher Captain \u2013 Officer Ed Hale']) {
      expect(kinds(line, lib), line).toBe('skip')
    }
  })
  it('known roles, pastor and service-area lines are not rescued by the generic rule', () => {
    for (const line of ['Greeter: Mary Hill', 'Head Usher \u2013 Carl Mims', 'Sound & Video: Jo Park', 'Pastor: Rev. Jo Park',
      'Ushers & Greeters: The Wells', 'Greeters (Front Door): The Smiths']) {
      expect(kinds(line, lib), line).toBe('skip')
    }
    // Known roles with a same-named library song (B9-N4) still skip on a colon.
    for (const line of ['Song Leader: Ann Lee', 'Security: Officer Dan Miles', 'Greeters: The Smiths', 'Readers: Ann & Jim']) {
      expect(kinds(line, PROBE9_LIBRARY), line).toBe('skip')
    }
  })
  it('probe9 sections B and C are unchanged (B9-N1, B9-N4)', () => {
    const section = (letter: string): string[] => PROBE9_SECTIONS.find(([h]) => h.startsWith(`${letter}.`))![1]
    for (const line of section('B')) expect(kinds(line, PROBE9_LIBRARY), line).toBe('skip')
    const rescued = ['Prayer Team \u2013 The Elders', 'Worship Leader \u2013 Jim Price'] // documented dash trade-off
    for (const line of section('C')) expect(kinds(line, PROBE9_LIBRARY), line).toBe(rescued.includes(line) ? 'song' : 'skip')
  })
})
