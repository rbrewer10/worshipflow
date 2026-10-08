import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, type LaunchedApp } from './electronApp'

// Shared bits for the QA regression specs (ported from the 2026-10 QA pass
// repros in a-extra/*.mjs and b-extra/specs/*.spec.ts).

export const wf = (page: Page): Promise<unknown> => page.waitForFunction(() => !!(window as unknown as { wf?: unknown }).wf)

export async function liveState(op: Page, track: 'main' | 'second' = 'main'): Promise<Record<string, any>> {
  return op.evaluate((t) => (window as any).wf.getState(t), track)
}

export async function goToLiveControl(op: Page): Promise<void> {
  await op.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Live Control' }).first().click()
  await op.getByRole('button', { name: /^Go live: / }).first().waitFor()
}

/** Click "Go live: <title>" and wait until that item is actually live (the load is async). */
export async function goLive(op: Page, title: string): Promise<void> {
  const before = (await liveState(op)).liveServiceItemId ?? null
  await op.getByRole('button', { name: `Go live: ${title}`, exact: true }).first().click()
  // (waitForFunction treats an async predicate's Promise as truthy, so poll instead.)
  await expect.poll(async () => {
    const id = (await liveState(op)).liveServiceItemId ?? null
    return id !== null && id !== before
  }, { timeout: 15_000 }).toBe(true)
  await op.waitForTimeout(500)
}

/** Press a live-control shortcut on the operator window (focuses it first, like an operator clicking it). */
export async function pressKey(app: ElectronApplication, op: Page, key: string): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => /#\/$/.test(x.webContents.getURL()) || !/#\/(output|stage)|\/zone\/|\/obs/.test(x.webContents.getURL()))
    w?.focus(); w?.webContents.focus()
  })
  await op.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await op.keyboard.press(key)
  await op.waitForTimeout(400)
}

/** Main-process view of every window. */
export async function windowList(app: ElectronApplication): Promise<Array<{ route: string; crashed: boolean }>> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => ({
    route: w.webContents.getURL().split('#')[1] ?? w.webContents.getURL(),
    crashed: w.webContents.isCrashed()
  })))
}

export function processExited(app: ElectronApplication, ms: number): Promise<boolean> {
  const p = app.process()
  if (p.exitCode !== null) return Promise.resolve(true)
  return new Promise((res) => {
    const t = setTimeout(() => res(false), ms)
    p.once('exit', () => { clearTimeout(t); res(true) })
  })
}

/** Open a page served by the app's LAN server (zone pages, /obs) in a new window. */
export async function openServedPage(app: ElectronApplication, op: Page, path: string, size = { width: 1920, height: 1080 }): Promise<Page> {
  const url: string = await op.evaluate(() => (window as any).wf.getObsUrl())
  const port = new URL(url).port
  const pagePromise = app.waitForEvent('window', (p) => p.url().includes(path))
  await app.evaluate(({ BrowserWindow }, a) => {
    const w = new BrowserWindow({ width: a.size.width, height: a.size.height, useContentSize: true, show: true })
    void w.loadURL(`http://127.0.0.1:${a.port}${a.path}`)
  }, { port, path, size })
  const page = await pagePromise
  await page.waitForLoadState('domcontentloaded')
  return page
}

/**
 * Simulate a crash: kill the app hard and wait until it is really gone. On
 * Windows a killed electron.exe leaves its renderer/GPU children running for a
 * moment, and a relaunch in that window loses the single-instance lock and
 * exits at once ("Process failed to launch!", exit code 0 — first seen on the
 * candidate's Windows CI). So on Windows the whole tree goes, like a real
 * crash takes it.
 */
export async function crashApp(app: ElectronApplication): Promise<void> {
  const proc = app.process()
  const gone = new Promise<void>((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) resolve()
    else proc.once('exit', () => resolve())
  })
  if (process.platform === 'win32' && proc.pid) {
    try { execFileSync('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' }) } catch { proc.kill('SIGKILL') }
  } else {
    proc.kill('SIGKILL')
  }
  await gone
  await new Promise((r) => setTimeout(r, 1000))
}

