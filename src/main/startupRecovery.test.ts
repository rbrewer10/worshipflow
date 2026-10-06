import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { StartupRecovery } from './startupRecovery'

// QA A2-N1: the first broadcast() of a new process overwrote recovery.json
// with the empty startup state before restoreRecovery() read it, so crash
// recovery never restored anything.

describe('StartupRecovery', () => {
  it('keeps the snapshot as it was at startup even after the store is overwritten', () => {
    let store: { liveServiceItemId: number | null } | null = { liveServiceItemId: 3 }
    let clean = false
    const sr = new StartupRecovery(() => store, () => clean)
    sr.capture()
    // first broadcast of the new session writes the idle state
    store = { liveServiceItemId: null }
    clean = false
    expect(sr.take()).toEqual({ snap: { liveServiceItemId: 3 }, cleanExit: false })
  })

  it('remembers a clean exit even though this session flips cleanExit back to false', () => {
    let clean = true
    const sr = new StartupRecovery(() => ({ liveServiceItemId: 3 }), () => clean)
    sr.capture()
    clean = false
    expect(sr.take()?.cleanExit).toBe(true)
  })

  it('hands the snapshot out once (a renderer reload must not re-restore)', () => {
    const sr = new StartupRecovery(() => ({ id: 1 }), () => false)
    expect(sr.take()?.snap).toEqual({ id: 1 })
    expect(sr.take()).toBeNull()
  })

  it('capture is idempotent and survives a throwing store', () => {
    let n = 0
    const sr = new StartupRecovery(() => { n++; throw new Error('corrupt recovery.json') }, () => { throw new Error('x') })
    sr.capture(); sr.capture()
    expect(n).toBe(1)
    expect(sr.take()).toEqual({ snap: null, cleanExit: false })
  })
})

describe('A3-N4: write hold', () => {
  it('holds writes until take(), then allows them', () => {
    let now = 1000
    const sr = new StartupRecovery(() => ({ id: 1 }), () => false, 30_000, () => now)
    expect(sr.writesAllowed()).toBe(false) // not even captured yet
    sr.capture()
    now += 1000
    expect(sr.writesAllowed()).toBe(false)
    expect(sr.holdRemainingMs()).toBe(29_000)
    sr.take()
    expect(sr.writesAllowed()).toBe(true)
    expect(sr.holdRemainingMs()).toBe(0)
  })
  it('releases on its own if the operator window never asks to restore', () => {
    let now = 0
    const sr = new StartupRecovery(() => null, () => false, 30_000, () => now)
    sr.capture()
    now = 29_999
    expect(sr.writesAllowed()).toBe(false)
    now = 30_000
    expect(sr.writesAllowed()).toBe(true)
  })
})

describe('index.ts wiring (A2-N1)', () => {
  const src = readFileSync(join(__dirname, 'index.ts'), 'utf-8')
  it('captures the previous snapshot before the first recovery write', () => {
    const b = src.slice(src.indexOf('function broadcast(): void {'))
    const cap = b.indexOf('startupRecovery.capture()')
    const write = b.indexOf('writeRecovery(')
    expect(cap).toBeGreaterThan(-1)
    expect(cap).toBeLessThan(write)
  })
  it('A3-N4: holds the write until the restore has run (or the hold expires), then writes', () => {
    const b = src.slice(src.indexOf('function broadcast(): void {'))
    expect(b.slice(0, b.indexOf('writeRecovery('))).toMatch(/!startupRecovery\.writesAllowed\(\)/)
    const handler = src.slice(src.indexOf("ipcMain.handle('wf:app:restoreRecovery'"))
    // every early return still persists this session's state
    expect(handler.slice(0, handler.indexOf('\n})\n'))).toMatch(/const nothing = [\s\S]{0,200}broadcast\(\)/)
  })
  it('A3-N2: restore brings back Black / Logo / C and paints no intermediate frame', () => {
    const handler = src.slice(src.indexOf("ipcMain.handle('wf:app:restoreRecovery'"))
    const body = handler.slice(0, handler.indexOf('\n})\n'))
    expect(body).toMatch(/recoveredLayers\(snap, t\.mode\)/)
    expect(body).toMatch(/t\.textHidden = layers\.textHidden/)
    expect(body).toMatch(/suppressBroadcast = true[\s\S]*restoreTrack\('main'[\s\S]*suppressBroadcast = false/)
    expect(src).toMatch(/textHidden: t\.textHidden, bgHidden: t\.bgHidden \}\)/)
  })
  it('A3-N5: a missing item falls back to the logo, never puts the first item (countdown) live', () => {
    const handler = src.slice(src.indexOf("ipcMain.handle('wf:app:restoreRecovery'"))
    const fallback = handler.slice(handler.indexOf('} else {', handler.indexOf('const restoreTrack')), handler.indexOf('suppressBroadcast = true'))
    expect(fallback).not.toMatch(/handleTabletLoadItem/)
    expect(fallback).toMatch(/t\.mode = 'logo'/)
  })
  it('captures at the very top of whenReady', () => {
    expect(src).toMatch(/app\.whenReady\(\)\.then\(async \(\) => \{[\s\S]{0,300}startupRecovery\.capture\(\)/)
  })
  it('restoreRecovery reads the startup copy, not the live store', () => {
    const handler = src.slice(src.indexOf("ipcMain.handle('wf:app:restoreRecovery'"))
    const body = handler.slice(0, handler.indexOf('\n})\n'))
    expect(body).toMatch(/startupRecovery\.take\(\)/)
    expect(body).not.toMatch(/readRecovery\(\)/)
    expect(body).not.toMatch(/wasCleanExit\(\)/)
  })
})
