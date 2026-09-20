import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// index.ts / renderer files import Electron or window.wf and can't load under
// this Node-only Vitest config, so these assert against SOURCE. Same idiom as
// loadGenerationGuards.test.ts and autoDeck.test.ts.

describe('Sunday-morning safety guards', () => {
  const main = readFileSync(join(__dirname, 'index.ts'), 'utf8')
  const output = readFileSync(join(__dirname, '../renderer/src/Output.tsx'), 'utf8')
  const triptych = readFileSync(join(__dirname, '../renderer/src/live/LiveTriptych.tsx'), 'utf8')
  const recovery = readFileSync(join(__dirname, 'recovery.ts'), 'utf8')

  it('itemCanGoLive matches the renderer: livecall and announcement refIds are liveable', () => {
    const start = main.indexOf('function itemCanGoLive')
    expect(start).toBeGreaterThan(-1)
    const fn = main.slice(start, start + 900)
    expect(fn).toContain("item.type === 'livecall'")
    expect(fn).toContain('payload.refIds')
  })

  it('a clean quit does not auto-restore onto the projectors', () => {
    expect(main).toMatch(/if \(wasCleanExit\(\)\)/)
    expect(main).toMatch(/markCleanExit\(true\)/)
    expect(recovery).toMatch(/store\.set\('cleanExit', false\)/)
  })

  it('ticker apply runs before the generic lyrics branch', () => {
    const lyricsAnn = output.indexOf("s.mode === 'lyrics' && s.songTitle === 'Announcement'")
    const lyricsGeneric = output.indexOf("} else if (s.mode === 'lyrics') {")
    expect(lyricsAnn, 'ticker sentinel branch missing').toBeGreaterThan(-1)
    expect(lyricsGeneric, 'generic lyrics branch missing').toBeGreaterThan(-1)
    expect(lyricsAnn).toBeLessThan(lyricsGeneric)
  })

  it('LiveTriptych does not treat a live sermon as a logo cutaway', () => {
    expect(triptych).toMatch(/sermonLive/)
    expect(triptych).toMatch(/live\?\.mode === 'logo' && !sermonLive/)
  })
})
