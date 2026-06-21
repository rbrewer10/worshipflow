import { app, shell, BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import type { Intent, LiveState, DisplayInfo, AppInfo, Mode, SongInput, NewServiceItem } from '../shared/types'
import { DEMO_SONG } from './demoSong'
import { readRecovery, writeRecovery } from './recovery'
import {
  initDb,
  listSongs,
  getSong,
  createSong,
  deleteSong,
  listServices,
  createService,
  deleteService,
  getService,
  addServiceItem,
  removeServiceItem,
  moveServiceItem
} from './db'
import { lookupScripture } from './scripture'

// WorshipFlow — main process ("the brain").
// Owns the monitors: enumerates displays, opens & positions the operator window
// and borderless fullscreen output windows, holds the single source of truth for
// live state, and broadcasts it to every output in lockstep. Dumb renderers just
// display what they're told — this is what makes multi-output sync + crash
// recovery possible (the capability the old app faked).

const PRELOAD = join(__dirname, '../preload/index.js')
const startTime = Date.now()

let operatorWin: BrowserWindow | null = null
const outputWins = new Map<string, BrowserWindow>()

// Canonical live state. liveSong is swapped at runtime via wf:live:loadSong.
let liveSong: Song = DEMO_SONG
const state: { mode: Mode; index: number } = { mode: 'lyrics', index: 0 }

// Restore position after a crash/forced-quit. MUST run after app is ready —
// before 'ready', app.getPath('userData') resolves to the wrong default dir, so
// the snapshot reads as missing and we'd start over (the Phase 0 recovery bug).
function restoreRecovery(): void {
  const recovered = readRecovery()
  if (recovered) {
    state.mode = (recovered.mode as Mode) ?? 'lyrics'
    state.index = Math.min(Math.max(recovered.index ?? 0, 0), liveSong.lines.length - 1)
  }
}

function renderState(): LiveState {
  const lines = liveSong.lines
  return {
    mode: state.mode,
    index: state.index,
    line: lines[state.index] ?? '',
    next: lines[state.index + 1] ?? '',
    total: lines.length,
    songTitle: liveSong.title,
    ts: Date.now()
  }
}

function describeDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    bounds: d.bounds,
    primary: d.id === primaryId,
    internal: d.internal
  }))
}

function broadcast(): void {
  const payload = renderState()
  for (const w of [operatorWin, ...outputWins.values()]) {
    if (w && !w.isDestroyed()) w.webContents.send('wf:state', payload)
  }
  writeRecovery({ mode: state.mode, index: state.index })
}

