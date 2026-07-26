import { app, shell, BrowserWindow, screen, ipcMain, dialog, protocol, net } from 'electron'
import { registerSoundCheckHandlers } from './sound-check/sound-check-ipc'
import { SoundCheckState } from './sound-check/sound-check-state'
import { join, basename, dirname, resolve, relative, isAbsolute } from 'path'
import { randomUUID } from 'crypto'
import { createServer } from 'http'
import { readFileSync, writeFileSync, statSync, createReadStream, existsSync, realpathSync, copyFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import os from 'os'
import { WebSocketServer } from 'ws'
import type { WebSocket as WsSocket } from 'ws'
import type { Intent, LiveState, DisplayInfo, AppInfo, Mode, SongInput, SongFull, NewServiceItem, ServiceItem, ServiceFull, Theme, SceneContext, BibleTranslation, ScriptureResult, ParsedPptxSong, ThemeColors, ItemStyle, ZoneId, ZoneMode, ZoneState, ZoneRouting, TrackId, AnnouncementInput } from '../shared/types'
import { DEFAULT_ZONE_TRACK } from '../shared/types'
import { parseSceneConfig, validateSceneConfig, defaultRoutingFor } from '../shared/zoneScenes'
import type { SceneConfig } from '../shared/zoneScenes'
import { parseZoneTrackAssignment, validateZoneTrackAssignment } from '../shared/zoneTrack'
import type { ZoneTrackAssignment } from '../shared/zoneTrack'
import { parseZoneSlides, resolveSlot, slideSummary } from '../shared/zoneSlides'
import type { ZoneSlide, ZoneSlot } from '../shared/zoneSlides'
import { validateZonePins } from '../shared/zonePins'
import type { ZonePin, ZonePins } from '../shared/zonePins'
import { DEFAULT_THEME_ID, getTheme, resolveColors } from '../shared/themes'
import { DEMO_SONG } from './demoSong'
import { readRecovery, writeRecovery } from './recovery'
import {
  initDb,
  onPersistError,
  listSongs,
  getSong,
  createSong,
  updateSong,
  deleteSong,
  listAnnouncements,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  listScheduledAnnouncements,
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
  reorderServiceItems,
  getItemZoneRouting,
  setItemZoneRouting,
  getItemZoneSlides,
  setItemZoneSlides,
  getZoneTrackAssignment,
  setZoneTrackAssignment,
  setSongBgMotion,
  setSongTextColor,
  setSongFont,
  setSongBlurBehindText,
  listServiceTemplates,
  saveServiceTemplate,
  deleteServiceTemplate,
  getBackgroundTags,
  setBackgroundTags,
  searchBackgroundsByTags,
  createRecording,
  addRecordingMarker,
  finalizeRecording,
  listRecordingMarkers,
  listRecordings,
  closeDanglingRecordings,
  getRecording,
  setRecordingRender,
  setRecordingAi
} from './db'
import { listBackgrounds, copyBackground, deleteBackground, openBackgroundsFolder } from './backgroundLib'
import { generateBackgroundImage } from './replicateApi'
import { generatePollinationsImage } from './pollinationsApi'
import { lookupScripture } from './scripture'
import { autoDeckFor } from './autoDeck'
import { TABLET_PORT, tabletHtml } from './tabletHtml'
import { OBS_HTML } from './obsHtml'
import { ZONE_HTML } from './zoneHtml'
import { MULTIVIEW_HTML } from './multiviewHtml'
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
  obsSetScene,
  initObsAutoConnect
} from './obs'
import { logInfo, logWarn, logError, getRecentLogLines, getLogsDir } from './logger'
import { createRecordingSession } from './recording'
import ffmpegStatic from 'ffmpeg-static'
import { createRenderer } from './render'
import { createContentRunner } from './content'

export { TABLET_PORT }

// Persistent diagnostics log: catch anything that would otherwise only hit the
// (invisible during a live service) console, so it's retrievable afterward.
process.on('uncaughtException', (err) => {
  logError('[process] uncaughtException', err)
})
process.on('unhandledRejection', (reason) => {
  logError('[process] unhandledRejection', reason)
})

const PRELOAD = join(__dirname, '../preload/index.js')
const startTime = Date.now()

// The product is branded "WorshipFlow Pro" (package.json productName + window titles),
// but the Electron userData folder MUST stay "worshipflow" — that's where the existing
// songs/services database, settings, and media already live. Electron derives userData
// from the app name, so without pinning it here the rename would silently repoint to a
// fresh "WorshipFlow Pro" folder and orphan all existing data. Runs at module load,
// before whenReady and before any getPath('userData') use.
app.setPath('userData', join(app.getPath('appData'), 'worshipflow'))

// Windows taskbar identity + icon. setAppUserModelId gives the app a stable identity so
// Windows groups/pins it as "WorshipFlow Pro" rather than a generic Electron entry. The
// per-window `icon` (below) is what actually shows in the taskbar and title bar; guard on
// existsSync so a missing build/icon.ico falls back to Electron's default instead of erroring.
app.setAppUserModelId('com.snowhillchurch.worshipflow-pro')
const iconFile = join(app.getAppPath(), 'build', 'icon.ico')
const APP_ICON = existsSync(iconFile) ? iconFile : undefined

// Helper to safely resolve a path and ensure it's within allowed media roots
function validateMediaPath(requestedPath: string): string | null {
  const allowedRoots = [
    join(app.getPath('userData'), 'backgrounds'),
    join(app.getPath('userData'), 'imported-media'),
    join(app.getPath('userData'), 'generated'),
  ]

  try {
    const resolved = resolve(requestedPath)
    // Resolve to real path (follow symlinks, get canonical path)
    const realPath = realpathSync(resolved)

    // The church logo image and logo motion background are explicitly chosen by the
    // user via Settings and can live anywhere they picked them (Downloads, a mapped
    // drive, etc.). Allow those exact configured files regardless of folder.
    for (const configured of [logoPath, logoBg]) {
      if (!configured) continue
      try {
        if (realpathSync(resolve(configured)) === realPath) return realPath
      } catch { /* configured file missing — fall through */ }
    }

    // Check if REAL path is within any allowed root
    for (const root of allowedRoots) {
      const rel = relative(root, realPath)
      // relative() returns ".." prefix if outside the root. On Windows, relative()
      // between paths on different drives (or a UNC path) returns an ABSOLUTE path
      // instead of a ".."-prefixed one, since there's no relative form across drives —
      // reject that case too, or it would incorrectly pass containment.
      if (!rel.startsWith('..') && !isAbsolute(rel) && existsSync(realPath)) {
        return realPath
      }
    }

    return null // path is outside allowed roots or doesn't exist
  } catch (err) {
    console.error('Invalid path:', requestedPath, err)
    return null
  }
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'wf-asset', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true } }
])

let operatorWin: BrowserWindow | null = null
let stageWin: BrowserWindow | null = null
let multiviewWin: BrowserWindow | null = null
const outputWins = new Map<string, BrowserWindow>()

// Without this, launching the app while a prior instance is still running (e.g.
// after an installer's "Launch now", a crash-relaunch, or a stray background
// copy) spawns a second process that silently fails to bind the zone/tablet
// WebSocket port (already held by the first) — the new window looks fine but
// the actual zone displays keep being served by the OLD, now-orphaned instance
// and never see anything the user does in the new one. Single-instance lock
// makes a second launch just focus the existing window instead.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  // app.quit() is async and does NOT stop this module from continuing to run —
  // the whenReady handler would still fire, open the DB, and persist() it back
  // over the live file (the data-loss incident). app.exit() terminates now, and
  // the whenReady body also guards on the lock as belt-and-suspenders.
  app.exit(0)
} else {
  app.on('second-instance', () => {
    if (operatorWin) {
      if (operatorWin.isMinimized()) operatorWin.restore()
      operatorWin.focus()
    }
  })
}

// Canonical live state — one LiveTrackState per track (Main always exists;
// Second is created eagerly too but stays empty/unused until a service has
// track:'second' items). See docs/superpowers/specs/2026-07-24-dual-live-track-design.md.
interface LiveTrackState {
  song: { title: string; lines: string[]; background?: string | null; bgMotion?: string | null }
  songId: number | null
  mode: Mode
  index: number
  serviceItemId: number | null
  fontScale: number
  songTextColor: string | null
  songFont: string | null
  blurBehindText: boolean
  bgFit: 'cover' | 'contain'
  stageMessage: string | null
  songMeta: { author: string | null; copyright: string | null; ccli: string | null }
  slideTheme: string
  slideThemeColors: ThemeColors | null
  itemNotes: string | null
  hmsLoadedAt: number | null
  autoAdvanceMs: number | null
  scriptureRef: string | null
  verseNumber: number | null
  countdownTimer: ReturnType<typeof setInterval> | null
  autoAdvanceTimer: ReturnType<typeof setInterval> | null
  autoAdvanceDuration: number
  autoAdvanceLoop: boolean
  // Bumped synchronously at the start of every load* function. Lets an async
  // loader (doLoadScripture's network fetch) detect, after its await resolves,
  // that something else has since loaded onto this track — so it can bail out
  // instead of clobbering newer live content. See doLoadScripture.
  loadGeneration: number
  // Set true by every load* function the first time real content (a service
  // item OR an ad-hoc Quick Scripture/Quick Countdown lookup) is loaded onto
  // this track — distinguishes "genuinely nothing loaded yet, still on the
  // pristine startup state" from "something's actually live here." Lets
  // computeZoneStates() show ad-hoc content (which has no service item, so
  // normal per-item zone routing can't find it) on zones assigned to this
  // track, instead of silently falling back to the idle Logo/Off default.
  hasLiveContent: boolean
  // An authored per-zone slide deck, when the live item has one — null means
  // "no deck, use normal per-item zone routing." Populated by loadDeckOnto,
  // which resolves it once at load time (never from computeZoneStates, which
  // must stay synchronous). t.index doubles as the deck cursor, so existing
  // next/prev/auto-advance code needs no deck-specific branch.
  deckSlides: ZoneSlide[] | null
  // The live item's OWN resolved source slides, for 'slide' slots (an index
  // into the item's normal content, not into the deck itself).
  deckSource: string[]
  // Pre-resolved scripture text for every deck slot of kind 'scripture', keyed
  // `${slideIndex}:${zoneId}`. Populated once at load time by loadDeckOnto —
  // computeZoneStates only ever reads this map, never triggers a lookup.
  deckScripture: Map<string, string>
}

function createTrackState(song: LiveTrackState['song']): LiveTrackState {
  return {
    song,
    songId: null,
    mode: 'lyrics',
    index: 0,
    serviceItemId: null,
    fontScale: 6,
    songTextColor: null,
    songFont: null,
    blurBehindText: false,
    bgFit: 'cover',
    stageMessage: null,
    songMeta: { author: null, copyright: null, ccli: null },
    slideTheme: DEFAULT_THEME_ID,
    slideThemeColors: null,
    itemNotes: null,
    hmsLoadedAt: null,
    autoAdvanceMs: null,
    scriptureRef: null,
    verseNumber: null,
    countdownTimer: null,
    autoAdvanceTimer: null,
    autoAdvanceDuration: 0,
    autoAdvanceLoop: false,
    loadGeneration: 0,
    hasLiveContent: false,
    deckSlides: null,
    deckSource: [],
    deckScripture: new Map()
  }
}

const tracks: Record<TrackId, LiveTrackState> = {
  main: createTrackState(DEMO_SONG),
  second: createTrackState({ title: '', lines: [], background: null })
}

// Zone pins: "this screen holds X until I unpin it." The operator's most recent,
// most explicit intent, so it sits at the TOP of the precedence chain:
//   pin > deck (t.deckSlides) > per-item zone_routing > scene typeDefault > idleDefault
// In-memory + mirrored into recovery.json by broadcast(); cleared on service switch.
const zonePins: Map<ZoneId, ZonePin> = new Map()
// Keys (`zoneId:itemId`) already warned about for a pin whose item has gone
// missing. computeZoneStates runs as often as 10×/second during auto-advance,
// so the warning has to be one-per-bad-pin, not one-per-broadcast. Cleared
// wherever zonePins is mutated, so a newly-set bad pin is still reported once.
const warnedMissingPins = new Set<string>()
let ccliLicense: string | null = null  // church CCLI license number (loaded from settings)
let logoPath: string | null = null     // church logo image path for logo zones
let logoBg: string | null = null       // motion background (video/image) for logo zones
const loggedSongIds = new Set<number>()  // songs already counted this service (CCLI: once per service)
let serviceSlideTheme: string = DEFAULT_THEME_ID  // service-level baseline
let serviceSlideThemeColors: ThemeColors | null = null
// Which track each zone follows for the active service; refreshed by
// refreshActiveServiceItems() and by wf:service:zoneTrackAssignment:set.
let activeZoneTrackAssignment: ZoneTrackAssignment = { ...DEFAULT_ZONE_TRACK }

// Tablet state — cached by wf:setActiveService so the WS server can serve them.
const tabletClients = new Set<WsSocket>()
// Server/heartbeat refs + the actually-bound port (may differ from TABLET_PORT if
// that port was taken and we fell back to the next one).
let tabletHttpServer: ReturnType<typeof createServer> | null = null
let tabletWss: WebSocketServer | null = null
let tabletHeartbeat: ReturnType<typeof setInterval> | null = null
let boundTabletPort = TABLET_PORT
let activeServiceItems: ServiceItem[] = []
let activeServiceId: number | null = null  // which service is currently active (for Volunteer mode to honor)
let activeServiceName = ''
let activeServiceDate: string | null = null

