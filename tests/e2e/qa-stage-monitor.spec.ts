import { test, expect } from '@playwright/test'
import { launchApp, closeApp, operatorWindow, completeFirstRun } from './electronApp'
import { goToLiveControl, goLive, liveState, openServedPage } from './qaHelpers'

// QA regression A-H1 (a-extra/stage-harness.mjs): the Stage Monitor zone page.

const LONG = Array.from({ length: 4 }, (_, i) => (`Line ${i + 1} ` + 'great is thy faithfulness morning by morning '.repeat(10)).slice(0, 140)).join('\n')

test('A-H1: Stage Monitor fits a long verse, re-fits on resize, and shows "Up next" on the last slide', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    await goToLiveControl(op)
    await goLive(op, 'Amazing Grace')
    const stage = await openServedPage(app, op, '/zone/4')
    await expect.poll(() => stage.evaluate(() => document.getElementById('current')!.textContent)).toMatch(/grace/i)

    // Last slide of the item: Next shows the next service item.
    const s = await liveState(op)
    for (let i = s.index; i < s.total - 1; i++) await op.evaluate(() => (window as any).wf.sendIntent('main', 'next'))
    await expect.poll(() => stage.evaluate(() => document.getElementById('nextlabel')!.textContent)).toBe('Up next')
    expect(await stage.evaluate(() => document.getElementById('nextline')!.textContent)).toBe('Come Thou Fount of Every Blessing')

    // A verse far too long for the box (QA: 843px of text in 680px, unflagged).
    await op.evaluate((t) => (window as any).wf.liveLoadText('main', '', t), LONG)
    const fits = (): Promise<boolean> => stage.evaluate(() => {
      const cur = document.getElementById('current')!
      const cs = getComputedStyle(cur)
      const availH = cur.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      const el = cur.firstElementChild as HTMLElement
      return !!el && el.scrollHeight <= availH + 2 && el.textContent!.includes('Line 1')
    })
    await expect.poll(fits).toBe(true)

    // Resize without a new slide (a Pi that boots before the TV changes mode).
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('/zone/4'))!
      w.setContentSize(1280, 1024)
    })
    await stage.waitForTimeout(600)
    await expect.poll(fits).toBe(true)
  } finally { await closeApp(app, userDataDir) }
})
