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
      // SongSelect shows a non-blocking (async) error box; a bad .wfservice now
      // comes back to the renderer as a toast message instead (QA B12), so
      // there may be no main-process dialog at all. Either way: no freeze.
      const result = op.evaluate((fn) => (window as any).wf[fn]().then((r: unknown) => r, (e: Error) => ({ threw: e.message })), fn).catch(() => null) // the songselect box is still up when the app is killed
      await expect.poll(async () => {
        const boxes = await app.evaluate(() => (globalThis as any).__boxes)
        if (boxes >= 1) return true
        if (which === 'service') { const r: any = await Promise.race([result, new Promise((res) => setTimeout(() => res(null), 200))]); return !!r?.error }
        return false
      }).toBe(true)
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
