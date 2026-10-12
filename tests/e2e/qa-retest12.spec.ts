import { test, expect, type Page, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, copyFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, closeApp, operatorWindow, outputWindow, completeFirstRun, visibleText } from './electronApp'
import { liveState, goToLiveControl, tarEntries, stubSave, stubOpen, saveFromBuild } from './qaHelpers'

// Church Tech retest 12 (on 986f8a2), one test per finding that runs in the app:
//  B12-N4 Black over a countdown keeps the timer; un-Black / Prev / Next show it live again
//  B12-N5 Reload projector keeps a playing video's position (and play/pause)
//  B12-N2 .wfbundle vs .wfservice (file contents)
//  B12-N6 the real reason for each file not carried (the toast the operator sees)
//  B12-N1 + watch item: content dedupe (a changed picture opens as itself), clean titles

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
    // Any <video> on OUT playing the clip — no build-specific hooks, so this
    // fails on 986f for what it did (restart at 0), not for a missing attribute.
    const video = (): Promise<{ t: number; paused: boolean; ready: number } | null> => out.evaluate(() => {
      const vids = Array.from(document.querySelectorAll('video')).filter((v) => /loop-20s/.test(v.currentSrc || v.src))
      const v = vids.find((x) => !x.paused) ?? vids.sort((x, y) => y.currentTime - x.currentTime)[0]
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
    await out.evaluate(() => { for (const v of Array.from(document.querySelectorAll('video'))) if (/loop-20s/.test(v.currentSrc || v.src)) v.pause() })
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
const UNC = '\\\\booth-pc\\media\\walk-in.mp4'

// These checks look only at what the operator gets — the files on disk, the
// bytes on screen, the toast — never at result fields or DOM hooks that only
// newer builds have, so on 986f they fail for what 986f did (Church Tech R2).

async function usbService(app: ElectronApplication, op: Page, media: string): Promise<{ svcId: number; cross: string; loop: string; fake: string }> {
  const cross = join(media, 'cross.png'); writeFileSync(cross, PNG)
  const loop = join(media, 'loop.mp4'); writeFileSync(loop, MP4)
  const fake = join(media, 'fake.png'); writeFileSync(fake, 'just text, not a picture')
  const svcId: number = await op.evaluate(async ({ cross, loop, fake, unc }) => {
    const wf = (window as any).wf
    const id = await wf.serviceCreate('USB Sunday', '2026-10-11')
    await wf.serviceAddItem(id, { type: 'image', payload: { path: cross } })
    await wf.serviceAddItem(id, { type: 'image', payload: { path: cross } }) // twice: carried once
    await wf.serviceAddItem(id, { type: 'text', payload: { title: 'Welcome', body: 'Welcome home', background: loop } })
    await wf.serviceAddItem(id, { type: 'image', payload: { path: fake } })
    await wf.serviceAddItem(id, { type: 'image', payload: { path: unc } })
    return id
  }, { cross, loop, fake, unc: UNC })
  return { svcId, cross, loop, fake }
}

test('B12-N2: .wfbundle is a tar carrying each real picture/video once; .wfservice is plain JSON an older WorshipFlow opens', async () => {
  test.setTimeout(120_000)
  const { app, userDataDir } = await launchApp()
  const media = mkdtempSync(join(tmpdir(), 'wf-b12n2-'))
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: false })
    const { svcId } = await usbService(app, op, media)
    const bundle = join(media, 'USB Sunday.wfbundle')
    await stubSave(app, bundle)
    expect((await op.evaluate((id) => (window as any).wf.serviceExport(id), svcId)).error).toBeUndefined()
    const entries = tarEntries(bundle)
    expect(entries[0].name).toBe('service.json')
    const carried = entries.slice(1)
    expect(carried.map((e) => e.size).sort((x, y) => x - y)).toEqual([PNG.length, MP4.length]) // cross once, the loop; not the fake, not the share
    expect(carried.map((e) => e.name.split('/').pop()!.replace(/^\d+-/, '')).sort()).toEqual(['cross.png', 'loop.mp4'])

    const plain = join(media, 'USB Sunday.wfservice')
    await stubSave(app, plain)
    expect((await op.evaluate((id) => (window as any).wf.serviceExport(id), svcId)).error).toBeUndefined()
    const text = readFileSync(plain, 'utf8')
    expect(text.startsWith('{'), '.wfservice must be JSON, not a tar').toBe(true)
    const json = JSON.parse(text)
    expect(json.version).toBe(2)
    expect(json.media).toBeUndefined()
    expect(json.items).toHaveLength(5)
  } finally {
    rmSync(media, { recursive: true, force: true })
    await closeApp(app, userDataDir)
  }
})

