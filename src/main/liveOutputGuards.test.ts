import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// index.ts imports Electron and can't load under this Node-only Vitest config,
// so (like sundaySafety.test.ts / loadGenerationGuards.test.ts) these pin the
// fixes against SOURCE. The behaviour itself is covered by the pure-module
// tests (liveNav, liveDisplay) and the e2e QA regression suite.
const main = readFileSync(join(__dirname, 'index.ts'), 'utf8')

function body(sig: string, len = 2600): string {
  const i = main.indexOf(sig)
  expect(i, `missing ${sig}`).toBeGreaterThan(-1)
  return main.slice(i, i + len)
}

describe('QA B2: a new item brings hidden lyrics back', () => {
  const loaders = [
    'function doLoadText(',
    'function doLoadSermon(',
    'function doLoadLiveCall(',
    'function doLoadCountdown(',
    'async function doLoadScripture(',
    'async function doLoadSong(',
    'function doLoadAnnouncementSlide(',
    'function doLoadMedia('
  ]
  for (const sig of loaders) {
    it(`${sig.replace(/^(async )?function /, '').replace('(', '')} resets per-item layers`, () => {
      expect(body(sig)).toContain('resetPerItemLayers(track)')
    })
  }
  it('resetPerItemLayers clears textHidden (but not bgHidden)', () => {
    const fn = body('function resetPerItemLayers(', 200)
    expect(fn).toContain('t.textHidden = false')
    expect(fn).not.toContain('bgHidden')
  })
})

describe('QA A-C1 / A-H2: ticker is an explicit flag', () => {
  it("doLoadText no longer defaults an empty title to 'Announcement'", () => {
    expect(body('function doLoadText(', 1600)).not.toMatch(/title \|\| 'Announcement'/)
  })
  it('ticker announcements load through doLoadTickerAnnouncement with the body as the line', () => {
    const fn = body('function doLoadTickerAnnouncement(', 500)
    expect(fn).toContain('t.isTicker = true')
    expect(fn).toContain('tickerLine(body)')
  })
  it('renderState publishes isTicker', () => {
    expect(main).toContain('isTicker: t.hasLiveContent && t.isTicker')
  })
})

describe('QA B3: Prev during countdown', () => {
  it('processIntent routes Next/Prev through the planNav decision table', () => {
    expect(body('function processIntent(', 2000)).toContain('planNav(dir,')
  })
})
