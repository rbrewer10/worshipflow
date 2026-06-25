import { app, shell, BrowserWindow, screen, ipcMain, dialog, protocol, net } from 'electron'
import { join, basename, dirname } from 'path'
import { createServer } from 'http'
import { readFileSync, writeFileSync } from 'fs'
import os from 'os'
import { WebSocketServer } from 'ws'
import type { WebSocket as WsSocket } from 'ws'
import type { Intent, LiveState, DisplayInfo, AppInfo, Mode, SongInput, SongFull, NewServiceItem, ServiceItem, ServiceFull, Theme, SceneContext, BibleTranslation, ScriptureResult, ParsedPptxSong, ThemeColors, ItemStyle } from '../shared/types'
import { DEFAULT_THEME_ID } from '../shared/themes'
import { DEMO_SONG } from './demoSong'
import { readRecovery, writeRecovery } from './recovery'
import {
  initDb,
  listSongs,
  getSong,
  createSong,
  updateSong,
  deleteSong,
  setSongBackground,
  setSongFontScale,
  listServices,
  createService,
  deleteService,
  getService,
  addServiceItem,
  removeServiceItem,
  moveServiceItem,
  updateServiceItemNotes,
  getSetting,
  setSetting,
  recordSongUsage,
  listSongUsage,
  clearSongUsage,
  setServiceTheme,
  setServiceItemStyle,
  setServiceItemPayload,
  reorderServiceItems
} from './db'
import { lookupScripture } from './scripture'
import { TABLET_PORT, TABLET_HTML } from './tabletHtml'
import { OBS_HTML } from './obsHtml'
import { parsePptx, parsePptxService } from './pptx'
import {
  connectObs,
  disconnectObs,
  getObsStatus,
  onObsStatus,
  obsStartStream,
  obsStopStream,
  obsStartRecord,
  obsStopRecord,
  obsSetScene
} from './obs'

const PRELOAD = join(__dirname, '../preload/index.js')
const startTime = Date.now()

protocol.registerSchemesAsPrivileged([
  { scheme: 'wf-asset', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true } }
])

let operatorWin: BrowserWindow | null = null
let stageWin: BrowserWindow | null = null
const outputWins = new Map<string, BrowserWindow>()

// Canonical live state.
let liveSong: { title: string; lines: string[]; background?: string | null } = DEMO_SONG
let liveSongId: number | null = null
const state: { mode: Mode; index: number } = { mode: 'lyrics', index: 0 }
let liveServiceItemId: number | null = null
let liveFontScale = 6
let liveBgFit: 'cover' | 'contain' = 'cover'  // whole-slide images use 'contain'
let liveStageMessage: string | null = null
// CCLI copyright info for the live song (for on-screen footer + usage log).
let liveSongMeta: { author: string | null; copyright: string | null; ccli: string | null } = {
  author: null, copyright: null, ccli: null
}
let ccliLicense: string | null = null  // church CCLI license number (loaded from settings)
const loggedSongIds = new Set<number>()  // songs already counted this service (CCLI: once per service)
let liveSlideTheme: string = DEFAULT_THEME_ID  // effective projector slide theme (broadcast)
let liveSlideThemeColors: ThemeColors | null = null
let serviceSlideTheme: string = DEFAULT_THEME_ID  // service-level baseline
let serviceSlideThemeColors: ThemeColors | null = null

// Tablet state — cached by wf:setActiveService so the WS server can serve them.
const tabletClients = new Set<WsSocket>()
let activeServiceItems: ServiceItem[] = []
let liveItemNotes: string | null = null

// Feature states
let hmsLoadedAt: number | null = null  // Hymn timer: when song was loaded
let autoAdvanceMs: number | null = null  // Auto-advance: remaining time in ms
let currentTheme: Theme = 'modern-church'
let bibleTranslation: BibleTranslation = 'kjv'
let liveScriptureRef: string | null = null  // last scripture loaded, for re-translation
let verseNumber: number | null = null  // Current verse being shown
const serviceLog: Array<{ ts: number; event: string }> = []  // Service recording

// OBS auto-switch: map a service "context" to an OBS scene name.
let obsAutoSwitch = false
let obsSceneMap: Record<SceneContext, string> = { worship: '', word: '', countdown: '' }
let lastAutoScene: string | null = null

let countdownTimer: ReturnType<typeof setInterval> | null = null
let autoAdvanceTimer: ReturnType<typeof setInterval> | null = null
let autoAdvanceDuration = 0  // configured interval, so we can re-arm after each advance
let autoAdvanceLoop = false  // when true, jump back to the start at the end
function clearCountdown(): void {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
}
function clearAutoAdvance(): void {
  if (autoAdvanceTimer) { clearInterval(autoAdvanceTimer); autoAdvanceTimer = null }
  autoAdvanceMs = null
  autoAdvanceDuration = 0
  autoAdvanceLoop = false
}

// Are we on the last slide of the last go-live item (nothing further to advance to)?
function atEndOfContent(): boolean {
  const atLastSlide = state.mode === 'lyrics' ? state.index >= liveSong.lines.length - 1 : true
  return atLastSlide && !adjacentLiveItem(1)
}