test('B12-N6: the save and open messages name the real reason for each file not carried, each once', async () => {
  test.setTimeout(120_000)
  const { app, userDataDir } = await launchApp()
  const media = mkdtempSync(join(tmpdir(), 'wf-b12n6-'))
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: false })
    const { svcId, cross, loop, fake } = await usbService(app, op, media)
    const bundle = join(media, 'USB Sunday.wfbundle')
    await stubSave(app, bundle)
    const said = await saveFromBuild(op, svcId)
    expect(said).toMatch(/Saved USB Sunday\.wfbundle with 2 picture\/video files/)
    expect(said).toMatch(/walk-in\.mp4 \(on a network share/)
    expect(said).toMatch(/fake\.png \(not a real picture or video\)/)
    expect(said).not.toMatch(/not found|weren’t found|wasn’t found/)

    // "another PC": originals gone; open the file
    rmSync(cross); rmSync(loop); rmSync(fake)
    await stubOpen(app, bundle)
    const res = await op.evaluate(() => (window as any).wf.serviceImportFile())
    expect(res.error).toBeUndefined()
    expect(res.summary.match(/fake\.png/g)).toHaveLength(1)
    expect(res.summary.match(/walk-in\.mp4/g)).toHaveLength(1)
    expect(res.summary).toMatch(/Skipped 1 file on a network share/)
  } finally {
    rmSync(media, { recursive: true, force: true })
    await closeApp(app, userDataDir)
  }
})

test('B12-N1 + watch item: a picture changed between two saves (same name, same size) opens as itself; re-opening reuses copies; titles stay clean', async () => {
  test.setTimeout(120_000)
  const { app, userDataDir } = await launchApp()
  const media = mkdtempSync(join(tmpdir(), 'wf-b12n1-'))
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: false })
    const RED = Buffer.concat([PNG, Buffer.from('RED-RED-')])
    const BLUE = Buffer.concat([PNG, Buffer.from('BLUEBLUE')]) // same size, different picture
    const pic = join(media, 'swap.png'); writeFileSync(pic, RED)
    const svcId: number = await op.evaluate(async (p) => {
      const wf = (window as any).wf
      const id = await wf.serviceCreate('Swap Sunday', '2026-10-11')
      await wf.serviceAddItem(id, { type: 'image', payload: { path: p } })
      await wf.serviceAddItem(id, { type: 'image', payload: { path: p } })
      return id
    }, pic)
    const red = join(media, 'red.wfbundle'); await stubSave(app, red)
    expect((await op.evaluate((id) => (window as any).wf.serviceExport(id), svcId)).error).toBeUndefined()
    writeFileSync(pic, BLUE) // the picture was replaced in place before the next Sunday
    const blue = join(media, 'blue.wfbundle'); await stubSave(app, blue)
    expect((await op.evaluate((id) => (window as any).wf.serviceExport(id), svcId)).error).toBeUndefined()

    // "another PC": open both
    rmSync(pic)
    const imported = join(userDataDir, 'userData', 'imported-media')
    const open = async (p: string): Promise<any[]> => {
      await stubOpen(app, p)
      const res = await op.evaluate(() => (window as any).wf.serviceImportFile())
      expect(res.error, p).toBeUndefined()
      return op.evaluate(async (id) => (await (window as any).wf.serviceGet(id)).items, res.serviceId)
    }
    const redItems = await open(red)
    const blueItems = await open(blue)
    for (const it of redItems) expect(readFileSync(it.payload.path).equals(RED), 'red service shows red').toBe(true)
    for (const it of blueItems) expect(readFileSync(it.payload.path).equals(BLUE), 'blue service shows BLUE, not the older red copy').toBe(true)
    expect(blueItems[0].payload.path).toBe(blueItems[1].payload.path) // one copy for both rows
    // the watch item: titles are the original name; only the stored file is hashed
    expect([...redItems, ...blueItems].map((i) => i.title)).toEqual(['swap.png', 'swap.png', 'swap.png', 'swap.png'])
    for (const it of blueItems) expect(it.payload.path.startsWith(imported)).toBe(true)
    const files = readdirSync(imported).filter((f) => !f.includes('.part-')).sort()
    expect(files).toHaveLength(2)

    // opening the same files again (one renamed .wfservice, as 986f wrote them) copies nothing new
    const old = join(media, 'from-986f.wfservice'); copyFileSync(blue, old)
    const again = await open(old)
    for (const it of again) expect(readFileSync(it.payload.path).equals(BLUE)).toBe(true)
    await open(red)
    expect(readdirSync(imported).filter((f) => !f.includes('.part-')).sort()).toEqual(files)
    expect(existsSync(red)).toBe(true)
  } finally {
    rmSync(media, { recursive: true, force: true })
    await closeApp(app, userDataDir)
  }
})
