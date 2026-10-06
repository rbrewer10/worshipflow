import { test, expect, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, closeApp, operatorWindow, outputWindow, completeFirstRun, visibleText } from './electronApp'
import { liveState, goToLiveControl, goLive, pressKey } from './qaHelpers'

// Regression specs for the QA retest2 findings (retest2-a.md / retest2-b.md)
// that need the real app: B2-N1, A2-N1, A2-N2, B2-N2, B2-N3, B2-N11.

// A real 2x2 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVQI12P8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==', 'base64')

const wfCall = <T = any>(op: Page, fn: string, ...args: unknown[]): Promise<T> =>
  op.evaluate(([f, a]) => (window as any).wf[f as string](...(a as unknown[])), [fn, args] as const)

async function sampleService(op: Page): Promise<any> {
  const id = (await wfCall<any[]>(op, 'servicesList')).find((s) => s.name === 'Sample Sunday').id
  return wfCall(op, 'serviceGet', id)
}

/** Can the projector window actually load this stored media path? */
async function outputCanLoad(out: Page, path: string): Promise<boolean> {
  return out.evaluate((p) => new Promise<boolean>((res) => {
    const img = new Image()
    img.onload = () => res(img.naturalWidth > 0)
    img.onerror = () => res(false)
    img.src = 'wf-asset://?path=' + encodeURIComponent(p)
    setTimeout(() => res(false), 5000)
  }), path)
}

test('B2-N1: a picture picked from outside the app folder is copied in and shows on the projector; old outside paths are migrated, missing ones flagged', async () => {
  const outside = mkdtempSync(join(tmpdir(), 'wf-usb-'))
  const first = await launchApp()
  const root = first.userDataDir
  try {
    const picked = join(outside, 'Sunday Cross.png')
    const legacy = join(outside, 'legacy-bg.png')
    writeFileSync(picked, PNG)
    writeFileSync(legacy, PNG)
    const op = await operatorWindow(first.app)
    await completeFirstRun(op, { sample: true })
    const out = await outputWindow(first.app)
    // Not servable straight from the USB stick / Pictures — this is why the projector was blank.
    expect(await outputCanLoad(out, picked)).toBe(false)

    await first.app.evaluate(({ dialog }, p) => { (dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [p] }) }, picked)
    const res = await wfCall<any>(op, 'mediaPick')
    expect(res.error).toBeUndefined()
    expect(res.path.startsWith(join(first.profileDir, 'imported-media'))).toBe(true)
    expect(existsSync(res.path)).toBe(true)
    expect(await outputCanLoad(out, res.path)).toBe(true)

    const svc = await sampleService(op)
    await wfCall(op, 'serviceAddItem', svc.id, { type: 'image', payload: { path: res.path }, track: 'main' })
    // What 0.20.2 stored: the outside path itself (and one whose file is gone).
    const legacyId = await wfCall<number>(op, 'serviceAddItem', svc.id, { type: 'image', payload: { path: legacy }, track: 'main' })
    const goneId = await wfCall<number>(op, 'serviceAddItem', svc.id, { type: 'image', payload: { path: join(outside, 'deleted.png') }, track: 'main' })
    await wfCall(op, 'setActiveService', svc.id)
    await first.app.close()

    const again = await launchApp({ root })
    try {
      const op2 = await operatorWindow(again.app)
      await op2.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
      const out2 = await outputWindow(again.app)
      await expect.poll(async () => {
        const s = await sampleService(op2)
        return s.items.find((i: any) => i.id === legacyId)?.payload?.path ?? ''
      }, { timeout: 15_000 }).toContain(join(again.profileDir, 'imported-media'))
      const s2 = await sampleService(op2)
      const migrated = s2.items.find((i: any) => i.id === legacyId)
      expect(migrated.mediaProblem ?? null).toBeNull()
      expect(await outputCanLoad(out2, migrated.payload.path)).toBe(true)
      expect(s2.items.find((i: any) => i.id === goneId).mediaProblem).toBe('missing')

      // Picked image goes live and the projector shows it (not blank).
      await goToLiveControl(op2)
      const imageItem = s2.items.find((i: any) => i.type === 'image' && i.payload?.path === res.path)
      await op2.getByRole('button', { name: `Go live: ${imageItem.title}`, exact: true }).first().click()
      await expect.poll(async () => (await liveState(op2)).liveServiceItemId, { timeout: 10_000 }).toBe(imageItem.id)
      await expect.poll(() => out2.evaluate(() => document.body.innerHTML.includes('imported-media')), { timeout: 10_000 }).toBe(true)
    } finally { await again.app.close() }
  } finally {
    await closeApp(first.app, root)
    rmSync(outside, { recursive: true, force: true })
  }
})