// Jump back to the first slide of the first go-live item (loop restart).
function goToStart(): void {
  const first = activeServiceItems.find(itemCanGoLive)
  if (first) void handleTabletLoadItem(first.id)
  else { state.index = 0; broadcast() }
}

// Start (or re-arm) the auto-advance countdown. Each time it elapses it advances
// one slide and re-arms itself, so it keeps going until the operator hits Stop.
// When `loop` is set, it restarts from the beginning instead of stopping at the end.
function armAutoAdvance(durationMs: number, loop: boolean): void {
  if (autoAdvanceTimer) clearInterval(autoAdvanceTimer)
  autoAdvanceDuration = durationMs
  autoAdvanceLoop = loop
  autoAdvanceMs = durationMs
  autoAdvanceTimer = setInterval(() => {
    if (autoAdvanceMs == null) return
    autoAdvanceMs -= 100
    if (autoAdvanceMs <= 0) {
      const dur = autoAdvanceDuration
      const lp = autoAdvanceLoop
      if (lp && atEndOfContent()) goToStart()
      else processIntent('next')  // advances; note this calls clearAutoAdvance()
      armAutoAdvance(dur, lp)      // …so re-arm to keep the cycle going
      return
    }
    broadcast()
  }, 100)
}
function logServiceEvent(event: string): void {
  serviceLog.push({ ts: Date.now(), event })
}

function groupLines(lines: string[], n: number): string[] {
  if (n <= 1) return lines
  const result: string[] = []
  for (let i = 0; i < lines.length; i += n) {
    result.push(lines.slice(i, i + n).join('\n'))
  }
  return result
}

function getLocalIp(): string {
  const ifaces = os.networkInterfaces()
  for (const addrs of Object.values(ifaces)) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address
    }
  }
  return '127.0.0.1'
}

