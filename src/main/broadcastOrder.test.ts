import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// QA B6-N1. index.ts imports Electron and can't load under this Node-only
// Vitest config, so (like liveOutputGuards.test.ts) this pins the fix against
// SOURCE; the ordering rule itself is unit-tested in shared/stateOrder.test.ts
// and the behaviour end to end in tests/e2e/qa-retest6.spec.ts.
//
// After a clicked Go live, loadDeckOnto finished inside wf:live:setItemId's
// broadcast (webContents.send drains microtasks) and broadcast the numbered
// deck; the outer broadcast then carried on and delivered its older pre-deck
// payload last, so the projector, the Stage window and the tablet showed
// '35 And the same day…' while state.line was '4:35 …'.
const main = readFileSync(join(__dirname, 'index.ts'), 'utf8')
const preload = readFileSync(join(__dirname, '..', 'preload', 'index.ts'), 'utf8')

function fn(sig: string): string {
  const i = main.indexOf(sig)
  expect(i, `missing ${sig}`).toBeGreaterThan(-1)
  return main.slice(i, main.indexOf('\n}\n', i) + 2)
}

describe('QA B6-N1: a broadcast superseded mid-send never delivers its stale payload', () => {
  it('every broadcast takes a new sequence number and stamps it on the payload', () => {
    expect(fn('function broadcast(')).toMatch(/const seq = \+\+broadcastSeq\s*\n\s*const payload = buildStatePayload\(\)/)
    expect(fn('function buildStatePayload(')).toMatch(/seq: broadcastSeq/)
  })
  it('stops sending to windows once a newer broadcast has run under it', () => {
    const b = fn('function broadcast(')
    expect(b).toMatch(/for \(const w of \[operatorWin, stageWin, \.\.\.outputWins\.values\(\)\]\) \{\s*\n\s*if \(seq !== broadcastSeq\) return/)
  })
  it('never sends the tablet / zones a payload a newer broadcast has replaced', () => {
    const b = fn('function broadcast(')
    const guard = b.lastIndexOf('if (seq !== broadcastSeq) return')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(b.indexOf('tabletBroadcast(payload.main)'))
  })
  it('the preload drops an out-of-order wf:state for every listener in the window', () => {
    expect(preload).toMatch(/const acceptState = stateOrderGuard\(\)/)
    expect(preload).toMatch(/if \(acceptState\(s\.seq\)\) cb\(s\)/)
  })
})
