import { test, expect, type Page } from '@playwright/test'
import { launchApp, closeApp, operatorWindow, outputWindow, completeFirstRun } from './electronApp'
import { liveState, goToLiveControl, openServedPage, pressKey } from './qaHelpers'

// Regression spec for the QA retest7 finding (retest7.md, repro
// b-extra/retest7/specs7/68-ref-flash), confirmed failing on 57bc413:
//  B7-N1 — after a clicked Go live on a reading, the projector briefly showed
//          ONLY the reference ('Mark 4:35') for ~170–260 ms, and Zone 3
//          'Mark 4:35 1 / 7' for ~100 ms, before the verse text. loadDeckOnto
//          broadcast the deck with reference-only slide summaries before the
//          verse lookup finished.
//
// Samples the VISIBLE text of OUT and Zone 3 every ~25 ms for 4.5 s after each
// Go live (and once for an arrival by Space) and fails on any reference-only
// frame.

// Text a viewer could actually read: displayed, and every ancestor at least
// half opaque (a crossfading layer counts once it's mostly in).
function shownText(p: Page): Promise<string> {
  return p.evaluate(() => {
    const seen = (el: Element | null): boolean => {
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e)
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.5) return false
      }
      return true
    }
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const out: string[] = []
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = (n.textContent ?? '').trim()
      if (t && seen(n.parentElement)) out.push(t)
    }
    // Drop clock readouts, normalise whitespace and curly quotes.
    return out.join(' ').replace(/\d{1,2}:\d{2}(:\d{2})?\s?[AP]M/g, '').replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim()
  }).catch(() => '?')
}

// A reference with nothing else: 'Mark 4:35', 'Romans 8:28; 12:1-2', 'Luke 2:1 1 / 7'.
const REFERENCE_ONLY = /^(Mark|Psalms?|Romans|John|Luke) \d+:\d+(\s*[-–;].*)?(\s+\d+ \/ \d+)?$/

test('B7-N1: no reference-only frame on the projector or Zone 3 after Go live on a reading', async () => {
  test.setTimeout(240_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const readings = [
      { reference: 'Mark 4:35-41', verse: /And the same day/ },
      { reference: 'Psalm 46:1-3', verse: /To the chief Musician/ },
      { reference: 'Romans 8:28; 12:1-2', verse: /And we know that all things/ },
      { reference: 'John 3:16', verse: /For God so loved the world/ },
      { reference: 'Luke 2:1-7', verse: /And it came to pass in those days/ },
    ]
    const items: Array<{ id: number; title: string }> = await op.evaluate(async (refs) => {
      const wf = (window as any).wf
      const sid = await wf.serviceCreate('Reference flash', '2026-10-11')
      await wf.setActiveService(sid)
      const start = await wf.serviceAddItem(sid, { type: 'text', payload: { title: 'Start', body: 'Start slide' } })
      const ids: number[] = [start]
      for (const r of refs) ids.push(await wf.serviceAddItem(sid, { type: 'scripture', payload: { reference: r } }))
      const svc = await wf.serviceGet(sid)
      return ids.map((id) => ({ id, title: svc.items.find((i: any) => i.id === id).title as string }))
    }, readings.map((r) => r.reference))
    await op.reload()
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    const out = await outputWindow(app)
    const z3 = await openServedPage(app, op, '/zone/3', { width: 960, height: 540 })
    await goToLiveControl(op)
    const goLiveButton = (k: number) => op.getByRole('button', { name: `Go live: ${items[k].title}`, exact: true }).first()

    const flashes: string[] = []
    // Act, then sample both surfaces for 4.5 s; return the last OUT text.
    const sample = async (label: string, act: () => Promise<void>): Promise<string> => {
      const t0 = Date.now()
      await act()
      let lastOut = ''
      while (Date.now() - t0 < 4500) {
        const [o, z] = await Promise.all([shownText(out), shownText(z3)])
        const t = Date.now() - t0
        if (REFERENCE_ONLY.test(o)) flashes.push(`${label} +${t}ms OUT "${o}"`)
        if (REFERENCE_ONLY.test(z)) flashes.push(`${label} +${t}ms Z3 "${z}"`)
        lastOut = o
        await op.waitForTimeout(20)
      }
      return lastOut
    }
    const backToStart = async (): Promise<void> => {
      await goLiveButton(0).click()
      await expect.poll(async () => (await liveState(op)).liveServiceItemId, { timeout: 10_000 }).toBe(items[0].id)
      await op.waitForTimeout(1500)
    }

    for (let k = 0; k < readings.length; k++) {
      const { reference, verse } = readings[k]
      await backToStart()
      const settled = await sample(`Go live ${reference}`, () => goLiveButton(k + 1).click())
      // Not vacuous: the reading really is on the projector by the end.
      expect(settled, `${reference}: projector after Go live`).toMatch(verse)
    }
    // Arrival by Space from the last slide of the item before (Start → Mark).
    await backToStart()
    await pressKey(app, op, 'Space')
    await expect.poll(async () => (await liveState(op)).index).toBe(1)
    await op.waitForTimeout(1500)
    // Focus the operator window first (as pressKey does), so the sample starts at the key press.
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => !/#\/(output|stage)|\/zone\/|\/obs/.test(x.webContents.getURL()))
      w?.focus(); w?.webContents.focus()
    })
    await op.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    const settled = await sample('Space into Mark 4:35-41', () => op.keyboard.press('Space'))
    expect(settled, 'projector after Space').toMatch(readings[0].verse)

    if (flashes.length) console.log(flashes.join('\n'))
    expect(flashes, 'reference-only frames').toEqual([])
  } finally {
    await closeApp(app, userDataDir)
  }
})
