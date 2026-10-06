import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { logError, logInfo } from './logger'
import { parseAutoUpdateMode } from '../shared/updatePolicy'

export interface AutoUpdateDeps {
  /** null when it's safe to install now; otherwise why not (QA A-H6). */
  installBlockReason: () => string | null
  /** Window to parent the confirm dialogs to. */
  parentWindow: () => BrowserWindow | null
  /** Setting `auto_update_mode` ('download' | 'off'). */
  getMode: () => string | null
}

let downloadedVersion: string | null = null

// Checks GitHub (rbrewer10/worshipflow — see electron-builder.yml's `publish`
// block) once at startup for a newer release, downloads it silently in the
// background if one exists, and tells every open window once it's ready to
// install. Deliberately never re-checks while the app stays open — a version
// check must never have a chance to fire mid-service. See the 2026-08-02
// design spec.
//
// QA A-H6: a downloaded update is now ONLY installed by an explicit, confirmed
// action while nothing is live. electron-updater's default
// autoInstallOnAppQuit=true used to install it silently on any quit —
// including a mid-service quit-and-relaunch to recover a frozen screen.
export function initAutoUpdate(deps: AutoUpdateDeps): void {
  // Registered even when unpackaged so the renderer's button never hits a
  // missing handler; there's simply never an update to install in dev.
  ipcMain.handle('wf:update:installNow', () => requestInstall(deps))

  if (!app.isPackaged) return // no update metadata exists under `npm run dev`
  if (parseAutoUpdateMode(deps.getMode()) === 'off') {
    logInfo('[autoUpdate] automatic update check is turned off (Settings → Diagnostics & backups)')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.autoRunAppAfterInstall = true

  autoUpdater.on('update-downloaded', (info) => {
    downloadedVersion = info?.version ?? null
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('wf:update:ready', downloadedVersion)
    }
  })

  // A failed check (offline, GitHub unreachable) is never shown to the
  // operator — it's not something a volunteer can act on, and a booth
  // computer is often offline between services. It just tries again next
  // startup, silently.
  autoUpdater.on('error', (err) => {
    logError('[autoUpdate] check failed', err)
  })

  void autoUpdater.checkForUpdates().catch((err) => {
    logError('[autoUpdate] checkForUpdates threw', err)
  })
}

export type InstallResult = 'installing' | 'blocked' | 'later' | 'none'

// A double-click on "Update ready…" used to open two confirm dialogs (QA
// retest info note). The second click joins the first request instead.
let installRequest: Promise<InstallResult> | null = null

function requestInstall(deps: AutoUpdateDeps): Promise<InstallResult> {
  if (!installRequest) installRequest = doRequestInstall(deps).finally(() => { installRequest = null })
  return installRequest
}

async function doRequestInstall(deps: AutoUpdateDeps): Promise<InstallResult> {
  if (!app.isPackaged || downloadedVersion === null) return 'none'
  const parent = deps.parentWindow()
  const show = (opts: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> =>
    parent && !parent.isDestroyed() ? dialog.showMessageBox(parent, opts) : dialog.showMessageBox(opts)

  const showBlocked = async (blocked: string): Promise<InstallResult> => {
    await show({
      type: 'info',
      title: 'Update later',
      message: "Can't install the update right now.",
      detail: `${blocked} Installing closes WorshipFlow and turns every projector and TV off. ` +
        'Install it after the service, when the screens are on black or the logo.',
      buttons: ['OK'],
      noLink: true
    })
    return 'blocked'
  }

  const blocked = deps.installBlockReason()
  if (blocked) return showBlocked(blocked)

  const { response } = await show({
    type: 'question',
    title: 'Install update?',
    message: `Install WorshipFlow ${downloadedVersion} now?`,
    detail: 'WorshipFlow will close, every projector and TV will go dark, and the installer will run (about a minute). ' +
      'WorshipFlow reopens by itself afterwards.\n\nIf a service is about to start, choose Later.',
    buttons: ['Later', 'Install and restart'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  })
  if (response !== 1) return 'later'
  // Re-check: something may have gone live while the dialog was open. Say so
  // here — re-entering requestInstall() returned the very promise we're
  // inside, which waited on itself forever and left the button dead for the
  // session (QA A2-N7).
  const blockedNow = deps.installBlockReason()
  if (blockedNow) return showBlocked(blockedNow)
  logInfo(`[autoUpdate] operator confirmed install of ${downloadedVersion}`)
  // Silent (no volunteer-facing installer wizard), relaunch afterwards.
  autoUpdater.quitAndInstall(true, true)
  return 'installing'
}
