import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// index.ts can't be imported under the Node-only Vitest config (Electron), so
// these pin the wiring against source, like sundaySafety.test.ts. The decisions
// themselves are unit-tested in src/shared/windowPolicy.test.ts, and the
// behaviour end-to-end in the QA e2e regression suite.
// CRLF on a Windows checkout (CI): compare with \n line ends (QA B10-N2).
const main = readFileSync(join(__dirname, 'index.ts'), 'utf8').replace(/\r\n/g, '\n')
const slice = (sig: string, len: number): string => {
  const i = main.indexOf(sig)
  expect(i, `missing ${sig}`).toBeGreaterThan(-1)
  return main.slice(i, i + len)
}

describe('QA A-C2: operator window', () => {
  it('second-instance recreates the operator window when it is gone', () => {
    const h = slice("app.on('second-instance'", 700)
    expect(h).toMatch(/if \(!operatorWin \|\| operatorWin\.isDestroyed\(\)\)\s*\{\s*createOperator\(\)/)
  })
  it('the operator window has a close guard that quits the whole app', () => {
    const c = slice("operatorWin.on('close'", 1400)
    expect(c).toContain('operatorCloseDecision(')
    expect(c).toContain('e.preventDefault()')
    expect(c).toContain('app.quit()')
    // the confirm defaults to keeping WorshipFlow open
    expect(c).toMatch(/defaultId: 0,\s*cancelId: 0/)
  })
  it('before-quit sets isQuitting so close guards step aside on a real quit', () => {
    expect(slice("app.on('before-quit'", 200)).toContain('isQuitting = true')
  })
})

describe('QA A-H7: output windows', () => {
  it('output windows block close unless quitting', () => {
    const c = slice('function createOutput(', 1600)
    expect(c).toContain("win.on('close'")
    expect(c).toContain('outputCloseAllowed(')
  })
  it("a destroyed old window can't drop the re-created window of the same label", () => {
    expect(slice('function createOutput(', 2000)).toContain('if (outputWins.get(label) === win) outputWins.delete(label)')
  })
})

describe('QA A-H3: renderer crash recovery', () => {
  it('reloads crashed renderers with a crash-loop cap', () => {
    const w = slice('function watchRenderer(', 1200)
    expect(w).toContain("'render-process-gone'")
    expect(w).toContain('rendererRecovery.allowReload(')
    expect(w).toContain('webContents.reload()')
  })
  it('operator, outputs and the stage window are all watched', () => {
    expect(main).toContain("watchRenderer(operatorWin, 'operator'")
    expect(main).toContain('watchRenderer(win, `output:${label}`')
    expect(main).toContain("watchRenderer(stageWin, 'stage'")
  })
  it('the "screens connected" count excludes crashed outputs', () => {
    expect(main).toContain('outputs: workingOutputCount(),')
    expect(slice('function workingOutputCount(', 300)).toContain('isCrashed()')
  })
})

describe('QA A-L3 / A-L4 wiring', () => {
  const src = readFileSync(join(__dirname, 'index.ts'), 'utf8').replace(/\r\n/g, '\n')
  it('Windows shutdown/log-off records a clean exit', () => {
    expect(src).toMatch(/win\.on\('session-end', onSessionEnd\)/)
    expect(src).toMatch(/function onSessionEnd\(\): void \{[\s\S]*?markCleanExit\(true\)/)
    expect(src).toMatch(/watchSessionEnd\(operatorWin\)/)
    expect(src).toMatch(/outputWins\.set\(label, win\)\n\s*watchSessionEnd\(win\)/)
    expect(src).toMatch(/powerMonitor\.on\('shutdown', onSessionEnd\)/)
  })
  it('unplugging a display re-homes the stage and multiview windows', () => {
    expect(src).toMatch(/screen\.on\('display-removed', \(_e, removed\) => rehomeAuxWindows\(removed\)\)/)
  })
})

describe('QA A-N3: crashed windows come back', () => {
  it('a second launch revives a crashed (not destroyed) operator and outputs', () => {
    const h = slice("app.on('second-instance'", 1200)
    expect(h).toContain('reviveCrashedWindows()')
    const r = slice('function reviveCrashedWindows', 600)
    expect(r).toMatch(/webContents\.isCrashed\(\)/)
    expect(r).toMatch(/rendererRecovery\.reset\(key\)/)
    expect(r).toMatch(/webContents\.reload\(\)/)
  })
  it('past the crash cap a retry is scheduled with back-off instead of giving up', () => {
    const w = slice('function watchRenderer', 2400)
    expect(w).toMatch(/rendererRecovery\.retryAfterMs\(key\)/)
    expect(w).toMatch(/crashRetryTimers\.set\(key, setTimeout/)
  })
  it('notices raised while the operator is crashed or reloading are held and replayed', () => {
    const n = slice('function notifyOperator', 500)
    expect(n).toMatch(/isCrashed\(\) \|\| operatorWin\.webContents\.isLoading\(\)/)
    expect(n).toContain('pendingOperatorNotices.push')
    expect(main).toMatch(/setTimeout\(flushOperatorNotices/)
  })
})

describe('QA A-N6: close prompt', () => {
  it('uses what is showing now, not "anything was ever live"', () => {
    const c = slice("operatorWin.on('close'", 1600)
    expect(c).toContain('anyTrackShowing()')
    expect(c).toContain('closePromptText(')
    expect(c).not.toContain('The projectors are live.')
  })
})