// --- Service recording (Phase 1: capture & markers) ---
// The session is driven by two live chokepoints: wf:live:setItemId (the explicit
// "Go Live" button) and handleTabletLoadItem (Next/Prev, the tablet remote, and
// slide-thumbnail clicks) — every item that goes live on the main track, via
// either path, starts the recording on the first call and stamps a marker on
// every call. The two paths never fire for the same transition (setItemId's
// callers don't route through handleTabletLoadItem and vice versa), so markers
// are never double-stamped. Recording stops via wf:setActiveService(null)/quit
// (stops + writes the sidecar). All side-effects are injected so recording.ts
// stays unit-testable. notifyOperator below is a hoisted function declaration,
// so it is safe to reference here at module load.
const recordingSession = createRecordingSession({
  now: () => Date.now(),
  appVersion: app.getVersion(),
  autoRecordEnabled: () => getSetting('autoRecord') !== 'off', // default ON
  obsConnected: () => getObsStatus().connected,
  obsRecording: () => getObsStatus().recording,
  obsRecordStartedMs: () => getObsStatus().recordStartedAt ?? Date.now(),
  startRecord: () => obsStartRecord(),
  stopRecord: () => obsStopRecord(),
  createRecording,
  addMarker: addRecordingMarker,
  finalizeRecording,
  listMarkers: listRecordingMarkers,
  writeSidecar: (videoPath, sidecar) => {
    const jsonPath = videoPath.replace(/\.[^.\\/]+$/, '') + '.worshipflow.json'
    try {
      writeFileSync(jsonPath, JSON.stringify(sidecar, null, 2), 'utf-8')
    } catch (err) {
      console.error('[recording] sidecar write failed', err)
      notifyOperator('Recording saved, but the marker sidecar could not be written.', 'warn')
    }
  },
  toast: (msg) => notifyOperator(msg, 'warn')
})

// --- Service recording (Phase 2: assembly / produce) ---
// ffmpeg-static resolves to a path inside app.asar when packaged; the binary is
// asarUnpack'd, so swap to the unpacked path (mirrors the sql.js wasm handling).
function resolveFfmpegPath(): string {
  const p = (ffmpegStatic as unknown as string) || 'ffmpeg'
  return p.replace('app.asar', 'app.asar.unpacked')
}

// operatorWin/notifyOperator are referenced lazily inside the deps closures (they
// run later, when a produce/progress event fires), so this ordering is safe.
const renderer = createRenderer({
  ffmpegPath: resolveFfmpegPath(),
  getRecording,
  listMarkers: listRecordingMarkers,
  setRenderState: (id, state, outputPath) => {
    setRecordingRender(id, state, outputPath)
    // Notify the panel of every transition so it can reflect rendering/done/failed
    // live (the produce IPC only resolves at the very end, so the UI can't rely on it).
    if (operatorWin && !operatorWin.isDestroyed()) {
      operatorWin.webContents.send('wf:recordings:renderState', { recordingId: id, state })
    }
  },
  getSetting,
  onProgress: (id, fraction) => {
    if (operatorWin && !operatorWin.isDestroyed()) {
      operatorWin.webContents.send('wf:recordings:renderProgress', { recordingId: id, fraction })
    }
  },
  toast: (message, level) => notifyOperator(message, level ?? 'info')
})

