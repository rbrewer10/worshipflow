import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Ryan's decision (Oct 2026): when a track is Black, every zone page on that
// track goes dark with OUT — zone 3 used to keep showing the lyric line
// (Church Tech retest9 question). Clearing Black brings them straight back.
const main = readFileSync(join(__dirname, 'index.ts'), 'utf8').replace(/\r\n/g, '\n')
const zoneHtml = readFileSync(join(__dirname, 'zoneHtml.ts'), 'utf8').replace(/\r\n/g, '\n')

function computeZoneStatesBody(): string {
  const at = main.indexOf('function computeZoneStates(')
  expect(at).toBeGreaterThan(-1)
  return main.slice(at, main.indexOf('\n}\n', at))
}

describe('zones during Black (source guard)', () => {
  it('computeZoneStates turns every zone of a Black track to mode black before pins, decks or routing', () => {
    const fn = computeZoneStatesBody()
    const black = fn.indexOf("if (t.mode === 'black') {")
    expect(black).toBeGreaterThan(-1)
    expect(fn.slice(black, black + 200)).toMatch(/result\[zoneId\] = \{ \.\.\.emptyZoneState\(live\), mode: 'black' \}\n\s*continue/)
    // ahead of the per-zone pin, any authored/generated deck and the routing
    expect(black).toBeLessThan(fn.indexOf('const pin = zonePins.get(zoneId)'))
    expect(black).toBeLessThan(fn.indexOf('t.deckSlides && t.index < t.deckSlides.length'))
    expect(black).toBeLessThan(fn.indexOf('getItemZoneRouting(item.id)'))
    // keyed on the zone's own track (stage rehearsal / per-zone track assignment)
    expect(fn.indexOf('const t = tracks[zoneTrack]')).toBeLessThan(black)
  })
  it('the black zone state carries no line, title, image or background', () => {
    const at = main.indexOf('function emptyZoneState(')
    const body = main.slice(at, main.indexOf('\n}\n', at))
    expect(body).toMatch(/line: ''/)
    expect(body).toMatch(/title: ''/)
    expect(body).toMatch(/background: null/)
    expect(body).toMatch(/imagePath: null/)
  })
  it('every zone template renders mode black as dark (zone 4 as its dim "Screen Off" card)', () => {
    expect((zoneHtml.match(/if\(m==='black'\|\|m==='off'\)\{/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(zoneHtml).toMatch(/if\(m==='black'\)\{\s*current\.innerHTML='<div[^']*>Screen Off<\/div>'/)
    // the scrolling ticker overlay stays hidden on a black zone
    expect(zoneHtml).toMatch(/state\.mode!=='black'/)
  })
  it('Black reaches the zone pages on the same broadcast as OUT', () => {
    const at = main.indexOf('function broadcast(): void {')
    const body = main.slice(at, main.indexOf('\n}\n', at))
    expect(body).toContain('zoneBroadcast()')
  })
})