function restoreRecovery(): void {
  const recovered = readRecovery()
  if (recovered) {
    const m = recovered.mode as Mode
    state.mode = (m === 'countdown' ? 'lyrics' : m) ?? 'lyrics'
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
    background: liveSong.background ?? null,
    bgFit: liveBgFit,
    liveServiceItemId,
    fontScale: liveFontScale,
    stageMessage: liveStageMessage,
    ts: Date.now(),
    hmsLoadedAt,
    autoAdvanceMs,
    theme: currentTheme,
    verseNumber,
    songAuthor: liveSongMeta.author,
    songCopyright: liveSongMeta.copyright,
    songCcli: liveSongMeta.ccli,
    ccliLicense,
    slideTheme: liveSlideTheme,
    slideThemeColors: liveSlideThemeColors
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

function tabletBroadcast(statePayload?: LiveState): void {
  if (tabletClients.size === 0) return
  const payload = JSON.stringify({
    type: 'state',
    state: statePayload ?? renderState(),
    notes: liveItemNotes,
    items: activeServiceItems.map((it) => ({ id: it.id, type: it.type, title: it.title }))
  })
  for (const client of tabletClients) {
    if ((client as WsSocket).readyState === 1) (client as WsSocket).send(payload)
  }
}

// Derive the current scene context from live state, then switch OBS if it changed.
function maybeAutoSwitchScene(): void {
  if (!obsAutoSwitch || !getObsStatus().connected) return
  // Don't switch while operator has blanked the screen.
  if (state.mode === 'black' || state.mode === 'logo') return
  let ctx: SceneContext
  if (state.mode === 'countdown') ctx = 'countdown'
  else {
    const item = liveServiceItemId != null
      ? activeServiceItems.find((it) => it.id === liveServiceItemId)
      : undefined
    ctx = item?.type === 'song' ? 'worship' : 'word'
  }
  const scene = obsSceneMap[ctx]
  if (scene && scene !== lastAutoScene) {
    lastAutoScene = scene
    void obsSetScene(scene)
  }
}

function broadcast(): void {
  const payload = renderState()
  for (const w of [operatorWin, stageWin, ...outputWins.values()]) {
    if (w && !w.isDestroyed()) w.webContents.send('wf:state', payload)
  }
  writeRecovery({ mode: state.mode, index: state.index })
  tabletBroadcast(payload)
  maybeAutoSwitchScene()
}

// Can this service item be sent live? (mirrors the renderer's canGoLive)
function itemCanGoLive(item: ServiceItem): boolean {
  return (
    (item.type === 'song' && item.ref_id != null) ||
    (item.type === 'scripture' && !!(item.payload.reference as string)) ||
    (item.type === 'text' && !!((item.payload.title as string) || (item.payload.body as string))) ||
    (item.type === 'countdown' && (item.payload.seconds as number) > 0) ||
    (item.type === 'image' && !!(item.payload.path as string)) ||
    (item.type === 'welcome' && (item.payload.seconds as number) > 0) ||
    (item.type === 'ticker' && !!(item.payload.text as string))
  )
}

// Find the next/previous go-live service item relative to the current one.
function adjacentLiveItem(dir: 1 | -1): ServiceItem | undefined {
  if (liveServiceItemId == null || activeServiceItems.length === 0) return undefined
  const idx = activeServiceItems.findIndex((it) => it.id === liveServiceItemId)
  if (idx < 0) return undefined
  const rest = dir === 1
    ? activeServiceItems.slice(idx + 1)
    : activeServiceItems.slice(0, idx).reverse()
  return rest.find(itemCanGoLive)
}

// --- Extracted intent processing (used by both IPC and WebSocket) ---
function processIntent(type: Intent): void {
  clearAutoAdvance()  // User action cancels auto-advance
  const last = liveSong.lines.length - 1
  if (type === 'next') {
    if (state.mode === 'countdown') {
      // A live countdown/welcome is a single view — Next moves to the next item.
      const nextItem = adjacentLiveItem(1)
      if (nextItem) { void handleTabletLoadItem(nextItem.id); return }
      clearCountdown(); state.mode = 'lyrics'
    } else if (state.mode !== 'lyrics') {
      // Black/logo were operator-blanked — Next un-blanks back to the slide.
      clearCountdown(); state.mode = 'lyrics'
    } else if (state.index < last) {
      state.index++; logServiceEvent(`next: ${state.index}/${last}`)
    } else {
      // At the last slide of this item — advance to the next service item.
      const nextItem = adjacentLiveItem(1)
      if (nextItem) { void handleTabletLoadItem(nextItem.id); return }
    }
  } else if (type === 'prev') {
    if (state.mode !== 'lyrics') { clearCountdown(); state.mode = 'lyrics' }
    else if (state.index > 0) { state.index--; logServiceEvent(`prev: ${state.index}/${last}`) }
    else {
      // At the first slide — step back to the previous service item.
      const prevItem = adjacentLiveItem(-1)
      if (prevItem) { void handleTabletLoadItem(prevItem.id); return }
    }
  } else if (type === 'black') { clearCountdown(); state.mode = 'black'; logServiceEvent('black') }
  else if (type === 'logo') { clearCountdown(); state.mode = 'logo'; logServiceEvent('logo') }
  else if (type === 'lyrics') { clearCountdown(); state.mode = 'lyrics'; logServiceEvent('lyrics') }
  broadcast()
}

// --- Extracted load functions (used by IPC handlers and tablet loadItem) ---
function doLoadText(title: string, body: string, background: string | null = null): void {
  clearCountdown()
  liveSongId = null
  liveScriptureRef = null
  clearSongMeta()
  liveBgFit = 'cover'
  const lines: string[] = []
  if (title) lines.push(title)
  body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).forEach((b) => lines.push(b))
  liveSong = { title: title || 'Announcement', lines: lines.length ? lines : [title], background }
  state.mode = 'lyrics'
  state.index = 0
}

function doLoadCountdown(seconds: number): void {
  clearCountdown()
  liveSongId = null
  liveScriptureRef = null
  clearSongMeta()
  liveBgFit = 'cover'
  const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  let remaining = seconds
  liveSong = { title: 'Countdown', lines: [fmt(remaining)], background: null }
  state.mode = 'countdown' as Mode
  state.index = 0
  countdownTimer = setInterval(() => {
    remaining--
    if (remaining <= 0) {
      clearCountdown()
      liveSong = { title: 'Countdown', lines: ['0:00'], background: null }
      state.mode = 'black'
      broadcast()
      return
    }
    liveSong = { title: 'Countdown', lines: [fmt(remaining)], background: null }
    broadcast()
  }, 1000)
}

// Fetch a non-KJV translation from the free bible-api.com (no key). Falls back
// to bundled offline KJV if there's no internet or the lookup fails.
async function fetchScripture(reference: string, translation: BibleTranslation): Promise<ScriptureResult> {
  try {
    const url = `https://bible-api.com/${encodeURIComponent(reference)}?translation=${translation}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { reference?: string; verses?: { verse: number; text: string }[] }
    if (!data.verses || data.verses.length === 0) throw new Error('no verses')
    return {
      ok: true,
      reference: data.reference ?? reference,
      verses: data.verses.map((v) => ({ n: v.verse, text: v.text.replace(/\s+/g, ' ').trim() }))
    }
  } catch (err) {
    console.error('[scripture] online fetch failed, falling back to KJV:', err)
    return lookupScripture(reference)
  }
}

async function doLoadScripture(reference: string): Promise<void> {
  clearCountdown()
  liveSongId = null
  liveScriptureRef = reference
  clearSongMeta()
  liveBgFit = 'cover'
  const result = bibleTranslation === 'kjv'
    ? lookupScripture(reference)
    : await fetchScripture(reference, bibleTranslation)
  if (!result.ok || !result.verses) return
  const lines =
    result.verses.length === 1
      ? [result.verses[0].text]
      : result.verses.map((v) => `${v.n}  ${v.text}`)
  liveSong = { title: result.reference!, lines, background: null }
  state.mode = 'lyrics'
  state.index = 0
}

// Order a song's sections (honoring arrangement) and group into slide lines.
function songLines(full: SongFull): string[] {
  const sorted = [...full.sections].sort((a, b) => a.ordinal - b.ordinal)
  const ordered = full.arrangement && full.arrangement.length > 0
    ? full.arrangement.map((i) => sorted[i]).filter(Boolean)
    : sorted
  const rawLines: string[] = []
  for (const section of ordered) {
    for (const raw of section.lyrics.split('\n')) {
      const line = raw.trim()
      if (line) rawLines.push(line)
    }
  }
  return groupLines(rawLines, full.linesPerSlide ?? 2)
}

async function doLoadSong(id: number): Promise<void> {
  clearCountdown()
  clearAutoAdvance()
  const full = await getSong(id)
  if (!full) return
  liveSongId = id
  liveScriptureRef = null
  liveBgFit = 'cover'
  liveSong = { title: full.title, lines: songLines(full), background: full.background ?? null }
  liveFontScale = full.fontScale ?? 6
  liveSongMeta = { author: full.author, copyright: full.copyright, ccli: full.ccli }
  hmsLoadedAt = Date.now()  // Start hymn timer
  verseNumber = 1
  state.mode = 'lyrics'
  state.index = 0
  logServiceEvent(`load-song: ${full.title}`)
  // Record CCLI usage once per service (reset when the active service changes).
  if (!loggedSongIds.has(id)) {
    loggedSongIds.add(id)
    recordSongUsage({ songId: id, title: full.title, author: full.author, ccli: full.ccli, copyright: full.copyright })
  }
}

// Pure: the slides an item would show, without going live (for the slide grid).
async function computeItemSlides(item: ServiceItem): Promise<string[]> {
  if (item.type === 'song' && item.ref_id != null) {
    const full = await getSong(item.ref_id)
    return full ? songLines(full) : []
  }
  if (item.type === 'scripture') {
    const ref = item.payload.reference as string
    if (!ref) return []
    const result = bibleTranslation === 'kjv' ? lookupScripture(ref) : await fetchScripture(ref, bibleTranslation)
    if (!result.ok || !result.verses) return []
    return result.verses.length === 1 ? [result.verses[0].text] : result.verses.map((v) => `${v.n}  ${v.text}`)
  }
  if (item.type === 'text' || item.type === 'ticker') {
    const title = (item.payload.title as string) ?? ''
    const body = (item.payload.body as string) ?? (item.payload.text as string) ?? ''
    const lines: string[] = []
    if (title) lines.push(title)
    body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).forEach((b) => lines.push(b))
    return lines.length ? lines : (title ? [title] : [])
  }
  if (item.type === 'countdown' || item.type === 'welcome') {
    const secs = (item.payload.seconds as number) ?? 0
    return [`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`]
  }
  if (item.type === 'image') return ['🖼']
  return []
}

// Clear CCLI song metadata when a non-song goes live.
function clearSongMeta(): void {
  liveSongMeta = { author: null, copyright: null, ccli: null }
}

// Effective projector theme = the live item's override, else the service baseline.
function applyItemTheme(item: ServiceItem | undefined): void {
  if (item?.style?.theme) {
    liveSlideTheme = item.style.theme
    liveSlideThemeColors = item.style.colors ?? null
  } else {
    liveSlideTheme = serviceSlideTheme
    liveSlideThemeColors = serviceSlideThemeColors
  }
}

function doLoadMedia(filePath: string, title: string): void {
  clearCountdown()
  liveSongId = null
  liveScriptureRef = null
  clearSongMeta()
  liveBgFit = 'contain'  // a whole-slide image — fit it entirely on screen
  liveSong = { title: title || 'Media', lines: [''], background: filePath }
  state.mode = 'lyrics'
  state.index = 0
}

// Load any service item to live (used by tablet loadItem messages).
async function handleTabletLoadItem(itemId: number): Promise<void> {
  const item = activeServiceItems.find((it) => it.id === itemId)
  if (!item) return
  if (item.type === 'song' && item.ref_id != null) {
    await doLoadSong(item.ref_id)
  } else if (item.type === 'scripture') {
    const ref = item.payload.reference as string
    if (!ref) return
    await doLoadScripture(ref)
  } else if (item.type === 'text') {
    doLoadText(
      (item.payload.title as string) ?? '',
      (item.payload.body as string) ?? '',
      (item.payload.background as string) ?? null
    )
  } else if (item.type === 'countdown') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return
    doLoadCountdown(secs)
  } else if (item.type === 'image') {
    const p = item.payload.path as string
    if (!p) return
    doLoadMedia(p, item.title)
  } else if (item.type === 'welcome') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return
    doLoadCountdown(secs)
  } else if (item.type === 'ticker') {
    const txt = item.payload.text as string
    if (!txt) return
    doLoadText('Announcement', txt)
  } else {
    return
  }
  liveServiceItemId = item.id
  liveItemNotes = item.notes ?? null
  applyItemTheme(item)
  broadcast()
}

// --- Tablet HTTP + WebSocket server ---
function startTabletServer(): void {
  const server = createServer((req, res) => {
    const isObs = (req.url ?? '').split('?')[0].replace(/\/+$/, '') === '/obs'
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    })
    res.end(isObs ? OBS_HTML : TABLET_HTML)
  })

  const wss = new WebSocketServer({ server })

  wss.on('connection', (ws: WsSocket) => {
    tabletClients.add(ws)
    // Send current state immediately on connect.
    ws.send(JSON.stringify({
      type: 'state',
      state: renderState(),
      notes: liveItemNotes,
      items: activeServiceItems.map((it) => ({ id: it.id, type: it.type, title: it.title }))
    }))

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string; intent?: string; itemId?: number }
        if (msg.type === 'intent' && msg.intent) {
          processIntent(msg.intent as Intent)
        } else if (msg.type === 'loadItem' && msg.itemId != null) {
          void handleTabletLoadItem(msg.itemId)
        } else if (msg.type === 'clearStageMessage') {
          // Pastor tapped "Got it" — clear the message everywhere.
          liveStageMessage = null
          broadcast()
        }
      } catch { /* ignore malformed messages */ }
    })

    ws.on('close', () => tabletClients.delete(ws))
    ws.on('error', () => tabletClients.delete(ws))
  })

  server.listen(TABLET_PORT, () => {
    console.log(`[tablet] server: http://${getLocalIp()}:${TABLET_PORT}`)
  })
}

