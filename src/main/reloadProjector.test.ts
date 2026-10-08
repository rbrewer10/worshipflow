import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Ryan's decision (Oct 2026): a manual "Reload projector" in the operator.
// It reloads the output window(s), which come back showing the current live
// state with no flash of stale content (source guards; the e2e in
// tests/e2e drives the real button).
const rd = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n')
const main = rd('main', 'index.ts')
const preload = rd('preload', 'index.ts')
const output = rd('renderer', 'src', 'Output.tsx')
const liveTools = rd('renderer', 'src', 'LiveTools.tsx')
const button = rd('renderer', 'src', 'live', 'ReloadProjectorButton.tsx')

const body = (src: string, sig: string): string => {
  const at = src.indexOf(sig)
  expect(at, sig).toBeGreaterThan(-1)
  return src.slice(at, src.indexOf('\n}\n', at))
}

describe('Reload projector', () => {
  it('main reloads every live output window and reports how many', () => {
    const fn = body(main, 'function reloadProjectorWindows(): number {')
    expect(fn).toMatch(/for \(const w of outputWins\.values\(\)\)/)
    expect(fn).toMatch(/if \(w\.isDestroyed\(\)\) continue/)
    expect(fn).toMatch(/w\.webContents\.reloadIgnoringCache\(\)/)
    expect(fn).toMatch(/return reloaded/)
    expect(main).toContain("ipcMain.handle('wf:output:reload', (): number => reloadProjectorWindows())")
  })
  it('it touches no live state (no broadcast, no track/mode change)', () => {
    const fn = body(main, 'function reloadProjectorWindows(): number {')
    expect(fn).not.toMatch(/tracks\[|\.mode =|broadcast\(|processIntent|clearCountdown/)
  })
  it('a reloaded output is sent the current state as soon as it has loaded', () => {
    const fn = body(main, 'function createOutput(')
    expect(fn).toMatch(/did-finish-load', \(\) => \{\n\s*if \(!win\.isDestroyed\(\)\) win\.webContents\.send\('wf:state', buildStatePayload\(\)\)/)
  })
  it('the output starts black until that state arrives — no stale or default-theme flash', () => {
    const hook = body(output, 'export function useLiveModel(')
    expect(hook).toMatch(/useState<Mode>\('black'\)/)
    expect(hook).not.toMatch(/useState<Mode>\('lyrics'\)/)
    expect(hook).toMatch(/window\.wf\.getState\('main'\)\.then\(apply\)/)
  })
  it('the operator has the button in Outputs & looks, wired through preload', () => {
    expect(preload).toContain("reloadProjector: (): Promise<number> => ipcRenderer.invoke('wf:output:reload')")
    const section = liveTools.slice(liveTools.indexOf('title="Outputs & looks"'))
    expect(section.slice(0, 300)).toContain('<ReloadProjectorButton />')
    expect(button).toMatch(/window\.wf\.reloadProjector\(\)/)
    expect(button).toMatch(/> Reload projector/)
  })
})