// Renders a 1280x720 thumbnail (background image + sermon title/speaker) via an
// offscreen window + capturePage — no native image dependency.
async function renderThumbnail(bgImagePath: string | null, title: string, speaker: string, outPath: string): Promise<void> {
  const win = new BrowserWindow({ width: 1280, height: 720, show: false, webPreferences: { offscreen: true } })
  try {
    const bg = bgImagePath ? `url("file:///${bgImagePath.replace(/\\/g, '/')}")` : 'linear-gradient(135deg,#0f172a,#334155)'
    const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;width:1280px;height:720px;overflow:hidden;font-family:Arial,Helvetica,sans-serif}
      .bg{width:1280px;height:720px;background:${bg};background-size:cover;background-position:center;position:relative}
      .scrim{position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.75),rgba(0,0,0,.15) 55%)}
      .txt{position:absolute;left:64px;right:64px;bottom:70px;color:#fff}
      .title{font-size:84px;font-weight:800;line-height:1.05;text-shadow:0 3px 18px rgba(0,0,0,.6)}
      .spk{font-size:38px;font-weight:600;margin-top:18px;opacity:.92;text-shadow:0 2px 10px rgba(0,0,0,.6)}
      </style></head><body><div class="bg"><div class="scrim"></div>
      <div class="txt"><div class="title">${esc(title)}</div>${speaker ? `<div class="spk">${esc(speaker)}</div>` : ''}</div>
      </div></body></html>`
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    await new Promise((r) => setTimeout(r, 350)) // let the background image paint
    const img = await win.webContents.capturePage()
    writeFileSync(outPath, img.toJPEG(90))
  } finally {
    win.destroy()
  }
}

const contentRunner = createContentRunner({
  ffmpegPath: resolveFfmpegPath(),
  getRecording,
  listMarkers: listRecordingMarkers,
  getSetting,
  saveAi: (id, fields) => setRecordingAi(id, fields),
  renderThumbnail,
  onProgress: (id, label) => {
    if (operatorWin && !operatorWin.isDestroyed()) operatorWin.webContents.send('wf:recordings:aiProgress', { recordingId: id, label })
  },
  toast: (message, level) => notifyOperator(message, level ?? 'info')
})

// Feature states
let currentTheme: Theme = 'modern-church'
let bibleTranslation: BibleTranslation = 'kjv'
const serviceLog: Array<{ ts: number; event: string }> = []  // Service recording

// OBS auto-switch: map a service "context" to an OBS scene name.
let obsAutoSwitch = false
let obsSceneMap: Record<SceneContext, string> = { worship: '', word: '', countdown: '' }
let lastAutoScene: string | null = null

function clearCountdown(track: TrackId): void {
  const t = tracks[track]
  if (t.countdownTimer) { clearInterval(t.countdownTimer); t.countdownTimer = null }
}
function clearAutoAdvance(track: TrackId): void {
  const t = tracks[track]
  if (t.autoAdvanceTimer) { clearInterval(t.autoAdvanceTimer); t.autoAdvanceTimer = null }
  t.autoAdvanceMs = null
  t.autoAdvanceDuration = 0
  t.autoAdvanceLoop = false
}
// Clear CCLI song metadata when a non-song goes live.
function clearSongMeta(track: TrackId): void {
  tracks[track].songMeta = { author: null, copyright: null, ccli: null }
}

// Are we on the last slide of the last go-live item (nothing further to advance to)?
function atEndOfContent(track: TrackId): boolean {
  const t = tracks[track]
  const atLastSlide = t.mode === 'lyrics' ? t.index >= t.song.lines.length - 1 : true
  return atLastSlide && !adjacentLiveItem(track, 1)
}

// Jump back to the first slide of the first go-live item (loop restart).
function goToStart(track: TrackId): void {
  const first = activeServiceItems.filter((it) => it.track === track).find(itemCanGoLive)
  if (first) void handleTabletLoadItem(track, first.id)
  else { tracks[track].index = 0; broadcast() }
}

// Start (or re-arm) the auto-advance countdown. Each time it elapses it advances
// one slide and re-arms itself, so it keeps going until the operator hits Stop.
// When `loop` is set, it restarts from the beginning instead of stopping at the end.
function armAutoAdvance(track: TrackId, durationMs: number, loop: boolean): void {
  if (durationMs <= 100 || durationMs > 3600000) {
    console.error(`Invalid auto-advance duration: ${durationMs}ms`)
    return
  }
  const t = tracks[track]
  if (t.autoAdvanceTimer) clearInterval(t.autoAdvanceTimer)
  t.autoAdvanceDuration = durationMs
  t.autoAdvanceLoop = loop
  t.autoAdvanceMs = durationMs
  t.autoAdvanceTimer = setInterval(() => {
    if (t.autoAdvanceMs == null) return
    t.autoAdvanceMs -= 100
    if (t.autoAdvanceMs <= 0) {
      const dur = t.autoAdvanceDuration
      const lp = t.autoAdvanceLoop
      if (lp && atEndOfContent(track)) goToStart(track)
      else if (atEndOfContent(track)) {
        // At end of service and not looping — stop auto-advance to prevent runaway
        clearAutoAdvance(track)
        logServiceEvent('auto-advance stopped at end of service')
        broadcast()
        return
      } else {
        processIntent(track, 'next')  // advances (note: doesn't clear auto-advance since it's a 'next' intent)
      }
      armAutoAdvance(track, dur, lp)      // …so re-arm to keep the cycle going
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


function renderState(track: TrackId = 'main'): LiveState {
  const t = tracks[track]
  const lines = t.song.lines
  return {
    mode: t.mode,
    index: t.index,
    line: lines[t.index] ?? '',
    next: lines[t.index + 1] ?? '',
    total: lines.length,
    songTitle: t.song.title,
    background: t.song.background ?? null,
    bgMotion: (t.song.bgMotion as 'pan' | 'zoom' | 'shimmer' | null) ?? null,
    bgFit: t.bgFit,
    liveServiceItemId: t.serviceItemId,
    fontScale: t.fontScale,
    stageMessage: t.stageMessage,
    ts: Date.now(),
    hmsLoadedAt: t.hmsLoadedAt,
    autoAdvanceMs: t.autoAdvanceMs,
    theme: currentTheme,
    verseNumber: t.verseNumber,
    songAuthor: t.songMeta.author,
    songCopyright: t.songMeta.copyright,
    songCcli: t.songMeta.ccli,
    ccliLicense,
    slideTheme: t.slideTheme,
    slideThemeColors: t.slideThemeColors,
    songTextColor: t.songTextColor,
    songFont: t.songFont,
    blurBehindText: t.blurBehindText
  }
}

// The all-blank ZoneState every rendering path (normal routing, and the deck
// path below) starts from and fills in — kept as one function so the two
// paths can never drift apart on a field neither of them meant to set.
function emptyZoneState(live: LiveState): ZoneState {
  return {
    mode: 'off',
    line: '',
    next: '',
    title: '',
    index: live.index,
    total: live.total,
    background: null,
    themeColors: null,
    fontScale: live.fontScale,
    secondsLeft: 0,
    stageMessage: live.stageMessage,
    imagePath: null,
    speaker: null,
    passage: null,
    bgColor: null,
    bgOverlay: null,
    textAlign: null,
    textPosition: null,
    blurBehindText: live.blurBehindText ?? false,
  }
}

// Zones can't load a `theme:<id>` background as a file (only the projector
// renders motion themes), so resolve the effective theme to colors and let the
// zone draw an animated gradient. Real image/video file backgrounds pass
// through as-is. One helper so the mode branches can't drift apart on it.
function applyZoneBackground(base: ZoneState, background: string | null | undefined, live: LiveState): void {
  const isThemeBg = background?.startsWith('theme:') ?? false
  const themeId = isThemeBg ? background!.slice(6) : (live.slideTheme ?? null)
  base.background = isThemeBg ? null : (background ?? null)
  base.themeColors = resolveColors(getTheme(themeId), live.slideThemeColors)
}

// A `titleCard` pin freezes one service item onto a zone — the designed sermon
// backdrop built from THAT item's own payload, not from whatever happens to be
// live now. That independence is the entire point of holding a screen.
function titleCardZoneState(item: ServiceItem, live: LiveState): ZoneState {
  const base = emptyZoneState(live)
  base.mode = 'sermon'
  base.title = (item.payload.title as string | undefined) ?? item.title
  if (item.type === 'sermon') {
    base.speaker = (item.payload.speaker as string | undefined) || null
    base.passage = (item.payload.passage as string | undefined) || null
  }
  applyZoneBackground(base, (item.payload.background as string | null | undefined) ?? null, live)
  return base
}

// The live zone pins as a plain record (for IPC and the recovery snapshot).
function zonePinsRecord(): ZonePins {
  const out: ZonePins = {}
  for (const [zoneId, pin] of zonePins) out[zoneId] = pin
  return out
}

// Precedence, highest first:
//   pin  >  deck (t.deckSlides)  >  per-item zone_routing  >  scene typeDefault  >  idleDefault
function computeZoneStates(): Record<ZoneId, ZoneState> {
  const result = {} as Record<ZoneId, ZoneState>
  const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]
  // Zone- and track-agnostic — read once per broadcast rather than once per zone,
  // since this hits the DB and computeZoneStates can fire every 100ms during auto-advance.
  const sceneConfig = parseSceneConfig(getSetting('zone_scenes'))
  for (const zoneId of ZONE_IDS) {
    const zoneTrack = activeZoneTrackAssignment[zoneId]
    const live = renderState(zoneTrack)
    const t = tracks[zoneTrack]

    // A pin is the operator's most recent and most explicit instruction for
    // this one screen — it outranks everything below, including an authored
    // deck. A mode pin falls through to the shared mode-population code below
    // (as the old manual override did); a titleCard pin is fully resolved here.
    const pin = zonePins.get(zoneId)
    let pinnedMode: ZoneMode | null = null
    if (pin) {
      if (pin.kind === 'titleCard') {
        // Deliberately NOT filtered by track: the operator pinned this specific
        // item, and which track it belongs to has nothing to do with holding it.
        const pinnedItem = activeServiceItems.find((it) => it.id === pin.itemId)
        if (pinnedItem) {
          result[zoneId] = titleCardZoneState(pinnedItem, live)
          continue
        }
        // Item was deleted out from under the pin. Fall back to the logo, never
        // to black — a dark screen mid-service reads as broken equipment.
        const warnKey = `${zoneId}:${pin.itemId}`
        if (!warnedMissingPins.has(warnKey)) {
          warnedMissingPins.add(warnKey)
          logWarn(`[zones] pinned item id=${pin.itemId} is no longer in the service — zone ${zoneId} falls back to the logo`)
        }
        pinnedMode = 'logo'
      } else {
        pinnedMode = pin.mode
      }
    }

    // An authored deck says explicitly what every zone shows on the current
    // slide — that's its whole purpose, so it wins outright over per-item
    // auto-routing and the idle default alike. The one thing it does NOT beat
    // is a pin, handled above: the operator asked for this screen by hand,
    // after the deck was authored.
    if (pinnedMode == null && t.deckSlides && t.index < t.deckSlides.length) {
      result[zoneId] = zoneStateFromSlot(resolveSlot(t.deckSlides, t.index, zoneId), t, zoneId, live)
      continue
    }

    // Get routing for the active item on this zone's track (or defaults: scene
    // palette typeDefault, falling back to the built-in ZONE_ROUTING_DEFAULTS).
    let routing: ZoneRouting | null = null
    if (t.serviceItemId != null) {
      const item = activeServiceItems.find((it) => it.id === t.serviceItemId && it.track === zoneTrack)
      if (item) {
        const stored = getItemZoneRouting(item.id)
        if (stored) {
          try {
            routing = JSON.parse(stored) as ZoneRouting
          } catch (err) {
            console.error(`Failed to parse zone routing for item id=${item.id}:`, err)
            routing = defaultRoutingFor(item.type, sceneConfig)
          }
        } else {
          routing = defaultRoutingFor(item.type, sceneConfig)
        }
      }
    }

    // No service item is live on this track (routing is null) — e.g. nothing's
    // loaded yet, OR ad-hoc content (Quick Scripture / Quick Countdown) is live,
    // which deliberately has no service item for per-item routing to key off.
    // Show that ad-hoc content on EVERY content screen (1/2 back screens and 3
    // the Lyrics TVs, with 4 on its stage view) instead of silently hiding it —
    // a Quick Scripture called mid-sermon used to blank the Lyrics TVs, which
    // is precisely the screen the congregation reads verses from. Only once
    // something real has actually loaded on this track (hasLiveContent), and
    // only while the track itself is actively displaying it (not black/logo'd
    // out), so a pristine, never-touched track still shows the safe Logo/Off.
    const trackShowingContent = t.hasLiveContent && (t.mode === 'lyrics' || t.mode === 'countdown')
    const idleContentMode: ZoneMode = t.mode === 'countdown' ? 'countdown' : 'text'
    const idleDefault: ZoneMode = trackShowingContent
      ? (zoneId === 4 ? 'stage' : idleContentMode)
      : ((zoneId === 1 || zoneId === 2) ? 'logo' : 'off')
    const routedMode = pinnedMode ?? (routing ? routing[zoneId] : idleDefault)
    const mode = routedMode ?? 'off'

    const base: ZoneState = { ...emptyZoneState(live), mode }

    // Populate fields based on mode.
    if (mode === 'lyrics' || mode === 'text') {
      base.line = live.line
      base.next = live.next
      base.title = live.songTitle
      applyZoneBackground(base, live.background, live)
      // For text-type items, pull per-item style overrides from payload
      if (t.serviceItemId != null) {
        const liveItem = activeServiceItems.find((it) => it.id === t.serviceItemId && it.type === 'text')
        if (liveItem) {
          const pl = liveItem.payload
          if (pl.bgOverlay != null) base.bgOverlay = pl.bgOverlay as number
          if (pl.textAlign != null) base.textAlign = pl.textAlign as string
          if (pl.textPosition != null) base.textPosition = pl.textPosition as string
          if (pl.bgColor != null && !base.background) base.bgColor = pl.bgColor as string
          if (pl.fontScale != null) base.fontScale = pl.fontScale as number
        }
      }
    } else if (mode === 'sermon') {
      // The designed sermon backdrop reached by routing (not by a pin): same
      // live content the lyrics/text branch shows, plus the speaker/passage the
      // card is built around, read off the live item when it really is a sermon.
      base.line = live.line
      base.next = live.next
      base.title = live.songTitle
      const sermonItem = t.serviceItemId != null
        ? activeServiceItems.find((it) => it.id === t.serviceItemId && it.track === zoneTrack)
        : undefined
      if (sermonItem?.type === 'sermon') {
        base.speaker = (sermonItem.payload.speaker as string | undefined) || null
        base.passage = (sermonItem.payload.passage as string | undefined) || null
      }
      applyZoneBackground(base, live.background, live)
    } else if (mode === 'stage') {
      // Stage always shows lyrics content with next preview.
      base.line = live.line
      base.next = live.next
      base.title = live.songTitle
      // No background on stage monitor.
    } else if (mode === 'countdown') {
      // Parse countdown from the live line ("M:SS" format).
      const parts = live.line.split(':')
      const mins = parseInt(parts[0] ?? '0', 10)
      const secs = parseInt(parts[1] ?? '0', 10)
      base.secondsLeft = (isNaN(mins) ? 0 : mins) * 60 + (isNaN(secs) ? 0 : secs)
      base.title = live.songTitle
      applyZoneBackground(base, live.background, live)
    } else if (mode === 'image') {
      const item = activeServiceItems.find((it) => it.id === t.serviceItemId)
      base.imagePath = item ? ((item.payload.path as string) ?? null) : null
    } else if (mode === 'logo') {
      // Logo zones stay on their own static backdrop — they do NOT follow the
      // live song/theme background. `logoBg` is the configured logo backdrop;
      // when unset the zone page draws its charcoal gradient. This applies to
      // every logo zone, Lyrics TVs included.
      base.imagePath = logoPath
      base.background = logoBg
    }

    result[zoneId] = base
  }
  return result
}

// The deck-path counterpart to computeZoneStates' per-item routing branch: a
// resolved ZoneSlot (already walked back through any 'same' chain by the
// caller) becomes the ZoneState for one zone. Synchronous and cache-only — no
// lookups happen here, see loadDeckOnto.
// Deck content on the ROOM-FACING screens starts bigger than the normal 6vw:
// their template shrink-to-fits aggressively, so a verse came out much smaller
// there than the same words on the stage monitor. Zone 4 is excluded on purpose
// — the stage monitor's own sizing was already right, and raising it there made
// it worse, not better.
const DECK_TEXT_FONT_SCALE = 9

function deckFontScale(zoneId: ZoneId, live: LiveState): number {
  return zoneId === 4 ? live.fontScale : DECK_TEXT_FONT_SCALE
}

function zoneStateFromSlot(slot: ZoneSlot, t: LiveTrackState, zoneId: ZoneId, live: LiveState): ZoneState {
  const base = emptyZoneState(live)
  if (slot.kind === 'slide') {
    base.mode = 'text'
    base.line = t.deckSource[slot.index ?? -1] ?? ''
    applyZoneBackground(base, live.background, live)
  } else if (slot.kind === 'text') {
    base.mode = 'text'
    base.line = slot.text ?? ''
    base.fontScale = deckFontScale(zoneId, live)
    applyZoneBackground(base, live.background, live)
  } else if (slot.kind === 'sermon') {
    // The designed title card. Speaker is deliberately null — during a reading
    // the room needs the title and where we are, not who is preaching.
    base.mode = 'sermon'
    base.title = slot.text ?? ''
    base.speaker = null
    base.passage = slot.reference ?? null
    applyZoneBackground(base, live.background, live)
  } else if (slot.kind === 'scripture') {
    // Keyed by the CURRENT slide's own index, not wherever the slot was
    // originally authored — loadDeckOnto pre-populates the cache for every
    // resolved index (including ones only reached via a 'same' chain), so
    // this always has a matching entry when a lookup for this reference
    // succeeded at load time.
    const verse = t.deckScripture.get(`${t.index}:${zoneId}`)
    if (verse) {
      base.mode = 'text'
      base.line = verse
      base.title = slot.reference ?? ''
      base.fontScale = deckFontScale(zoneId, live)
      applyZoneBackground(base, live.background, live)
    } else base.mode = 'black'   // lookup failed — better blank than a stale verse
  } else if (slot.kind === 'image') {
    base.mode = 'image'
    base.imagePath = slot.path ?? null
  } else if (slot.kind === 'logo') {
    // Must carry the church logo and its backdrop, exactly as the non-deck logo
    // branch does. Without these the zone page has no image to draw and falls
    // back to a generic cross glyph — the Lyrics TVs showed a plain ✝ instead of
    // the Snow Hill logo.
    base.mode = 'logo'
    base.imagePath = logoPath
    base.background = logoBg
  } else {
    base.mode = 'black'
  }

  // The stage monitor renders a next-line preview under the current text, and
  // it is the screen the pastor reads from — without this it sits empty and the
  // monitor is half useless. Costs nothing on the other zones.
  base.next = deckNextText(t, zoneId)
  return base
}

// What this zone will show on the following slide, as plain text. Returns ''
// at the end of the deck, and for slots that have no text to preview.
function deckNextText(t: LiveTrackState, zoneId: ZoneId): string {
  if (!t.deckSlides) return ''
  const nextIndex = t.index + 1
  if (nextIndex >= t.deckSlides.length) return ''
  const slot = resolveSlot(t.deckSlides, nextIndex, zoneId)
  if (slot.kind === 'text' || slot.kind === 'sermon') return slot.text ?? ''
  if (slot.kind === 'slide') return t.deckSource[slot.index ?? -1] ?? ''
  if (slot.kind === 'scripture') return t.deckScripture.get(`${nextIndex}:${zoneId}`) ?? ''
  return ''
}

function zoneBroadcast(): void {
  if (tabletClients.size === 0) return
  const states = computeZoneStates()
  const payload = JSON.stringify({ type: 'zones', states })
  for (const client of tabletClients) {
    if ((client as WsSocket).readyState === 1) (client as WsSocket).send(payload)
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
    state: statePayload ?? renderState('main'),
    notes: tracks.main.itemNotes,
    items: activeServiceItems.filter((it) => it.track === 'main').map((it) => ({ id: it.id, type: it.type, title: it.title }))
  })
  for (const client of tabletClients) {
    if ((client as WsSocket).readyState === 1) (client as WsSocket).send(payload)
  }
}

// Derive the current scene context from Main-track live state, then switch OBS if it changed.
function maybeAutoSwitchScene(): void {
  if (!obsAutoSwitch || !getObsStatus().connected) return
  const t = tracks.main
  // Don't switch while operator has blanked the screen.
  if (t.mode === 'black' || t.mode === 'logo') return
  let ctx: SceneContext
  if (t.mode === 'countdown') ctx = 'countdown'
  else {
    const item = t.serviceItemId != null
      ? activeServiceItems.find((it) => it.id === t.serviceItemId && it.track === 'main')
      : undefined
    ctx = item?.type === 'song' ? 'worship' : 'word'
  }
  const scene = obsSceneMap[ctx]
  if (scene && scene !== lastAutoScene) {
    lastAutoScene = scene
    void obsSetScene(scene)
  }
}

// Single source of truth for the { main, second } wf:state payload — used by
// broadcast() and by every window's did-finish-load initial paint, so the
// "is Second active" rule can never drift out of sync between call sites
// (that drift is exactly what caused the stale-shape bug this helper fixes).
function buildStatePayload(): { main: LiveState; second: LiveState | null } {
  const secondActive = activeServiceItems.some((it) => it.track === 'second')
  return { main: renderState('main'), second: secondActive ? renderState('second') : null }
}

function broadcast(): void {
  const payload = buildStatePayload()
  for (const w of [operatorWin, stageWin, ...outputWins.values()]) {
    if (w && !w.isDestroyed()) w.webContents.send('wf:state', payload)
  }
  writeRecovery({
    main: { liveServiceItemId: tracks.main.serviceItemId, slideIndex: tracks.main.index, mode: tracks.main.mode },
    second: payload.second
      ? { liveServiceItemId: tracks.second.serviceItemId, slideIndex: tracks.second.index, mode: tracks.second.mode }
      : null,
    // Pins are live-operation state, so a crash mid-sermon must not silently
    // release a held screen — restoreRecovery puts them back.
    pins: zonePinsRecord()
  })
  tabletBroadcast(payload.main)
  zoneBroadcast()
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
    (item.type === 'ticker' && !!(item.payload.text as string)) ||
    (item.type === 'announcement' && item.ref_id != null) ||
    item.type === 'sermon'
  )
}

// Find the next/previous go-live service item relative to the current one, within the same track.
function adjacentLiveItem(track: TrackId, dir: 1 | -1): ServiceItem | undefined {
  const t = tracks[track]
  if (t.serviceItemId == null) return undefined
  const trackItems = activeServiceItems.filter((it) => it.track === track)
  const idx = trackItems.findIndex((it) => it.id === t.serviceItemId)
  if (idx < 0) return undefined
  const rest = dir === 1
    ? trackItems.slice(idx + 1)
    : trackItems.slice(0, idx).reverse()
  return rest.find(itemCanGoLive)
}

// Send a transient banner to the operator window (non-technical-friendly toast).
function notifyOperator(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  if (operatorWin && !operatorWin.isDestroyed()) {
    operatorWin.webContents.send('wf:notify', { message, level })
  }
}

// --- Extracted intent processing (used by both IPC and WebSocket) ---
function processIntent(track: TrackId, type: Intent): void {
  const t = tracks[track]
  // Only clear auto-advance for mode-changing intents (black/logo/lyrics), not for navigation (next/prev)
  if (type !== 'next' && type !== 'prev') {
    clearAutoAdvance(track)
  }
  const last = t.song.lines.length - 1
  if (type === 'next') {
    if (t.mode === 'countdown') {
      // A live countdown/welcome is a single view — Next moves to the next item.
      const nextItem = adjacentLiveItem(track, 1)
      if (nextItem) { void handleTabletLoadItem(track, nextItem.id); return }
      // Nothing after the countdown — go to the logo hold screen instead of
      // stranding the frozen timer value (e.g. "0:42") as a lyric slide.
      clearCountdown(track); t.song = { title: '', lines: [], background: null }; t.mode = 'logo'
    } else if (t.mode !== 'lyrics') {
      // Black/logo were operator-blanked — Next un-blanks back to the slide.
      clearCountdown(track); t.mode = 'lyrics'
    } else if (t.index < last) {
      t.index++; logServiceEvent(`next: ${t.index}/${last}`)
    } else {
      // At the last slide of this item — advance to the next service item.
      const nextItem = adjacentLiveItem(track, 1)
      if (nextItem) { void handleTabletLoadItem(track, nextItem.id); return }
    }
  } else if (type === 'prev') {
    if (t.mode !== 'lyrics') { clearCountdown(track); t.mode = 'lyrics' }
    else if (t.index > 0) { t.index--; logServiceEvent(`prev: ${t.index}/${last}`) }
    else {
      // At the first slide — step back to the previous service item.
      const prevItem = adjacentLiveItem(track, -1)
      if (prevItem) { void handleTabletLoadItem(track, prevItem.id); return }
    }
  } else if (type === 'black') { clearCountdown(track); t.mode = 'black'; logServiceEvent('black') }
  else if (type === 'logo') { clearCountdown(track); t.mode = 'logo'; logServiceEvent('logo') }
  else if (type === 'lyrics') { clearCountdown(track); t.mode = 'lyrics'; logServiceEvent('lyrics') }
  broadcast()
}

// --- Extracted load functions (used by IPC handlers and tablet loadItem) ---
// `item`, when given, is the live ServiceItem this text came from — used to
// look up and load its authored zone-slide deck (if any). Ad-hoc loads (Quick
// Text, tickers, announcements) pass no item, so they never carry a deck.
function doLoadText(track: TrackId, title: string, body: string, background: string | null = null, fontScale?: number, blurBehindText?: boolean, item?: ServiceItem | null): void {
  const t = tracks[track]
  t.loadGeneration++
  t.hasLiveContent = true
  clearCountdown(track)
  clearAutoAdvance(track)
  t.songId = null
  t.scriptureRef = null
  clearSongMeta(track)
  t.bgFit = 'cover'
  t.deckSlides = null  // dropped here; loadDeckOnto repopulates it below if `item` has one
  const lines: string[] = []
  if (title) lines.push(title)
  body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).forEach((b) => lines.push(b))
  t.song = { title: title || 'Announcement', lines: lines.length ? lines : [title], background }
  t.songTextColor = null; t.songFont = null
  t.blurBehindText = blurBehindText ?? false
  // Only a text item's own saved font size overrides the live size — tickers/
  // announcements (which pass no fontScale) leave whatever's currently set
  // untouched, same as before this per-item override existed.
  if (fontScale != null) t.fontScale = fontScale
  t.mode = 'lyrics'
  t.index = 0
  if (item) void loadDeckOnto(track, item, t.loadGeneration)
}

// See doLoadText's `item` comment — same deal here.
function doLoadSermon(track: TrackId, title: string, speaker: string, passage: string, background?: string | null, blurBehindText?: boolean, item?: ServiceItem | null): void {
  const t = tracks[track]
  t.loadGeneration++
  t.hasLiveContent = true
  clearCountdown(track)
  clearAutoAdvance(track)
  t.songId = null
  t.scriptureRef = null
  clearSongMeta(track)
  t.bgFit = 'cover'
  t.deckSlides = null  // dropped here; loadDeckOnto repopulates it below if `item` has one
  const line = [speaker, passage].filter(Boolean).join('\n')
  t.song = { title, lines: [line], background: background ?? null }
  t.songTextColor = null; t.songFont = null
  t.blurBehindText = blurBehindText ?? false
  // Unlike every other loader, mode stays 'logo' — the main projector's
  // sermon behavior (show the church logo) is intentional and unchanged.
  // Zone routing reads t.song/t.blurBehindText independently of t.mode, so a
  // zone manually routed to Text/Lyrics mode still picks up this content —
  // only the main projector's own mode-driven rendering is unaffected.
  t.mode = 'logo'
  t.index = 0
  if (item) void loadDeckOnto(track, item, t.loadGeneration)
}

// Fills t.song.lines with one summary per deck slide, so the EXISTING cursor,
// next/prev and auto-advance all work unchanged — the deck needs no second
// cursor. Pre-resolves every scripture slot because computeZoneStates is
// synchronous and fires as often as every 100ms. Returns false if no deck.
async function loadDeckOnto(track: TrackId, item: ServiceItem, generation: number): Promise<boolean> {
  // A hand-authored deck always wins; generation only fills the gap where there
  // isn't one, so nothing anyone built in the composer changes behaviour.
  const slides = parseZoneSlides(getItemZoneSlides(item.id)) ?? await autoDeckFor(item, {
    budget: zoneChunkBudget(),
    lookupScripture: (reference) => bibleTranslation === 'kjv'
      ? Promise.resolve(lookupScripture(reference))
      : fetchScripture(reference, bibleTranslation),
    getAnnouncement: async (id) => {
      const a = getAnnouncement(id)
      return a ? { id: a.id, title: a.title, body: a.body } : null
    },
  })
  if (!slides) return false
  const source = await computeItemSourceSlides(item)
  if (tracks[track].loadGeneration !== generation) return true
  const t = tracks[track]
  t.deckSlides = slides
  t.deckSource = source
  t.deckScripture = new Map()
  t.song = { ...t.song, lines: slides.map((s) => slideSummary(s, source)) }
  t.index = 0
  // Every caller fires this async and broadcasts immediately — BEFORE the deck
  // exists (the awaits above land on a later turn). Without a broadcast here
  // the zones keep rendering the pre-deck state and are never told about the
  // deck at all: screens sat on logo/black while the operator saw nothing.
  broadcast()

  // Memoized by reference, not by slide index: resolveSlot walks a 'same'
  // chain back to its nearest real slot, so every slide in that chain resolves
  // to the SAME scripture slot and would otherwise trigger the identical
  // network lookup once per slide. One fetch per distinct reference is enough;
  // the cache below is still populated per resolved slide index, so the
  // render-time read (keyed by the live t.index) always has a matching entry.
  const lookedUp = new Map<string, ScriptureResult>()
  for (let i = 0; i < slides.length; i++) {
    for (const zoneId of [1, 2, 3, 4] as ZoneId[]) {
      const slot = resolveSlot(slides, i, zoneId)
      if (slot.kind !== 'scripture' || !slot.reference) continue
      let result = lookedUp.get(slot.reference)
      if (!result) {
        result = bibleTranslation === 'kjv'
          ? lookupScripture(slot.reference)
          : await fetchScripture(slot.reference, bibleTranslation)
        lookedUp.set(slot.reference, result)
      }
      // The await may have let something newer load onto this track.
      if (tracks[track].loadGeneration !== generation) return true
      if (result.ok && result.verses) {
        tracks[track].deckScripture.set(`${i}:${zoneId}`, result.verses.map((v) => v.text).join(' '))
      } else {
        logWarn(`[deck] scripture lookup failed for "${slot.reference}" on slide ${i + 1} zone ${zoneId}`)
      }
    }
  }
  // Verse text arrived after the initial deck broadcast above — push it out,
  // or scripture slots stay black until the next unrelated state change.
  if (tracks[track].loadGeneration === generation) broadcast()
  return true
}

function doLoadCountdown(track: TrackId, seconds: number, background?: string | null, blurBehindText?: boolean): void {
  const t = tracks[track]
  t.loadGeneration++
  t.hasLiveContent = true
  clearCountdown(track)
  clearAutoAdvance(track)
  t.songId = null
  t.scriptureRef = null
  clearSongMeta(track)
  t.bgFit = 'cover'
  t.deckSlides = null  // countdowns never carry a deck
  const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  let remaining = seconds
  const bg = background ?? null
  t.song = { title: 'Countdown', lines: [fmt(remaining)], background: bg }
  t.songTextColor = null; t.songFont = null
  t.blurBehindText = blurBehindText ?? false
  t.mode = 'countdown' as Mode
  t.index = 0
  t.countdownTimer = setInterval(() => {
    remaining--
    if (remaining <= 0) {
      clearCountdown(track)
      t.song = { title: 'Countdown', lines: ['0:00'], background: bg }
      t.mode = 'black'
      broadcast()
      return
    }
    t.song = { title: 'Countdown', lines: [fmt(remaining)], background: bg }
    broadcast()
  }, 1000)
}

// Fetch a non-KJV translation from the free bible-api.com (no key). Falls back
// to bundled offline KJV if there's no internet or the lookup fails.
async function fetchScripture(reference: string, translation: BibleTranslation): Promise<ScriptureResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)
  try {
    const url = `https://bible-api.com/${encodeURIComponent(reference)}?translation=${translation}`
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { reference?: string; verses?: { verse: number; text: string }[] }
    if (!data.verses || data.verses.length === 0) throw new Error('no verses')
    return {
      ok: true,
      reference: data.reference ?? reference,
      verses: data.verses.map((v) => ({ n: v.verse, text: v.text.replace(/\s+/g, ' ').trim() }))
    }
  } catch (err) {
    clearTimeout(timeout)
    logWarn(`[scripture] online fetch failed, falling back to KJV: ${(err as Error)?.message ?? err}`)
    return { ...lookupScripture(reference), usedFallback: true }
  }
}