function createStageWindow(): void {
  if (stageWin && !stageWin.isDestroyed()) { stageWin.focus(); return }
  const primary = screen.getPrimaryDisplay()
  const externals = screen.getAllDisplays().filter((d) => d.id !== primary.id)
  const target = externals.length > 1 ? externals[externals.length - 1] : null
  stageWin = new BrowserWindow({
    x: target ? target.bounds.x : primary.bounds.x + 80,
    y: target ? target.bounds.y : primary.bounds.y + 80,
    width: target ? target.bounds.width : 960,
    height: target ? target.bounds.height : 540,
    frame: !target,
    fullscreen: !!target,
    title: 'WorshipFlow — Stage',
    backgroundColor: '#060912',
    autoHideMenuBar: true,
    webPreferences: { preload: PRELOAD, sandbox: false }
  })
  stageWin.webContents.on('did-finish-load', () => {
    if (stageWin && !stageWin.isDestroyed()) stageWin.webContents.send('wf:state', renderState())
  })
  stageWin.on('closed', () => { stageWin = null })
  loadRoute(stageWin, '/stage')
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
  operatorWin.on('closed', () => { operatorWin = null })
  loadRoute(operatorWin, '/')
}

interface OutputOpts {
  x: number; y: number; width: number; height: number
  fullscreen: boolean; alwaysOnTop?: boolean; id: number
}

