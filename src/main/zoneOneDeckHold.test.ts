import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// QA B9-N9 (pinned against SOURCE — index.ts imports Electron; end to end:
// tests/e2e/qa-retest9.spec.ts). A reading goes up as its verses first, then
// its deck; zone 1 (the deck's reference card) rendered the routing default —
// the numbered verse — for one frame in between.
const src = (p: string): string => readFileSync(join(__dirname, p), 'utf8').replace(/\r\n/g, '\n')
const main = src('index.ts')
function fn(sig: string): string {
  const i = main.indexOf(sig)
  expect(i, `missing ${sig}`).toBeGreaterThan(-1)
  return main.slice(i, main.indexOf('\n}\n', i) + 2)
}
const code = (body: string): string => body.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

describe('QA B9-N9: zone 1 waits for the deck instead of flashing the verse', () => {
  it('computeZoneStates holds zone 1 (only) on its last state while a hold is set, below pins', () => {
    const z = code(fn('function computeZoneStates('))
    expect(z).toMatch(/zoneId === 1 && pinnedMode == null && zoneOneHold\[zoneTrack\]/)
    expect(z.indexOf('zoneOneHold[zoneTrack]')).toBeGreaterThan(z.indexOf("pin.kind === 'titleCard'"))
    expect(z).toMatch(/if \(!zoneOneHeld\) lastZoneOneState\[/)
    // No other zone is held (zone 3's behaviour, Black included, is unchanged).
    expect(z.match(/zoneOneHold/g)).toHaveLength(1)
  })
  it('the hold is bounded and keyed to the load', () => {
    expect(main).toMatch(/const ZONE1_DECK_HOLD_MS = 1000\n/)
    const hold = code(fn('function holdZoneOneForDeck('))
    expect(hold).toMatch(/setTimeout\(/)
    expect(hold).toMatch(/zoneBroadcast\(\)/)
    expect(code(fn('function releaseZoneOneHold('))).toMatch(/hold\.generation !== generation\) return false/)
  })
  it('a reading Go live sets it (operator and tablet paths); the deck releases it before its one broadcast', () => {
    const ipc = main.slice(main.indexOf("ipcMain.handle('wf:live:loadScripture'"))
    expect(ipc.slice(0, ipc.indexOf('\n})\n'))).toMatch(/if \(ok && typeof itemId === 'number'\) holdZoneOneForDeck\(track, tracks\[track\]\.loadGeneration\)\n\s+if \(ok\) broadcast\(\)/)
    expect(code(fn('async function handleTabletLoadItem('))).toMatch(/if \(!tracks\[track\]\.deckSlides\) \{?\s*holdZoneOneForDeck\(track, tracks\[track\]\.loadGeneration\)/)
    const deck = code(fn('async function loadDeckOnto('))
    const release = deck.indexOf('releaseZoneOneHold(track, generation)')
    expect(release).toBeGreaterThan(deck.indexOf('t.deckSlides = slides'))
    expect(release).toBeLessThan(deck.lastIndexOf('broadcast()'))
  })
  it('the renderer passes the item id with the reading', () => {
    expect(src('../preload/index.ts')).toMatch(/invoke\('wf:live:loadScripture', track, reference, background, blurBehindText, itemId\)/)
    expect(src('../renderer/src/liveActions.ts')).toMatch(/liveLoadScripture\(track, ref, [^\n]*, item\.id\)/)
    expect(src('../renderer/src/VolunteerView.tsx')).toMatch(/liveLoadScripture\('main', ref, [^\n]*, item\.id\)/)
  })
})
