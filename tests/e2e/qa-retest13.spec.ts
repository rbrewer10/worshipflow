import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, mkdirSync, openSync, writeSync, ftruncateSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, closeApp, operatorWindow, completeFirstRun } from './electronApp'
import { liveState, goToLiveControl } from './qaHelpers'

// Church Tech retest 13 (on 5bd7654), one test per finding that runs in the app:
//  B13-N1 a big damaged .wfbundle is refused (not read whole, no crash); anything over 64 MB is refused
//  B13-N2 a service file double-clicked while WorshipFlow is CLOSED (path in argv) is imported, once
//  B13-N4 a countdown running out under Logo stays on the Logo
//  B13-N5 zones don't freeze "0:00" once the countdown ran out under Black
//  B13-N6 a picture this PC already had says "already in this computer's library", not "copied"
//  B13-N7 two different pictures with the same name get distinct labels
//  B13-N8 .WFBUNDLE partials are swept whatever the case
// (B13-N3, the setlist role<TAB>song rescue, is covered by src/shared/setlistProbe12.test.ts.)

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082', 'hex')
const PNG_B = Buffer.concat([PNG, Buffer.from('second picture')]) // a different picture (trailing bytes after IEND)

const saveAs = (app: ElectronApplication, p: string): Promise<void> => app.evaluate(({ dialog }, p) => { (dialog as any).showSaveDialog = async () => ({ canceled: false, filePath: p }) }, p)
const openFile = (app: ElectronApplication, p: string): Promise<void> => app.evaluate(({ dialog }, p) => { (dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [p] }) }, p)
const zoneModes = async (op: Page): Promise<string[]> =>
  Object.values(await op.evaluate(() => (window as any).wf.zoneGetStates()) as Record<string, any>).slice(0, 3).map((z) => z.mode)

/** A sparse file of `bytes` whose first 512 bytes are `head`. */
function sparse(path: string, head: Buffer, bytes: number): void {
  const fd = openSync(path, 'w')
  try { writeSync(fd, head, 0, head.length, 0); ftruncateSync(fd, bytes) } finally { closeSync(fd) }
}

test('B13-N2: a service file double-clicked while WorshipFlow is closed (path in argv) is imported once', async () => {
  test.setTimeout(150_000)
  const media = mkdtempSync(join(tmpdir(), 'wf-b13n2-'))
  const file = join(media, 'Cold Start Sunday.wfservice')
  // Set up this PC and save a service to a file, then quit.
  const first = await launchApp()
  let root = first.userDataDir
  try {
    const op = await operatorWindow(first.app)
    await completeFirstRun(op, { sample: false })
    const id: number = await op.evaluate(async () => {
      const wf = (window as any).wf
      const sid = await wf.serviceCreate('Cold Start Sunday', '2026-10-11')
      await wf.serviceAddItem(sid, { type: 'text', payload: { title: 'Welcome', body: 'Welcome home' } })
      return sid
    })
    await saveAs(first.app, file)
    expect((await op.evaluate((sid) => (window as any).wf.serviceExport(sid), id)).error).toBeUndefined()
    await op.evaluate((sid) => (window as any).wf.serviceDelete(sid), id)
    expect(JSON.parse(readFileSync(file, 'utf8')).name).toBe('Cold Start Sunday')
  } finally { await first.app.close().catch(() => undefined) }

  // Explorer starts WorshipFlow with the file's path on the command line.
  const { app, userDataDir } = await launchApp({ root, args: [file] })
  root = userDataDir
  try {
    const op = await operatorWindow(app)
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    const named = async (): Promise<number> => ((await op.evaluate(() => (window as any).wf.servicesList())) as any[]).filter((s) => s.name === 'Cold Start Sunday').length
    await expect.poll(named, { timeout: 15_000, message: 'the double-clicked file was never imported' }).toBe(1)
    // the operator is told, and the new service is open
    await expect(op.getByText(/Imported “Cold Start Sunday”/).first()).toBeVisible({ timeout: 10_000 })
    // once only: a reload of the operator window (the listener comes back) doesn't import it again
    await op.reload()
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    await op.waitForTimeout(2500)
    expect(await named()).toBe(1)
  } finally {
    rmSync(media, { recursive: true, force: true })
    await closeApp(app, root)
  }
})

