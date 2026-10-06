import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Launches the real built app (npm run build must have run first) against a
// fresh, throwaway profile. Two belts:
//  - `--user-data-dir=<tmp>/userData`, which the unpackaged main process now
//    honours (src/main/index.ts), so worshipflow.db, backups/ and
//    recovery.json all land in the temp dir; and
//  - a temp working directory, so even an older build that still forces
//    `<cwd>/.worshipflow-dev` can never touch the developer's real dev DB.
// The single-instance lock is keyed on the userData path, so every launch
// gets its own lock too.
export interface LaunchedApp {
  app: ElectronApplication
  /** Throwaway root (cwd); userData lives at `${userDataDir}/userData`. */
  userDataDir: string
  profileDir: string
}

export interface LaunchOptions {
  /** Re-use an existing throwaway root (simulates relaunching on the same PC). */
  root?: string
  env?: Record<string, string>
}

const MAIN_JS = join(__dirname, '..', '..', 'out', 'main', 'index.js')

export async function launchApp(opts: LaunchOptions = {}): Promise<LaunchedApp> {
  const root = opts.root ?? mkdtempSync(join(tmpdir(), 'wf-e2e-'))
  const profileDir = join(root, 'userData')
  const args = [MAIN_JS, `--user-data-dir=${profileDir}`]
  // GitHub's Linux runners (and most containers) have no usable setuid sandbox.
  if (process.platform === 'linux') args.push('--no-sandbox')
  const app = await electron.launch({
    executablePath: require('electron') as unknown as string,
    args,
    cwd: root,
    env: { ...process.env, WF_SIM: '1', ...(opts.env ?? {}) } as Record<string, string> // one simulated output window
  })
  return { app, userDataDir: root, profileDir }
}

export async function closeApp(app: ElectronApplication, userDataDir: string): Promise<void> {
  await app.close().catch(() => { /* already gone */ })
  rmSync(userDataDir, { recursive: true, force: true })
}

function isOperatorUrl(url: string): boolean {
  return !url.includes('#/output') && !url.includes('#/stage') && !url.includes('/multiview') && !url.includes('/overlay')
}

/** The operator (control) window, waiting for it to exist and load. */
export async function operatorWindow(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const p = app.windows().find((w) => isOperatorUrl(w.url()) && w.url() !== 'about:blank')
    if (p) { await p.waitForLoadState('domcontentloaded'); return p }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('operator window never opened: ' + app.windows().map((w) => w.url()).join(', '))
}

/** The (WF_SIM) audience output window. */
export async function outputWindow(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const p = app.windows().find((w) => w.url().includes('#/output'))
    if (p) { await p.waitForLoadState('domcontentloaded'); return p }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('output window never opened: ' + app.windows().map((w) => w.url()).join(', '))
}

/**
 * A brand-new profile opens to the first-run wizard ("Set up this booth
 * computer"). Click through it, optionally loading the Sample Sunday, and wait
 * for the main nav.
 */
export async function completeFirstRun(operator: Page, opts: { sample?: boolean } = {}): Promise<void> {
  const nav = operator.getByRole('navigation', { name: 'Main' })
  const start = operator.getByRole('button', { name: 'Start', exact: true })
  await Promise.race([nav.waitFor({ timeout: 20_000 }), start.waitFor({ timeout: 20_000 })])
  if (await nav.isVisible()) return
  if (opts.sample) {
    await start.click()
    await operator.getByRole('button', { name: 'Continue' }).click()
    await operator.getByRole('button', { name: 'Load sample Sunday' }).click()
  } else {
    await operator.getByRole('button', { name: /^Skip/ }).first().click()
  }
  await nav.waitFor({ timeout: 15_000 })
}

/**
 * Text the audience can actually see on a page: skips subtrees that are
 * display:none, visibility:hidden or opacity 0 (the output crossfades between
 * two lyric layers, so the outgoing slide stays in the DOM at opacity 0).
 */
export async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const parts: string[] = []
    const walk = (el: Element): void => {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          const t = (child.textContent ?? '').trim()
          if (t) parts.push(t)
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          walk(child as Element)
        }
      }
    }
    walk(document.body)
    return parts.join(' ').replace(/\s+/g, ' ')
  })
}
