import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, copyFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, closeApp, operatorWindow, outputWindow, completeFirstRun, visibleText } from './electronApp'
import { liveState, goToLiveControl } from './qaHelpers'

// Church Tech retest 12 (on 986f8a2), one test per finding that runs in the app:
//  B12-N4 Black over a countdown keeps the timer; un-Black / Prev / Next show it live again
//  B12-N5 Reload projector keeps a playing video's position (and play/pause)
//  B12-N1/N2/N6 + watch item: .wfbundle vs .wfservice, content dedupe, real reasons, clean titles

const secondsOf = (line: string): number => { const [m, s] = String(line).split(':').map((n) => parseInt(n, 10)); return m * 60 + s }
const zoneModes = async (op: Page): Promise<string> =>
  Object.values(await op.evaluate(() => (window as any).wf.zoneGetStates()) as Record<string, any>).slice(0, 3).map((z) => z.mode).join(',')

test('B12-N4: Black over a countdown keeps it running; Live, Prev and Next bring the live countdown back', async () => {
  test.setTimeout(120_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    const out = await outputWindow(app)
    await completeFirstRun(op, { sample: true })
    const [, countdown]: number[] = await op.evaluate(async () => {
      const wf = (window as any).wf
      const sid = await wf.serviceCreate('Black countdown', '2026-10-11')
      await wf.setActiveService(sid)
      const ids = [
        await wf.serviceAddItem(sid, { type: 'text', payload: { title: 'Before', body: 'Before the countdown' } }),
        await wf.serviceAddItem(sid, { type: 'countdown', payload: { seconds: 300 } }),
        await wf.serviceAddItem(sid, { type: 'text', payload: { title: 'After', body: 'After the countdown' } })
      ]
      await wf.serviceRefreshActiveItems(sid)
      return ids
    })
    await op.reload()
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    await goToLiveControl(op)
    await op.evaluate((id) => (window as any).wf.liveGoLiveAt('main', id, 0), countdown)
    await expect.poll(async () => (await liveState(op)).mode, { timeout: 10_000 }).toBe('countdown')

    for (const way of ['lyrics', 'prev', 'next'] as const) {
      const before = secondsOf((await liveState(op)).line)
      await op.evaluate(() => (window as any).wf.sendIntent('main', 'black'))
      await expect.poll(async () => (await liveState(op)).mode).toBe('black')
      await op.waitForTimeout(2600)
      await op.evaluate((w) => (window as any).wf.sendIntent('main', w), way)
      const back = await liveState(op)
      expect(back.mode, `out of Black by ${way}`).toBe('countdown')
      expect(back.liveServiceItemId, `${way} stays on the countdown`).toBe(countdown)
      // it kept counting while hidden
      expect(secondsOf(back.line), `${way}: timer ran during Black`).toBeLessThanOrEqual(before - 2)
      // and is live, not frozen: OUT shows the countdown with its label and it keeps going down
      await expect.poll(() => visibleText(out), { timeout: 5000 }).toMatch(/Service begins in/i)
      await expect.poll(async () => zoneModes(op), { timeout: 5000 }).toBe('countdown,countdown,countdown')
      const t0 = secondsOf((await liveState(op)).line)
      await expect.poll(async () => secondsOf((await liveState(op)).line), { timeout: 4000 }).toBeLessThan(t0)
      expect((await liveState(op)).mode).toBe('countdown')
    }
  } finally { await closeApp(app, userDataDir) }
})