test('B13-N1: a big .wfbundle with a damaged first header is refused as damaged without being read; any file over 64 MB is refused; the app keeps running', async () => {
  test.setTimeout(120_000)
  const { app, userDataDir } = await launchApp()
  const media = mkdtempSync(join(tmpdir(), 'wf-b13n1-'))
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: false })
    const before = ((await op.evaluate(() => (window as any).wf.servicesList())) as any[]).length
    const head = Buffer.alloc(512)
    head.write('service.json', 0, 'latin1'); head.write('ustar\u000000', 257, 'latin1'); head.write('9999999\u0000', 148, 'latin1') // wrong checksum
    const big = 80 * 1024 * 1024 // over the 64 MB cap; 5bd7 read it whole
    const cases: Array<[string, Buffer, RegExp]> = [
      ['Damaged.wfbundle', head, /damaged \(bad header\)/],
      ['Damaged-no-magic.wfbundle', Buffer.alloc(512, 0x41), /damaged \(bad header\)/],
      ['Damaged-renamed.wfservice', head, /damaged \(bad header\)/],
      ['video-renamed.wfservice', Buffer.alloc(512, 0x41), /isn't a WorshipFlow service file \(\d+ MB, far bigger than any service/]
    ]
    for (const [name, h, want] of cases) {
      const p = join(media, name); sparse(p, h, big)
      await openFile(app, p)
      const t0 = Date.now()
      const res = await op.evaluate(() => (window as any).wf.serviceImportFile())
      expect(res.error, name).toMatch(want)
      expect(Date.now() - t0, `${name}: refused quickly, not read whole`).toBeLessThan(5000)
    }
    // still alive, nothing created
    expect(((await op.evaluate(() => (window as any).wf.servicesList())) as any[]).length).toBe(before)
  } finally {
    rmSync(media, { recursive: true, force: true })
    await closeApp(app, userDataDir)
  }
})

async function countdownService(op: Page, seconds: number): Promise<number> {
  const id: number = await op.evaluate(async (s) => {
    const wf = (window as any).wf
    const sid = await wf.serviceCreate('Countdown runs out', '2026-10-11')
    await wf.setActiveService(sid)
    const cd = await wf.serviceAddItem(sid, { type: 'countdown', payload: { seconds: s } })
    await wf.serviceAddItem(sid, { type: 'text', payload: { title: 'After', body: 'After the countdown' } })
    await wf.serviceRefreshActiveItems(sid)
    return cd
  }, seconds)
  await op.reload()
  await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
  await goToLiveControl(op)
  await op.evaluate((cd) => (window as any).wf.liveGoLiveAt('main', cd, 0), id)
  await expect.poll(async () => (await liveState(op)).mode, { timeout: 10_000 }).toBe('countdown')
  return id
}

test('B13-N4/N5: a countdown that runs out under Logo stays on the Logo; under Black the zones show no frozen 0:00', async () => {
  test.setTimeout(120_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: false })
    // Logo over a 4 s countdown; it runs out while hidden → still the Logo
    await countdownService(op, 4)
    await op.evaluate(() => (window as any).wf.sendIntent('main', 'logo'))
    await expect.poll(async () => (await liveState(op)).mode).toBe('logo')
    await op.waitForTimeout(5500)
    expect((await liveState(op)).mode, 'ran out under Logo').toBe('logo')
    await op.waitForTimeout(1500)
    expect((await liveState(op)).mode).toBe('logo')

    // Black over a countdown that runs out: zones show the logo, not "0:00" — under Black and after Unblack
    await countdownService(op, 4)
    expect(await zoneModes(op)).toContain('countdown')
    await op.evaluate(() => (window as any).wf.sendIntent('main', 'black'))
    await op.waitForTimeout(5500)
    expect((await liveState(op)).mode).toBe('black')
    expect(await zoneModes(op), 'under Black after it ran out').not.toContain('countdown')
    await op.evaluate(() => (window as any).wf.sendIntent('main', 'lyrics'))
    await expect.poll(async () => (await liveState(op)).mode).toBe('logo')
    expect(await zoneModes(op), 'after Unblack').not.toContain('countdown')
  } finally { await closeApp(app, userDataDir) }
})