function createOutput(label: string, opts: OutputOpts): void {
  const win = new BrowserWindow({
    x: opts.x, y: opts.y, width: opts.width, height: opts.height,
    frame: false, fullscreen: opts.fullscreen,
    alwaysOnTop: opts.alwaysOnTop ?? false,
    backgroundColor: '#000000',
    title: `WorshipFlow Output ${opts.id}`,
    webPreferences: { preload: PRELOAD, sandbox: false }
  })
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
    const wa = primary.workArea
    const cell = Math.floor(wa.width / sim)
    const h = Math.round((cell * 9) / 16)
    for (let i = 0; i < sim; i++) {
      createOutput('sim' + i, {
        x: wa.x + i * cell, y: wa.y, width: cell, height: h,
        fullscreen: false, alwaysOnTop: true, id: i + 1
      })
    }
    return
  }

  const externals = screen.getAllDisplays().filter((d) => d.id !== primary.id)
  if (externals.length === 0) {
    createOutput('main', {
      x: primary.bounds.x + 120, y: primary.bounds.y + 120,
      width: 960, height: 540, fullscreen: false, id: 1
    })
  } else {
    externals.forEach((d, i) =>
      createOutput('ext' + d.id, {
        x: d.bounds.x, y: d.bounds.y,
        width: d.bounds.width, height: d.bounds.height,
        fullscreen: true, id: i + 1
      })
    )
  }
}

// --- IPC: intents ---
ipcMain.on('wf:intent', (_e, type: Intent) => processIntent(type))

ipcMain.handle('wf:getInfo', (): AppInfo => ({
  song: liveSong,
  state: renderState(),
  displays: describeDisplays(),
  outputs: outputWins.size,
  startupMs: Date.now() - startTime
}))

// --- Live engine ---
ipcMain.handle('wf:live:loadText', (_e, title: string, body: string, background?: string | null) => {
  doLoadText(title, body, background ?? null); broadcast()
})

ipcMain.handle('wf:live:loadCountdown', (_e, seconds: number) => {
  doLoadCountdown(seconds); broadcast()
})

ipcMain.handle('wf:live:loadScripture', async (_e, reference: string) => {
  await doLoadScripture(reference); broadcast()
})

ipcMain.handle('wf:live:loadSong', async (_e, id: number) => {
  await doLoadSong(id); broadcast()
})

ipcMain.handle('wf:live:loadMedia', (_e, filePath: string, title: string) => {
  doLoadMedia(filePath, title); broadcast()
})

ipcMain.handle('wf:getState', (): LiveState => renderState())

ipcMain.handle('wf:stage:open', () => { createStageWindow() })

