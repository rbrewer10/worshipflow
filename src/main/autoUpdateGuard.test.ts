import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// autoUpdate.ts imports electron-updater/Electron, so this pins the wiring by source.
describe('update install request (QA retest note: double-click opened two dialogs)', () => {
  const src = readFileSync(join(__dirname, 'autoUpdate.ts'), 'utf8')
  it('a second click joins the pending request instead of opening another dialog', () => {
    expect(src).toMatch(/if \(!installRequest\) installRequest = doRequestInstall\(deps\)/)
    expect(src).toMatch(/ipcMain\.handle\('wf:update:installNow', \(\) => requestInstall\(deps\)\)/)
  })
})
