import { expect, type ElectronApplication, type Page } from '@playwright/test'

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
