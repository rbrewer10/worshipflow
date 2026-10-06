import { test, expect } from '@playwright/test'
import { openSync, writeSync, closeSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, closeApp, operatorWindow, completeFirstRun } from './electronApp'

// QA regressions B1 (b-extra/specs/09-upgrade-firstrun.spec.ts) and A-C3 (a-extra/launch.mjs).

test('B1: an existing (0.19) booth profile skips the setup wizard and keeps its church name + CCLI license', async () => {
  const first = await launchApp()
  let root = first.userDataDir
  try {
    const op = await operatorWindow(first.app)
    await completeFirstRun(op)
    await op.evaluate(async () => {
      const w = (window as any).wf
      await w.settingSet('church_name', 'Snow Hill Congregational Methodist Church')
      await w.ccliSetLicense('7654321')
      await w.serviceCreate('Real Sunday', '2026-10-11')
      await w.settingSet('has_completed_setup', null) // what a 0.19 database looks like
    })
    await first.app.close()

    const again = await launchApp({ root })
    root = again.userDataDir
    const op2 = await operatorWindow(again.app)
    await op2.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    expect(await op2.getByRole('button', { name: 'Start', exact: true }).count()).toBe(0)
    const kept = await op2.evaluate(async () => {
      const w = (window as any).wf
      return { name: await w.settingGet('church_name'), ccli: await w.ccliGetLicense() }
    })
    expect(kept).toEqual({ name: 'Snow Hill Congregational Methodist Church', ccli: '7654321' })
    await again.app.close()
  } finally { await closeApp(first.app, root) }
})

test('A-C3: a corrupt database is recovered from a backup and the app still opens', async () => {
  const first = await launchApp()
  const root = first.userDataDir
  try {
    const op = await operatorWindow(first.app)
    await completeFirstRun(op, { sample: true })
    const songCount: number = await op.evaluate(async () => (await (window as any).wf.songsList('')).length)
    expect(songCount).toBeGreaterThan(0)
    await first.app.close()

    // Overwrite the SQLite header, like a bad shutdown / partial copy.
    const dbPath = join(first.profileDir, 'worshipflow.db')
    const fd = openSync(dbPath, 'r+'); writeSync(fd, Buffer.from('this is not a database!!')); closeSync(fd)

    const again = await launchApp({ root })
    const op2 = await operatorWindow(again.app) // QA: WINDOW COUNT: 0
    await again.app.evaluate(({ dialog }) => { (dialog as any).showMessageBox = async () => ({ response: 0 }) })
    await expect.poll(() => op2.evaluate(async () => (await (window as any).wf.songsList('')).length), { timeout: 20_000 }).toBe(songCount)
    expect(readdirSync(first.profileDir).some((f) => f.startsWith('worshipflow.db.corrupt-'))).toBe(true)
    expect(existsSync(dbPath)).toBe(true)
    await again.app.close()
  } finally { await closeApp(first.app, root) }
})

test('B-N1: the active service survives a relaunch, even when a newer service exists', async () => {
  const first = await launchApp()
  const root = first.userDataDir
  try {
    const op = await operatorWindow(first.app)
    await completeFirstRun(op, { sample: true })
    const ids = await op.evaluate(async () => {
      const w = (window as any).wf
      const real = await w.serviceCreate('Real Sunday Oct 11', '2026-10-11')
      await w.setActiveService(real)
      // Created after the prepared service, so it is list[0] (newest).
      const newer = await w.serviceCreate('Next week draft', '2026-10-18')
      return { real, newer }
    })
    await first.app.close()

    const again = await launchApp({ root })
    try {
      const op2 = await operatorWindow(again.app)
      await op2.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
      await op2.waitForTimeout(1000) // let the renderer's mount-time selection run
      expect(await op2.evaluate(() => (window as any).wf.getActiveServiceId())).toBe(ids.real)
    } finally { await again.app.close() }
  } finally { await closeApp(first.app, root) }
})
