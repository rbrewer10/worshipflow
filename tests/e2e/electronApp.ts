import { _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Launches the real built app (npm run build must have run first) against a
// fresh, throwaway --user-data-dir — Electron's standard switch for
// relocating app.getPath('userData'), which is where db.ts puts
// worshipflow.db. Every test gets its own empty database; the developer's
// real song/service library is never touched.
export async function launchApp(): Promise<{ app: ElectronApplication; userDataDir: string }> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'wf-e2e-'))
  const app = await electron.launch({
    executablePath: require('electron') as unknown as string,
    args: [join(__dirname, '..', '..', 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
    env: { ...process.env, WF_SIM: '1' } // one simulated tiled output window, no real monitors needed
  })
  return { app, userDataDir }
}

export async function closeApp(app: ElectronApplication, userDataDir: string): Promise<void> {
  await app.close()
  rmSync(userDataDir, { recursive: true, force: true })
}