// Returns false (leaving the current slide untouched) when the reference can't be
// resolved, so callers don't mark a failed scripture "live" and strand the wrong
// content on the projector.
async function doLoadScripture(track: TrackId, reference: string, background?: string | null, blurBehindText?: boolean): Promise<boolean> {
  // Bump the generation synchronously, before the (possibly slow, non-KJV)
  // network await, and remember our value. If anything else loads onto this
  // track while we're waiting — including another scripture lookup — that call
  // bumps the generation again, so when we resolve we can tell we've been
  // superseded and bail out without touching live state. See
  // LiveTrackState.loadGeneration.
  const generation = ++tracks[track].loadGeneration
  const result = bibleTranslation === 'kjv'
    ? lookupScripture(reference)
    : await fetchScripture(reference, bibleTranslation)
  if (!result.ok || !result.verses) {
    logWarn(`[scripture] lookup failed for reference="${reference}" translation=${bibleTranslation}`)
    return false
  }
  if (tracks[track].loadGeneration !== generation) {
    logWarn(`[scripture] discarding stale lookup for reference="${reference}" — track "${track}" moved on while fetching`)
    return false
  }
  if (result.usedFallback) {
    notifyOperator(`Online lookup failed — showing KJV for "${reference}"`, 'warn')
  }
  const t = tracks[track]
  t.hasLiveContent = true
  clearCountdown(track)
  clearAutoAdvance(track)
  t.songId = null
  t.scriptureRef = reference
  clearSongMeta(track)
  t.bgFit = 'cover'
  t.deckSlides = null  // ad-hoc scripture loads never carry a deck
  const lines =
    result.verses.length === 1
      ? [result.verses[0].text]
      : result.verses.map((v) => `${v.n}  ${v.text}`)
  t.song = { title: result.reference!, lines, background: background ?? null }
  t.songTextColor = null; t.songFont = null
  t.blurBehindText = blurBehindText ?? false
  t.mode = 'lyrics'
  t.index = 0
  return true
}

// Order a song's sections (honoring arrangement) and group into slide lines.
// Grouping happens WITHIN each section so a slide never mixes the end of one
// section with the start of the next (e.g. a verse and the chorus). Mirrors the
// editor's computeEditorSlides so the projector matches the editor preview.
function songLines(full: SongFull): string[] {
  const sorted = [...full.sections].sort((a, b) => a.ordinal - b.ordinal)
  const ordered = full.arrangement && full.arrangement.length > 0
    ? full.arrangement.map((i) => sorted[i]).filter(Boolean)
    : sorted
  const perSlide = full.linesPerSlide ?? 2
  const slides: string[] = []
  for (const section of ordered) {
    const lines = section.lyrics.split('\n').map((l) => l.trim()).filter(Boolean)
    for (const slide of groupLines(lines, perSlide)) slides.push(slide)
  }
  return slides
}

