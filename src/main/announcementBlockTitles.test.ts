import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// index.ts imports Electron, so (like liveOutputGuards.test.ts) these pin the
// QA B5-N1 wiring against source; the behaviour is covered by autoDeck.test.ts,
// liveDisplay.test.ts and the e2e qa-retest4 "B5-N1" spec.
// B5-N1: in an announcement block the projector and Volunteer mode kept the
// FIRST announcement's title over every later announcement's body.
const main = readFileSync(join(__dirname, 'index.ts'), 'utf8')
const fn = (sig: string): string => {
  const i = main.indexOf(sig)
  expect(i, sig).toBeGreaterThan(-1)
  return main.slice(i, main.indexOf('\n}\n', i) + 2)
}

describe('QA B5-N1: announcement block slides carry their own title', () => {
  it('loadDeckOnto keeps each generated slide\'s title alongside its line', () => {
    expect(fn('async function loadDeckOnto(')).toMatch(/slideTitles = slides\.some\(\(s\) => s\.title\)[\s\S]*t\.song = \{ \.\.\.t\.song, lines: [^}]*slideTitles \}/)
  })
  it('the broadcast state titles the CURRENT slide, and names the next one', () => {
    const state = fn('function renderState(')
    expect(state).toMatch(/songTitle: t\.hasLiveContent \? slideTitleAt\(t, t\.index\)/)
    expect(state).toMatch(/nextTitle: [^\n]*slideTitleAt\(t, t\.index \+ 1\)/)
    expect(fn('function slideTitleAt(')).toMatch(/slideTitles\?\.\[index\] \|\| t\.song\.title/)
  })
  it('the stage monitor (zone 4) gets the slide title and a titled NEXT', () => {
    expect(fn('function zoneStateFromSlot(')).toMatch(/zoneId === 4 && t\.deckSlides\?\.\[t\.index\]\?\.title/)
    expect(fn('function deckNextText(')).toMatch(/nextTitle !== t\.deckSlides\[t\.index\]\?\.title/)
  })
  it('a block whose first announcement was deleted still loads (starts at the first that exists)', () => {
    const load = fn('async function doLoadAnnouncement(')
    expect(load).toMatch(/for \(const candidate of candidates\)/)
    expect(load).not.toMatch(/const firstId = refIds\[0\]/)
  })
  it('every NEXT preview uses nextPreview', () => {
    for (const f of ['tabletHtml.ts', 'pulpitHtml.ts']) expect(readFileSync(join(__dirname, f), 'utf8'), f).toMatch(/textContent = nextPreview\(s\)/)
    for (const f of ['Stage.tsx', 'VolunteerView.tsx']) expect(readFileSync(join(__dirname, '..', 'renderer', 'src', f), 'utf8'), f).toMatch(/nextPreview\(live\)/)
  })
})
