import { describe, expect, it } from 'vitest'
import { matchSongTitle, parseSetlist, parseSetlistDetailed } from './setlistImport'

// QA retest11 B11-N1: a double space, a tab or a non-breaking space inside a
// line broke matching. 'Amazing  Grace' became an unlinked placeholder with
// the song in the library, and 'Head  Usher: Carl Mims' / 'Senior  Pastor:
// Ryan Brewer' were imported as song placeholders. The preview row collapses
// the double space, so it looked like it should have linked.
const lib = ['Amazing Grace', 'Great Is Thy Faithfulness', 'Holy, Holy, Holy', 'Peace Speaker'].map((title, i) => ({ id: i + 1, title }))
const id = (title: string): number => lib.find((s) => s.title === title)!.id
const NBSP = '\u00A0'
const song = (line: string, library = lib): { title: string; id: number | null } | null => {
  const e = parseSetlist(line, { library })
  return e.length === 1 && e[0].kind === 'song' ? { title: e[0].title, id: matchSongTitle(e[0].title, library) } : null
}

describe('QA B11-N1: spaces, tabs and non-breaking spaces inside a line', () => {
  it('a double space, a tab or a non-breaking space between words still links the song', () => {
    for (const line of ['Amazing  Grace', 'Amazing\tGrace', `Amazing${NBSP}Grace`, `Amazing${NBSP}${NBSP}Grace`, `Amazing ${NBSP}Grace`]) {
      expect(song(line), JSON.stringify(line)).toEqual({ title: 'Amazing Grace', id: id('Amazing Grace') })
    }
    expect(song('Great Is  Thy Faithfulness')).toEqual({ title: 'Great Is Thy Faithfulness', id: id('Great Is Thy Faithfulness') })
    expect(song('Holy,  Holy,  Holy')).toEqual({ title: 'Holy, Holy, Holy', id: id('Holy, Holy, Holy') })
    expect(song('Hymn:  Amazing  Grace')).toEqual({ title: 'Amazing Grace', id: id('Amazing Grace') })
    expect(song('Peace  Speaker: Geron Davis')?.id).toBe(id('Peace Speaker'))
    expect(song('Peace\tSpeaker: Geron Davis')?.id).toBe(id('Peace Speaker'))
  })
  it('without a library the double space is still collapsed in the title', () => {
    expect(parseSetlist('Amazing  Grace')).toEqual([{ kind: 'song', title: 'Amazing Grace' }])
    expect(parseSetlist(`Amazing${NBSP}${NBSP}Grace`)).toEqual([{ kind: 'song', title: 'Amazing Grace' }])
  })
  it('personnel lines with a double space, a tab or a non-breaking space are skipped, with and without a library', () => {
    const lines = ['Head  Usher: Carl Mims', 'Senior  Pastor: Ryan Brewer', 'Choir  Director: Gloria Lee', 'Head\tUsher: Carl Mims',
      `Senior${NBSP}${NBSP}Pastor: Ryan Brewer`, 'Youth  Leader: Jim Price', 'Greeter:  Mary Hill']
    for (const library of [undefined, lib]) {
      const r = parseSetlistDetailed(lines.join('\n'), library ? { library } : {})
      expect(r.entries).toEqual([])
      expect(r.skipped.map((s) => s.reason)).toEqual(lines.map(() => 'serving'))
    }
  })
  it('a library title saved with extra whitespace matches too', () => {
    const odd = [{ id: 7, title: 'Amazing  Grace' }, { id: 8, title: 'Great Is\tThy Faithfulness' }, { id: 9, title: `Holy,${NBSP}Holy, Holy ` }]
    expect(matchSongTitle('Amazing Grace', odd)).toBe(7)
    expect(matchSongTitle('Great Is Thy Faithfulness', odd)).toBe(8)
    expect(matchSongTitle('Holy, Holy, Holy', odd)).toBe(9)
    expect(song('Amazing  Grace', odd)).toEqual({ title: 'Amazing Grace', id: 7 })
  })
  it('the preview title is the imported title: no double spaces or tabs, and it matches as the import does', () => {
    const r = parseSetlistDetailed(['Amazing  Grace', 'Hymn:\tGreat Is  Thy Faithfulness', `Holy,${NBSP} Holy, Holy`].join('\n'), { library: lib })
    expect(r.entries.map((e) => e.title)).toEqual(['Amazing Grace', 'Great Is Thy Faithfulness', 'Holy, Holy, Holy'])
    for (const e of r.entries) expect(matchSongTitle(e.title, lib), e.title).not.toBeNull()
  })
  it('a tab or a wide gap is still a column break in bulletin layouts', () => {
    expect(parseSetlist('Call to Worship\t\tPastor Jim')).toEqual([{ kind: 'element', title: 'Call to Worship \u2014 Pastor Jim' }])
    expect(parseSetlist('Call to Worship     Pastor Jim')).toEqual([{ kind: 'element', title: 'Call to Worship \u2014 Pastor Jim' }])
    expect(parseSetlist('Hymn of Praise\tNo. 89\tJoyful, Joyful, We Adore Thee')).toEqual([{ kind: 'song', title: 'Joyful, Joyful, We Adore Thee' }])
    expect(song('Amazing Grace\tNo. 378')).toEqual({ title: 'Amazing Grace', id: id('Amazing Grace') })
  })
})