async function doLoadSong(track: TrackId, id: number): Promise<void> {
  const t = tracks[track]
  t.loadGeneration++
  clearCountdown(track)
  clearAutoAdvance(track)
  const full = await getSong(id)
  if (!full) return
  t.hasLiveContent = true
  t.songId = id
  t.scriptureRef = null
  t.bgFit = 'cover'
  t.deckSlides = null  // songs never carry a deck
  t.song = { title: full.title, lines: songLines(full), background: full.background ?? null, bgMotion: full.bgMotion ?? null }
  t.fontScale = full.fontScale ?? 6
  t.songTextColor = full.textColor ?? null
  t.songFont = full.font ?? null
  t.blurBehindText = full.blurBehindText ?? false
  t.songMeta = { author: full.author, copyright: full.copyright, ccli: full.ccli }
  t.hmsLoadedAt = Date.now()  // Start hymn timer
  t.verseNumber = 1
  t.mode = 'lyrics'
  t.index = 0
  logServiceEvent(`load-song: ${full.title}`)
  // Record CCLI usage once per service (reset when the active service changes).
  // Dedup key is the song id, not the track — playing the same song on both
  // tracks in one service still only logs it once, which is correct.
  if (!loggedSongIds.has(id)) {
    loggedSongIds.add(id)
    recordSongUsage({ songId: id, title: full.title, author: full.author, ccli: full.ccli, copyright: full.copyright })
  }
}

// `item` is optional so the plain "load this one announcement" callers still
// work; when it IS given, the block's generated deck loads on top and the
// screens split into heading + content. The main projector keeps showing the
// first announcement either way, which is what it did before blocks existed.
async function doLoadAnnouncement(track: TrackId, id: number | null, item?: ServiceItem | null): Promise<void> {
  const refIds = Array.isArray(item?.payload.refIds)
    ? (item!.payload.refIds as unknown[]).filter((n): n is number => typeof n === 'number')
    : []
  const firstId = refIds[0] ?? id
  if (firstId == null) return
  const a = getAnnouncement(firstId)
  if (!a) return
  if (a.display === 'ticker') {
    // Title literally 'Announcement' triggers the ticker renderer (existing mechanism).
    doLoadText(track, 'Announcement', a.body)
  } else {
    doLoadText(track, a.title, a.body, a.background ?? null, undefined, a.blurBehindText)
  }
  // doLoadText bumped loadGeneration, so read it back rather than capturing it earlier.
  if (item) void loadDeckOnto(track, item, tracks[track].loadGeneration)
}

// Pure: the slides an item would show, without going live (for the slide
// grid). Checks for an authored deck first — when one exists, ITS summaries
// are what the item "shows". Otherwise delegates to computeItemSourceSlides.
async function computeItemSlides(item: ServiceItem): Promise<string[]> {
  const deck = parseZoneSlides(getItemZoneSlides(item.id))
  if (deck) return deck.map((s) => slideSummary(s))
  return computeItemSourceSlides(item)
}

// The item's own resolved content slides — what computeItemSlides used to
// compute unconditionally before decks existed. loadDeckOnto calls this
// directly (never computeItemSlides) to get the source an authored 'slide'
// slot indexes into: that source must always be the item's ORIGINAL content,
// never another deck's summaries, or a deck referencing its own summaries
// would be circular.
async function computeItemSourceSlides(item: ServiceItem): Promise<string[]> {
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
  if (item.type === 'announcement' && item.ref_id != null) {
    const a = getAnnouncement(item.ref_id)
    if (!a) return []
    if (a.display === 'ticker') return a.body ? [a.body] : []
    const lines: string[] = []
    if (a.title) lines.push(a.title)
    a.body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).forEach((b) => lines.push(b))
    return lines.length ? lines : (a.title ? [a.title] : [])
  }
  if (item.type === 'sermon') {
    const speaker = (item.payload.speaker as string) ?? ''
    const passage = (item.payload.passage as string) ?? ''
    const line = [speaker, passage].filter(Boolean).join('\n')
    return line ? [line] : []
  }
  return []
}

// Effective projector theme = the live item's override, else the service baseline.
function applyItemTheme(track: TrackId, item: ServiceItem | undefined): void {
  const t = tracks[track]
  if (item?.style?.theme) {
    t.slideTheme = item.style.theme
    t.slideThemeColors = item.style.colors ?? null
  } else {
    t.slideTheme = serviceSlideTheme
    t.slideThemeColors = serviceSlideThemeColors
  }
}

function doLoadMedia(track: TrackId, filePath: string, title: string): void {
  const t = tracks[track]
  t.loadGeneration++
  t.hasLiveContent = true
  clearCountdown(track)
  clearAutoAdvance(track)
  t.songId = null
  t.scriptureRef = null
  clearSongMeta(track)
  t.bgFit = 'contain'  // a whole-slide image — fit it entirely on screen
  t.deckSlides = null  // media loads never carry a deck
  t.song = { title: title || 'Media', lines: [''], background: filePath }
  t.songTextColor = null; t.songFont = null
  t.blurBehindText = false
  t.mode = 'lyrics'
  t.index = 0
}

// Load any service item to live (used by tablet loadItem messages and the goLiveAt IPC).
async function handleTabletLoadItem(track: TrackId, itemId: number): Promise<void> {
  const item = activeServiceItems.find((it) => it.id === itemId && it.track === track)
  if (!item) return
  if (item.type === 'song' && item.ref_id != null) {
    await doLoadSong(track, item.ref_id)
  } else if (item.type === 'scripture') {
    const ref = item.payload.reference as string
    if (!ref) return
    if (!(await doLoadScripture(track, ref, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined))) return  // lookup failed → don't mark it live
  } else if (item.type === 'text') {
    doLoadText(
      track,
      (item.payload.title as string) ?? '',
      (item.payload.body as string) ?? '',
      (item.payload.background as string) ?? null,
      item.payload.fontScale as number | undefined,
      item.payload.blurBehindText as boolean | undefined,
      item
    )
  } else if (item.type === 'countdown') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return
    doLoadCountdown(track, secs, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined)
  } else if (item.type === 'image') {
    const p = item.payload.path as string
    if (!p) return
    doLoadMedia(track, p, item.title)
  } else if (item.type === 'welcome') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return
    doLoadCountdown(track, secs, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined)
  } else if (item.type === 'ticker') {
    const txt = item.payload.text as string
    if (!txt) return
    doLoadText(track, 'Announcement', txt)
  } else if (item.type === 'announcement') {
    await doLoadAnnouncement(track, item.ref_id, item)
  } else if (item.type === 'sermon') {
    doLoadSermon(
      track,
      (item.payload.title as string) ?? '',
      (item.payload.speaker as string) ?? '',
      (item.payload.passage as string) ?? '',
      item.payload.background as string | null | undefined,
      item.payload.blurBehindText as boolean | undefined,
      item
    )
  } else {
    return
  }
  const t = tracks[track]
  t.serviceItemId = item.id
  t.itemNotes = item.notes ?? null
  applyItemTheme(track, item)
  broadcast()
  // Mirrors wf:live:setItemId's recording hook (main-track only) — this is the
  // path Next/Prev, the tablet remote, and slide-thumbnail clicks actually run
  // through during a live service, so it must stamp markers too, not just the
  // explicit "Go Live" button. See the recordingSession comment near the top
  // of this file for why both chokepoints must call onItemLive.
  if (track === 'main') {
    void recordingSession.onItemLive(item, activeServiceId, activeServiceName, activeServiceDate)
  }
}

// Characters per generated slide. The right number depends on the physical
// screens and how far back the room sits, so it is a setting rather than a
// constant someone guessed at a desk.
function zoneChunkBudget(): number {
  const raw = parseInt(getSetting('zone_chunk_budget') ?? '', 10)
  // 150 ≈ one verse. The first try at 300 fit John 3:16-17 onto a single slide,
  // which shrank the type until the back of the room couldn't read it and
  // overflowed the stage monitor. Fewer characters per slide means bigger words.
  return Number.isFinite(raw) && raw > 0 ? raw : 150
}

// --- Tablet HTTP + WebSocket server ---
function startTabletServer(): void {
  const server = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0].replace(/\/+$/, '')
    const zoneMatch = path.match(/^\/zone\/([1-4])$/)
    const isObs = path === '/obs'
    const zoneId = zoneMatch ? parseInt(zoneMatch[1], 10) as ZoneId : null
    const htmlHeaders = {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    }
    if (zoneId && ZONE_HTML[zoneId]) {
      res.writeHead(200, htmlHeaders)
      res.end(ZONE_HTML[zoneId])
    } else if (path === '/multiview') {
      res.writeHead(200, htmlHeaders)
      res.end(MULTIVIEW_HTML)
    } else if (isObs) {
      res.writeHead(200, htmlHeaders)
      res.end(OBS_HTML)
    } else if (path === '/file') {
      // Serve local media files (images, videos) to Pi browsers and multiview iframes.
      const qs = new URLSearchParams((req.url ?? '').split('?')[1] ?? '')
      const filePath = qs.get('path') ?? ''
      if (!filePath || typeof filePath !== 'string') {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Missing or invalid path parameter')
        return
      }

      const validPath = validateMediaPath(filePath)
      if (!validPath) {
        res.writeHead(403, { 'Content-Type': 'text/plain' })
        res.end('Access denied: path is outside media directories')
        return
      }

      const ext = (validPath.split('.').pop() ?? '').toLowerCase()
      const MIME: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
        mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4',
      }
      const mime = MIME[ext] ?? 'application/octet-stream'
      const safeEnd = (): void => { if (!res.writableEnded) res.end() }
      try {
        const stat = statSync(validPath)
        const rangeHeader = req.headers['range']
        if (rangeHeader && mime.startsWith('video/')) {
          const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-')
          let start = parseInt(startStr, 10)
          let end = endStr ? parseInt(endStr, 10) : stat.size - 1
          // Clamp a malformed/unsatisfiable range instead of emitting NaN headers.
          if (isNaN(start) || start < 0) start = 0
          if (isNaN(end) || end >= stat.size) end = stat.size - 1
          if (start > end) {
            res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` })
            return safeEnd()
          }
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Content-Type': mime,
            'Cache-Control': 'public, max-age=3600',
          })
          const stream = createReadStream(validPath, { start, end })
          stream.on('error', safeEnd)
          stream.pipe(res, { end: true })
        } else {
          const buf = readFileSync(validPath)
          res.writeHead(200, {
            'Content-Type': mime,
            'Content-Length': buf.length,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=3600',
          })
          res.end(buf)
        }
      } catch {
        if (!res.headersSent) res.writeHead(404)
        safeEnd()
      }
    } else {
      res.writeHead(200, htmlHeaders)
      res.end(tabletHtml(getSetting('church_name')?.trim() || 'Snow Hill Church'))
    }
  })

  const wss = new WebSocketServer({ server })
  tabletHttpServer = server
  tabletWss = wss

  // Liveness: a tablet that drops off WiFi without a clean TCP close stays "open"
  // and would accumulate. The heartbeat pings each client and terminates any that
  // don't pong back before the next tick.
  const aliveClients = new WeakSet<WsSocket>()

  wss.on('connection', (ws: WsSocket) => {
    tabletClients.add(ws)
    aliveClients.add(ws)
    ws.on('pong', () => aliveClients.add(ws))
    // Send current state immediately on connect.
    ws.send(JSON.stringify({
      type: 'state',
      state: renderState('main'),
      notes: tracks.main.itemNotes,
      items: activeServiceItems.map((it) => ({ id: it.id, type: it.type, title: it.title }))
    }))
    // Send zone states so zone pages render immediately on connect.
    ws.send(JSON.stringify({ type: 'zones', states: computeZoneStates() }))

    // The tablet remote is Main-only (see design's non-goals) — always operates
    // on the 'main' track, same reasoning as tabletBroadcast/maybeAutoSwitchScene.
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string; intent?: string; itemId?: number }
        if (msg.type === 'intent' && msg.intent) {
          processIntent('main', msg.intent as Intent)
        } else if (msg.type === 'loadItem' && msg.itemId != null) {
          void handleTabletLoadItem('main', msg.itemId)
        } else if (msg.type === 'clearStageMessage') {
          // Pastor tapped "Got it" — clear the message everywhere.
          tracks.main.stageMessage = null
          broadcast()
        }
      } catch { /* ignore malformed messages */ }
    })

    ws.on('close', () => { tabletClients.delete(ws); aliveClients.delete(ws) })
    ws.on('error', () => { tabletClients.delete(ws); aliveClients.delete(ws) })
  })

  tabletHeartbeat = setInterval(() => {
    for (const ws of tabletClients) {
      if (!aliveClients.has(ws)) {
        try { ws.terminate() } catch { /* ignore */ }
        tabletClients.delete(ws)
        continue
      }
      aliveClients.delete(ws)
      try { ws.ping() } catch { /* ignore */ }
    }
  }, 30000)

  // If the preferred port is taken (leftover instance / second launch), fall back
  // to the next port instead of silently failing, and surface the port actually
  // bound so the operator's tablet/OBS URLs stay correct.
  const MAX_PORT_ATTEMPTS = 10
  let portAttempts = 0
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && portAttempts < MAX_PORT_ATTEMPTS) {
      portAttempts++
      console.warn(`[tablet] port ${boundTabletPort} in use — trying ${boundTabletPort + 1}`)
      logWarn(`[tablet] port ${boundTabletPort} in use — trying ${boundTabletPort + 1}`)
      boundTabletPort++
      setTimeout(() => server.listen(boundTabletPort), 100)
    } else {
      console.error('[tablet] server error:', err)
      logError('[tablet] server error', err)
    }
  })
  server.on('listening', () => {
    console.log(`[tablet] server: http://${getLocalIp()}:${boundTabletPort}`)
    logInfo(`[tablet] server: http://${getLocalIp()}:${boundTabletPort}`)
  })
  server.listen(boundTabletPort)
}