ipcMain.handle('wf:live:setItemId', (_e, id: number | null) => {
  liveServiceItemId = id
  const item = id != null ? activeServiceItems.find((it) => it.id === id) : undefined
  liveItemNotes = item?.notes ?? null
  applyItemTheme(item)
  broadcast()
})

ipcMain.handle('wf:live:setFontScale', (_e, scale: number) => {
  liveFontScale = Math.min(14, Math.max(3, scale))
  broadcast()
})

ipcMain.handle('wf:live:saveFontScale', () => {
  if (liveSongId == null) return
  setSongFontScale(liveSongId, liveFontScale)
})

ipcMain.handle('wf:live:setStageMessage', (_e, msg: string | null) => {
  liveStageMessage = msg || null
  broadcast()
})

// --- CCLI IPCs ---
ipcMain.handle('wf:ccli:getLicense', () => ccliLicense)
ipcMain.handle('wf:ccli:setLicense', (_e, license: string | null) => {
  ccliLicense = (license && license.trim()) || null
  setSetting('ccli_license', ccliLicense)
  broadcast()  // push the new license to the output footer
})
ipcMain.handle('wf:ccli:listUsage', () => listSongUsage())
ipcMain.handle('wf:ccli:clearUsage', () => clearSongUsage())

// --- Tablet IPCs ---
ipcMain.handle('wf:getTabletUrl', () => `http://${getLocalIp()}:${TABLET_PORT}`)

ipcMain.handle('wf:setActiveService', (_e, serviceId: number | null) => {
  loggedSongIds.clear()  // new/switched service → start CCLI counting fresh
  if (serviceId == null) {
    activeServiceItems = []
    liveItemNotes = null
    return
  }
  const svc = getService(serviceId)
  activeServiceItems = (svc as { items: ServiceItem[] } | null)?.items ?? []
  serviceSlideTheme = (svc as { theme?: string | null } | null)?.theme || DEFAULT_THEME_ID
  serviceSlideThemeColors = (svc as { themeColors?: ThemeColors | null } | null)?.themeColors ?? null
  if (liveServiceItemId != null) {
    const item = activeServiceItems.find((it) => it.id === liveServiceItemId)
    liveItemNotes = item?.notes ?? null
  }
  applyItemTheme(activeServiceItems.find((it) => it.id === liveServiceItemId))
  broadcast()  // projector needs the new theme, not just the tablet
})

ipcMain.handle('wf:service:setTheme', (_e, serviceId: number, themeId: string | null, colors: ThemeColors | null) => {
  setServiceTheme(serviceId, themeId, colors)
  // Update the baseline and re-resolve the live item (its override still wins).
  serviceSlideTheme = themeId || DEFAULT_THEME_ID
  serviceSlideThemeColors = colors
  applyItemTheme(activeServiceItems.find((it) => it.id === liveServiceItemId))
  broadcast()
})

// --- OBS IPCs ---
// Forward OBS status changes to the operator window.
onObsStatus((s) => {
  if (operatorWin && !operatorWin.isDestroyed()) operatorWin.webContents.send('wf:obs:status', s)
})

ipcMain.handle('wf:getObsUrl', () => `http://${getLocalIp()}:${TABLET_PORT}/obs`)
ipcMain.handle('wf:obs:getStatus', () => getObsStatus())
ipcMain.handle('wf:obs:connect', (_e, host: string, port: number, password: string) =>
  connectObs(host, port, password))
ipcMain.handle('wf:obs:disconnect', () => disconnectObs())
ipcMain.handle('wf:obs:startStream', () => obsStartStream())
ipcMain.handle('wf:obs:stopStream', () => obsStopStream())
ipcMain.handle('wf:obs:startRecord', () => obsStartRecord())
ipcMain.handle('wf:obs:stopRecord', () => obsStopRecord())
ipcMain.handle('wf:obs:setScene', (_e, sceneName: string) => {
  lastAutoScene = sceneName  // manual switch updates the baseline so auto-switch won't fight it
  return obsSetScene(sceneName)
})
ipcMain.handle('wf:obs:setAutoSwitch', (_e, enabled: boolean, map: Record<SceneContext, string>) => {
  obsAutoSwitch = enabled
  if (map) obsSceneMap = map
  lastAutoScene = null  // re-evaluate on next broadcast
  if (enabled) maybeAutoSwitchScene()
})

// --- Feature IPCs ---
ipcMain.handle('wf:features:startAutoAdvance', (_e, durationMs: number, loop?: boolean) => {
  logServiceEvent(`auto-advance: ${durationMs}ms${loop ? ' (loop)' : ''}`)
  armAutoAdvance(durationMs, !!loop)
  broadcast()
})

ipcMain.handle('wf:features:stopAutoAdvance', () => {
  clearAutoAdvance()
  broadcast()
})

ipcMain.handle('wf:features:setTheme', (_e, theme: Theme) => {
  currentTheme = theme
  logServiceEvent(`theme: ${theme}`)
  broadcast()
})

