import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { logError } from './logger'

// Checks GitHub (rbrewer10/worshipflow — see electron-builder.yml's `publish`
// block) once at startup for a newer release, downloads it silently in the
// background if one exists, and tells every open window once it's ready to
// install. Deliberately never re-checks while the app stays open — a version
// check must never have a chance to fire mid-service. See the 2026-08-02
// design spec.
export function initAutoUpdate(): void {
  if (!app.isPackaged) return // no update metadata exists under `npm run dev`

  autoUpdater.autoDownload = true

  autoUpdater.on('update-downloaded', () => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('wf:update:ready')
    }
  })

  // A failed check (offline, GitHub unreachable) is never shown to the
  // operator — it's not something a volunteer can act on, and a booth
  // computer is often offline between services. It just tries again next
  // startup, silently.
  autoUpdater.on('error', (err) => {
    logError('[autoUpdate] check failed', err)
  })

  ipcMain.on('wf:update:installNow', () => {
    autoUpdater.quitAndInstall()
  })

  void autoUpdater.checkForUpdates().catch((err) => {
    logError('[autoUpdate] checkForUpdates threw', err)
  })
}
