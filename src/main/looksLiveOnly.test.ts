import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Ryan's decision #7 (Oct 2026): Looks are one-time only. Tapping Worship /
// Word / Invitation changes only what's live right now, resets when the live
// item changes, and is never saved to the item. Source guards for the wiring;
// the behaviour itself is pinned by shared/liveLook.test.ts and the e2e
// "decision #7" test in tests/e2e/ryan-decisions.spec.ts.
const read = (p: string): string => readFileSync(join(__dirname, p), 'utf8').replace(/\r\n/g, '\n')
const main = read('index.ts')
const bar = read('../renderer/src/LooksModeBar.tsx')
const liveView = read('../renderer/src/LiveView.tsx')
const preload = read('../preload/index.ts')

function body(src: string, start: string): string {
  const at = src.indexOf(start)
  expect(at, start).toBeGreaterThan(-1)
  return src.slice(at, src.indexOf(start.startsWith('ipcMain') ? '\n})\n' : '\n}\n', at))
}

describe('Looks are one-time only (source guards)', () => {
  it('the Looks bar never writes the item: no zoneSetRouting, no stored-routing highlight, no "saved to" title', () => {
    expect(bar).not.toMatch(/zoneSetRouting/)
    expect(bar).not.toMatch(/activeLookMode|effectiveRouting|zoneRouting/)
    expect(bar).not.toMatch(/— saved to|saved to “/)
    expect(bar).toMatch(/window\.wf\.liveSetLook\(track, liveItem\.id, mode\)/)
    expect(bar).toMatch(/title=\{!liveItem \? 'Nothing is live yet' : !scene \? 'Map this look in Setup' : MODE_HINT\[mode\]\}/)
  })
  it('the tap goes to wf:live:setLook, which keeps the Look in memory only', () => {
    expect(preload).toMatch(/liveSetLook: \(track: TrackId, itemId: number, mode: [^)]*\): Promise<boolean> =>\n\s*ipcRenderer\.invoke\('wf:live:setLook', track, itemId, mode\)/)
    const h = body(main, "ipcMain.handle('wf:live:setLook'")
    expect(h).toMatch(/assertTrackId\(track\)/)
    expect(h).toMatch(/if \(!isLookMode\(mode\)\) return false/)
    expect(h).toMatch(/if \(t\.serviceItemId !== itemId\) return false/)
    expect(h).toMatch(/liveLooks\[track\] = \{ itemId, generation: t\.loadGeneration, mode, routing \}/)
    expect(h).not.toMatch(/setItemZoneRouting|setSetting|zoneRouting:/)
  })
  it('computeZoneStates uses the Look in place of the item routing, below pins and decks, only while it is current', () => {
    const fn = body(main, 'function computeZoneStates(')
    const stored = fn.indexOf('getItemZoneRouting(item.id)')
    const look = fn.indexOf('const look = currentLiveLook(zoneTrack)')
    expect(look).toBeGreaterThan(stored)
    expect(fn.slice(look, look + 160)).toMatch(/if \(look\) \{\n\s*routing = look\.routing\n\s*routingIsExplicit = true/)
    expect(fn.indexOf('const pin = zonePins.get(zoneId)')).toBeLessThan(look)
    expect(look).toBeLessThan(fn.indexOf('t.deckSlides && t.index < t.deckSlides.length'))
    const cur = body(main, 'function currentLiveLook(')
    expect(cur).toMatch(/liveLookFor\(liveLooks\[track\], tracks\[track\]\)/)
  })
  it('the live state reports the Look in force; a deliberate screen choice or a service switch drops it', () => {
    expect(main).toMatch(/liveLook: currentLiveLook\(track\)\?\.mode \?\? null,/)
    const set = body(main, "ipcMain.handle('wf:zone:setRouting'")
    expect(set).toMatch(/if \(liveLooks\[track\]\?\.itemId === itemId\) liveLooks\[track\] = null/)
    const svc = body(main, "ipcMain.handle('wf:setActiveService'")
    expect(svc).toMatch(/liveLooks\.main = null\n\s*liveLooks\.second = null/)
  })
  it('the Look is not part of the crash-recovery snapshot', () => {
    const snap = main.slice(main.indexOf('const snapOf = '), main.indexOf('\n', main.indexOf('const snapOf = ')))
    expect(snap).not.toMatch(/look/i)
  })
  it('the scene row under the Live preview shows the Look while it is in force', () => {
    expect(liveView).toMatch(/const look = live\?\.liveLook \? lookRouting\(live\.liveLook, modeMapping, sceneConfig, liveItem\.type\) : null/)
    expect(liveView).toMatch(/isDefault=\{liveItem\.zoneRouting == null && !look\}/)
  })
})