ipcMain.handle('wf:features:setBibleTranslation', async (_e, trans: BibleTranslation) => {
  bibleTranslation = trans
  logServiceEvent(`bible-translation: ${trans}`)
  // If a scripture is currently live, reload it in the new translation.
  if (liveScriptureRef) {
    const ref = liveScriptureRef
    const keepIndex = state.index
    await doLoadScripture(ref)
    state.index = Math.min(keepIndex, liveSong.lines.length - 1)
    broadcast()
  }
})

ipcMain.handle('wf:features:setVerseNumber', (_e, v: number | null) => {
  verseNumber = v
  broadcast()
})

ipcMain.handle('wf:features:getServiceLog', () => serviceLog)

ipcMain.handle('wf:features:clearServiceLog', () => {
  serviceLog.length = 0
})

// --- Song library IPC ---
ipcMain.handle('wf:songs:list', (_e, search?: string) => listSongs(search ?? ''))
ipcMain.handle('wf:songs:get', (_e, id: number) => getSong(id))
ipcMain.handle('wf:songs:create', (_e, input: SongInput) => createSong(input))
ipcMain.handle('wf:songs:update', (_e, id: number, input: SongInput) => updateSong(id, input))
ipcMain.handle('wf:songs:delete', (_e, id: number) => deleteSong(id))
ipcMain.handle('wf:songs:setFontScale', (_e, id: number, scale: number) => setSongFontScale(id, scale))

// --- Service builder IPC ---
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
ipcMain.handle('wf:services:updateItemNotes', (_e, itemId: number, notes: string | null) =>
  updateServiceItemNotes(itemId, notes)
)
ipcMain.handle('wf:services:setItemStyle', (_e, itemId: number, style: ItemStyle | null) =>
  setServiceItemStyle(itemId, style)
)
ipcMain.handle('wf:services:setItemPayload', (_e, itemId: number, payload: Record<string, unknown>) =>
  setServiceItemPayload(itemId, payload)
)
ipcMain.handle('wf:services:reorder', (_e, serviceId: number, orderedIds: number[]) =>
  reorderServiceItems(serviceId, orderedIds)
)

ipcMain.handle('wf:services:export', async (_e, serviceId: number): Promise<{ canceled: boolean }> => {
  const svc = getService(serviceId)
  if (!svc) return { canceled: true }
  const itemsWithSongs = await Promise.all(
    svc.items.map(async (item) => {
      const song = item.type === 'song' && item.ref_id != null ? getSong(item.ref_id) : null
      return { ...item, song }
    })
  )
  const bundle = { version: 1, name: svc.name, service_date: svc.service_date, theme: svc.theme, themeColors: svc.themeColors, items: itemsWithSongs }
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Export Service',
    defaultPath: `${svc.name.replace(/[/\\?%*:|"<>]/g, '-')}.wfservice`,
    filters: [{ name: 'WorshipFlow Service', extensions: ['wfservice'] }]
  })
  if (canceled || !filePath) return { canceled: true }
  writeFileSync(filePath, JSON.stringify(bundle, null, 2), 'utf-8')
  return { canceled: false }
})

ipcMain.handle('wf:services:import', async (): Promise<{ canceled: boolean; serviceId: number | null }> => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: 'Import Service',
    filters: [{ name: 'WorshipFlow Service', extensions: ['wfservice'] }],
    properties: ['openFile']
  })
  if (canceled || filePaths.length === 0) return { canceled: true, serviceId: null }
  const bundle = JSON.parse(readFileSync(filePaths[0], 'utf-8')) as {
    version: number
    name: string
    service_date: string | null
    theme: string | null
    themeColors: ThemeColors | null
    items: Array<(ServiceFull['items'][number]) & { song: SongFull | null }>
  }
  const serviceId = createService(bundle.name, bundle.service_date ?? undefined)
  if (bundle.theme) setServiceTheme(serviceId, bundle.theme, bundle.themeColors ?? null)
  for (const item of bundle.items) {
    let ref_id: number | null = null
    if (item.type === 'song' && item.song) {
      const existing = listSongs(item.song.title).find((s) => s.title === item.song!.title)
      ref_id = existing ? existing.id : createSong({
        title: item.song.title,
        author: item.song.author ?? undefined,
        ccli: item.song.ccli ?? undefined,
        copyright: item.song.copyright ?? undefined,
        publisher: item.song.publisher ?? undefined,
        background: item.song.background,
        sections: item.song.sections,
        arrangement: item.song.arrangement ?? undefined,
        fontScale: item.song.fontScale ?? undefined,
        linesPerSlide: item.song.linesPerSlide ?? undefined,
      })
    }
    const itemId = addServiceItem(serviceId, { type: item.type, ref_id, payload: item.payload })
    if (item.notes) updateServiceItemNotes(itemId, item.notes)
    if (item.style) setServiceItemStyle(itemId, item.style)
  }
  return { canceled: false, serviceId }
})
ipcMain.handle('wf:service:slides', async (_e, serviceId: number): Promise<{ id: number; slides: string[] }[]> => {
  const svc = getService(serviceId)
  if (!svc) return []
  const out: { id: number; slides: string[] }[] = []
  for (const item of svc.items) {
    if (itemCanGoLive(item)) out.push({ id: item.id, slides: await computeItemSlides(item) })
  }
  return out
})
ipcMain.handle('wf:live:goLiveAt', async (_e, itemId: number, slideIndex: number) => {
  await handleTabletLoadItem(itemId)  // loads the item live (index 0) + broadcasts + resolves theme
  const last = liveSong.lines.length - 1
  state.index = Math.max(0, Math.min(slideIndex, last < 0 ? 0 : last))
  broadcast()
})

