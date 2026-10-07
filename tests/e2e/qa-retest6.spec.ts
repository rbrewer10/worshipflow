import { test, expect, type Page } from '@playwright/test'
import { launchApp, closeApp, operatorWindow, outputWindow, completeFirstRun, visibleText } from './electronApp'
import { liveState, goToLiveControl, goLive, pressKey, openServedPage } from './qaHelpers'

// Regression spec for the QA retest6 lane B finding (retest6-b.md, repro
// b-extra/retest6/specs6/62c-first-slide), confirmed failing on f923be2:
//  B6-N1 — after a clicked Go live, the FIRST slide of a scripture reading kept
//          the pre-deck verse text on the projector, the Stage window and the
//          tablet ('35 And the same day…' for Mark 4:35-41, '1 To the chief
//          Musician…' for Psalm 46:1-3, no number at all for 'Romans 8:28;
//          12:1-2') while state.line and Zone 3 already had the numbered deck
//          text ('4:35 …'). It only corrected itself after Space then ←.

async function reloadOperator(op: Page): Promise<void> {
  await op.reload()
  await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
}

test('B6-N1: the first slide of a reading shows its numbered deck text on output, Stage window and tablet straight after a clicked Go live', async () => {
  test.setTimeout(240_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const readings = [
      { reference: 'Mark 4:35-41', first: /^4:35 And the same day/, next: /4:36 And when they had sent away/ },
      { reference: 'Psalm 46:1-3', first: /^46:1 To the chief Musician/, next: /46:2 Therefore will not we fear/ },
      { reference: 'Romans 8:28; 12:1-2', first: /^8:28 And we know that all things/, next: /12:1 I beseech you/ },
    ]
    const titles: string[] = await op.evaluate(async (refs) => {
      const wf = (window as any).wf
      const sid = await wf.serviceCreate('First slide', '2026-10-11')
      await wf.setActiveService(sid)
      await wf.serviceAddItem(sid, { type: 'text', payload: { title: 'Start', body: 'Start slide' } })
      const ids: number[] = []
      for (const r of refs) ids.push(await wf.serviceAddItem(sid, { type: 'scripture', payload: { reference: r } }))
      const svc = await wf.serviceGet(sid)
      return ids.map((id) => svc.items.find((i: any) => i.id === id).title as string)
    }, readings.map((r) => r.reference))
    await reloadOperator(op)
    const out = await outputWindow(app)
    await op.evaluate(() => (window as any).wf.stageOpen())
    const stageWin = await (async () => {
      const deadline = Date.now() + 15_000
      while (Date.now() < deadline) {
        const p = app.windows().find((w) => w.url().includes('#/stage'))
        if (p) { await p.waitForLoadState('domcontentloaded'); return p }
        await op.waitForTimeout(200)
      }
      throw new Error('Stage window never opened')
    })()
    const tablet = await openServedPage(app, op, '/stage', { width: 960, height: 540 })
    const z3 = await openServedPage(app, op, '/zone/3', { width: 960, height: 540 })
    await goToLiveControl(op)

    for (let k = 0; k < readings.length; k++) {
      const { reference, first, next } = readings[k]
      await goLive(op, titles[k])
      // The deck (and its numbered text) lands a moment after Go live.
      await expect.poll(async () => (await liveState(op)).line, { message: `${reference}: state.line`, timeout: 10_000 }).toMatch(first)
      const s = await liveState(op)
      expect(s.index).toBe(0)
      const firstText = first.source.slice(1)
      const vis = new RegExp(firstText)
      // Every surface must redraw slide 1 from the deck — without the operator touching anything.
      await expect.poll(() => visibleText(out), { message: `${reference}: projector slide 1`, timeout: 8_000 }).toMatch(vis)
      await expect.poll(() => visibleText(stageWin), { message: `${reference}: Stage window slide 1`, timeout: 8_000 }).toMatch(vis)
      // …and the Stage window's NEXT is the deck's numbered slide 2, not the pre-deck line.
      expect(await visibleText(stageWin), `${reference}: Stage window NEXT`).toMatch(next)
      await expect.poll(() => tablet.evaluate(() => document.getElementById('cur')?.textContent ?? ''), { message: `${reference}: tablet slide 1`, timeout: 8_000 }).toMatch(vis)
      await expect.poll(() => visibleText(z3), { message: `${reference}: Zone 3 slide 1`, timeout: 8_000 }).toMatch(vis)
      // Still right after the dust settles (no late stale broadcast).
      await op.waitForTimeout(1500)
      expect(await visibleText(out), `${reference}: projector slide 1 (settled)`).toMatch(vis)
      // The un-numbered pre-deck line never stays on the projector.
      expect(await visibleText(out)).not.toMatch(/(^|\s)(35|1) (And the same day|To the chief Musician)/)
      // Space then ← still lands on the same numbered first slide.
      await pressKey(app, op, 'Space')
      await expect.poll(async () => (await liveState(op)).index).toBe(1)
      await pressKey(app, op, 'ArrowLeft')
      await expect.poll(async () => (await liveState(op)).index).toBe(0)
      await expect.poll(() => visibleText(out), { message: `${reference}: projector after Space/←` }).toMatch(vis)
    }
  } finally {
    await closeApp(app, userDataDir)
  }
})
