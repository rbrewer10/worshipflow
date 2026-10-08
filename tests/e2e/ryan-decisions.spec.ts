import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, closeApp, operatorWindow, outputWindow, completeFirstRun, visibleText } from './electronApp'
import { liveState, goToLiveControl, goLive, pressKey, openServedPage } from './qaHelpers'

// Ryan's decisions on Church Tech's open questions (Oct 2026), one test each:
//  #1 Prev during a countdown does nothing            (PR fix/countdown-prev-stay)
//  #2 a .wfservice carries its pictures/videos         (PR feat/wfservice-media)
//  #3 Reload projector                                 (PR feat/reload-projector)
//  #4 Black during the 1.5 s Go Live wait: unchanged   (PR test/black-during-go-live-wait)
//  #5 zone pages go dark with Black                    (PR fix/zones-dark-on-black)

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
    return out.join(' ').replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim()
  }).catch(() => '?')
}

// The output's own diagnostics badges (unpackaged builds: "OUT 1", fps) aren't audience content.
const audience = async (out: Page): Promise<string> => (await visibleText(out)).replace(/\bOUT \d+\b/g, '').replace(/\b\d+(\.\d+)? ?fps\b/gi, '').replace(/\s+/g, ' ').trim()

// Is any backdrop (theme gradient, picture, video) painted on the output?
const backdropShown = (out: Page): Promise<boolean> => out.evaluate(() => [...document.querySelectorAll('div, img, video')].some((el) => {
  const cs = getComputedStyle(el)
  if (cs.visibility !== 'visible' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return false
  if (el.tagName === 'IMG' || el.tagName === 'VIDEO') return (el as HTMLImageElement).getBoundingClientRect().width > 50
  return cs.backgroundImage !== 'none' && el.getBoundingClientRect().width > 50
})).catch(() => false)

const secondsOf = (line: string): number => { const [m, s] = line.split(':').map((n) => parseInt(n, 10)); return m * 60 + s }

test('#1 Countdown: Prev does nothing — same item, still counting, not restarted', async () => {
  test.setTimeout(120_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    // An item before the countdown, so Prev has somewhere it could go.
    const [, countdown, afterItem]: number[] = await op.evaluate(async () => {
      const wf = (window as any).wf
      const sid = await wf.serviceCreate('Countdown Prev', '2026-10-11')
      await wf.setActiveService(sid)
      const ids = [
        await wf.serviceAddItem(sid, { type: 'text', payload: { title: 'Before', body: 'Before the countdown' } }),
        await wf.serviceAddItem(sid, { type: 'countdown', payload: { seconds: 300 } }),
        await wf.serviceAddItem(sid, { type: 'text', payload: { title: 'After', body: 'After the countdown' } })
      ]
      await wf.serviceRefreshActiveItems(sid) // main's Next/Prev walk the active service's items
      return ids
    })
    await op.reload()
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    await goToLiveControl(op)
    await op.evaluate((id) => (window as any).wf.liveGoLiveAt('main', id, 0), countdown)
    await expect.poll(async () => (await liveState(op)).mode, { timeout: 10_000 }).toBe('countdown')
    await op.waitForTimeout(2500)
    const before = await liveState(op)
    expect(before.liveServiceItemId).toBe(countdown)
    await pressKey(app, op, 'ArrowLeft')
    await pressKey(app, op, 'PageUp')
    const after = await liveState(op)
    expect(after.liveServiceItemId).toBe(countdown)
    expect(after.mode).toBe('countdown')
    // still running down from where it was — not back at 5:00
    expect(secondsOf(after.line)).toBeLessThanOrEqual(secondsOf(before.line))
    expect(secondsOf(after.line)).toBeLessThan(300)
    await op.waitForTimeout(2200)
    expect(secondsOf((await liveState(op)).line)).toBeLessThan(secondsOf(after.line))
    // Next still moves on
    await pressKey(app, op, 'ArrowRight')
    await expect.poll(async () => (await liveState(op)).liveServiceItemId, { timeout: 5000 }).toBe(afterItem)
  } finally { await closeApp(app, userDataDir) }
})

test('#4 Black during the 1.5 s Go Live wait: screen blacks at once, the armed item still goes live', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    const out = await outputWindow(app)
    await completeFirstRun(op, { sample: true })
    await goToLiveControl(op)
    await goLive(op, 'Amazing Grace')
    await expect.poll(() => visibleText(out)).toMatch(/Amazing grace/i)
    await op.getByRole('button', { name: 'Go live: Holy, Holy, Holy', exact: true }).first().click() // arms (tap to cancel)
    await pressKey(app, op, 'b') // inside the 1.5 s
    const blacked = await liveState(op)
    expect(blacked.mode).toBe('black')
    expect(blacked.songTitle).toBe('Amazing Grace') // not live yet
    await expect.poll(() => visibleText(out), { timeout: 2000 }).not.toMatch(/Amazing grace/i)
    // the wait ends: the armed song goes live and takes the screen out of Black
    await expect.poll(async () => { const s = await liveState(op); return `${s.mode}|${s.songTitle}` }, { timeout: 5000 }).toBe('lyrics|Holy, Holy, Holy')
    await expect.poll(() => visibleText(out), { timeout: 5000 }).toMatch(/Holy, holy, holy/i)
  } finally { await closeApp(app, userDataDir) }
})

