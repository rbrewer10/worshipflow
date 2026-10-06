import { BrowserWindow, dialog } from 'electron'

/**
 * Non-blocking error dialog (QA A-H4).
 *
 * `dialog.showErrorBox` is synchronous and modal: it blocks the Electron MAIN
 * process until someone clicks OK — and the box can be hidden behind other
 * windows. While it's up, Go Live / Next / Black, zone broadcasts, OBS and
 * tablet remotes all freeze. `showMessageBox` returns a promise and leaves the
 * main process running. Use this for every error after startup.
 */
export function showErrorAsync(parent: BrowserWindow | null | undefined, title: string, message: string, detail?: string): Promise<void> {
  const opts = { type: 'error' as const, title, message, detail, buttons: ['OK'], noLink: true }
  const win = parent && !parent.isDestroyed() ? parent : null
  return (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)).then(
    () => undefined,
    () => undefined
  )
}