// --- Scripture IPC ---
ipcMain.handle('wf:scripture:lookup', (_e, reference: string) => lookupScripture(reference))

// --- Song background / file dialog ---
ipcMain.handle('wf:songs:setBackground', (_e, id: number, path: string | null) =>
  setSongBackground(id, path)
)
ipcMain.handle('wf:dialog:openFile', async () => {
  const opts = {
    title: 'Choose media file',
    filters: [
      { name: 'Video', extensions: ['mp4', 'webm', 'mov'] },
      { name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }
    ],
    properties: ['openFile'] as ['openFile']
  }
  return operatorWin
    ? await dialog.showOpenDialog(operatorWin, opts)
    : await dialog.showOpenDialog(opts)
})

// Pick one or more .pptx files and parse them into song previews (not yet saved).
ipcMain.handle('wf:songs:importPptx', async (): Promise<ParsedPptxSong[]> => {
  const opts = {
    title: 'Choose PowerPoint song files',
    filters: [{ name: 'PowerPoint', extensions: ['pptx', 'pptm'] }],
    properties: ['openFile', 'multiSelections'] as ['openFile', 'multiSelections']
  }
  const result = operatorWin
    ? await dialog.showOpenDialog(operatorWin, opts)
    : await dialog.showOpenDialog(opts)
  if (result.canceled || result.filePaths.length === 0) return []
  const songs: ParsedPptxSong[] = []
  for (const fp of result.filePaths) {
    try {
      const buf = readFileSync(fp)
      songs.push(await parsePptx(fp, buf))
    } catch (err) {
      console.error('[pptx] failed to parse', fp, err)
    }
  }
  return songs
})

// Natural sort so Slide2 comes before Slide10.
function naturalCompare(a: string, b: string): number {
  return basename(a).localeCompare(basename(b), undefined, { numeric: true, sensitivity: 'base' })
}

// Builder 1: pick exported slide images → create a service of full-screen image slides.
ipcMain.handle('wf:service:importImages', async (): Promise<{ id: number; name: string; count: number } | null> => {
  const opts = {
    title: 'Choose slide images (exported from PowerPoint)',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
    properties: ['openFile', 'multiSelections'] as ['openFile', 'multiSelections']
  }
  const result = operatorWin
    ? await dialog.showOpenDialog(operatorWin, opts)
    : await dialog.showOpenDialog(opts)
  if (result.canceled || result.filePaths.length === 0) return null
  const files = [...result.filePaths].sort(naturalCompare)
  const name = basename(dirname(files[0])) || 'Imported Service'
  const id = createService(name)
  for (const f of files) addServiceItem(id, { type: 'image', payload: { path: f } })
  return { id, name, count: files.length }
})

// Builder 2: pick a .pptx → create an editable service (text + extracted backgrounds).
ipcMain.handle('wf:service:importPptx', async (): Promise<{ id: number; name: string; count: number } | null> => {
  const opts = {
    title: 'Choose a PowerPoint service file',
    filters: [{ name: 'PowerPoint', extensions: ['pptx', 'pptm'] }],
    properties: ['openFile'] as ['openFile']
  }
  const result = operatorWin
    ? await dialog.showOpenDialog(operatorWin, opts)
    : await dialog.showOpenDialog(opts)
  if (result.canceled || result.filePaths.length === 0) return null
  const fp = result.filePaths[0]
  const name = basename(fp).replace(/\.ppt[xm]?$/i, '').replace(/[_]+/g, ' ').trim() || 'Imported Service'
  const mediaDir = join(app.getPath('userData'), 'imported-media')
  const slides = await parsePptxService(readFileSync(fp), mediaDir, Date.now())
  const id = createService(name)
  for (const slide of slides) {
    if (slide.text) {
      addServiceItem(id, { type: 'text', payload: { title: '', body: slide.text, background: slide.background } })
    } else if (slide.background) {
      addServiceItem(id, { type: 'image', payload: { path: slide.background } })
    }
  }
  return { id, name, count: slides.length }
})

app.whenReady().then(async () => {
  protocol.handle('wf-asset', (request) => {
    const url = new URL(request.url)
    const filePath = url.searchParams.get('path') ?? ''
    const fileUrl = 'file:///' + filePath.replace(/\\/g, '/')
    const headers: Record<string, string> = {}
    const range = request.headers.get('range')
    if (range) headers['range'] = range
    return net.fetch(fileUrl, { headers })
  })

  await initDb()
  ccliLicense = getSetting('ccli_license')
  restoreRecovery()
  startTabletServer()
  createOperator()
  layoutOutputs()
  broadcast()
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
