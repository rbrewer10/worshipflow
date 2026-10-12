import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, closeApp, operatorWindow, completeFirstRun } from './electronApp'
import { liveState, goToLiveControl } from './qaHelpers'

// Church Tech retest 14 (on ac0208a):
//  B14-N1 several service files in ONE argv at cold start (multi-select → Open) are all imported, in order, once each
//  B14 Z4  the stage monitor (Zone 4) shows the logo, not "Countdown 0:00", after a countdown ran out under Logo
// (B14-N2, the qa-retest8 flake, is a change to qa-retest8.spec.ts.)

const saveAs = (app: ElectronApplication, p: string): Promise<void> => app.evaluate(({ dialog }, p) => { (dialog as any).showSaveDialog = async () => ({ canceled: false, filePath: p }) }, p)

test('B14-N1: three service files opened together while WorshipFlow is closed are all imported, in order, once each', async () => {
  test.setTimeout(180_000)
  const media = mkdtempSync(join(tmpdir(), 'wf-b14n1-'))
  const names = ['Multi A Sunday', 'Multi B Sunday', 'Multi C Sunday']
  const files = names.map((n) => join(media, `${n}.wfservice`))
  const first = await launchApp()
  let root = first.userDataDir
  try {
    const op = await operatorWindow(first.app)
    await completeFirstRun(op, { sample: false })
    for (let i = 0; i < names.length; i++) {
      const id: number = await op.evaluate(async (n) => {
        const wf = (window as any).wf
        const sid = await wf.serviceCreate(n, '2026-10-18')
        await wf.serviceAddItem(sid, { type: 'text', payload: { title: 'Welcome', body: n } })
        return sid
      }, names[i])
      await saveAs(first.app, files[i])
      expect((await op.evaluate((sid) => (window as any).wf.serviceExport(sid), id)).error).toBeUndefined()
      await op.evaluate((sid) => (window as any).wf.serviceDelete(sid), id)
      expect(JSON.parse(readFileSync(files[i], 'utf8')).name).toBe(names[i])
    }
  } finally { await first.app.close().catch(() => undefined) }

  // Explorer hands all of them (plus a repeat) to one cold start.
  const { app, userDataDir } = await launchApp({ root, args: [...files, files[0]] })
  root = userDataDir
  try {
    const op = await operatorWindow(app)
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    const imported = async (): Promise<string[]> =>
      ((await op.evaluate(() => (window as any).wf.servicesList())) as any[]).filter((s) => names.includes(s.name)).sort((a, b) => a.id - b.id).map((s) => s.name)
    await expect.poll(async () => (await imported()).length, { timeout: 30_000, message: 'not every opened file was imported' }).toBe(3)
    expect(await imported(), 'in the order Explorer gave them').toEqual(names)
    await op.reload()
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    await op.waitForTimeout(2500)
    expect(await imported(), 'once each, also after a reload').toEqual(names)
  } finally {
    rmSync(media, { recursive: true, force: true })
    await closeApp(app, root)
  }
})

const zone4 = async (op: Page): Promise<any> => ((await op.evaluate(() => (window as any).wf.zoneGetStates())) as Record<string, any>)['4']

test('B14 Z4: after a countdown runs out under Logo, the stage monitor shows the logo, not "Countdown 0:00"', async () => {
  test.setTimeout(120_000)
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await completeFirstRun(op, { sample: false })
    const cd: number = await op.evaluate(async () => {
      const wf = (window as any).wf
      const sid = await wf.serviceCreate('Z4 countdown', '2026-10-18')
      await wf.setActiveService(sid)
      const id = await wf.serviceAddItem(sid, { type: 'countdown', payload: { seconds: 4 } })
      await wf.serviceRefreshActiveItems(sid)
      return id
    })
    await op.reload()
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    await goToLiveControl(op)
    await op.evaluate((id) => (window as any).wf.liveGoLiveAt('main', id, 0), cd)
    await expect.poll(async () => (await liveState(op)).mode, { timeout: 10_000 }).toBe('countdown')
    await op.evaluate(() => (window as any).wf.sendIntent('main', 'logo'))
    await expect.poll(async () => (await liveState(op)).mode).toBe('logo')
    // it runs out while hidden (4 s); the main track stays on the Logo
    await op.waitForTimeout(5500)
    expect((await liveState(op)).mode).toBe('logo')
    const z = await zone4(op)
    expect(['logo', 'off'], `Z4 was ${z.mode} "${z.title} ${z.line}"`).toContain(z.mode)
    expect(`${z.title ?? ''} ${z.line ?? ''}`).not.toMatch(/0:00/)
  } finally { await closeApp(app, userDataDir) }
})
