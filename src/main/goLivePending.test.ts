import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// QA B9-N5/N6/N7, pinned against SOURCE (index.ts imports Electron and can't
// load under this Node-only Vitest config). End to end:
// tests/e2e/qa-retest9.spec.ts.
const src = (p: string): string => readFileSync(join(__dirname, p), 'utf8').replace(/\r\n/g, '\n')
const main = src('index.ts')
function fn(sig: string): string {
  const i = main.indexOf(sig)
  expect(i, `missing ${sig}`).toBeGreaterThan(-1)
  return main.slice(i, main.indexOf('\n}\n', i) + 2)
}
function handler(channel: string): string {
  const i = main.indexOf(`ipcMain.handle('${channel}'`)
  expect(i, `missing handler ${channel}`).toBeGreaterThan(-1)
  return main.slice(i, main.indexOf('\n})\n', i) + 3)
}
const code = (body: string): string => body.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

describe('QA B9-N5: Play slide N on a reading lands on deck slide N', () => {
  const deck = code(fn('async function loadDeckOnto('))
  it('a deck intent for this load wins over the verse-index mapping', () => {
    expect(deck).toMatch(/const intent = t\.deckIntent\?\.generation === generation \? t\.deckIntent\.index : null/)
    const at = (s: string): number => deck.indexOf(s)
    expect(at('intent != null')).toBeGreaterThan(-1)
    expect(at('intent != null')).toBeLessThan(at('deckIndexForVerse(versesPerSlide, t.index)'))
    expect(deck).toMatch(/Math\.max\(0, Math\.min\(intent, slides\.length - 1\)\)/)
  })
  it('goLiveAt records slideIndex as the deck slide, waits for the deck, and does not re-map it', () => {
    const at = code(handler('wf:live:goLiveAt'))
    expect(at).toMatch(/await handleTabletLoadItem\(track, itemId, slideIndex\)/)
    expect(at).toMatch(/const landed = await deck\.promise\n\s+if \(landed \|\| t\.loadGeneration !== deck\.generation\) return/)
    const load = code(fn('async function handleTabletLoadItem('))
    expect(load).toMatch(/tracks\[track\]\.deckIntent = \{ generation: tracks\[track\]\.loadGeneration, index: deckIndex \}/)
    // The deck's own broadcast is the first frame (no verse-1 flash first).
    expect(load).toMatch(/if \(!deckBroadcasts\) broadcast\(\)/)
    expect(code(fn('async function doLoadScripture('))).toMatch(/t\.deckLoad = \{ generation, promise \}/)
  })
})

describe('QA B9-N6: arming a newer Go live drops a reading still being looked up', () => {
  it('the renderer tells main when a Go live is armed, not only when it fires', () => {
    const live = src('../renderer/src/liveActions.ts')
    expect(live).toMatch(/trigger: \(key: string, run: \(\) => void, onArm\?: \(\) => void\) => void/)
    const trig = live.slice(live.indexOf('const trigger = useCallback('))
    expect(trig.indexOf('onArm?.()')).toBeGreaterThan(-1)
    expect(trig.indexOf('onArm?.()')).toBeLessThan(trig.indexOf('setTimeout('))
    expect(src('../renderer/src/ServiceRail.tsx')).toMatch(/trigger\(String\(it\.id\), \(\) => \{ sendItemLive\(it, 'main'\) \}, \(\) => \{ void window\.wf\.liveGoLiveArmed\('main'\) \}\)/)
    expect(src('../renderer/src/SlideGrid.tsx')).toMatch(/trigger\(slideKey, goLive, \(\) => \{ void window\.wf\.liveGoLiveArmed\(track\) \}\)/)
    expect(src('../preload/index.ts')).toMatch(/liveGoLiveArmed: \(track: TrackId\): Promise<void> => ipcRenderer\.invoke\('wf:live:goLiveArmed', track\)/)
  })
  it('main bumps the generation only while a lookup for the current load is pending', () => {
    expect(main).toMatch(/ipcMain\.handle\('wf:live:goLiveArmed', \(_e, track: TrackId\) => \{ assertTrackId\(track\); supersedePendingLookup\(track\) \}\)/)
    const sup = code(fn('function supersedePendingLookup('))
    expect(sup).toMatch(/if \(!p \|\| p\.generation !== t\.loadGeneration\) return\n\s+\+\+t\.loadGeneration/)
    // doLoadScripture's existing stale check then discards it.
    const load = code(fn('async function doLoadScripture('))
    expect(load).toMatch(/if \(tracks\[track\]\.loadGeneration !== generation\) \{\n\s+logWarn\(`\[scripture\] discarding stale lookup/)
  })
})

describe('QA B9-N7: Next/Prev during a pending lookup are carried onto the reading', () => {
  const load = code(fn('async function doLoadScripture('))
  it('the lookup is marked pending around the await, and the presses land on the verse list', () => {
    const mark = load.indexOf('tracks[track].pendingScripture = pending')
    const awaitAt = load.indexOf('await Promise.all(refs.map(scriptureFor))')
    const clear = load.indexOf('if (tracks[track].pendingScripture === pending) tracks[track].pendingScripture = null')
    expect(mark).toBeGreaterThan(-1)
    expect(mark).toBeLessThan(awaitAt)
    expect(clear).toBeGreaterThan(awaitAt)
    // A verse index, which loadDeckOnto carries onto the deck (retest8 / #30).
    expect(load).toMatch(/t\.index = Math\.min\(pending\.advance, lines\.length - 1\)\n\s+t\.verseListGeneration = generation/)
    expect(load).not.toMatch(/\n\s+t\.index = 0\n/)
  })
  it('operator and tablet presses go to the pending reading, not the item on screen; auto-advance does not', () => {
    const carry = code(fn('function carryPressIntoPendingLookup('))
    expect(carry).toMatch(/if \(!p \|\| p\.generation !== t\.loadGeneration\) return false/)
    // Black/Logo still un-blank as before.
    expect(carry).toMatch(/if \(t\.mode !== 'lyrics' && !t\.deckSlides\) return false/)
    expect(main).toMatch(/if \(!carryPressIntoPendingLookup\(track, type\)\) processIntent\(track, type\)/)
    expect(main).toMatch(/if \(!carryPressIntoPendingLookup\('main', msg\.intent\)\) processIntent\('main', msg\.intent\)/)
    expect(code(fn('function processIntent('))).not.toMatch(/carryPressIntoPendingLookup/)
  })
})