test('#5 Zones: Black takes every zone page dark with OUT, and they come back when Black clears', async () => {
  test.setTimeout(120_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    await goToLiveControl(op)
    await goLive(op, 'Amazing Grace')
    const z3 = await openServedPage(app, op, '/zone/3', { width: 960, height: 540 })
    const z4 = await openServedPage(app, op, '/zone/4', { width: 960, height: 540 })
    await expect.poll(() => shownText(z3), { timeout: 10_000 }).toMatch(/Amazing grace/i)
    await op.evaluate(() => (window as any).wf.sendIntent('main', 'black'))
    await expect.poll(async () => Object.values(await op.evaluate(() => (window as any).wf.zoneGetStates()) as Record<string, any>).map((z) => z.mode).join(','), { timeout: 5000 }).toBe('black,black,black,black')
    await expect.poll(() => shownText(z3), { timeout: 5000 }).toBe('')
    await expect.poll(() => shownText(z4), { timeout: 5000 }).toMatch(/Screen Off/)
    expect(await shownText(z4)).not.toMatch(/Amazing grace/i)
    // Black clears → zone 3 shows the line again
    await op.evaluate(() => (window as any).wf.sendIntent('main', 'lyrics'))
    await expect.poll(() => shownText(z3), { timeout: 5000 }).toMatch(/Amazing grace/i)
    await expect.poll(() => shownText(z4), { timeout: 5000 }).not.toMatch(/Screen Off/)
  } finally { await closeApp(app, userDataDir) }
})

test('#3 Reload projector: the output reloads and shows what is live now — no stale frame; Black stays black', async () => {
  test.setTimeout(120_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    const out = await outputWindow(app)
    await completeFirstRun(op, { sample: true })
    await goToLiveControl(op)
    await goLive(op, 'Amazing Grace')
    await pressKey(app, op, 'ArrowRight') // slide 2: slide 1 on screen after the reload would be stale
    const live = await liveState(op)
    const line2 = String(live.line).split('\n')[0].slice(0, 12).toLowerCase()
    await expect.poll(async () => (await audience(out).catch(() => '')).toLowerCase()).toContain(line2)
    const markBefore = await out.evaluate(() => { (window as any).__beforeReload = true; return true })
    expect(markBefore).toBe(true)

    // Keyboard, like an operator tabbing: in the e2e window the Live tools
    // column scrolls under its sticky footer, which swallows a mouse click.
    await op.getByRole('button', { name: /Outputs & looks/ }).first().press('Enter')
    await op.getByRole('button', { name: /Reload projector/ }).press('Enter')
    const frames: string[] = []
    const t0 = Date.now()
    while (Date.now() - t0 < 3000) { frames.push((await audience(out).catch(() => '<loading>')).toLowerCase()); await out.waitForTimeout(10) }
    // it really reloaded (fresh page), and nothing but black or the live slide was ever shown
    expect(await out.evaluate(() => (window as any).__beforeReload ?? false)).toBe(false)
    const other = frames.filter((f) => f !== '' && f !== '<loading>' && !f.includes(line2))
    expect(other, 'frames showing something other than black or the live slide').toEqual([])
    expect(frames[frames.length - 1]).toContain(line2)
    const after = await liveState(op)
    expect([after.liveServiceItemId, after.index, after.mode]).toEqual([live.liveServiceItemId, live.index, live.mode])
    await expect(op.getByText(/Projector reloaded/)).toBeVisible()

    // under Black, the reloaded projector stays black
    await pressKey(app, op, 'b')
    await expect.poll(() => audience(out)).toBe('')
    await op.getByRole('button', { name: /Reload projector/ }).press('Enter')
    expect(await backdropShown(out)).toBe(false)
    const dark: string[] = []
    let backdropFrames = 0
    const t1 = Date.now()
    while (Date.now() - t1 < 2500) {
      dark.push(await audience(out).catch(() => ''))
      if (await backdropShown(out)) backdropFrames++
      await out.waitForTimeout(5)
    }
    expect(dark.filter((f) => f !== '')).toEqual([])
    // a fresh output starts black until the state arrives — never the default theme backdrop
    expect(backdropFrames, 'frames with a backdrop painted while the screen is Black').toBe(0)
    expect((await liveState(op)).mode).toBe('black')
  } finally { await closeApp(app, userDataDir) }
})

