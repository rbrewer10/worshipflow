import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'

// WorshipFlow — main process ("the brain").
// Phase 0 will grow this into the multi-monitor engine proven by the spike:
// enumerate displays, own borderless fullscreen output windows, broadcast live
// state to them in lockstep. For now it opens the operator window.
function createOperatorWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    title: 'WorshipFlow',
    backgroundColor: '#0b0f17',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite injects ELECTRON_RENDERER_URL in dev for HMR.
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createOperatorWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createOperatorWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
