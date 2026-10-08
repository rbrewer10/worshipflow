import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { deckIndexForVerse } from './deckPosition'

describe('deckIndexForVerse (QA retest8: keep the operator’s place when the deck lands)', () => {
  it('one verse per slide: same index', () => {
    expect([0, 1, 2, 6].map((v) => deckIndexForVerse([1, 1, 1, 1, 1, 1, 1], v))).toEqual([0, 1, 2, 6])
  })
  it('several verses per slide: the slide that holds the verse', () => {
    // Slides of 2, 1, 3 verses: verses 0-1 → 0, 2 → 1, 3-5 → 2.
    expect([0, 1, 2, 3, 4, 5].map((v) => deckIndexForVerse([2, 1, 3], v))).toEqual([0, 0, 1, 2, 2, 2])
  })
  it('slides without new verses (a held reference card, a same chain) are skipped', () => {
    expect(deckIndexForVerse([0, 2, 0, 2], 2)).toBe(3)
    expect(deckIndexForVerse([0, 2, 0, 2], 1)).toBe(1)
  })
  it('past the end stays on the last slide with verses; nothing resolved starts at slide 1', () => {
    expect(deckIndexForVerse([1, 1, 0], 9)).toBe(1)
    expect(deckIndexForVerse([], 3)).toBe(0)
    expect(deckIndexForVerse([0, 0], 3)).toBe(0)
  })
})

// index.ts imports Electron, so (like scriptureLoadToast.test.ts) the wiring is
// pinned against its source.
describe('online scripture: one shared lookup, deck keeps the position (QA retest8)', () => {
  const source = readFileSync(join(__dirname, 'index.ts'), 'utf8').replace(/\r\n/g, '\n')
  const fnBody = (name: string): string => {
    const start = source.indexOf(`function ${name}(`)
    expect(start, name).toBeGreaterThan(-1)
    const end = source.indexOf('\n}\n', start)
    return source.slice(start, end)
  }
  it('every live-path lookup goes through scriptureFor, not straight to fetchScripture', () => {
    const calls = [...source.matchAll(/fetchScripture\(/g)].length
    // The definition and the single call inside scriptureFor.
    expect(calls).toBe(2)
    expect(fnBody('scriptureFor')).toMatch(/promise: fetchScripture\(reference, translation\)/)
    expect(fnBody('autoDeckDeps')).toMatch(/lookupScripture: scriptureFor/)
    expect(fnBody('resolveDeckScripture')).toMatch(/Promise\.all\(references\.map\(scriptureFor\)\)/)
  })
  it('passages are looked up together, not one after another', () => {
    expect(fnBody('doLoadScripture')).toMatch(/await Promise\.all\(refs\.map\(scriptureFor\)\)/)
    expect(fnBody('computeItemSourceSlides')).toMatch(/await Promise\.all\(refs\.map\(scriptureFor\)\)/)
    expect(fnBody('loadDeckOnto')).toMatch(/await Promise\.all\(\[\s*authored \? Promise\.resolve\(authored\) : autoDeckFor\(item, autoDeckDeps\(\)\),\s*computeItemSourceSlides\(item\),?\s*\]\)/)
    const autoDeck = readFileSync(join(__dirname, 'autoDeck.ts'), 'utf8')
    expect(autoDeck).toMatch(/await Promise\.all\(references\.map\(\(reference\) => deps\.lookupScripture\(reference\)\)\)/)
  })
  it('in-flight and fresh lookups are shared; a KJV fallback only briefly', () => {
    const fresh = fnBody('onlineLookupFresh')
    expect(fresh).toMatch(/if \(!entry\.settled\) return true/)
    expect(fresh).toMatch(/entry\.settled\.ok && !entry\.settled\.usedFallback \? ONLINE_OK_TTL_MS : ONLINE_FALLBACK_TTL_MS/)
    expect(source).toMatch(/const ONLINE_FALLBACK_TTL_MS = 30_000/)
    expect(fnBody('scriptureFor')).toMatch(/while \(onlineLookups\.size > ONLINE_CACHE_MAX\)/)
  })
  it('the deck lands on the slide holding the verse the operator reached, not slide 1', () => {
    const fn = fnBody('loadDeckOnto')
    expect(fn).toMatch(/t\.verseListGeneration === generation\s*\? deckIndexForVerse\(versesPerSlide, t\.index\)/)
    expect(fn).toMatch(/t\.index = index\b/)
    expect(fn).not.toMatch(/t\.index = 0/)
    expect(fnBody('doLoadScripture')).toMatch(/t\.verseListGeneration = generation/)
  })
})