// Close the tablet/zone server + heartbeat and drop all client sockets. Called on
// quit so a relaunch doesn't hit EADDRINUSE on a socket the OS hasn't released.
function stopTabletServer(): void {
  if (tabletHeartbeat) { clearInterval(tabletHeartbeat); tabletHeartbeat = null }
  for (const ws of tabletClients) { try { ws.terminate() } catch { /* ignore */ } }
  tabletClients.clear()
  if (tabletWss) { tabletWss.close(); tabletWss = null }
  if (tabletHttpServer) { tabletHttpServer.close(); tabletHttpServer = null }
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
    title: 'WorshipFlow Pro — Stage',
    icon: APP_ICON,
    backgroundColor: '#060912',
    autoHideMenuBar: true,
    webPreferences: { preload: PRELOAD, sandbox: false }
  })
  stageWin.webContents.on('did-finish-load', () => {
    if (stageWin && !stageWin.isDestroyed()) stageWin.webContents.send('wf:state', buildStatePayload())
  })
  stageWin.on('closed', () => { stageWin = null })
  loadRoute(stageWin, '/stage')
}

function createMultiviewWindow(): void {
  if (multiviewWin && !multiviewWin.isDestroyed()) { multiviewWin.focus(); return }
  const primary = screen.getPrimaryDisplay()
  const externals = screen.getAllDisplays().filter((d) => d.id !== primary.id)
  // Prefer the second external display; fall back to a windowed view on the primary.
  const target = externals.length > 0 ? externals[0] : null
  multiviewWin = new BrowserWindow({
    x: target ? target.bounds.x : primary.bounds.x + 100,
    y: target ? target.bounds.y : primary.bounds.y + 100,
    width: target ? target.bounds.width : 1280,
    height: target ? target.bounds.height : 720,
    frame: true,
    fullscreen: false,
    title: 'WorshipFlow Pro — Zone Multiview',
    icon: APP_ICON,
    backgroundColor: '#0c0c10',
    autoHideMenuBar: true,
    webPreferences: { sandbox: true },
  })
  multiviewWin.loadURL(`http://127.0.0.1:${boundTabletPort}/multiview`)
  multiviewWin.on('closed', () => { multiviewWin = null })
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
    width: 1600,
    height: 760,
    // TopBar's 8 flat nav tabs + brand + live-output/OBS status cluster need
    // real horizontal room (measured: needs ~1440px with zero margin just for
    // the idle-status state, more once OBS on-air badges are showing) — keep
    // the default and the floor comfortably above that.
    minWidth: 1300,
    show: false,
    title: 'WorshipFlow Pro — Operator',
    icon: APP_ICON,
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
    title: `WorshipFlow Pro Output ${opts.id}`,
    icon: APP_ICON,
    webPreferences: { preload: PRELOAD, sandbox: false }
  })
  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed()) win.webContents.send('wf:state', buildStatePayload())
  })
  win.on('closed', () => outputWins.delete(label))
  outputWins.set(label, win)
  loadRoute(win, '/output', { id: String(opts.id) })
}

// Signature of the current physical display arrangement — used to ignore spurious
// display events (DPI tweaks, sleep/wake) that would otherwise tear down and rebuild
// the live output for no reason.
function displaySignature(): string {
  return screen.getAllDisplays()
    .map((d) => `${d.id}:${d.bounds.width}x${d.bounds.height}@${d.bounds.x},${d.bounds.y}`)
    .sort().join('|')
}

let lastDisplaySig = ''
let relayoutTimer: ReturnType<typeof setTimeout> | null = null
// Debounce display events and only rebuild when the arrangement actually changed.
function scheduleLayoutOutputs(): void {
  if (relayoutTimer) clearTimeout(relayoutTimer)
  relayoutTimer = setTimeout(() => {
    relayoutTimer = null
    if (displaySignature() === lastDisplaySig) return
    layoutOutputs()
  }, 500)
}

/**
 * `windowedFallback` controls the no-projector case only.
 *
 * With no external display there is no congregation screen to fill, so the old
 * behaviour — popping a 960x540 "Output 1" window on the primary — just put a
 * window in the operator's way that changed with every slide. Automatic callers
 * pass false and get the zone multiview instead, which is what you actually want
 * to watch. The manual "open the output" action passes true, so the escape hatch
 * still works when a projector is attached but never got a hotplug event.
 */