function loadRoute(win: BrowserWindow, route: string, query?: Record<string, string>): void {
  const q = query ? '?' + new URLSearchParams(query).toString() : ''
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    win.loadURL(`${devUrl}/${q}#${route}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), {
      search: q ? q.slice(1) : undefined,
      hash: route
    })
  }
}

function createOperator(): void {
  const primary = screen.getPrimaryDisplay()
  const sim = parseInt(process.env['WF_SIM'] || '0', 10)
  // In sim mode, drop the operator below the row of tiled output strips.
  let oy = primary.bounds.y + 60
  if (sim > 0) {
    const wa = primary.workArea
    oy = wa.y + Math.round((wa.width / sim) * 9 / 16) + 12
  }
  operatorWin = new BrowserWindow({
    x: primary.bounds.x + 60,
    y: oy,
    width: 1100,
    height: 760,
    show: false,
    title: 'WorshipFlow — Operator',
    backgroundColor: '#0b0f17',
    autoHideMenuBar: true,
    webPreferences: { preload: PRELOAD, sandbox: false }
  })
  operatorWin.on('ready-to-show', () => operatorWin?.show())
  operatorWin.webContents.setWindowOpenHandler((d) => {
    shell.openExternal(d.url)
    return { action: 'deny' }
  })
  operatorWin.on('closed', () => {
    operatorWin = null
  })
  loadRoute(operatorWin, '/')
}

interface OutputOpts {
  x: number
  y: number
  width: number
  height: number
  fullscreen: boolean
  alwaysOnTop?: boolean
  id: number
}

function createOutput(label: string, opts: OutputOpts): void {
  const win = new BrowserWindow({
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    frame: false,
    fullscreen: opts.fullscreen,
    alwaysOnTop: opts.alwaysOnTop ?? false,
    backgroundColor: '#000000',
    title: `WorshipFlow Output ${opts.id}`,
    webPreferences: { preload: PRELOAD, sandbox: false }
  })
  // Push current state as soon as the output finishes loading so it's in sync.
  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed()) win.webContents.send('wf:state', renderState())
  })
  win.on('closed', () => outputWins.delete(label))
  outputWins.set(label, win)
  loadRoute(win, '/output', { id: String(opts.id) })
}

function layoutOutputs(): void {
  for (const w of outputWins.values()) if (!w.isDestroyed()) w.destroy()
  outputWins.clear()

  const primary = screen.getPrimaryDisplay()
  const sim = parseInt(process.env['WF_SIM'] || '0', 10)

  if (sim > 0) {
    // Sim mode: N tiled, always-on-top output strips on one screen — proves the
    // routing/lockstep engine without extra monitors.
    const wa = primary.workArea
    const cell = Math.floor(wa.width / sim)
    const h = Math.round((cell * 9) / 16)
    for (let i = 0; i < sim; i++) {
      createOutput('sim' + i, {
        x: wa.x + i * cell,
        y: wa.y,
        width: cell,
        height: h,
        fullscreen: false,
        alwaysOnTop: true,
        id: i + 1
      })
    }
    return
  }

  const externals = screen.getAllDisplays().filter((d) => d.id !== primary.id)
  if (externals.length === 0) {
    // Single-monitor dev fallback so it's demoable on a laptop.
    createOutput('main', {
      x: primary.bounds.x + 120,
      y: primary.bounds.y + 120,
      width: 960,
      height: 540,
      fullscreen: false,
      id: 1
    })
  } else {
    externals.forEach((d, i) =>
      createOutput('ext' + d.id, {
        x: d.bounds.x,
        y: d.bounds.y,
        width: d.bounds.width,
        height: d.bounds.height,
        fullscreen: true,
        id: i + 1
      })
    )
  }
}

// --- IPC: renderers send intents; main mutates canonical state + broadcasts ---
ipcMain.on('wf:intent', (_e, type: Intent) => {
  const last = liveSong.lines.length - 1
  if (type === 'next') {
    if (state.mode !== 'lyrics') state.mode = 'lyrics'
    else if (state.index < last) state.index++
  } else if (type === 'prev') {
    if (state.mode !== 'lyrics') state.mode = 'lyrics'
    else if (state.index > 0) state.index--
  } else if (type === 'black') state.mode = 'black'
  else if (type === 'logo') state.mode = 'logo'
  else if (type === 'lyrics') state.mode = 'lyrics'
  broadcast()
})

ipcMain.handle(
  'wf:getInfo',
  (): AppInfo => ({
    song: liveSong,
    state: renderState(),
    displays: describeDisplays(),
    outputs: outputWins.size,
    startupMs: Date.now() - startTime
  })
)

// --- Live engine: load a song from the library into the outputs ---
ipcMain.handle('wf:live:loadSong', async (_e, id: number) => {
  const full = await getSong(id)
  if (!full) return
  const lines: string[] = []
  for (const section of [...full.sections].sort((a, b) => a.ordinal - b.ordinal)) {
    for (const raw of section.lyrics.split('\n')) {
      const line = raw.trim()
      if (line) lines.push(line)
    }
  }
  liveSong = { title: full.title, lines }
  state.mode = 'lyrics'
  state.index = 0
  broadcast()
})
ipcMain.handle('wf:getState', (): LiveState => renderState())

// --- Song library IPC (Phase 1) ---
ipcMain.handle('wf:songs:list', (_e, search?: string) => listSongs(search ?? ''))
ipcMain.handle('wf:songs:get', (_e, id: number) => getSong(id))
ipcMain.handle('wf:songs:create', (_e, input: SongInput) => createSong(input))
ipcMain.handle('wf:songs:delete', (_e, id: number) => deleteSong(id))

// --- Service builder IPC (Phase 1) ---
ipcMain.handle('wf:services:list', () => listServices())
ipcMain.handle('wf:services:create', (_e, name: string, date?: string) => createService(name, date))
ipcMain.handle('wf:services:delete', (_e, id: number) => deleteService(id))
ipcMain.handle('wf:services:get', (_e, id: number) => getService(id))
ipcMain.handle('wf:services:addItem', (_e, serviceId: number, item: NewServiceItem) =>
  addServiceItem(serviceId, item)
)
ipcMain.handle('wf:services:removeItem', (_e, itemId: number) => removeServiceItem(itemId))
ipcMain.handle('wf:services:moveItem', (_e, itemId: number, dir: 'up' | 'down') =>
  moveServiceItem(itemId, dir)
)

// --- Scripture IPC (Phase 1) ---
ipcMain.handle('wf:scripture:lookup', (_e, reference: string) => lookupScripture(reference))

app.whenReady().then(async () => {
  await initDb()
  restoreRecovery()
  createOperator()
  layoutOutputs()
  broadcast() // push restored position to windows + persist the loaded snapshot
  screen.on('display-added', layoutOutputs)
  screen.on('display-removed', layoutOutputs)
  screen.on('display-metrics-changed', layoutOutputs)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOperator()
      layoutOutputs()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