test('A2-N1: after a crash (SIGKILL) mid-service, relaunching puts the live item back on the projector', async () => {
  const first = await launchApp()
  const root = first.userDataDir
  try {
    const op = await operatorWindow(first.app)
    await completeFirstRun(op, { sample: true })
    await goToLiveControl(op)
    await goLive(op, 'Amazing Grace')
    const liveId = (await liveState(op)).liveServiceItemId
    expect(liveId).not.toBeNull()
    await op.waitForTimeout(1500) // let the recovery snapshot land
    first.app.process().kill('SIGKILL')
    await new Promise((r) => setTimeout(r, 1000))

    const again = await launchApp({ root })
    try {
      const op2 = await operatorWindow(again.app)
      const out2 = await outputWindow(again.app)
      await expect.poll(async () => (await liveState(op2)).liveServiceItemId ?? null, { timeout: 20_000 }).toBe(liveId)
      await expect.poll(() => visibleText(out2), { timeout: 10_000 }).toMatch(/Amazing grace|sweet the sound/i)
    } finally { await again.app.close() }
  } finally { await closeApp(first.app, root) }
})

test('A2-N2: Black pressed while a slow online verse is loading stays black when the verse arrives', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    await wfCall(op, 'featuresSetBibleTranslation', 'web')
    // A slow bible-api.com (2.5 s) — main's global fetch, stubbed.
    await app.evaluate(() => {
      const g = globalThis as any
      const real = g.fetch
      g.fetch = async (url: unknown, init: unknown) => {
        if (!String(url).includes('bible-api.com')) return real(url, init)
        await new Promise((r) => setTimeout(r, 2500))
        return new Response(JSON.stringify({ reference: 'John 3:16-17', verses: [{ verse: 16, text: 'For God so loved the world (WEB stub)' }, { verse: 17, text: 'Second verse (WEB stub)' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
    })
    await goToLiveControl(op)
    const svc = await sampleService(op)
    const scripture = svc.items.find((i: any) => i.type === 'scripture')
    await op.getByRole('button', { name: `Go live: ${scripture.title}`, exact: true }).first().click()
    await op.waitForTimeout(300)
    await op.evaluate(() => (window as any).wf.sendIntent('main', 'black'))
    expect((await liveState(op)).mode).toBe('black')
    await expect.poll(async () => (await liveState(op)).liveServiceItemId, { timeout: 10_000 }).toBe(scripture.id)
    await op.waitForTimeout(500)
    expect((await liveState(op)).mode).toBe('black')
    const out = await outputWindow(app)
    expect(await visibleText(out)).not.toMatch(/WEB stub/)

    // Same for Logo.
    await op.evaluate(() => (window as any).wf.sendIntent('main', 'lyrics'))
    const amazing = svc.items.find((i: any) => i.title === 'Amazing Grace')
    await op.getByRole('button', { name: `Go live: ${amazing.title}`, exact: true }).first().click()
    await expect.poll(async () => (await liveState(op)).liveServiceItemId).toBe(amazing.id)
    await op.getByRole('button', { name: `Go live: ${scripture.title}`, exact: true }).first().click()
    await op.waitForTimeout(300)
    await op.evaluate(() => (window as any).wf.sendIntent('main', 'logo'))
    await expect.poll(async () => (await liveState(op)).liveServiceItemId, { timeout: 10_000 }).toBe(scripture.id)
    await op.waitForTimeout(500)
    expect((await liveState(op)).mode).toBe('logo')
  } finally { await closeApp(app, userDataDir) }
})

test('B2-N2: an announcement survives a USB .wfservice round trip to another computer', async () => {
  const a = await launchApp()
  const b = await launchApp()
  try {
    const op = await operatorWindow(a.app)
    await completeFirstRun(op, { sample: true })
    const svc = await sampleService(op)
    const annId = await wfCall<number>(op, 'announcementCreate', { title: 'Potluck Sunday', body: 'Bring a dish to share after service', display: 'slide', frequency: 'once', active: true })
    await wfCall(op, 'serviceAddItem', svc.id, { type: 'announcement', ref_id: annId, track: 'main' })
    const usb = join(a.userDataDir, 'usb.wfservice')
    await a.app.evaluate(({ dialog }, p) => { (dialog as any).showSaveDialog = async () => ({ canceled: false, filePath: p }) }, usb)
    const exp = await wfCall<any>(op, 'serviceExport', svc.id)
    expect(exp.filePath).toBe(usb)

    // The other PC has never seen this announcement.
    const opB = await operatorWindow(b.app)
    await completeFirstRun(opB)
    await b.app.evaluate(({ dialog }, p) => {
      ;(dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [p] })
      ;(dialog as any).showMessageBox = async () => ({ response: 0 })
    }, usb)
    const res = await wfCall<any>(opB, 'serviceImportFile')
    expect(res.error).toBeUndefined()
    expect(res.summary).toMatch(/announcement/i)
    const imported = await wfCall<any>(opB, 'serviceGet', res.serviceId)
    const item = imported.items.find((i: any) => i.type === 'announcement')
    expect(item).toBeTruthy()
    const ann = await wfCall<any>(opB, 'announcementGet', item.ref_id)
    expect(ann.title).toBe('Potluck Sunday')
    expect(ann.body).toBe('Bring a dish to share after service')
  } finally {
    await closeApp(a.app, a.userDataDir)
    await closeApp(b.app, b.userDataDir)
  }
})

test('B2-N3: Space with nothing live starts the service on its first item that can go live; B2-N11: C on a countdown is ignored', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    await goToLiveControl(op)
    const svc = await sampleService(op)
    expect((await liveState(op)).liveServiceItemId ?? null).toBeNull()
    const firstLive = svc.items.find((i: any) => i.track === 'main' && i.type !== 'header' && i.type !== 'placeholder')
    await pressKey(app, op, 'Space')
    await expect.poll(async () => (await liveState(op)).liveServiceItemId ?? null, { timeout: 10_000 }).toBe(firstLive.id)
    expect(firstLive.type).toBe('countdown')
    expect((await liveState(op)).mode).toBe('countdown')

    await pressKey(app, op, 'c')
    const s = await liveState(op)
    expect(s.textHidden).toBe(false)
    expect(s.mode).toBe('countdown')
    // …and it doesn't carry over to hide the next song's lyrics.
    await goLive(op, 'Amazing Grace')
    expect((await liveState(op)).textHidden).toBe(false)
  } finally { await closeApp(app, userDataDir) }
})

async function setOperatorSize(app: any, w: number, h: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }: any, sz: { w: number; h: number }) => {
    const win = BrowserWindow.getAllWindows().find((x: any) => !/#\/(output|stage)/.test(x.webContents.getURL()))!
    win.unmaximize(); win.setSize(sz.w, sz.h)
  }, { w, h })
}

