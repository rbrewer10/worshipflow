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

describe('index.ts wiring (A2-N1)', () => {
  const src = readFileSync(join(__dirname, 'index.ts'), 'utf-8')
  it('captures the previous snapshot before the first recovery write', () => {
    expect(src).toMatch(/startupRecovery\.capture\(\)\s*\n\s*lastWrittenRecoveryKey = recoveryKey\s*\n\s*writeRecovery\(/)
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
