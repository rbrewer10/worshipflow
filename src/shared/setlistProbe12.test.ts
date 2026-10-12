import { describe, expect, it } from 'vitest'
import { matchSongTitle, parseSetlistDetailed } from './setlistImport'

// QA retest12 B12-N8 (B11-N1 residuals).
const lib = ['Amazing Grace', 'How Great Thou Art', 'Greeter'].map((title, i) => ({ id: i + 1, title }))
const got = (line: string, library?: typeof lib): string => {
  const r = parseSetlistDetailed(line, library ? { library } : {})
  return r.entries.length ? r.entries.map((e) => `${e.kind}:${e.title}`).join(' | ') : `skip:${r.skipped.map((s) => s.reason).join(',')}`
}

describe('B12-N8: every width of space is one space', () => {
  it('em, en, thin, hair, figure, narrow, medium and ideographic spaces collapse; the title keeps no odd character', () => {
    for (const sp of ['\u2002', '\u2003', '\u2009', '\u200A', '\u2007', '\u202F', '\u205F', '\u3000', '\u2003\u2003', '\u2009\u3000']) {
      expect(got(`Amazing${sp}Grace`), JSON.stringify(sp)).toBe('song:Amazing Grace')
      expect(matchSongTitle(parseSetlistDetailed(`Amazing${sp}Grace`).entries[0].title, lib)).toBe(1)
    }
  })
  it("'Head\\u2003\\u2003Usher: Carl Mims' is who's serving, not a song", () => {
    expect(got('Head\u2003\u2003Usher: Carl Mims')).toBe('skip:serving')
    expect(got('Choir\u3000Director: Gloria Lee')).toBe('skip:serving')
  })
})

describe("B12-N8: 'Role<TAB>Name' without a colon", () => {
  it('a known role (or pastor) and a name is skipped as serving', () => {
    for (const line of ['Greeter\tMary Hill', 'Song Leader\tAnn Lee', 'Pastor\tRyan Brewer', 'Head Usher\tCarl Mims', 'Security \t Officer Dan Miles',
      'Greeters\tMary Hill, Tom Baker', 'Senior Pastor\tRev. Jo Park', 'Organist\t\tIda Ross', 'Liturgist\tRev. Ann Lee']) {
      expect(got(line), line).toBe('skip:serving')
    }
  })
  it('even when the role is also a library title (the name on the right says it is personnel)', () => {
    expect(got('Greeter\tMary Hill', lib)).toBe('skip:serving')
  })
  it('the existing tab-column cases are unchanged', () => {
    expect(got('Call to Worship\tPastor Jim')).toBe('element:Call to Worship — Pastor Jim')
    expect(got('Amazing Grace\tChris Tomlin')).toBe('song:Amazing Grace')
    expect(got('Prelude\tHow Great Thou Art')).toBe('element:Prelude — How Great Thou Art')
    expect(got('Amazing\tGrace', lib)).toBe('song:Amazing Grace')
    expect(got('Head\tUsher: Carl Mims')).toBe('skip:serving')
    expect(got('Hymn of Praise\tNo. 89\tAmazing Grace')).toBe('song:Amazing Grace')
    // a role word with something that isn't a name after the tab is not a who's-serving line
    expect(got('Greeter\tHow Great Thou Art')).not.toBe('skip:serving')
    expect(got('Pastor\tThe Lord Is My Shepherd')).not.toBe('skip:serving')
  })
})

describe("B13-N3: 'Role<TAB><library song>' is the song, not who's serving", () => {
  const songs = ['Silent Night', 'Way Maker', 'Living Hope', 'Cornerstone', 'Ancient Words', 'Graves Into Gardens', 'Mary Hill'].map((title, i) => ({ id: i + 1, title }))
  it('the right column that is exactly a library title links that song', () => {
    for (const [line, title] of [['Organist\tSilent Night', 'Silent Night'], ['Worship Leader\tWay Maker', 'Way Maker'], ['Pianist\t\tLiving Hope', 'Living Hope'],
      ['Song Leader \t Cornerstone', 'Cornerstone'], ['Pastor\tAncient Words', 'Ancient Words'], ['Cantor\tGraves Into Gardens', 'Graves Into Gardens']]) {
      const r = parseSetlistDetailed(line, { library: songs })
      expect(r.skipped, line).toEqual([])
      expect(r.entries.map((e) => `${e.kind}:${e.title}`), line).toHaveLength(1)
      expect(r.entries[0].kind, line).toBe('song')
      expect(matchSongTitle(r.entries[0].title, songs), line).toBe(songs.find((s) => s.title === title)!.id)
    }
  })
  it('a person (not in the library), no library, or a near-miss title stays who is serving', () => {
    for (const line of ['Organist\tIda Ross', 'Greeter\tMary Hill Smith', 'Organist\tSilent Nights']) expect(got(line, songs as typeof lib), line).toBe('skip:serving')
    expect(got('Organist\tSilent Night')).toBe('skip:serving') // no library to check against
  })
})