test('B2-N10: Safety Reset never covers the Live tools cards; B2-N4: Build keeps the flow list and the whole Add content panel usable at 1600x760', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: true })
    const svc = await sampleService(op)
    await wfCall(op, 'announcementCreate', { title: 'Potluck Sunday', body: 'Bring a dish', display: 'slide', frequency: 'recurring', active: true })
    await wfCall(op, 'setActiveService', svc.id)

    await setOperatorSize(app, 1280, 649)
    await goToLiveControl(op)
    const reset = op.getByRole('button', { name: 'Safety Reset' })
    await expect(reset).toBeInViewport()
    const geo = await op.evaluate(() => {
      const scroll = document.querySelector('.wf-live-tools-scroll') as HTMLElement
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Safety Reset'))!
      return { inScroll: scroll.contains(btn), scrollBottom: scroll.getBoundingClientRect().bottom, btnTop: btn.getBoundingClientRect().top }
    })
    expect(geo.inScroll).toBe(false)
    expect(geo.scrollBottom).toBeLessThanOrEqual(geo.btnTop) // nothing scrolls underneath it

    await setOperatorSize(app, 1600, 760)
    await op.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Build service' }).click()
    await expect(op.getByTestId('scheduled-announcements')).toBeVisible()
    await op.locator('.wf-service-item-list').getByText('Amazing Grace').first().click()
    await op.getByRole('button', { name: 'Add item' }).click()
    const panel = op.getByTestId('add-content-panel')
    await expect(panel).toBeVisible()
    await op.waitForTimeout(300)
    const listH = await op.locator('.wf-service-item-list').evaluate((el) => el.getBoundingClientRect().height)
    expect(listH).toBeGreaterThanOrEqual(150) // QA saw 0 px
    const ph = panel.getByRole('button', { name: /Placeholder/ })
    await ph.scrollIntoViewIfNeeded()
    await expect(ph).toBeInViewport()
    // The scheduled banner folds to one line.
    await op.getByRole('button', { name: 'Hide scheduled announcements' }).click()
    await expect(op.getByRole('button', { name: 'Show scheduled announcements' })).toBeVisible()
    await expect(op.getByTestId('scheduled-announcements').getByText('Potluck Sunday')).toHaveCount(0)
  } finally { await closeApp(app, userDataDir) }
})

test('B2-N5: "Import songs & CCLI" stays open after the first song lands in an empty library', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op)
    const nav = op.getByRole('navigation', { name: 'Main' })
    const openLibrary = async (): Promise<void> => {
      await nav.getByRole('button', { name: 'Media/Library' }).click()
      await op.getByRole('menuitem', { name: 'Songs' }).click()
    }
    await openLibrary()
    const toggle = op.getByRole('button', { name: /Import songs & CCLI/ })
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await wfCall(op, 'songCreate', { title: 'First Pasted Song', sections: [{ kind: 'verse', label: 'Verse 1', ordinal: 0, lyrics: 'line one' }] })
    // Leave and come back (remount) — the library now has a song.
    await nav.getByRole('button', { name: 'Home' }).click()
    await openLibrary()
    await expect(op.getByText('First Pasted Song').first()).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  } finally { await closeApp(app, userDataDir) }
})