function layoutOutputs(windowedFallback = false): void {
  lastDisplaySig = displaySignature()
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
    if (!windowedFallback) {
      // Nothing to fill, so show the four zones rather than a stray output window.
      if (!multiviewWin) createMultiviewWindow()
      return
    }
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
ipcMain.on('wf:intent', (_e, track: TrackId, type: Intent) => processIntent(track, type))

ipcMain.handle('wf:getInfo', (): AppInfo => ({
  song: tracks.main.song,
  state: renderState('main'),
  displays: describeDisplays(),
  outputs: outputWins.size,
  startupMs: Date.now() - startTime,
  appVersion: app.getVersion(),
  isPackaged: app.isPackaged
}))

// --- Live engine ---
ipcMain.handle('wf:live:loadText', (_e, track: TrackId, title: string, body: string, background?: string | null, fontScale?: number, blurBehindText?: boolean) => {
  doLoadText(track, title, body, background ?? null, fontScale, blurBehindText); broadcast()
})
ipcMain.handle('wf:live:loadSermon', (_e, track: TrackId, title: string, speaker: string, passage: string, background?: string | null, blurBehindText?: boolean) => {
  doLoadSermon(track, title, speaker, passage, background ?? null, blurBehindText); broadcast()
})

ipcMain.handle('wf:live:loadCountdown', (_e, track: TrackId, seconds: number, background?: string | null, blurBehindText?: boolean) => {
  doLoadCountdown(track, seconds, background, blurBehindText); broadcast()
})

ipcMain.handle('wf:live:loadScripture', async (_e, track: TrackId, reference: string, background?: string | null, blurBehindText?: boolean): Promise<boolean> => {
  const ok = await doLoadScripture(track, reference, background, blurBehindText)
  if (ok) broadcast()
  return ok
})

ipcMain.handle('wf:live:loadSong', async (_e, track: TrackId, id: number) => {
  await doLoadSong(track, id); broadcast()
})

ipcMain.handle('wf:live:loadMedia', (_e, track: TrackId, filePath: string, title: string) => {
  doLoadMedia(track, filePath, title); broadcast()
})

ipcMain.handle('wf:live:loadAnnouncement', async (_e, track: TrackId, id: number | null, itemId?: number) => {
  const item = itemId != null
    ? activeServiceItems.find((it) => it.id === itemId && it.track === track) ?? null
    : null
  await doLoadAnnouncement(track, id, item); broadcast()
})

ipcMain.handle('wf:getState', (_e, track?: TrackId): LiveState => renderState(track ?? 'main'))

ipcMain.handle('wf:stage:open', () => { createStageWindow() })
ipcMain.handle('wf:multiview:open', () => { createMultiviewWindow() })
// Manual re-open of the audience output (e.g. operator closed it, or it never
// opened because the projector was connected before launch with no display event).
ipcMain.handle('wf:output:open', () => { layoutOutputs(true); broadcast() })

ipcMain.handle('wf:live:setItemId', (_e, track: TrackId, id: number | null) => {
  const t = tracks[track]
  t.serviceItemId = id
  const item = id != null ? activeServiceItems.find((it) => it.id === id && it.track === track) : undefined
  t.itemNotes = item?.notes ?? null
  applyItemTheme(track, item)
  // The explicit "Go Live" path (sendItemLive) calls wf:live:loadText/loadSermon
  // with bare primitives, not the ServiceItem, so doLoadText/doLoadSermon's own
  // deck load never fires for it — it finishes here with the item id instead.
  // This handler is the only place in that path where the ServiceItem is
  // available, so it's the deck-load chokepoint for "Go Live". (The other path,
  // Next/Prev via handleTabletLoadItem, never calls wf:live:setItemId — it
  // already loaded the deck itself, straight from the ServiceItem it has.)
  if (item && (item.type === 'text' || item.type === 'sermon')) {
    void loadDeckOnto(track, item, t.loadGeneration)
  }
  broadcast()
  if (item && track === 'main') {
    void recordingSession.onItemLive(item, activeServiceId, activeServiceName, activeServiceDate)
  }
})

ipcMain.handle('wf:live:setFontScale', (_e, track: TrackId, scale: number) => {
  tracks[track].fontScale = Math.min(14, Math.max(3, scale))
  broadcast()
})

ipcMain.handle('wf:live:saveFontScale', (_e, track: TrackId) => {
  const t = tracks[track]
  if (t.songId == null) return
  setSongFontScale(t.songId, t.fontScale)
})

ipcMain.handle('wf:live:setStageMessage', (_e, track: TrackId, msg: string | null) => {
  tracks[track].stageMessage = msg || null
  broadcast()
})


// --- Logo IPCs ---
ipcMain.handle('wf:logo:get', () => ({ logoPath, logoBg }))
ipcMain.handle('wf:logo:set', (_e, path: string | null, bg: string | null) => {
  logoPath = path || null
  logoBg = bg || null
  setSetting('logo_path', logoPath)
  setSetting('logo_bg', logoBg)
  zoneBroadcast()
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
ipcMain.handle('wf:getTabletUrl', () => `http://${getLocalIp()}:${boundTabletPort}`)

// Rebuilds activeServiceItems (and dependent theme/notes state) from the DB.
// This is the cache handleTabletLoadItem/computeZoneStates read to resolve an
// item id into its type/routing when going live — it does NOT update itself
// when items are added/edited in Build Service, so callers must explicitly
// refresh it after any such change or newly-added items silently fail to go
// live (found in the UI, invisible to the live-routing layer).
function refreshActiveServiceItems(serviceId: number): void {
  const svc = getService(serviceId)
  activeServiceId = serviceId
  activeServiceItems = (svc as { items: ServiceItem[] } | null)?.items ?? []
  activeServiceName = (svc as { name?: string } | null)?.name ?? ''
  activeServiceDate = (svc as { service_date?: string | null } | null)?.service_date ?? null
  serviceSlideTheme = (svc as { theme?: string | null } | null)?.theme || DEFAULT_THEME_ID
  serviceSlideThemeColors = (svc as { themeColors?: ThemeColors | null } | null)?.themeColors ?? null
  activeZoneTrackAssignment = parseZoneTrackAssignment(getZoneTrackAssignment(serviceId))
  for (const track of ['main', 'second'] as TrackId[]) {
    const t = tracks[track]
    if (t.serviceItemId != null) {
      const item = activeServiceItems.find((it) => it.id === t.serviceItemId && it.track === track)
      t.itemNotes = item?.notes ?? null
      applyItemTheme(track, item)
    }
  }
  broadcast()  // projector needs the new theme, not just the tablet
}

ipcMain.handle('wf:setActiveService', (_e, serviceId: number | null) => {
  loggedSongIds.clear()  // new/switched service → start CCLI counting fresh
  // Pins belong to the service that was on screen; carrying them into the next
  // one would hold a card from a service nobody is running any more.
  zonePins.clear()
  warnedMissingPins.clear()
  if (serviceId == null) {
    activeServiceId = null
    activeServiceItems = []
    activeServiceName = ''
    activeServiceDate = null
    activeZoneTrackAssignment = { ...DEFAULT_ZONE_TRACK }
    tracks.main.itemNotes = null
    tracks.second.itemNotes = null
    void recordingSession.onServiceEnded()  // stop OBS + write the marker sidecar
    broadcast()  // push the cleared service to tablet/zones/projector
    return
  }
  refreshActiveServiceItems(serviceId)
})
ipcMain.handle('wf:getActiveServiceId', () => activeServiceId)

// Same cache rebuild as wf:setActiveService, but without resetting CCLI usage
// tracking — call this after edits to a service that's already active (e.g.
// adding an item), not when switching which service is open.
ipcMain.handle('wf:services:refreshActiveItems', (_e, serviceId: number) => {
  refreshActiveServiceItems(serviceId)
})

ipcMain.handle('wf:service:setTheme', (_e, serviceId: number, themeId: string | null, colors: ThemeColors | null) => {
  setServiceTheme(serviceId, themeId, colors)
  // Update the baseline and re-resolve whichever track(s) have a live item (their override still wins).
  serviceSlideTheme = themeId || DEFAULT_THEME_ID
  serviceSlideThemeColors = colors
  for (const track of ['main', 'second'] as TrackId[]) {
    const t = tracks[track]
    if (t.serviceItemId != null) {
      applyItemTheme(track, activeServiceItems.find((it) => it.id === t.serviceItemId && it.track === track))
    }
  }
  broadcast()
})

// --- OBS IPCs ---
// Forward OBS status changes to the operator window.
onObsStatus((s) => {
  if (s.error) logError(`[obs] status error: ${s.error}`)
  if (operatorWin && !operatorWin.isDestroyed()) operatorWin.webContents.send('wf:obs:status', s)
})

ipcMain.handle('wf:getObsUrl', () => `http://${getLocalIp()}:${boundTabletPort}/obs`)
ipcMain.handle('wf:obs:getStatus', () => getObsStatus())
ipcMain.handle('wf:obs:connect', (_e, host: string, port: number, password: string) =>
  connectObs(host, port, password))
ipcMain.handle('wf:obs:disconnect', () => disconnectObs())
ipcMain.handle('wf:obs:startStream', () => obsStartStream())
ipcMain.handle('wf:obs:stopStream', () => obsStopStream())
ipcMain.handle('wf:obs:startRecord', () => obsStartRecord())
ipcMain.handle('wf:obs:stopRecord', () => obsStopRecord())

// --- Recording IPCs (Phase 1: capture & markers) ---
ipcMain.handle('wf:recordings:list', () => listRecordings())
ipcMain.handle('wf:recordings:markers', (_e, recordingId: number) => listRecordingMarkers(recordingId))
ipcMain.handle('wf:recordings:getAutoRecord', () => getSetting('autoRecord') !== 'off')
ipcMain.handle('wf:recordings:setAutoRecord', (_e, on: boolean) => {
  setSetting('autoRecord', on ? 'on' : 'off')
})
ipcMain.handle('wf:recordings:produce', (_e, recordingId: number, override?: { startMs?: number; endMs?: number }) =>
  renderer.produce(recordingId, override)
)
ipcMain.handle('wf:recordings:cancelRender', (_e, recordingId: number) => { renderer.cancel(recordingId) })
ipcMain.handle('wf:recordings:revealOutput', async (_e, outputPath: string) => {
  if (outputPath) shell.showItemInFolder(outputPath)
})
ipcMain.handle('wf:recordings:getAssemblySettings', () => ({
  introPath: getSetting('assemblyIntroPath'),
  outroPath: getSetting('assemblyOutroPath'),
  outputFolder: getSetting('assemblyOutputFolder')
}))
ipcMain.handle('wf:recordings:setAssemblySetting', (_e, key: 'introPath' | 'outroPath' | 'outputFolder', value: string | null) => {
  const map = { introPath: 'assemblyIntroPath', outroPath: 'assemblyOutroPath', outputFolder: 'assemblyOutputFolder' } as const
  setSetting(map[key], value)
})
ipcMain.handle('wf:recordings:pickAssemblyFile', async (_e, kind: 'video' | 'folder'): Promise<string | null> => {
  const res = await dialog.showOpenDialog(operatorWin!, kind === 'folder'
    ? { properties: ['openDirectory'] }
    : { properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm'] }] })
  if (res.canceled || res.filePaths.length === 0) return null
  return res.filePaths[0]
})
ipcMain.handle('wf:recordings:generateContent', (_e, recordingId: number) => contentRunner.generate(recordingId))
ipcMain.handle('wf:recordings:saveAi', (_e, recordingId: number, fields: { aiTitle?: string; aiDescription?: string }) => {
  setRecordingAi(recordingId, fields)
})
ipcMain.handle('wf:recordings:revealPath', async (_e, p: string) => { if (p) shell.showItemInFolder(p) })
ipcMain.handle('wf:recordings:getAnthropicKey', () => getSetting('anthropic_api_key') ?? '')
ipcMain.handle('wf:recordings:setAnthropicKey', (_e, key: string) => { setSetting('anthropic_api_key', key || null) })
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
// Auto-advance/Bible-translation/verse-number remain Main-only for now — no UI
// surface exists yet for driving these per-track (see SecondTrackTools, later task).
ipcMain.handle('wf:features:startAutoAdvance', (_e, durationMs: number, loop?: boolean) => {
  logServiceEvent(`auto-advance: ${durationMs}ms${loop ? ' (loop)' : ''}`)
  armAutoAdvance('main', durationMs, !!loop)
  broadcast()
})

ipcMain.handle('wf:features:stopAutoAdvance', () => {
  clearAutoAdvance('main')
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
  // If a scripture is currently live on Main, reload it in the new translation.
  const t = tracks.main
  if (t.scriptureRef) {
    const ref = t.scriptureRef
    const keepIndex = t.index
    // doLoadScripture can bail out (returning false, leaving t.song untouched) if
    // the track moved on to something else while this translation-reload fetch
    // was in flight — don't clobber whatever loaded in the meantime.
    if (await doLoadScripture('main', ref)) {
      t.index = Math.min(keepIndex, t.song.lines.length - 1)
      broadcast()
    }
  }
})

ipcMain.handle('wf:features:setVerseNumber', (_e, v: number | null) => {
  tracks.main.verseNumber = v
  broadcast()
})

ipcMain.handle('wf:features:getServiceLog', () => serviceLog)

ipcMain.handle('wf:features:clearServiceLog', () => {
  serviceLog.length = 0
})

// --- Diagnostics log IPC (persistent rolling log — retrievable after a live service) ---
ipcMain.handle('wf:logs:getRecent', () => getRecentLogLines(200))
ipcMain.handle('wf:logs:openFolder', async () => { await shell.openPath(getLogsDir()) })

// --- Song library IPC ---
ipcMain.handle('wf:songs:list', (_e, search?: string) => listSongs(search ?? ''))
ipcMain.handle('wf:songs:get', (_e, id: number) => getSong(id))
ipcMain.handle('wf:songs:create', (_e, input: SongInput) => createSong(input))
ipcMain.handle('wf:songs:update', (_e, id: number, input: SongInput) => updateSong(id, input))
ipcMain.handle('wf:songs:delete', (_e, id: number) => deleteSong(id))
ipcMain.handle('wf:announcements:list', (_e, search?: string) => listAnnouncements(search ?? ''))
ipcMain.handle('wf:announcements:get', (_e, id: number) => getAnnouncement(id))
ipcMain.handle('wf:announcements:create', (_e, input: AnnouncementInput) => createAnnouncement(input))
ipcMain.handle('wf:announcements:update', (_e, id: number, input: AnnouncementInput) => updateAnnouncement(id, input))
ipcMain.handle('wf:announcements:delete', (_e, id: number) => deleteAnnouncement(id))
ipcMain.handle('wf:announcements:scheduled', (_e, serviceDate: string) => listScheduledAnnouncements(serviceDate))
ipcMain.handle('wf:songs:setFontScale', (_e, id: number, scale: number) => setSongFontScale(id, scale))
ipcMain.handle('wf:songs:setTextColor', (_e: unknown, id: number, color: string | null) => {
  setSongTextColor(id, color)
  let changed = false
  for (const track of ['main', 'second'] as TrackId[]) {
    const t = tracks[track]
    if (t.songId === id) { t.songTextColor = color; changed = true }
  }
  if (changed) broadcast()
})
ipcMain.handle('wf:songs:setFont', (_e: unknown, id: number, font: string | null) => {
  setSongFont(id, font)
  let changed = false
  for (const track of ['main', 'second'] as TrackId[]) {
    const t = tracks[track]
    if (t.songId === id) { t.songFont = font; changed = true }
  }
  if (changed) broadcast()
})
ipcMain.handle('wf:songs:setBlurBehindText', (_e: unknown, id: number, value: boolean) => {
  setSongBlurBehindText(id, value)
  let changed = false
  for (const track of ['main', 'second'] as TrackId[]) {
    const t = tracks[track]
    if (t.songId === id) { t.blurBehindText = value; changed = true }
  }
  if (changed) broadcast()
})

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
ipcMain.handle('wf:services:reorder', (_e, serviceId: number, track: TrackId, orderedIds: number[]) => {
  reorderServiceItems(serviceId, track, orderedIds)
})

// ── Service Templates IPC ─────────────────────────────────────────────────────
ipcMain.handle('wf:templates:list', () => {
  return listServiceTemplates()
})

ipcMain.handle('wf:templates:save', (_e, template: { id: string; name: string; description?: string; items: any[]; theme: string | null; themeColors: any | null }) => {
  saveServiceTemplate(template)
  return template
})

ipcMain.handle('wf:templates:delete', (_e, id: string) => {
  deleteServiceTemplate(id)
})

ipcMain.handle('wf:templates:fromService', (_e, serviceId: number, templateName: string, description?: string) => {
  const service = getService(serviceId)
  if (!service) throw new Error('Service not found')
  const id = randomUUID()
  saveServiceTemplate({
    id,
    name: templateName,
    description,
    items: service.items,
    theme: service.theme,
    themeColors: service.themeColors
  })
  return id
})

// ── Zone routing IPC ──────────────────────────────────────────────────────────
ipcMain.handle('wf:zone:getRouting', (_e, itemId: number): ZoneRouting | null => {
  const raw = getItemZoneRouting(itemId)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ZoneRouting
  } catch (err) {
    console.error(`Failed to parse zone routing for item id=${itemId}:`, err)
    return null
  }
})

ipcMain.handle('wf:zone:setRouting', (_e, itemId: number, routing: ZoneRouting | null): void => {
  setItemZoneRouting(itemId, routing ? JSON.stringify(routing) : null)
  // Update item in activeServiceItems cache so zone states re-compute correctly.
  const idx = activeServiceItems.findIndex((it) => it.id === itemId)
  if (idx >= 0) activeServiceItems[idx] = { ...activeServiceItems[idx], zoneRouting: routing }
  broadcast()
})

ipcMain.handle('wf:zone:getSlides', (_e, itemId: number): ZoneSlide[] | null =>
  parseZoneSlides(getItemZoneSlides(itemId))
)

ipcMain.handle('wf:zone:setSlides', (_e, itemId: number, slides: ZoneSlide[] | null): void => {
  setItemZoneSlides(itemId, slides ? JSON.stringify(slides) : null)
  // Zone states are computed from the deck, so an edit while this item is live
  // must push fresh state to the screens. Unlike zone_routing, the deck isn't
  // (yet) part of the ServiceItem type/activeServiceItems cache, so there's no
  // cache entry to refresh there — but t.deckSlides/deckSource/deckScripture
  // are their own snapshot, taken at load time, and broadcast() alone would
  // just keep re-sending that stale snapshot. Re-run the load for any track
  // this item is currently live on, same loadGeneration discipline as every
  // other loader (bump first, so an in-flight scripture lookup from a
  // previous edit can't clobber this one when it resolves).
  for (const track of ['main', 'second'] as TrackId[]) {
    const t = tracks[track]
    if (t.serviceItemId !== itemId) continue
    t.loadGeneration++
    t.deckSlides = null  // covers the deck-just-got-removed case too (slides === null)
    if (slides) {
      const item = activeServiceItems.find((it) => it.id === itemId && it.track === track)
      if (item) void loadDeckOnto(track, item, t.loadGeneration)
    }
  }
  broadcast()
})

// Pin/unpin one screen. Full broadcast() rather than zoneBroadcast(): the
// operator UI reads pins back from state, and the recovery snapshot has to
// record the pin the moment it's set, not on the next unrelated live action.
ipcMain.handle('wf:zone:setPin', (_e, zoneId: ZoneId, pin: ZonePin | null): void => {
  if (pin == null) {
    zonePins.delete(zoneId)
  } else {
    if (!validateZonePins({ [zoneId]: pin })) throw new Error('Invalid zone pin')
    zonePins.set(zoneId, pin)
  }
  warnedMissingPins.clear()
  broadcast()
})

ipcMain.handle('wf:zone:clearPins', (): void => {
  zonePins.clear()
  warnedMissingPins.clear()
  broadcast()
})

ipcMain.handle('wf:zone:getPins', (): ZonePins => zonePinsRecord())

ipcMain.handle('wf:zone:getStates', (): Record<ZoneId, ZoneState> => {
  return computeZoneStates()
})

ipcMain.handle('wf:zone:getIp', (): string => {
  return getLocalIp()
})

// --- Per-service zone→track assignment ---
ipcMain.handle('wf:service:zoneTrackAssignment:get', (_e, serviceId: number): ZoneTrackAssignment => {
  return parseZoneTrackAssignment(getZoneTrackAssignment(serviceId))
})

ipcMain.handle('wf:service:zoneTrackAssignment:set', (_e, serviceId: number, assignment: ZoneTrackAssignment): void => {
  if (!validateZoneTrackAssignment(assignment)) throw new Error('Invalid zone track assignment')
  setZoneTrackAssignment(serviceId, JSON.stringify(assignment))
  if (serviceId === activeServiceId) {
    activeZoneTrackAssignment = assignment
    zoneBroadcast()
  }
})

// --- Scene palette (Build Service screen scenes) ---
ipcMain.handle('wf:scenes:get', () => parseSceneConfig(getSetting('zone_scenes')))
ipcMain.handle('wf:scenes:set', (_e, config: SceneConfig) => {
  if (!validateSceneConfig(config)) throw new Error('Invalid scene configuration')
  setSetting('zone_scenes', JSON.stringify(config))
  broadcast() // typeDefaults may have changed → zones with default routing re-resolve
})

ipcMain.handle('wf:app:getTabletPort', async (): Promise<number> => {
  return boundTabletPort
})

ipcMain.handle('wf:app:restoreRecovery', async (): Promise<{ ok: boolean; restored?: boolean; fallback?: boolean }> => {
  // At this point, the renderer has been created and activeServiceItems is populated
  const recovered = readRecovery()
  if (!recovered) return { ok: true, restored: false }

  let restoredAny = false
  let fallbackAny = false

  const restoreTrack = async (track: TrackId, snap: { liveServiceItemId: number | null; slideIndex: number } | null): Promise<void> => {
    if (!snap?.liveServiceItemId) return
    const item = activeServiceItems.find((i) => i.id === snap.liveServiceItemId && i.track === track)
    if (item) {
      await handleTabletLoadItem(track, item.id)
      const t = tracks[track]
      if (snap.slideIndex >= 0 && snap.slideIndex < t.song.lines.length) {
        t.index = snap.slideIndex
      }
      restoredAny = true
    } else {
      // Item was deleted; load first same-track item as fallback
      const firstItem = activeServiceItems.find((i) => i.track === track)
      if (firstItem) {
        await handleTabletLoadItem(track, firstItem.id)
        tracks[track].index = 0
        fallbackAny = true
      }
    }
  }

  await restoreTrack('main', recovered.main)
  await restoreTrack('second', recovered.second)

  // Put held screens back exactly as the operator left them — except a
  // titleCard pin whose item is gone from the service (deleted, or a different
  // service is now active): that would hold a screen on nothing.
  zonePins.clear()
  warnedMissingPins.clear()
  if (validateZonePins(recovered.pins ?? {})) {
    for (const [key, pin] of Object.entries(recovered.pins ?? {})) {
      if (!pin) continue
      if (pin.kind === 'titleCard' && !activeServiceItems.some((i) => i.id === pin.itemId)) {
        logWarn(`[zones] dropping recovered pin for zone ${key} — item id=${pin.itemId} is not in the active service`)
        continue
      }
      zonePins.set(Number(key) as ZoneId, pin)
    }
  }

  broadcast()
  return { ok: true, restored: restoredAny, fallback: fallbackAny }
})

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

  let bundle: {
    version: number
    name: string
    service_date: string | null
    theme: string | null
    themeColors: ThemeColors | null
    items: Array<(ServiceFull['items'][number]) & { song: SongFull | null }>
  }
  try {
    bundle = JSON.parse(readFileSync(filePaths[0], 'utf-8')) as {
      version: number
      name: string
      service_date: string | null
      theme: string | null
      themeColors: ThemeColors | null
      items: Array<(ServiceFull['items'][number]) & { song: SongFull | null }>
    }
  } catch (err) {
    await dialog.showErrorBox('Import Failed', `Invalid service file: ${err instanceof Error ? err.message : String(err)}`)
    return { canceled: false, serviceId: null }
  }

  // Validate structure
  if (!bundle.version || !Array.isArray(bundle.items)) {
    await dialog.showErrorBox('Import Failed', 'Invalid service file: missing version or items array')
    return { canceled: false, serviceId: null }
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
ipcMain.handle('wf:live:goLiveAt', async (_e, track: TrackId, itemId: number, slideIndex: number) => {
  await handleTabletLoadItem(track, itemId)  // loads the item live (index 0) + broadcasts + resolves theme
  const t = tracks[track]
  const last = t.song.lines.length - 1
  t.index = Math.max(0, Math.min(slideIndex, last < 0 ? 0 : last))
  broadcast()
})

// --- Scripture IPC ---
ipcMain.handle('wf:scripture:lookup', (_e, reference: string) => lookupScripture(reference))

// --- Song background / file dialog ---
ipcMain.handle('wf:songs:setBackground', (_e, id: number, path: string | null) =>
  setSongBackground(id, path)
)

// Push a background update to whatever's currently live, without resetting slide
// index/timer/other live state (used by the Live-tab drawer's Backgrounds tab so
// a background change mid-service doesn't jump back to the first slide/reset a timer).
ipcMain.handle('wf:live:setBackground', (_e, track: TrackId, path: string) => {
  const t = tracks[track]
  t.song = { ...t.song, background: path }
  broadcast()
})

// Background library
ipcMain.handle('wf:bg:list', () => listBackgrounds())

ipcMain.handle('wf:bg:openFolder', () => openBackgroundsFolder())

ipcMain.handle('wf:bg:upload', async (_e: unknown, srcPath: string) => {
  return copyBackground(srcPath)
})

ipcMain.handle('wf:bg:delete', (_e: unknown, filePath: string) => {
  deleteBackground(filePath)
})

ipcMain.handle('wf:bg:generate', async (_e: unknown, prompt: string) => {
  const provider = getSetting('ai_provider') ?? 'pollinations'

  if (provider === 'replicate') {
    const apiKey = getSetting('replicate_api_key')
    if (!apiKey) {
      throw new Error('Replicate API key not set. Switch to Free, or paste your key in the AI Generate tab, then Save.')
    }
    try {
      console.log('[bg:generate] Using Replicate API')
      return await generateBackgroundImage(prompt, apiKey)
    } catch (err) {
      console.error('[bg:generate] Replicate failed:', err)
      throw new Error(`Replicate image generation failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Use free Pollinations with automatic retry
  try {
    console.log('[bg:generate] Using Pollinations (free, no key)')
    return await generatePollinationsImage(prompt)
  } catch (err) {
    console.error('[bg:generate] Pollinations failed:', err)
    throw new Error(`Image generation failed: ${err instanceof Error ? err.message : String(err)}. Try switching to Replicate if the issue persists.`)
  }
})

ipcMain.handle('wf:bg:openDialog', async () => {
  if (!operatorWin) return { canceled: true, filePaths: [] }
  return dialog.showOpenDialog(operatorWin, {
    title: 'Select background image or video',
    filters: [
      { name: 'Media', extensions: ['mp4', 'webm', 'mov', 'jpg', 'jpeg', 'png', 'webp', 'gif'] }
    ],
    properties: ['openFile']
  })
})

// Background tags
ipcMain.handle('wf:bg:getTags', (_e: unknown, filePath: string) => {
  return getBackgroundTags(filePath)
})

ipcMain.handle('wf:bg:setTags', (_e: unknown, filePath: string, tags: string[]) => {
  setBackgroundTags(filePath, tags)
})

ipcMain.handle('wf:bg:search', (_e: unknown, tags: string[]) => {
  return searchBackgroundsByTags(tags)
})

ipcMain.handle('wf:bg:autoTag', (_e: unknown, filePath: string) => {
  // Simple auto-tagging based on filename
  const filename = basename(filePath).toLowerCase()
  const tags: string[] = []

  if (/worship|praise|god|jesus|holy/i.test(filename)) tags.push('worship')
  if (/prayer|pray|intercede/i.test(filename)) tags.push('prayer')
  if (/energy|energetic|electric|dynamic|high/i.test(filename)) tags.push('energetic')
  if (/peace|calm|serene|quiet|still|meditat/i.test(filename)) tags.push('peaceful')
  if (/joy|celebrate|celebrat|happy|glad/i.test(filename)) tags.push('joyful')
  if (/dark|night|shadow|black/i.test(filename)) tags.push('dark')
  if (/light|bright|white|glow/i.test(filename)) tags.push('bright')
  if (/nature|green|earth|tree|outdoor/i.test(filename)) tags.push('nature')
  if (/city|urban|abstract|geometric/i.test(filename)) tags.push('modern')
  if (/seasonal|christmas|easter|advent/i.test(filename)) tags.push('seasonal')

  // If no tags detected, add generic 'other'
  if (tags.length === 0) tags.push('other')

  setBackgroundTags(filePath, tags)
  return tags
})

ipcMain.handle('wf:songs:setBgMotion', (_e: unknown, id: number, motion: string | null) => {
  setSongBgMotion(id, motion)
})

// Settings getter/setter (used by Settings tab for API keys etc.)
ipcMain.handle('wf:setting:get', (_e: unknown, key: string) => getSetting(key))
ipcMain.handle('wf:setting:set', (_e: unknown, key: string, value: string | null) => setSetting(key, value))

// Pop-out song editor window
let editorWin: BrowserWindow | null = null
ipcMain.handle('wf:editor:open', (_e: unknown, songId: number) => {
  if (editorWin && !editorWin.isDestroyed()) {
    editorWin.focus()
    loadRoute(editorWin, '/editor', { songId: String(songId) })
    return
  }
  editorWin = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    title: 'WorshipFlow Pro — Song Editor',
    icon: APP_ICON,
    backgroundColor: '#0b0b0f',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: PRELOAD, sandbox: false }
  })
  editorWin.on('closed', () => { editorWin = null })
  loadRoute(editorWin, '/editor', { songId: String(songId) })
  editorWin.once('ready-to-show', () => {
    editorWin?.maximize()
    editorWin?.show()
  })
})
let serviceWin: BrowserWindow | null = null
ipcMain.handle('wf:service:open', (_e: unknown, serviceId: number) => {
  if (serviceWin && !serviceWin.isDestroyed()) {
    serviceWin.focus()
    loadRoute(serviceWin, '/service', { serviceId: String(serviceId) })
    return
  }
  serviceWin = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    title: 'WorshipFlow Pro — Service Builder',
    icon: APP_ICON,
    backgroundColor: '#0b0b0f',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: PRELOAD, sandbox: false }
  })
  serviceWin.on('closed', () => { serviceWin = null })
  loadRoute(serviceWin, '/service', { serviceId: String(serviceId) })
  serviceWin.once('ready-to-show', () => {
    serviceWin?.maximize()
    serviceWin?.show()
  })
})
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

// Create a timestamped backup of the database on app launch
function createTimestampedBackup(): void {
  const dbPath = join(app.getPath('userData'), 'worshipflow.db')
  const bakDir = join(app.getPath('userData'), 'backups')

  try {
    if (!existsSync(bakDir)) mkdirSync(bakDir, { recursive: true })
    const now = new Date()
    const timestamp = now.toISOString().replace(/[:\-]/g, '').split('.')[0]
    const backupPath = join(bakDir, `worshipflow-${timestamp}.db`)
    if (existsSync(dbPath)) {
      copyFileSync(dbPath, backupPath)
      console.log(`Backup created: ${backupPath}`)
    }
    pruneBackups(bakDir, 40)
  } catch (err) {
    console.error('Failed to create backup:', err)
  }
}

// Keep the most recent `keep` launch backups; delete older ones so the backups
// folder can't grow without bound and eventually fill the media PC's disk.
function pruneBackups(bakDir: string, keep: number): void {
  try {
    const files = readdirSync(bakDir)
      .filter((f) => /^worshipflow-.*\.db$/.test(f))
      .sort()  // ISO-ish timestamp in the name sorts chronologically
    for (const f of files.slice(0, Math.max(0, files.length - keep))) {
      try { unlinkSync(join(bakDir, f)) } catch { /* ignore individual failures */ }
    }
  } catch (err) {
    console.error('Failed to prune backups:', err)
  }
}

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
  // Belt-and-suspenders: never touch the DB or open windows on a losing instance.
  if (!gotSingleInstanceLock) return
  protocol.handle('wf-asset', async (request) => {
    const url = new URL(request.url)
    const pathParam = url.searchParams.get('path')
    if (!pathParam) {
      return new Response('Missing path parameter', { status: 400 })
    }
    const validPath = validateMediaPath(pathParam)
    if (!validPath) {
      return new Response('Access denied: path is outside media directories', { status: 403 })
    }
    const fileUrl = 'file:///' + validPath.replace(/\\/g, '/')
    const headers: Record<string, string> = {}
    const range = request.headers.get('range')
    if (range) headers['range'] = range
    // A moved/deleted/unplugged media file should surface as a logged 404, not a
    // silent blank projector slide with nothing to diagnose afterward.
    try {
      return await net.fetch(fileUrl, { headers })
    } catch (err) {
      logWarn(`[wf-asset] failed to load media: ${validPath} — ${(err as Error)?.message ?? err}`)
      return new Response('Media file not found', { status: 404 })
    }
  })

  // Snapshot the last-good database file BEFORE initDb() runs migrations, so a bad
  // migration can never poison the day's backup.
  createTimestampedBackup()
  // The database must be initialized before anything reads it — SoundCheckState
  // loads its saved rules/reference mixes during initialize(), so initDb() has to
  // run first or that read hits an undefined db handle and silently fails.
  await initDb()
  // Reconcile any recording left open by a crash/hard-quit so it doesn't stay
  // dangling forever — mark it ended now.
  closeDanglingRecordings(Date.now())
  // Surface save failures to the operator instead of losing them to the console.
  onPersistError((err) => {
    logError('[persist] save failed', err)
    notifyOperator('Save failed — your last change may not be saved. Check disk space and pause Google Drive/OneDrive sync.', 'error')
  })
  ccliLicense = getSetting('ccli_license')
  logoPath = getSetting('logo_path')
  logoBg = getSetting('logo_bg')

  const soundCheckState = new SoundCheckState()
  await soundCheckState.initialize()
  registerSoundCheckHandlers(soundCheckState)

  startTabletServer()
  createOperator()
  // Fullscreen the audience output on a projector at launch, so the congregation
  // screen is never left dark waiting for a hotplug event. With no projector
  // attached this opens the zone multiview instead of a stray output window.
  layoutOutputs()
  broadcast()
  // Reconnect to OBS in the background if the operator connected before (non-blocking).
  void initObsAutoConnect()
  // Debounced + change-guarded so DPI/resolution/sleep-wake churn doesn't tear
  // down and rebuild the live output (a mid-service black flash).
  screen.on('display-added', scheduleLayoutOutputs)
  screen.on('display-removed', scheduleLayoutOutputs)
  screen.on('display-metrics-changed', scheduleLayoutOutputs)

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

// Release the LAN server socket + timers on quit so a relaunch doesn't hit
// EADDRINUSE and leave the tablet/zone/OBS layer silently dead.
app.on('before-quit', () => {
  // Best-effort final stop so a quit mid-service still finalizes the recording +
  // writes its sidecar (fire-and-forget; the app is shutting down regardless).
  if (recordingSession.isActive()) void recordingSession.onServiceEnded()
  stopTabletServer()
  clearCountdown('main')
  clearAutoAdvance('main')
  clearCountdown('second')
  clearAutoAdvance('second')
})
