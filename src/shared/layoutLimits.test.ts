import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { OPERATOR_MIN_WIDTH, SMALLEST_SUPPORTED_SCREEN_WIDTH, songToolsOpen } from './layoutLimits'

describe('operator window floor (QA B17)', () => {
  it('fits a maximized window on a 1280-px laptop', () => {
    expect(OPERATOR_MIN_WIDTH).toBeLessThanOrEqual(SMALLEST_SUPPORTED_SCREEN_WIDTH)
  })
  it('index.ts uses the shared floor, not a hard-coded 1300', () => {
    const main = readFileSync(join(__dirname, '../main/index.ts'), 'utf8')
    expect(main).toMatch(/minWidth: OPERATOR_MIN_WIDTH,/)
    expect(main).not.toMatch(/minWidth: 1300/)
  })
  it('Safety Reset stays on screen when the tools column scrolls — as a footer outside the scroll area, so it covers nothing (B17, B2-N10)', () => {
    const tools = readFileSync(join(__dirname, '../renderer/src/LiveTools.tsx'), 'utf8')
    expect(tools).not.toMatch(/sticky bottom-0/)
    const scroll = tools.indexOf('wf-live-tools-scroll')
    const scrollEnd = tools.indexOf('<ServiceControlsDrawer')
    const footer = tools.indexOf('wf-live-tools-footer shrink-0')
    expect(scroll).toBeGreaterThan(-1)
    expect(footer).toBeGreaterThan(scrollEnd)
    expect(tools.slice(footer)).toMatch(/^[^>]*>\s*<button\s+onClick=\{\(\) => void window\.wf\.zoneSafetyReset\(\)\}/)
    expect(tools.match(/zoneSafetyReset\(\)/g)).toHaveLength(1)
  })
})

describe('song library tools (QA B18)', () => {
  it('collapsed by default once there are songs, so the list gets the room', () => {
    expect(songToolsOpen(null, 4, false)).toBe(false)
    expect(songToolsOpen(null, 0, false)).toBe(true)
    expect(songToolsOpen(null, 0, true)).toBe(false)
  })
  it('remembers the operator’s choice', () => {
    expect(songToolsOpen('1', 400, false)).toBe(true)
    expect(songToolsOpen('0', 0, false)).toBe(false)
  })
  it('QA B2-N5: once open this session it stays open after the first paste', () => {
    expect(songToolsOpen(null, 1, false, true)).toBe(true)
    expect(songToolsOpen('0', 1, false, true)).toBe(false) // the operator's own collapse still wins
  })
})