test('B12-N5: Reload projector — a playing video carries on from where it was, a paused one stays paused', async () => {
  test.setTimeout(120_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    const out = await outputWindow(app)
    await completeFirstRun(op, { sample: true })
    const mediaDir = join(userDataDir, 'userData', 'imported-media'); mkdirSync(mediaDir, { recursive: true })
    const clip = join(mediaDir, 'loop-20s.webm'); copyFileSync(join(__dirname, 'fixtures', 'loop-20s.webm'), clip)
    const item: number = await op.evaluate(async (p) => {
      const wf = (window as any).wf
      const sid = await wf.serviceCreate('Video reload', '2026-10-11')
      await wf.setActiveService(sid)
      const id = await wf.serviceAddItem(sid, { type: 'image', payload: { path: p } })
      await wf.serviceRefreshActiveItems(sid)
      return id
    }, clip)
    await op.reload()
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    await goToLiveControl(op)
    await op.evaluate((id) => (window as any).wf.liveGoLiveAt('main', id, 0), item)
    const video = (): Promise<{ t: number; paused: boolean; ready: number } | null> => out.evaluate(() => {
      const v = document.querySelector('video[data-wf-bg]') as HTMLVideoElement | null
      return v ? { t: v.currentTime, paused: v.paused, ready: v.readyState } : null
    }).catch(() => null)
    await expect.poll(async () => (await video())?.t ?? 0, { timeout: 20_000 }).toBeGreaterThan(4)
    const before = (await video())!
    expect(before.paused).toBe(false)
    await out.evaluate(() => { (window as any).__beforeReload = true })
    await op.getByRole('button', { name: /Outputs & looks/ }).first().press('Enter')
    await op.getByRole('button', { name: /Reload projector/ }).press('Enter')
    await expect.poll(() => out.evaluate(() => (window as any).__beforeReload ?? false).catch(() => true), { timeout: 10_000 }).toBe(false)
    // as soon as the reloaded video has its metadata it is at (or past) where it was, still playing — not back at 0
    await expect.poll(async () => (await video())?.ready ?? 0, { timeout: 10_000 }).toBeGreaterThan(0)
    const after = (await video())!
    expect(after.t, `was ${before.t.toFixed(2)} before the reload`).toBeGreaterThanOrEqual(before.t - 0.25)
    expect(after.paused).toBe(false)

    // paused stays paused, at the same spot
    await out.evaluate(() => (document.querySelector('video[data-wf-bg]') as HTMLVideoElement).pause())
    const held = (await video())!
    await out.evaluate(() => { (window as any).__beforeReload = true })
    await op.getByRole('button', { name: /Reload projector/ }).press('Enter')
    await expect.poll(() => out.evaluate(() => (window as any).__beforeReload ?? false).catch(() => true), { timeout: 10_000 }).toBe(false)
    await expect.poll(async () => { const v = await video(); return v && v.ready > 0 && v.paused ? Math.round(v.t * 10) : -1 }, { timeout: 10_000 }).toBe(Math.round(held.t * 10))
    await op.waitForTimeout(800)
    expect((await video())!.paused).toBe(true)
  } finally { await closeApp(app, userDataDir) }
})

// Minimal real media the content sniffer accepts.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082', 'hex')
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(4096, 1)])

