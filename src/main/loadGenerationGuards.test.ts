import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// index.ts imports Electron and can't be loaded under this Node-only Vitest
// config (see autoDeck.test.ts's comment for the established precedent), so
// this asserts against its SOURCE. Coarse, but it fails loudly if the
// staleness guard is ever refactored away.
//
// Regression: doLoadSong used to bump loadGeneration but never re-check it
// after its `await getSong(id)`, unlike every other loader on this track
// (doLoadScripture, loadDeckOnto) — an accident of getSong currently being
// synchronous, not a real guarantee. A future async DB layer, or any await
// added inside getSong, would let a fast double song-load (double-click
// Next, or Next right after Go Live) let the OLDER call's response land
// last and silently stomp the newer song onto the track.
describe('doLoadSong has the same staleness guard every other track loader has', () => {
  const source = readFileSync(join(__dirname, 'index.ts'), 'utf8')

  function body(fnSignature: string): string {
    const start = source.indexOf(fnSignature)
    expect(start, `could not find "${fnSignature}" in index.ts — has it been renamed?`).toBeGreaterThan(-1)
    // Function bodies here are well under 2000 chars; this just needs to
    // capture doLoadSong's body without running into the next function.
    return source.slice(start, start + 1500)
  }

  it('captures the generation before its await, not just bumping it', () => {
    const fn = body('async function doLoadSong(track: TrackId, id: number)')
    expect(fn).toMatch(/const generation = \+\+t\.loadGeneration/)
  })

  it('re-checks the generation after the await, before writing any live state', () => {
    const fn = body('async function doLoadSong(track: TrackId, id: number)')
    const awaitIdx = fn.indexOf('await getSong(id)')
    const checkIdx = fn.indexOf('tracks[track].loadGeneration !== generation')
    expect(awaitIdx, 'await getSong(id) not found').toBeGreaterThan(-1)
    expect(checkIdx, 'staleness check not found').toBeGreaterThan(-1)
    expect(checkIdx).toBeGreaterThan(awaitIdx)

    // And the check must come before any live-state write (hasLiveContent is
    // the first field doLoadSong sets on success) — otherwise the guard exists
    // but doesn't actually guard anything.
    const firstWriteIdx = fn.indexOf('t.hasLiveContent = true')
    expect(firstWriteIdx, 't.hasLiveContent = true not found').toBeGreaterThan(-1)
    expect(checkIdx).toBeLessThan(firstWriteIdx)
  })
})
