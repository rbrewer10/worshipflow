import { test, expect } from '@playwright/test'
import { rmSync } from 'node:fs'
import { launchApp, closeApp, operatorWindow, outputWindow, completeFirstRun } from './electronApp'
import { windowList, processExited, closeAppWithin, captureOutput, attachText } from './qaHelpers'

// QA regressions: A-C2, A-H3, A-H7 (a-extra/close-operator.mjs, close-output.mjs, crash-renderer.mjs).

test('A-C2: closing the operator with nothing live quits the whole app, and a relaunch works', async () => {
  const first = await launchApp()
  const op = await operatorWindow(first.app)
  await outputWindow(first.app)
  await completeFirstRun(op)
  await first.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('#/output'))!.close() })
  expect(await processExited(first.app, 10_000)).toBe(true)
  const again = await launchApp({ root: first.userDataDir })
  try {
    await operatorWindow(again.app)
    await outputWindow(again.app)
  } finally { await closeApp(again.app, again.userDataDir) }
})

test('A-C2: closing the operator while live asks first; "Keep open" keeps everything, "Close" quits', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await outputWindow(app)
    await completeFirstRun(op)
    await op.evaluate(() => (window as any).wf.liveLoadText('main', 'Welcome', 'Hello'))
    await app.evaluate(({ dialog }) => {
      const g = globalThis as any
      g.__answers = [0, 1]; g.__asked = 0
      ;(dialog as any).showMessageBox = async () => { g.__asked++; return { response: g.__answers.shift() } }
    })
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('#/output'))!.close() })
    await expect.poll(() => app.evaluate(() => (globalThis as any).__asked)).toBe(1)
    expect((await windowList(app)).length).toBe(2)
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('#/output'))!.close() })
    expect(await processExited(app, 10_000)).toBe(true)
  } finally { rmSync(userDataDir, { recursive: true, force: true }) }
})

test('A-C2: launching again while the operator window is gone brings it back', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await outputWindow(app)
    await completeFirstRun(op)
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('#/output'))!.destroy() })
    await expect.poll(async () => (await windowList(app)).some((w) => w.route === '/')).toBe(false)
    // Second instance on the same profile: hits the single-instance lock and exits,
    // which must make the first instance re-create its operator window.
    const second = await launchApp({ root: userDataDir }).catch(() => null)
    await expect.poll(async () => (await windowList(app)).some((w) => w.route === '/'), { timeout: 15_000 }).toBe(true)
    await second?.app.close().catch(() => {})
  } finally { await closeApp(app, userDataDir) }
})

test('A-H7: Alt+F4 on the projector output is blocked while running', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await outputWindow(app)
    await completeFirstRun(op)
    await op.evaluate(() => (window as any).wf.liveLoadText('main', 'Welcome', 'Hello'))
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('#/output'))!.close() })
    await op.waitForTimeout(1500)
    expect((await windowList(app)).some((w) => w.route.startsWith('/output'))).toBe(true)
    expect(await op.evaluate(() => (window as any).wf.getInfo().then((i: any) => i.outputs))).toBe(1)
  } finally { await closeApp(app, userDataDir) }
})

test('A-H3: crashed output and operator renderers reload by themselves', async () => {
  test.setTimeout(120_000)
  const launched = await launchApp()
  const { app } = launched
  const output = captureOutput(app)
  let quit = false
  try {
    const op = await operatorWindow(app)
    await outputWindow(app)
    await completeFirstRun(op)
    await op.evaluate(() => (window as any).wf.liveLoadText('main', 'Welcome', 'Hello there'))
    await test.step('crash the output renderer; it reloads and shows what is live', async () => {
      await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('#/output'))!.webContents.forcefullyCrashRenderer() })
      await expect.poll(async () => (await windowList(app)).every((w) => !w.crashed), { timeout: 10_000 }).toBe(true)
      // executeJavaScript on a renderer that is mid-crash/reload never settles, so race it.
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
        const wc = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('#/output'))!.webContents
        return Promise.race([wc.executeJavaScript('document.body.innerText') as Promise<string>, new Promise<string>((r) => setTimeout(() => r(''), 1000))])
      }), { timeout: 15_000 }).toContain('Welcome')
    }, { timeout: 30_000 })
    await test.step('crash the operator renderer; it reloads', async () => {
      await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('#/output'))!.webContents.forcefullyCrashRenderer() })
      await expect.poll(async () => (await windowList(app)).every((w) => !w.crashed), { timeout: 10_000 }).toBe(true)
    }, { timeout: 30_000 })
  } finally {
    await test.step('quit', async () => { quit = await closeAppWithin(launched) })
    await attachText('app-output.txt', output())
  }
  expect.soft(quit, 'the app quits normally after its renderers crashed and reloaded').toBe(true)
})

test('A-N6: after Logo, closing the operator quits without the "projectors are live" prompt', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    const op = await operatorWindow(app)
    await outputWindow(app)
    await completeFirstRun(op)
    await op.evaluate(() => (window as any).wf.liveLoadText('main', 'Welcome', 'Hello'))
    await op.evaluate(() => (window as any).wf.sendIntent('main', 'logo'))
    await op.waitForTimeout(300)
    await app.evaluate(({ dialog }) => {
      const g = globalThis as any
      g.__asked = 0
      ;(dialog as any).showMessageBox = async () => { g.__asked++; return { response: 0 } }
    })
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('#/output'))!.close() })
    expect(await processExited(app, 10_000)).toBe(true)
  } finally { rmSync(userDataDir, { recursive: true, force: true }) }
})

test('A-N3: an operator that crashed past the cap comes back when the app is launched again', async () => {
  test.setTimeout(120_000)
  const launched = await launchApp()
  const { app } = launched
  const output = captureOutput(app)
  let quit = false
  try {
    const op = await operatorWindow(app)
    await outputWindow(app)
    await completeFirstRun(op)
    // Let first-run finish settling — crashing mid-navigation makes Playwright itself report "Target crashed".
    await op.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 20_000 })
    await op.waitForTimeout(500)
    const crashOperator = (): Promise<void> => app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('#/output'))!.webContents.forcefullyCrashRenderer()
    })
    const operatorCrashed = (): Promise<boolean> => app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('#/output'))!.webContents.isCrashed())
    for (let i = 0; i < 3; i++) {
      await test.step(`crash ${i + 1} reloads automatically`, async () => {
        await crashOperator()
        await expect.poll(operatorCrashed, { timeout: 10_000 }).toBe(false) // reloaded automatically
        await new Promise((r) => setTimeout(r, 700))
      }, { timeout: 20_000 })
    }
    await test.step('4th crash within a minute stays crashed (past the cap)', async () => {
      await crashOperator()
      await new Promise((r) => setTimeout(r, 2000))
      expect(await operatorCrashed()).toBe(true)
    }, { timeout: 30_000 })
    await test.step('launching again revives it', async () => {
      // Double-clicking the icon again (what single-instance delivers to us).
      await app.evaluate(({ app: a }) => { a.emit('second-instance', {}, [], '') })
      await expect.poll(operatorCrashed, { timeout: 10_000 }).toBe(false)
    }, { timeout: 30_000 })
  } finally {
    await test.step('quit', async () => { quit = await closeAppWithin(launched) })
    await attachText('app-output.txt', output())
  }
  expect.soft(quit, 'the app quits normally after its operator renderer crashed and was revived').toBe(true)
})
