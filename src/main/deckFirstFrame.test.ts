import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// QA B7-N1. index.ts imports Electron and can't load under this Node-only
// Vitest config, so (like liveOutputGuards.test.ts) this pins the fix against
// SOURCE; the behaviour end to end is tests/e2e/qa-retest7.spec.ts.
//
// loadDeckOnto used to broadcast the deck with every scripture slide
// summarised as its bare reference, then again once the verses were looked
// up: after a clicked Go live the projector showed "Mark 4:35" alone for
// ~¼ s (Zone 3 "Mark 4:35 1 / 7") before "4:35 And the same day…".
// CRLF on a Windows checkout (CI): compare with \n line ends.
const main = readFileSync(join(__dirname, 'index.ts'), 'utf8').replace(/\r\n/g, '\n')

function fn(sig: string): string {
  const i = main.indexOf(sig)
  expect(i, `missing ${sig}`).toBeGreaterThan(-1)
  return main.slice(i, main.indexOf('\n}\n', i) + 2)
}

describe('QA B7-N1: a deck goes on screen once, with its verses already looked up', () => {
  const load = fn('async function loadDeckOnto(')
  const code = load.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  it('broadcasts exactly once', () => {
    expect(code.match(/broadcast\(\)/g)).toHaveLength(1)
  })
  it('looks the verses up before the deck or its lines are applied', () => {
    const lookup = code.search(/await resolveDeckScripture\(slides[,)]/)
    expect(lookup).toBeGreaterThan(-1)
    expect(lookup).toBeLessThan(code.indexOf('t.deckSlides = slides'))
    expect(lookup).toBeLessThan(code.indexOf('t.song = '))
    expect(lookup).toBeLessThan(code.indexOf('broadcast()'))
  })
  it('re-checks the load generation after the lookup await, before touching the track', () => {
    const after = code.slice(code.search(/await resolveDeckScripture\(slides[,)]/))
    expect(after.indexOf('if (tracks[track].loadGeneration !== generation) return true')).toBeLessThan(after.indexOf('t.deckSlides = slides'))
  })
  it('no slide line is a bare reference summary when its verse resolved', () => {
    const lines = fn('function deckLines(')
    // The resolved verse is preferred over the slot summary on every content zone.
    expect(lines).toMatch(/const verse = deckScripture\.get\(`\$\{i\}:\$\{zoneId\}`\)\s*\n\s*if \(verse\) return verse/)
  })
  it('one lookup per distinct reference, in parallel', () => {
    const r = fn('async function resolveDeckScripture(')
    expect(r).toMatch(/new Set\(wanted\.map\(\(w\) => w\.reference\)\)/)
    expect(r).toMatch(/await Promise\.all\(/)
  })
})