/**
 * Launch again on the same profile after crashApp(). Retries only the
 * "lost the single-instance lock to a process that is still going away" case
 * (the launch exits immediately); anything else fails the test as before, and
 * so does an app that still won't start after ~15 s.
 */
export async function relaunchAfterCrash(root: string): Promise<LaunchedApp> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await launchApp({ root })
    } catch (err) {
      if (!/Process failed to launch/i.test(String(err))) throw err
      lastErr = err
      await new Promise((r) => setTimeout(r, 2500))
    }
  }
  throw lastErr
}

/**
 * Close the app, but never hang the run on it. Playwright's app.close() can
 * hang on Linux after a renderer crashed even though the app itself quits
 * (also seen by VS Code's sanity tests, microsoft/vscode#315418), so the
 * verdict is whether the Electron PROCESS exited by itself within `ms`, not
 * whether close() settled. Still running after `ms` → killed (whole tree on
 * Windows) and false. The app's own log and a close summary are attached to
 * the test, so a CI failure says where it stopped.
 */
export async function closeAppWithin(launched: LaunchedApp, ms = 20_000): Promise<boolean> {
  const { app, userDataDir, profileDir } = launched
  const proc = app.process()
  const exited = (): boolean => proc.exitCode !== null || proc.signalCode !== null
  const t0 = Date.now()
  let closeSettled = false
  let exitedAt: number | null = exited() ? 0 : null
  proc.once('exit', () => { exitedAt ??= Date.now() - t0 })
  void app.close().catch(() => { /* reported below */ }).finally(() => { closeSettled = true })
  const sleep = (n: number): Promise<void> => new Promise((r) => setTimeout(r, n))
  while (Date.now() - t0 < ms && !exited()) await sleep(100)
  for (let i = 0; i < 30 && exited() && !closeSettled; i++) await sleep(100) // give close() 3 s to notice
  const quit = exited()
  if (!quit) await crashApp(app).catch(() => { /* already gone */ })
  const summary = `process exited by itself: ${quit}${exitedAt != null ? ` (after ${exitedAt} ms)` : ''}; app.close() settled: ${closeSettled}; waited ${Date.now() - t0} ms`
  test.info().annotations.push({ type: 'close', description: summary })
  try {
    await attachText('close-summary.txt', summary)
    const logs = join(profileDir, 'logs')
    if (existsSync(logs)) {
      for (const f of readdirSync(logs)) {
        const to = test.info().outputPath(`main-log-${f}`)
        copyFileSync(join(logs, f), to)
        await test.info().attach(`main-log-${f}`, { path: to, contentType: 'text/plain' })
      }
    }
  } catch { /* diagnostics only */ }
  rmSync(userDataDir, { recursive: true, force: true })
  return quit
}

/** Collect the app's stdout/stderr so it can be attached on failure. */
export function captureOutput(app: ElectronApplication): () => string {
  const chunks: string[] = []
  const proc = app.process()
  proc.stdout?.on('data', (d) => chunks.push(String(d)))
  proc.stderr?.on('data', (d) => chunks.push(String(d)))
  return () => chunks.join('')
}

/** Attach text as a file in the test's output folder (uploaded with CI failures). */
export async function attachText(name: string, text: string): Promise<void> {
  const to = test.info().outputPath(name)
  writeFileSync(to, text)
  await test.info().attach(name, { path: to, contentType: 'text/plain' })
}

/**
 * Crash a window's renderer the way a real crash does. On GitHub's Ubuntu
 * runner webContents.forcefullyCrashRenderer() left the renderer hung instead
 * of gone: no render-process-gone, isCrashed() false, executeJavaScript never
 * answering (candidate CI, Oct 8). So on Linux the renderer's OS process is
 * killed from main (what the OOM killer or a GPU fault does); elsewhere
 * forcefullyCrashRenderer() is kept, as it works there.
 */
export async function crashRenderer(app: ElectronApplication, which: 'output' | 'operator'): Promise<void> {
  await app.evaluate(({ BrowserWindow }, w) => {
    const win = BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('#/output') === (w === 'output'))!
    if (process.platform === 'linux') process.kill(win.webContents.getOSProcessId(), 'SIGKILL')
    else win.webContents.forcefullyCrashRenderer()
  }, which)
}