test('B13-N6/N7/N8: reused pictures say so; two pictures named cross.png get distinct labels; .WFBUNDLE partials are swept', async () => {
  test.setTimeout(120_000)
  const { app, userDataDir } = await launchApp()
  const media = mkdtempSync(join(tmpdir(), 'wf-b13-'))
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: false })
    mkdirSync(join(media, 'a')); mkdirSync(join(media, 'b')); mkdirSync(join(media, 'stick'))
    const a = join(media, 'a', 'cross.png'); writeFileSync(a, PNG)
    const b = join(media, 'b', 'cross.png'); writeFileSync(b, PNG_B)
    const svcId: number = await op.evaluate(async ({ a, b }) => {
      const wf = (window as any).wf
      const id = await wf.serviceCreate('Two crosses', '2026-10-11')
      await wf.serviceAddItem(id, { type: 'image', payload: { path: a } })
      await wf.serviceAddItem(id, { type: 'image', payload: { path: b } })
      await wf.serviceAddItem(id, { type: 'image', payload: { path: a } })
      return id
    }, { a, b })
    const titles = async (id: number): Promise<string[]> => ((await op.evaluate(async (sid) => (await (window as any).wf.serviceGet(sid)).items, id)) as any[]).map((i) => i.title)
    // N7: distinct labels for distinct files; the same file keeps one label
    expect(await titles(svcId)).toEqual(['cross.png', 'cross.png (2)', 'cross.png'])

    // N8: a stale upper-case partial in the save folder is swept by the next save there
    const stick = join(media, 'stick')
    const stale = `OLD.WFBUNDLE.part-1-${Date.now() - 11 * 60_000}`
    const fresh = `NEW.WFBUNDLE.part-1-${Date.now()}`
    writeFileSync(join(stick, stale), 'x'); writeFileSync(join(stick, fresh), 'x')
    const bundle = join(stick, 'Two crosses.wfbundle')
    await saveAs(app, bundle)
    expect((await op.evaluate((id) => (window as any).wf.serviceExport(id), svcId)).error).toBeUndefined()
    expect(readdirSync(stick).sort()).toEqual([fresh, 'Two crosses.wfbundle'].sort())

    // N6: the first import copies both pictures; the second finds them already here
    await openFile(app, bundle)
    const r1 = await op.evaluate(() => (window as any).wf.serviceImportFile())
    expect(r1.error).toBeUndefined()
    expect(r1.summary).toMatch(/2 picture\/video files copied onto this computer/)
    expect(r1.summary).not.toMatch(/already in this computer/)
    expect(await titles(r1.serviceId)).toEqual(['cross.png', 'cross.png (2)', 'cross.png'])
    const r2 = await op.evaluate(() => (window as any).wf.serviceImportFile())
    expect(r2.error).toBeUndefined()
    expect(r2.summary).not.toMatch(/copied onto this computer/)
    expect(r2.summary).toMatch(/2 picture\/video files were already in this computer’s library — not copied again/)
    const imported = join(userDataDir, 'userData', 'imported-media')
    expect(readdirSync(imported).filter((f) => !f.includes('.part-'))).toHaveLength(2)
    // each label still shows its own picture
    const items: any[] = await op.evaluate(async (id) => (await (window as any).wf.serviceGet(id)).items, r2.serviceId)
    expect(readFileSync(items[0].payload.path).equals(PNG)).toBe(true)
    expect(readFileSync(items[1].payload.path).equals(PNG_B)).toBe(true)

    // the Live rail can tell them apart
    await op.evaluate((id) => (window as any).wf.setActiveService(id), r2.serviceId)
    await op.reload()
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    await goToLiveControl(op)
    await expect(op.getByRole('button', { name: 'Go live: cross.png (2)', exact: true })).toHaveCount(1)
    expect(existsSync(bundle)).toBe(true)
  } finally {
    rmSync(media, { recursive: true, force: true })
    await closeApp(app, userDataDir)
  }
})
