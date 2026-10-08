import { describe, it, expect } from 'vitest'
import { zoneHtmlFor } from './zoneHtml'

// QA B7-N1 (Zone 3 half). The zone page fades a new line up over 0.5 s, but
// put the item's reference and slide counter up at once, so for the first
// ~100 ms after Go live Zone 3 read just "Mark 4:35 1 / 7". A new item's
// reference (and counter) now fades up with its line; within an item it stays
// steady. The behaviour end to end is tests/e2e/qa-retest7.spec.ts.
const page = (z: number): string => zoneHtmlFor(z, 'token', 'room') ?? ''

describe('QA B7-N1: a new reference fades up with its line on the zone pages', () => {
  it('Zone 3 (lyrics): title and slide counter take the fade only when the title changes with the line', () => {
    const p = page(3)
    expect(p).toContain("var titleIn=lineChanged&&state.title!==prevTitle?' class=\"fade-up\"':'';prevTitle=state.title;")
    expect(p).toMatch(/titleEl\.innerHTML=state\.title\?'<div'\+titleIn\+'><span/)
    expect(p).toMatch(/slideNum\.innerHTML=state\.total>1\?'<div'\+titleIn\+'>'/)
  })
  it('Zones 1-2 (flex): the title is wrapped so the fade does not override its 0.5 opacity', () => {
    for (const z of [1, 2]) {
      const p = page(z)
      expect(p).toContain("var titleIn=lineChanged&&state.title!==prevTitle?'fade-up':'';prevTitle=state.title;")
      expect(p).toMatch(/'<div class="'\+titleIn\+'"><div style="margin-top:2vw;font-size:'\+Math\.min\(fs\*0\.3,3\)\+'vw;color:'\+textColor\+';opacity:0\.5/)
    }
  })
  it('clearing the screen forgets the title, so the next item fades in whole', () => {
    for (const z of [1, 2, 3]) {
      const p = page(z)
      expect(p).toMatch(/prevLine=null;prevTitle=null;return;/)
      expect(p).toContain('prevTitle=null')
    }
  })
})