// Minimal real media: a PNG and an MP4 (ftyp header) the content sniffer accepts.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082', 'hex')
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(4096, 1)])

test('#2 .wfservice carries its pictures and videos: export, remove the originals, import — the service is complete', async () => {
  test.setTimeout(120_000)
  const { app, userDataDir } = await launchApp()
  const media = mkdtempSync(join(tmpdir(), 'wf-media-'))
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: false })
    const cross = join(media, 'cross.png'); writeFileSync(cross, PNG)
    const loop = join(media, 'loop.mp4'); writeFileSync(loop, MP4)
    const svcId: number = await op.evaluate(async ({ cross, loop }) => {
      const wf = (window as any).wf
      const id = await wf.serviceCreate('USB Sunday', '2026-10-11')
      await wf.serviceAddItem(id, { type: 'image', payload: { path: cross } })
      await wf.serviceAddItem(id, { type: 'text', payload: { title: 'Welcome', body: 'Welcome home', background: loop } })
      return id
    }, { cross, loop })
    const file = join(media, 'USB Sunday.wfservice')
    await app.evaluate(({ dialog }, p) => { (dialog as any).showSaveDialog = async () => ({ canceled: false, filePath: p }) }, file)
    const exp = await op.evaluate((id) => (window as any).wf.serviceExport(id), svcId)
    expect(exp.error).toBeUndefined()
    expect(exp.mediaCount).toBe(2)
    expect(exp.missingMedia).toEqual([])
    expect(readFileSync(file).toString('latin1', 257, 262)).toBe('ustar')

    // "another PC": the originals and any copies are gone
    rmSync(cross); rmSync(loop)
    const imported = join(userDataDir, 'userData', 'imported-media')
    if (existsSync(imported)) for (const f of readdirSync(imported)) rmSync(join(imported, f), { force: true })

    await app.evaluate(({ dialog }, p) => { (dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [p] }) }, file)
    const res = await op.evaluate(() => (window as any).wf.serviceImportFile())
    expect(res.error).toBeUndefined()
    expect(res.summary).toMatch(/2 picture\/video files copied onto this computer/)
    expect(res.summary).not.toMatch(/isn’t on this computer|aren’t on this computer/)
    const items: any[] = await op.evaluate(async (id) => (await (window as any).wf.serviceGet(id)).items, res.serviceId)
    const img = items.find((i) => i.type === 'image')!.payload.path as string
    const bg = items.find((i) => i.type === 'text')!.payload.background as string
    for (const [p, bytes] of [[img, PNG], [bg, MP4]] as const) {
      expect(p.startsWith(imported)).toBe(true)
      expect(readFileSync(p).equals(bytes)).toBe(true)
    }

    // and a file missing at export time is named in the warning, not silently dropped
    const gone = await op.evaluate(async (p) => {
      const wf = (window as any).wf
      const id = await wf.serviceCreate('Missing media', '2026-10-11')
      await wf.serviceAddItem(id, { type: 'image', payload: { path: p } })
      return wf.serviceExport(id)
    }, join(media, 'not-there.jpg'))
    expect(gone.mediaCount).toBe(0)
    expect(gone.missingMedia).toEqual(['not-there.jpg'])
  } finally {
    rmSync(media, { recursive: true, force: true })
    await closeApp(app, userDataDir)
  }
})
