import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp, closeApp, operatorWindow, completeFirstRun } from './electronApp'

// QA regression A-H4 (a-extra/errorbox-block.mjs): an import error dialog must
// not freeze the main process (and with it Go Live / Next / Black).

for (const which of ['songselect', 'service'] as const) {
  test(`A-H4: a ${which} import error leaves live control responsive`, async () => {
    const { app, userDataDir } = await launchApp()
    try {
      const op = await operatorWindow(app)
      await completeFirstRun(op)
      const bad = join(userDataDir, which === 'songselect' ? 'empty.txt' : 'broken.wfservice')
      writeFileSync(bad, which === 'songselect' ? '   ' : '{not json')
      await app.evaluate(({ dialog }, f) => {
        const g = globalThis as any
        g.__boxes = 0
        const orig = dialog.showMessageBox.bind(dialog)
        ;(dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths: [f] })
        ;(dialog as any).showMessageBox = (...a: unknown[]) => { g.__boxes++; return (orig as any)(...a) }
      }, bad)
      const fn = which === 'songselect' ? 'songSelectImportFile' : 'serviceImportFile'
      void op.evaluate((fn) => { void (window as any).wf[fn]() }, fn)
      await expect.poll(() => app.evaluate(() => (globalThis as any).__boxes)).toBe(1)
      const answered = await Promise.race([
        op.evaluate(async () => { (window as any).wf.sendIntent('main', 'black'); return (await (window as any).wf.getState('main')).mode }),
        new Promise((res) => setTimeout(() => res('NO IPC RESPONSE'), 5000))
      ])
      expect(answered).toBe('black')
    } finally {
      app.process().kill('SIGKILL') // an error dialog is still up
      await closeApp(app, userDataDir)
    }
  })
}
