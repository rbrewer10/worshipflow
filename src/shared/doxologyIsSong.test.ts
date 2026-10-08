import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { matchSongTitle, parseSetlist, parseSetlistDetailed } from './setlistImport'

// Ryan's decision #6 (Oct 2026): the Doxology is a song like any other. It is
// sung, it lives in the song library, and a pasted setlist line naming it
// becomes a song item (linked to the library song when there is one, a
// "Song: …" placeholder when there isn't) — exactly what happens to any other
// hymn title. There is no Doxology special case anywhere, and this file pins
// that so a future "liturgy element" rule can't quietly reclassify it.

const LIB = [
  { id: 1, title: 'Holy, Holy, Holy' },
  { id: 2, title: 'Doxology' },
  { id: 3, title: 'Amazing Grace' },
]

// How bulletins actually write it (Church Tech's probes + common variants).
const DOXOLOGY_LINES = [
  'Doxology', 'DOXOLOGY', 'doxology', '+ Doxology', '3. Doxology', 'Hymn: Doxology',
  'Doxology (No. 95)', 'Doxology (UMH 95)', 'Doxology #95', 'Doxology \u2014 No. 95', 'Doxology - Hymn 95', 'Doxology\t95',
]

describe("Ryan's decision #6 — the Doxology is treated like any other song", () => {
  it('every way a bulletin writes it parses as one song entry', () => {
    for (const line of DOXOLOGY_LINES) {
      const entries = parseSetlist(line)
      expect(entries, line).toHaveLength(1)
      expect(entries[0].kind, line).toBe('song')
      expect(entries[0].title.toLowerCase(), line).toBe('doxology')
    }
  })

  it('it links to the library song "Doxology" (and the library does not change that)', () => {
    for (const line of DOXOLOGY_LINES) {
      const [entry] = parseSetlist(line, { library: LIB })
      expect(entry.kind, line).toBe('song')
      expect(matchSongTitle(entry.title, LIB), line).toBe(2)
    }
  })

  it('with no Doxology in the library it is an unmatched song — the same as any unknown hymn', () => {
    const noDox = LIB.filter((s) => s.title !== 'Doxology')
    for (const [line, other] of [['Doxology', 'Be Thou My Vision'], ['Doxology #95', 'Be Thou My Vision #95'], ['+ Doxology', '+ Be Thou My Vision']]) {
      const [dox] = parseSetlist(line, { library: noDox })
      const [hymn] = parseSetlist(other, { library: noDox })
      expect(dox.kind, line).toBe(hymn.kind)
      expect(dox.kind, line).toBe('song')
      expect(matchSongTitle(dox.title, noDox), line).toBeNull()
      expect(matchSongTitle(hymn.title, noDox), other).toBeNull()
    }
  })

  it('inside a full order of worship it is a song between the offering and the reading, and nothing is skipped', () => {
    const bulletin = ['Prelude', 'Opening Hymn: Holy, Holy, Holy', 'Tithes & Offerings', 'Doxology', 'Scripture Reading: Romans 8:28-39', 'Amazing Grace'].join('\n')
    const { entries, skipped } = parseSetlistDetailed(bulletin, { library: LIB })
    const at = entries.findIndex((e) => e.title === 'Doxology')
    expect(at).toBeGreaterThan(0)
    expect(entries[at]).toEqual({ kind: 'song', title: 'Doxology' })
    expect(entries[at - 1].title).toMatch(/Offering/)
    expect(entries[at + 1]).toEqual({ kind: 'scripture', title: 'Romans 8:28-39' })
    expect(skipped.map((s) => s.line)).not.toContain('Doxology')
  })

  it('no app code special-cases the Doxology (only the setlist name filter mentions it, so it is never read as a person)', () => {
    const root = join(__dirname, '..')
    const hits: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) { walk(p); continue }
        if (!/\.(ts|tsx)$/.test(name) || /\.(test|fixture)\.tsx?$/.test(name)) continue
        if (/doxology/i.test(readFileSync(p, 'utf8'))) hits.push(p.slice(root.length + 1).replace(/\\/g, '/'))
      }
    }
    walk(root)
    expect(hits).toEqual(['shared/setlistImport.ts'])
    const src = readFileSync(join(root, 'shared/setlistImport.ts'), 'utf8').replace(/\r\n/g, '\n')
    const lines = src.split('\n').filter((l) => /doxology/i.test(l))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^const NOT_A_NAME = /)
  })
})
