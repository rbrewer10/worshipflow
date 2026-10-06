// QA A2-N7 (behavioural, adapted from QA's a-extra/tests2/update-recheck.test.ts):
// if something goes live while the "Install update?" confirm is open, the
// request used to deadlock — no message, and the button stayed dead.
import { describe, it, expect, vi } from 'vitest'

const handlers: Record<string, (...a: unknown[]) => unknown> = {}
const shown: string[] = []
const updaterEvents: Record<string, (...a: unknown[]) => void> = {}
const quitAndInstall = vi.fn()
let onShow: (() => void) | null = null

vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown) => { handlers[ch] = fn } },
  dialog: {
    showMessageBox: async (o: { message: string; buttons: string[] }) => {
      shown.push(o.message)
      onShow?.()
      return { response: o.buttons.length - 1 } // "Install and restart" / "OK"
    }
  }
}))
vi.mock('electron-updater', () => ({
  autoUpdater: { on: (ev: string, fn: (...a: unknown[]) => void) => { updaterEvents[ev] = fn }, checkForUpdates: () => Promise.resolve(), quitAndInstall }
}))
vi.mock('./logger', () => ({ logError: () => undefined, logInfo: () => undefined }))

const answer = (p: unknown): Promise<unknown> =>
  Promise.race([p, new Promise((r) => setTimeout(() => r('NO ANSWER'), 1500))])

describe('install re-check (QA A2-N7)', () => {
  it('a Go Live while the confirm is open → "can’t install now", and the button still works afterwards', async () => {
    const { initAutoUpdate } = await import('./autoUpdate')
    let live = false
    initAutoUpdate({ installBlockReason: () => (live ? 'Something is showing on the screens.' : null), parentWindow: () => null, getMode: () => 'download' })
    updaterEvents['update-downloaded']({ version: '0.20.4' })

    onShow = () => { live = true } // goes live while the confirm is up
    expect(await answer(handlers['wf:update:installNow']())).toBe('blocked')
    expect(shown).toEqual(['Install WorshipFlow 0.20.4 now?', "Can't install the update right now."])
    expect(quitAndInstall).not.toHaveBeenCalled()

    onShow = null
    live = false
    expect(await answer(handlers['wf:update:installNow']())).toBe('installing')
    expect(quitAndInstall).toHaveBeenCalledTimes(1)
  })
})