test('B12-N1/N2/N6 + watch item: .wfbundle carries media, .wfservice is plain JSON; real reasons; re-import reuses copies; titles stay clean', async () => {
  test.setTimeout(120_000)
  const { app, userDataDir } = await launchApp()
  const media = mkdtempSync(join(tmpdir(), 'wf-b12-'))
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: false })
    const cross = join(media, 'cross.png'); writeFileSync(cross, PNG)
    const loop = join(media, 'loop.mp4'); writeFileSync(loop, MP4)
    const fake = join(media, 'fake.png'); writeFileSync(fake, 'just text, not a picture')
    const unc = '\\\\booth-pc\\media\\walk-in.mp4'
    const svcId: number = await op.evaluate(async ({ cross, loop, fake, unc }) => {
      const wf = (window as any).wf
      const id = await wf.serviceCreate('USB Sunday', '2026-10-11')
      await wf.serviceAddItem(id, { type: 'image', payload: { path: cross } })
      await wf.serviceAddItem(id, { type: 'image', payload: { path: cross } }) // twice: carried once
      await wf.serviceAddItem(id, { type: 'text', payload: { title: 'Welcome', body: 'Welcome home', background: loop } })
      await wf.serviceAddItem(id, { type: 'image', payload: { path: fake } })
      await wf.serviceAddItem(id, { type: 'image', payload: { path: unc } })
      return id
    }, { cross, loop, fake, unc })
    const saveAs = (p: string): Promise<void> => app.evaluate(({ dialog }, p) => { (dialog as any).showSaveDialog = async () => ({ canceled: false, filePath: p }) }, p)

    // .wfbundle: a tar with the two real files; the others named with their real reason
    const bundle = join(media, 'USB Sunday.wfbundle')
    await saveAs(bundle)
    const exp = await op.evaluate((id) => (window as any).wf.serviceExport(id), svcId)
    expect(exp.error).toBeUndefined()
    expect(readFileSync(bundle).toString('latin1', 257, 262)).toBe('ustar')
    expect(exp.summary).toMatch(/^Saved USB Sunday\.wfbundle with 2 picture\/video files \(opens in WorshipFlow 0\.20\.3 or newer\)\./)
    expect(exp.summary).toMatch(/walk-in\.mp4 \(on a network share/)
    expect(exp.summary).toMatch(/fake\.png \(not a real picture or video\)/)
    expect(exp.summary).not.toMatch(/not found/)
    expect(exp.warn).toBe(true)

    // .wfservice: always plain JSON (older builds open it), says the media isn't in it
    const plain = join(media, 'USB Sunday.wfservice')
    await saveAs(plain)
    const exp2 = await op.evaluate((id) => (window as any).wf.serviceExport(id), svcId)
    const json = JSON.parse(readFileSync(plain, 'utf8'))
    expect(json.version).toBe(2)
    expect(json.media).toBeUndefined()
    expect(exp2.summary).toMatch(/doesn’t include the \d+ picture\/video files the service uses — save as \.wfbundle/)

    // "another PC": originals gone; import the bundle
    rmSync(cross); rmSync(loop); rmSync(fake)
    const imported = join(userDataDir, 'userData', 'imported-media')
    const openFile = (p: string): Promise<void> => app.evaluate(({ dialog }, p) => { (dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [p] }) }, p)
    await openFile(bundle)
    const res = await op.evaluate(() => (window as any).wf.serviceImportFile())
    expect(res.error).toBeUndefined()
    expect(res.summary.match(/fake\.png/g)).toHaveLength(1) // listed once (not on this PC, not in the file)
    expect(res.summary.match(/walk-in\.mp4/g)).toHaveLength(1)
    expect(res.summary).toMatch(/Skipped 1 file on a network share/)
    const items: any[] = await op.evaluate(async (id) => (await (window as any).wf.serviceGet(id)).items, res.serviceId)
    const images = items.filter((i) => i.type === 'image' && String(i.payload.path).startsWith(imported))
    expect(images).toHaveLength(2)
    expect(images[0].payload.path).toBe(images[1].payload.path) // one copy for both rows
    // the watch item: the title is the original name; only the stored file is hashed
    expect(images.map((i) => i.title)).toEqual(['cross.png', 'cross.png'])
    expect(images[0].payload.path).toMatch(/cross-[0-9a-f]{16}\.png$/)
    const files = readdirSync(imported).filter((f) => !f.includes('.part-')).sort()
    expect(files).toHaveLength(2)

    // re-import (a 986f-style tar named .wfservice): same bytes → same copies, nothing new
    const old = join(media, 'from-986f.wfservice'); copyFileSync(bundle, old)
    await openFile(old)
    const again = await op.evaluate(() => (window as any).wf.serviceImportFile())
    expect(again.error).toBeUndefined()
    expect(readdirSync(imported).filter((f) => !f.includes('.part-')).sort()).toEqual(files)
    const items2: any[] = await op.evaluate(async (id) => (await (window as any).wf.serviceGet(id)).items, again.serviceId)
    expect(items2.filter((i) => i.type === 'image' && String(i.payload.path).startsWith(imported)).map((i) => i.title)).toEqual(['cross.png', 'cross.png'])

    // the plain .wfservice imports too (older-style JSON)
    await openFile(plain)
    const res3 = await op.evaluate(() => (window as any).wf.serviceImportFile())
    expect(res3.error).toBeUndefined()
    expect(existsSync(plain)).toBe(true)
  } finally {
    rmSync(media, { recursive: true, force: true })
    await closeApp(app, userDataDir)
  }
})
