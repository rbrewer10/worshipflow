import { test, expect } from '@playwright/test'
import { launchApp, closeApp, operatorWindow, outputWindow, completeFirstRun, visibleText } from './electronApp'
import { liveState, goToLiveControl, goLive, pressKey, openServedPage } from './qaHelpers'

// QA regressions: A-C1, A-H2, B2, B3, B4, B5, B-15.

test('A-C1: an untitled text card shows its words, not an "Announcement" ticker', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    const out = await outputWindow(app)
    await completeFirstRun(op)
    await op.evaluate(() => (window as any).wf.liveLoadText('main', '', 'Welcome to Snow Hill Church\n\nPlease silence your phones'))
    await expect.poll(() => visibleText(out)).toContain('Welcome to Snow Hill Church')
    expect(await visibleText(out)).not.toContain('Announcement')
    expect(await out.evaluate(() => !!document.querySelector('[style*="animation-duration"]'))).toBe(false)
    await op.evaluate(() => (window as any).wf.sendIntent('main', 'next'))
    await expect.poll(() => visibleText(out)).toContain('Please silence your phones')
  } finally { await closeApp(app, userDataDir) }
})

test('A-H2: a ticker announcement scrolls its message, not the word "Announcement"', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    const out = await outputWindow(app)
    await completeFirstRun(op)
    const id = await op.evaluate(() => (window as any).wf.announcementCreate({ title: 'Potluck', body: 'Potluck lunch after service in the fellowship hall', display: 'ticker', frequency: 'recurring' }))
    await op.evaluate((id) => (window as any).wf.liveLoadAnnouncement('main', id), id)
    await expect.poll(() => visibleText(out)).toContain('Potluck lunch after service in the fellowship hall')
    expect((await liveState(op)).line).toBe('Potluck lunch after service in the fellowship hall')
  } finally { await closeApp(app, userDataDir) }
})

test('B2 + B3 + B4: Clear lyrics resets on the next item, Prev on the countdown, long verses fit', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    const out = await outputWindow(app)
    await completeFirstRun(op, { sample: true })
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('#/output'))!
      w.setFullScreen(false); w.setContentSize(1920, 1080); w.setPosition(0, 0)
    })
    await goToLiveControl(op)

    // B4: "Holy, Holy, Holy" v1 at 1920x1080 used to measure top -36 / bottom 1115.
    await goLive(op, 'Holy, Holy, Holy')
    await out.waitForTimeout(800)
    const rects = await out.evaluate(() => Array.from(document.querySelectorAll('span.font-bold')).map((s) => {
      const r = s.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight }
    }))
    expect(rects.length).toBeGreaterThan(0)
    for (const r of rects) { expect(r.top).toBeGreaterThanOrEqual(0); expect(r.bottom).toBeLessThanOrEqual(r.h) }

    // B2: C (Clear lyrics), then Go live on another song -> words come back.
    await pressKey(app, op, 'c')
    expect((await liveState(op)).textHidden).toBe(true)
    await goLive(op, 'Come Thou Fount of Every Blessing')
    expect((await liveState(op)).textHidden).toBe(false)
    await expect.poll(() => visibleText(out)).toMatch(/Come|fount/i)

    // B3: Prev during the countdown never un-blanks to a frozen old slide —
    // and (Ryan's decision) does nothing at all: same item, still a countdown.
    await goLive(op, 'Countdown 5:00')
    const before = await liveState(op)
    expect(before.mode).toBe('countdown')
    await pressKey(app, op, 'ArrowLeft')
    const after = await liveState(op)
    expect(after.liveServiceItemId).toBe(before.liveServiceItemId)
    expect(after.mode).toBe('countdown')
  } finally { await closeApp(app, userDataDir) }
})

test('B5 + B-15: OBS overlay is empty during Rehearsal; a long lower third scrolls', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    await goToLiveControl(op)
    await goLive(op, 'Amazing Grace')
    const obs = await openServedPage(app, op, '/obs', { width: 1280, height: 720 })
    await expect.poll(() => obs.evaluate(() => document.getElementById('box')!.className)).toBe('on')

    const longMsg = 'Fellowship lunch after service in the Family Life Center — everyone welcome; please bring a side dish, and parents of children in the nursery please pick up by 12:15 today'
    await op.getByPlaceholder('Announcement over lyrics…').fill(longMsg)
    await op.getByPlaceholder('Announcement over lyrics…').press('Enter')
    await expect.poll(() => obs.evaluate(() => document.querySelector('#ticker .track') !== null)).toBe(true)

    await op.evaluate(() => (window as any).wf.setRehearsalMode(true))
    await expect.poll(() => obs.evaluate(() => [document.getElementById('box')!.className, document.getElementById('ticker')!.className])).toEqual(['', ''])
  } finally { await closeApp(app, userDataDir) }
})
