import { app, shell, BrowserWindow, screen, ipcMain, dialog, protocol, net, powerMonitor } from 'electron'
import { isRestorableBackupName, parseBackupFilename, type BackupKind, preRestoreCopiesToPrune } from '../shared/backupNames'
import { nextOrderSnapshot, pickAdjacentItem } from '../shared/deckAdjacent'
import { describeImport, parseServiceBundle, referencedMediaPaths, sameSong, songContentDiffers, songInputFrom, uniqueServiceName, announcementRefs, bundleAnnouncementFrom, announcementInputFrom, sameAnnouncement, remapAnnouncementItem, BUNDLE_VERSION, type BundleAnnouncement, type BundleItem, type ImportSummary } from '../shared/serviceBundle'
import type { ServiceImportResult } from '../shared/types'
import { OPERATOR_MIN_WIDTH } from '../shared/layoutLimits'
import { registerSoundCheckHandlers } from './sound-check/sound-check-ipc'
import { SoundCheckState } from './sound-check/sound-check-state'
import { join, basename, dirname, resolve, relative, isAbsolute } from 'path'
import { randomUUID, randomInt, randomBytes } from 'crypto'
import { createServer, type IncomingMessage } from 'http'
import { readFileSync, writeFileSync, statSync, createReadStream, existsSync, realpathSync, copyFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { promises as fsPromises } from 'fs'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
const execFileAsync = promisify(execFile)
import { WebSocketServer } from 'ws'
import type { WebSocket as WsSocket } from 'ws'
import type { Intent, LiveState, DisplayInfo, AppInfo, Mode, SongInput, SongFull, NewServiceItem, ServiceItem, ServiceFull, Theme, SceneContext, BibleTranslation, ScriptureResult, ScriptureVerse, ParsedPptxSong, ThemeColors, ItemStyle, ZoneId, ZoneMode, ZoneState, ZoneRouting, TrackId, AnnouncementInput, LivecallConfig } from '../shared/types'
import { DEFAULT_ZONE_TRACK } from '../shared/types'
import { stageItemTitle } from '../shared/stageNext'
import { parseSceneConfig, validateSceneConfig, defaultRoutingFor, generatedDeckYieldsTo } from '../shared/zoneScenes'
import type { SceneConfig } from '../shared/zoneScenes'
import { parseServiceControlModeMapping, validateServiceControlModeMapping } from '../shared/serviceControlModes'
import { operatorCloseDecision, outputCloseAllowed, RendererRecovery, crashReasonText, wasOnRemovedDisplay, trackShowing, closePromptText } from '../shared/windowPolicy'
import type { ServiceControlModeMapping } from '../shared/serviceControlModes'
import { parseZoneTrackAssignment, validateZoneTrackAssignment } from '../shared/zoneTrack'
import { parseReferenceList, formatReferenceList, rangeReference, verseLines, deckVerseText, numberedVerseLines } from '../shared/scriptureRefs'
import { normalizeReference } from '../shared/scriptureParse'
import { reflowSlideTexts } from '../shared/reflowText'
import { chunkVerses } from '../shared/chunkText'
import type { ZoneTrackAssignment } from '../shared/zoneTrack'
import { parseZoneSlides, resolveSlot, slideSummary } from '../shared/zoneSlides'
import type { ZoneSlide, ZoneSlot } from '../shared/zoneSlides'
import { validateZonePins } from '../shared/zonePins'
import type { ZonePin, ZonePins } from '../shared/zonePins'
import { parseLooksConfig, validateLook } from '../shared/zoneLooks'
import type { Look } from '../shared/zoneLooks'
import { zoneTrackFor, idleModeFor, clampSongIndex, STAGE_REHEARSAL_OFF } from '../shared/stageRehearsal'
import type { StageRehearsalState } from '../shared/stageRehearsal'
import { DEFAULT_THEME_ID, getTheme, resolveColors } from '../shared/themes'
import { DEMO_SONG } from './demoSong'
import { readRecovery, writeRecovery, isRecoveryStale, markCleanExit, wasCleanExit, type TrackSnapshot, type RecoverySnapshot } from './recovery'
import { StartupRecovery } from './startupRecovery'
import { recoveredLayers } from './recoveryPlan'
import { stripChords, formatSlideChords } from '../shared/chords'
import { applyAudienceLayers } from '../shared/layers'
import { detectNdiRuntime } from '../shared/ndiRuntime'
import { seedSampleSunday } from './sampleSunday'
import { importSongSelectFile, openSongSelectWindow } from './songSelect'
import { showErrorAsync } from './errorDialog'
import { setRoomFeedActive } from './roomFeedPrecedence'
import { markZoneConnected, markZoneDisconnected, getConnectedZoneIds } from './zoneConnections'
import { assertTrackId, assertZoneId, isIntent, isPositiveInt, assertIsoDateOrNull } from './ipcValidate'
import {
  initDb,
  checkDatabaseOnStartup,
  forceRestoreLatestBackup,
  restoreMissingFromBackup,
  validateDatabaseFile,
  onPersistError,
  DbConflictError,
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
  setServicePublished,
  getServiceTeam,
  setServiceTeam,
  addServiceItem,
  replaceServiceItem,
  duplicateServiceItem,
  removeServiceItem,
  moveServiceItem,
  updateServiceItemNotes,
  getSetting,
  setSetting,
  getSecretSetting,
  setSecretSetting,
  recordSongUsage,
  listSongUsage,
  clearSongUsage,
  setServiceTheme,
  setServiceDate,
  setServiceItemStyle,
  setServiceItemPayload,
  reorderServiceItems,
  getServiceIdForItem,
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
  renameBackgroundTagPath,
  findBackgroundUsage,
  createRecording,
  addRecordingMarker,
  finalizeRecording,
  listRecordingMarkers,
  listRecordings,
  closeDanglingRecordings,
  getRecording,
  setRecordingRender,
  setRecordingAi,
  listStoredMediaPaths,
  rewriteStoredMediaPaths,
  databaseMentions,
} from './db'
import { importMediaFile, mediaProblemFor, migrateOutsidePaths, planImportedMediaCleanup, safeCleanupName, MediaImportRefused, servablePath, MEDIA_EXTENSIONS, type MediaRoots } from './mediaImport'
import {
  listBackgrounds, copyBackground, deleteBackground, openBackgroundsFolder,
  listBackgroundFolders, createBackgroundFolder, renameBackgroundFolder, moveBackground, deleteBackgroundFolder
} from './backgroundLib'
import { generateBackgroundImage } from './replicateApi'
import { generatePollinationsImage } from './pollinationsApi'
import { lookupScripture } from './scripture'
import { buildSermonSlides, type SermonVerse, type SermonSlide } from '../shared/sermonVerses'
import { autoDeckFor } from './autoDeck'
import { deckIndexForVerse } from './deckPosition'
import type { AutoDeckDeps } from './autoDeck'
import { TABLET_PORT, tabletHtml } from './tabletHtml'
import { pulpitHtml } from './pulpitHtml'
import { attachLivecallSignaling } from './livecallSignaling'
import { phoneClientHtml } from './phoneClientHtml'
import { roomFeedViewerHtml } from './roomFeedViewerHtml'
import { OBS_HTML } from './obsHtml'
import { zoneHtmlFor } from './zoneHtml'
import { MULTIVIEW_HTML } from './multiviewHtml'
import { parsePptx, parsePptxService } from './pptx'
import { mapPlanItems } from './planImport'
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
import { atomicCopy, moveAside, readRestoreAttempt, recordRestoreAttempt, clearRestoreAttempt, type DbStartupReport } from './dbRecovery'
import { initAutoUpdate } from './autoUpdate'
import { updateInstallBlockReason } from '../shared/updatePolicy'
import { planNav } from '../shared/liveNav'
import { nextPreview, textCardSlides, tickerLine } from '../shared/liveDisplay'
import { createRecordingSession } from './recording'
import ffmpegStatic from 'ffmpeg-static'
import { createRenderer } from './render'
import { createContentRunner } from './content'
import { ACTIVE_SERVICE_SETTING, activeServiceSettingValue, parseActiveServiceSetting } from '../shared/activeService'
import { shouldClearHiddenText, modeAfterAsyncLoad, textHideBlocker, textHideNotice } from '../shared/layerReset'

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
// but the packaged Electron userData folder MUST stay "worshipflow" — that's where the
// existing songs/services database, settings, and media already live. Development uses
// a workspace-local folder so it can run in restricted environments without touching or
// locking the production profile. Runs at module load, before whenReady and before any
// getPath('userData') use.
//
// Unpackaged runs honour an explicit `--user-data-dir=<dir>` (or WF_USER_DATA_DIR)
// so the Playwright e2e suite really does get a throwaway profile per test —
// without this, every e2e run silently shared <repo>/.worshipflow-dev with the
// developer's own dev database and with every other run. Packaged builds are
// unchanged: they always use the real %APPDATA%\worshipflow profile.
const devUserDataOverride = app.commandLine.getSwitchValue('user-data-dir') || process.env['WF_USER_DATA_DIR'] || ''
const userDataPath = app.isPackaged
  ? join(app.getPath('appData'), 'worshipflow')
  : (devUserDataOverride ? resolve(devUserDataOverride) : join(process.cwd(), '.worshipflow-dev'))
app.setPath('userData', userDataPath)
// Some development containers do not expose a usable GPU process. Keep the
// packaged app on normal hardware acceleration, but let local development
// render through software so the operator window can still open for UI review.
if (!app.isPackaged) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
  app.commandLine.appendSwitch('in-process-gpu')
}

// Windows taskbar identity + icon. setAppUserModelId gives the app a stable identity so
// Windows groups/pins it as "WorshipFlow Pro" rather than a generic Electron entry. The
// per-window `icon` (below) is what actually shows in the taskbar and title bar; guard on
// existsSync so a missing build/icon.ico falls back to Electron's default instead of erroring.
app.setAppUserModelId('com.snowhillchurch.worshipflow-pro')
const iconFile = join(app.getAppPath(), 'build', 'icon.ico')
const APP_ICON = existsSync(iconFile) ? iconFile : undefined

// Helper to safely resolve a path and ensure it's within allowed media roots
// The only folders the projector (wf-asset://) and the LAN tablet /file route
// may load from. Anything an operator picks from elsewhere is copied into
// imported-media first (QA B2-N1, see mediaImport.ts).
function mediaRoots(): MediaRoots {
  const ud = app.getPath('userData')
  const mediaDir = join(ud, 'imported-media')
  return { mediaDir, allowedRoots: [join(ud, 'backgrounds'), mediaDir, join(ud, 'generated')], userDataDir: ud }
}

function validateMediaPath(requestedPath: string): string | null {
  // Pure logic in mediaImport.ts (servablePath) so it's unit-tested (QA A3-N1).
  return servablePath(requestedPath, mediaRoots().allowedRoots, [logoPath, logoBg])
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
// Set in before-quit. Window close guards (operator confirm, output Alt+F4
// block) only apply while the app is NOT shutting down.
let isQuitting = false
let quitStarted = false  // before-quit or an OS session-end already ran
const rendererRecovery = new RendererRecovery()

// QA A-L3: a Windows shutdown / log-off doesn't run before-quit, so cleanExit
// was never written and the next launch (within 12 h) was treated as a crash
// and pushed the last live item back onto the projectors. Windows emits
// session-end on each window (WM_ENDSESSION) just before the process is ended:
// record a clean exit there, and drop the close guards.
function onSessionEnd(): void {
  if (quitStarted) return
  isQuitting = true
  quitStarted = true
  logInfo('[lifecycle] OS session ending — recording a clean exit')
  markCleanExit(true)
  if (recordingSession.isActive()) void recordingSession.onServiceEnded()
}
function watchSessionEnd(win: BrowserWindow): void {
  win.on('session-end', onSessionEnd)
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  // app.quit() is async and does NOT stop this module from continuing to run —
  // the whenReady handler would still fire, open the DB, and persist() it back
  // over the live file (the data-loss incident). app.exit() terminates now, and
  // the whenReady body also guards on the lock as belt-and-suspenders.
  app.exit(0)
} else {
  app.on('second-instance', () => {
    // QA A-C2: if the operator window is gone (closed, or its renderer died
    // and the window was torn down), double-clicking the desktop icon must
    // bring control back instead of silently doing nothing.
    if (!app.isReady() || isQuitting) return
    if (!operatorWin || operatorWin.isDestroyed()) {
      createOperator()
      return
    }
    // QA A-N3: a crashed renderer leaves the window neither null nor destroyed,
    // so this used to just focus a dead operator. Launching the app again is
    // what a volunteer does — revive every crashed window, ignoring the cap.
    reviveCrashedWindows()
    if (operatorWin.isMinimized()) operatorWin.restore()
    operatorWin.show()
    operatorWin.focus()
  })
}

// Canonical live state — one LiveTrackState per track (Main always exists;
// Second is created eagerly too but stays empty/unused until a service has
// track:'second' items). See docs/superpowers/specs/2026-07-24-dual-live-track-design.md.
interface LiveTrackState {
  song: { title: string; lines: string[]; background?: string | null; bgMotion?: string | null; icon?: string | null; slideTitles?: string[] | null }
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
  // loadGeneration at the moment "Clear lyrics" (C) was last turned on — so a
  // slow load that started before it doesn't undo it (QA A-N4, shared/layerReset.ts).
  textHiddenAtGeneration: number
  // loadGeneration when Black or Logo was last pressed — an async load that
  // started before then keeps the operator's blank (QA A2-N2, shared/layerReset.ts).
  blankedAtGeneration: number
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
  // True when deckSlides came from autoDeckFor rather than a deck the operator
  // built in the composer. A generated deck is only a default, so it yields to
  // an explicit per-item routing choice; an authored one does not.
  // Only ever read while deckSlides is non-null, and loadDeckOnto is the single
  // place that sets deckSlides non-null (everywhere else clears it), so this
  // cannot be read stale.
  deckIsGenerated: boolean
  // The live item's OWN resolved source slides, for 'slide' slots (an index
  // into the item's normal content, not into the deck itself).
  deckSource: string[]
  // Pre-resolved scripture text for every deck slot of kind 'scripture', keyed
  // `${slideIndex}:${zoneId}`. Populated once at load time by loadDeckOnto —
  // computeZoneStates only ever reads this map, never triggers a lookup.
  deckScripture: Map<string, string>
  // The current sermon's resolved slides (intro + one per verse), when the
  // live item is a sermon with verses. Index-aligned with t.song.lines/t.index
  // — see buildSermonSlides. null for every non-sermon item.
  sermonSlides: SermonSlide[] | null
  // The loadGeneration whose doLoadScripture put a one-line-per-verse list on
  // this track (what the screens show until the item's deck lands), so
  // loadDeckOnto knows t.index is a verse index it can carry onto the deck.
  verseListGeneration: number
  overlayTicker: string | null
  // True only while a ticker-display announcement is loaded (QA A-C1/A-H2):
  // the explicit replacement for the old songTitle === 'Announcement' sentinel.
  isTicker: boolean
  textHidden: boolean
  bgHidden: boolean
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
    textHiddenAtGeneration: -1,
    blankedAtGeneration: -1,
    hasLiveContent: false,
    deckSlides: null,
    deckIsGenerated: false,
    deckSource: [],
    deckScripture: new Map(),
    sermonSlides: null,
    verseListGeneration: -1,
    overlayTicker: null,
    isTicker: false,
    textHidden: false,
    bgHidden: false
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
// Per-screen output scale (percent), keyed by ZoneId. Cached in memory —
// computeZoneStates can fire every 100ms during auto-advance, so this must not
// hit the DB on every broadcast the way a fresh getSetting() call would.
let zoneScales: Record<ZoneId, number> = { 1: 100, 2: 100, 3: 100, 4: 100 }
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
// Live Call signaling runs on the same port under /livecall, but in its own
// WebSocketServer with its own client set — see the upgrade router below.
let livecallWss: WebSocketServer | null = null
let tabletHeartbeat: ReturnType<typeof setInterval> | null = null
let boundTabletPort = TABLET_PORT

// PIN-gates tablet-remote CONTROL (intents/loadItem/stage-message clear) only.
// State/zone broadcasts stay open to every connection: the Pi zone screens share
// this same WS server and have no way to enter a PIN, and read-only mirrored
// state isn't the exposure — an unauthenticated stranger driving the live show is.
const authedTabletClients = new WeakSet<WsSocket>()
const tabletAuthFailures = new Map<string, { count: number; lockedUntil: number }>()
const TABLET_AUTH_MAX_FAILURES = 5
const TABLET_AUTH_LOCKOUT_MS = 60_000
// Zone Pi kiosks are the screens the congregation is looking at, so a dropped
// connection needs to surface fast. The loop below is single-strike (a client
// that misses one ping/pong round trip is terminated on the very next tick),
// so 8s means worst case ~8s before markZoneDisconnected fires, not the old ~30s.
const TABLET_HEARTBEAT_INTERVAL_MS = 8_000

function getTabletPin(): string {
  const existing = getSetting('tablet_pin')
  if (existing) return existing
  const pin = String(randomInt(0, 1_000_000)).padStart(6, '0')
  setSetting('tablet_pin', pin)
  return pin
}

function regenerateTabletPin(): string {
  const pin = String(randomInt(0, 1_000_000)).padStart(6, '0')
  setSetting('tablet_pin', pin)
  return pin
}

// Shared PIN-lockout state check, reused by both the tablet WS 'auth' message
// handler and the HTTP PIN gate on /phone and /room-feed below — one place
// that knows the lockout window, so both surfaces stay in lockstep instead of
// drifting into two counters with different reset behavior.
function tabletLockoutMs(remoteIp: string): number {
  const failure = tabletAuthFailures.get(remoteIp)
  if (failure && failure.lockedUntil > Date.now()) return failure.lockedUntil - Date.now()
  return 0
}

// Verifies a submitted PIN against getTabletPin(), recording the attempt in
// tabletAuthFailures exactly like the WS path always has. Only call this for
// an actual attempt (a PIN was submitted) — a bare page load with no PIN
// should check tabletLockoutMs() instead so simply visiting the page doesn't
// itself count as a failed guess.
function checkTabletPin(remoteIp: string, pin: string | undefined): { ok: true } | { ok: false; lockedOutMs: number } {
  const lockedOutMs = tabletLockoutMs(remoteIp)
  if (lockedOutMs > 0) return { ok: false, lockedOutMs }
  if (typeof pin === 'string' && pin === getTabletPin()) {
    tabletAuthFailures.delete(remoteIp)
    return { ok: true }
  }
  const failure = tabletAuthFailures.get(remoteIp)
  const fails = (failure?.count ?? 0) + 1
  tabletAuthFailures.set(remoteIp, {
    count: fails,
    lockedUntil: fails >= TABLET_AUTH_MAX_FAILURES ? Date.now() + TABLET_AUTH_LOCKOUT_MS : 0
  })
  return { ok: false, lockedOutMs: 0 }
}

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
  getSetting: getSecretSetting, // both keys this reads (replicate/anthropic) are secrets
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

// Crash recovery throttle: writeRecovery() is a synchronous electron-store
// disk write, and broadcast() runs ~10x/sec while auto-advance is armed. Skip
// the write when nothing recoverable actually changed since the last one we
// wrote. Deliberately excludes serviceId/ts (a timestamp always differs, and
// a real service change always shows up as a track change too) — this is a
// JSON snapshot of everything else "actually live": per-track item/index/mode
// plus zone pins (a crash mid-hold must not silently drop a pinned screen).
let lastWrittenRecoveryKey: string | null = null
// QA A2-N1: the previous session's snapshot, read once before this session's
// first recovery write (see startupRecovery.ts) — restoreRecovery uses it.
const startupRecovery = new StartupRecovery<RecoverySnapshot>(readRecovery, wasCleanExit)

// Rehearsal mode: a global, session-only (never persisted — always starts OFF)
// flag carried on LiveState. Real physical outputs check it and show nothing;
// operator-facing previews ignore it. See the field's comment in shared/types.ts.
let rehearsalMode = false

// Stage Rehearsal: singers run through the active service's songs, in order,
// on the Stage Monitor (Zone 4) via the Second track, while Zones 1-3 loop
// through the service's announcements on Main. Session-only, same "never
// persisted, always starts OFF" contract as rehearsalMode above — see
// shared/stageRehearsal.ts for the zone precedence.
let stageRehearsal: StageRehearsalState = STAGE_REHEARSAL_OFF
let stageRehearsalAnnouncementTimer: ReturnType<typeof setInterval> | null = null
let stageRehearsalAnnouncementIndex = 0
// doLoadAnnouncement never sets serviceItemId, so this stays pinned to
// whatever Main held when rehearsal armed; any REAL load (which does set
// serviceItemId, via handleTabletLoadItem or the Go-Live IPC handler) breaks
// the match and triggers disarm. Checked on every tick so a real "Go Live" or
// Next/Prev during rehearsal is detected as a hijack instead of getting
// silently overwritten by the next announcement.
// This check-then-load-then-rebaseline sequence below is race-free only
// because doLoadAnnouncement (and doLoadText, which it calls) has no real
// await that yields to the event loop before resolving — if either ever
// gains one, an operator's load landing in that window could get silently
// absorbed into the rebaseline instead of triggering disarm.
let stageRehearsalMainBaselineItemId: number | null = null

function clearStageRehearsalAnnouncementTimer(): void {
  if (stageRehearsalAnnouncementTimer) {
    clearInterval(stageRehearsalAnnouncementTimer)
    stageRehearsalAnnouncementTimer = null
  }
}

// One announcement every 8s, looping — long enough to actually read, short
// enough that a short rehearsal still sees the rotation.
const STAGE_REHEARSAL_ANNOUNCEMENT_MS = 8000

function armStageRehearsalAnnouncementLoop(queue: number[]): void {
  clearStageRehearsalAnnouncementTimer()
  if (queue.length === 0) return
  stageRehearsalAnnouncementIndex = 0
  stageRehearsalAnnouncementTimer = setInterval(() => {
    if (!stageRehearsal.active || queue.length === 0) return
    // If Main no longer holds what we last put there, the operator has
    // loaded real content (Go Live, Next/Prev, tablet remote) since the last
    // tick — the real service has started. Disarm instead of clobbering it
    // with another announcement; this is the same off-path as the manual
    // "turn rehearsal off" IPC handler below.
    if (tracks.main.serviceItemId !== stageRehearsalMainBaselineItemId) {
      clearStageRehearsalAnnouncementTimer()
      stageRehearsal = STAGE_REHEARSAL_OFF
      broadcast()
      return
    }
    stageRehearsalAnnouncementIndex = (stageRehearsalAnnouncementIndex + 1) % queue.length
    void doLoadAnnouncement('main', queue[stageRehearsalAnnouncementIndex]).then(() => {
      stageRehearsalMainBaselineItemId = tracks.main.serviceItemId
      broadcast()
    })
  }, STAGE_REHEARSAL_ANNOUNCEMENT_MS)
}

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
  // A deck advances on its own index regardless of t.mode — a sermon deck sits
  // at mode 'logo' by design, and treating that as "nothing left to advance to"
  // reported every sermon as finished the moment it went live, which fed
  // auto-advance's loop/stop decision the wrong answer. A verses-based sermon
  // (see doLoadSermon) also sits at mode 'logo' with no deck (it deliberately
  // skips loadDeckOnto), so it needs the same exception.
  const followsIndex = t.mode === 'lyrics' || !!t.deckSlides || !!t.sermonSlides
  const atLastSlide = followsIndex ? t.index >= t.song.lines.length - 1 : true
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

function getLocalIp(): string {
  const ifaces = os.networkInterfaces()
  for (const addrs of Object.values(ifaces)) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address
    }
  }
  return '127.0.0.1'
}

/** The title over slide `index`: the slide's own (announcement block, QA B5-N1) or the item's. */
function slideTitleAt(t: { song: { title: string; slideTitles?: string[] | null } }, index: number): string {
  return t.song.slideTitles?.[index] || t.song.title
}

function renderState(track: TrackId = 'main'): LiveState {
  const t = tracks[track]
  // Mirrors computeZoneStates' hasLiveContent gate: on a pristine track, t.song
  // is still the Phase-0 demo song (see demoSong.ts) — real content only lands
  // once a load* function runs. Without this gate, every consumer of this
  // function (operator Live/Volunteer views, the tablet remote, AND the real
  // audience-facing Output.tsx fullscreen window on a directly-attached
  // projector) would show "Amazing Grace" before anything is actually live.
  const lines = t.hasLiveContent ? t.song.lines : []
  const rawLine = lines[t.index] ?? ''
  const rawNext = lines[t.index + 1] ?? ''
  const staged = formatSlideChords(rawLine)
  return {
    mode: t.mode,
    index: t.index,
    line: staged.lyricLine,
    chordLine: staged.chordLine,
    next: stripChords(rawNext),
    total: lines.length,
    songTitle: t.hasLiveContent ? slideTitleAt(t, t.index) : '',
    nextTitle: t.hasLiveContent && t.index + 1 < lines.length ? slideTitleAt(t, t.index + 1) : '',
    background: t.hasLiveContent ? (t.song.background ?? null) : null,
    icon: t.hasLiveContent ? (t.song.icon ?? null) : null,
    bgMotion: t.hasLiveContent ? ((t.song.bgMotion as 'pan' | 'zoom' | 'shimmer' | null) ?? null) : null,
    bgFit: t.bgFit,
    liveServiceItemId: t.serviceItemId,
    fontScale: t.fontScale,
    stageMessage: t.stageMessage,
    overlayTicker: t.overlayTicker,
    isTicker: t.hasLiveContent && t.isTicker,
    textHidden: t.textHidden,
    bgHidden: t.bgHidden,
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
    blurBehindText: t.blurBehindText,
    rehearsal: rehearsalMode,
    sermonReference: t.hasLiveContent ? (t.sermonSlides?.[t.index]?.reference ?? null) : null,
    sermonNotes: t.hasLiveContent ? (t.sermonSlides?.[t.index]?.notes ?? null) : null
  }
}

// The all-blank ZoneState every rendering path (normal routing, and the deck
// path below) starts from and fills in — kept as one function so the two
// paths can never drift apart on a field neither of them meant to set.
// Stage monitor "Up next" on the last slide of an item (QA A-H1): Next jumps
// to the next live-able service item, so show its title.
function nextItemTitleFor(track: TrackId): string | null {
  const item = adjacentLiveItem(track, 1)
  if (!item) return null
  return stageItemTitle(item.type, item.title, item.payload)
}

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
    fixedFontScale: false,
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
    overlayTicker: live.overlayTicker ?? null,
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
//   pin  >  authored deck  >  per-item zone_routing  >  generated deck
//     >  scene typeDefault  >  idleDefault
// (A generated deck sits below explicit routing only for zones that routing
// takes off content; for the rest it still supplies the per-zone layout.)
function computeZoneStates(): Record<ZoneId, ZoneState> {
  const result = {} as Record<ZoneId, ZoneState>
  const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]
  // Zone- and track-agnostic — read once per broadcast rather than once per zone,
  // since this hits the DB and computeZoneStates can fire every 100ms during auto-advance.
  const sceneConfig = parseSceneConfig(getSetting('zone_scenes'))
  for (const zoneId of ZONE_IDS) {
    const zoneTrack = zoneTrackFor(zoneId, stageRehearsal, activeZoneTrackAssignment[zoneId])
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

    // Get routing for the active item on this zone's track (or defaults: scene
    // palette typeDefault, falling back to the built-in ZONE_ROUTING_DEFAULTS).
    // Resolved BEFORE the deck below because an explicit routing choice can
    // veto a *generated* deck — see the comment on that branch.
    let routing: ZoneRouting | null = null
    let routingIsExplicit = false
    if (t.serviceItemId != null) {
      const item = activeServiceItems.find((it) => it.id === t.serviceItemId && it.track === zoneTrack)
      if (item) {
        const stored = getItemZoneRouting(item.id)
        if (stored) {
          try {
            routing = JSON.parse(stored) as ZoneRouting
            routingIsExplicit = true
          } catch (err) {
            console.error(`Failed to parse zone routing for item id=${item.id}:`, err)
            routing = defaultRoutingFor(item.type, sceneConfig)
          }
        } else {
          routing = defaultRoutingFor(item.type, sceneConfig)
        }
      }
    }

    // An authored deck says explicitly what every zone shows on the current
    // slide — that's its whole purpose, so it wins outright over per-item
    // auto-routing and the idle default alike. The one thing it does NOT beat
    // is a pin, handled above: the operator asked for this screen by hand,
    // after the deck was authored.
    //
    // A *generated* deck is different: nobody authored it, it's just a smart
    // default. It must not silently outrank the operator picking a scene, which
    // is exactly what went wrong for scripture — scriptureDeck hardcodes the
    // verse onto zones 2/3/4, so choosing "Back screens only" left the reading
    // on the Lyrics TVs anyway and the scene chip looked broken. So an explicit
    // routing choice vetoes a generated deck on any zone it takes off content;
    // zones the routing still wants showing content keep the deck's richer
    // per-zone layout.
    const deckVetoedHere = generatedDeckYieldsTo(
      t.deckIsGenerated,
      routingIsExplicit,
      routing?.[zoneId]
    )
    if (pinnedMode == null && t.deckSlides && t.index < t.deckSlides.length && !deckVetoedHere) {
      result[zoneId] = zoneStateFromSlot(resolveSlot(t.deckSlides, t.index, zoneId), t, zoneId, live)
      continue
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
      : idleModeFor(zoneId, stageRehearsal, (zoneId === 1 || zoneId === 2) ? 'logo' : 'off')
    const routedMode = pinnedMode ?? (routing ? routing[zoneId] : idleDefault)
    const mode = routedMode ?? 'off'

    const base: ZoneState = { ...emptyZoneState(live), mode }

    // Populate fields based on mode.
    if (mode === 'lyrics' || mode === 'text') {
      base.line = live.line
      base.next = live.next
      base.title = live.songTitle
      applyZoneBackground(base, live.background, live)
      // Pull per-item style overrides from payload. Scripture/Announcement only
      // author fontScale today (no UI for the others yet), but reading the same
      // payload keys for all three means those get support for free once added.
      if (t.serviceItemId != null) {
        const liveItem = activeServiceItems.find((it) => it.id === t.serviceItemId && (it.type === 'text' || it.type === 'scripture' || it.type === 'announcement'))
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
      base.next = nextPreview(live)
      base.title = live.songTitle
      if (!live.next) base.nextItemTitle = nextItemTitleFor(zoneTrack)
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
  // Stamped after the loop, not per-branch: some zoneIds resolve through
  // titleCardZoneState/zoneStateFromSlot instead of `base` above, and scale is
  // a screen property, not a content one — every path should get it the same way.
  for (const zoneId of ZONE_IDS) {
    result[zoneId].scale = zoneScales[zoneId] ?? 100
    const zoneTrack = zoneTrackFor(zoneId, stageRehearsal, activeZoneTrackAssignment[zoneId])
    const t = tracks[zoneTrack]
    const cleared = applyAudienceLayers(
      { line: result[zoneId].line, background: result[zoneId].background },
      { textHidden: t.textHidden, bgHidden: t.bgHidden },
      { isStage: zoneId === 4 }
    )
    result[zoneId].line = cleared.line
    result[zoneId].background = cleared.background
    result[zoneId].overlayTicker = t.overlayTicker
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
const DECK_TEXT_FONT_SCALE = 14

// The stage monitor is a lectern screen a few feet away, not a room-facing one,
// so it wants LESS than the audience screens — 5 rather than the 6 it inherited.
const DECK_STAGE_FONT_SCALE = 5

function deckFontScale(zoneId: ZoneId, _live: LiveState): number {
  return zoneId === 4 ? DECK_STAGE_FONT_SCALE : DECK_TEXT_FONT_SCALE
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
    // An operator-set size on the slot always wins over the automatic one —
    // this is the manual escape hatch from auto-fit guessing wrong.
    base.fontScale = slot.fontScale ?? deckFontScale(zoneId, live)
    base.fixedFontScale = slot.fontScale != null
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
      base.fontScale = slot.fontScale ?? deckFontScale(zoneId, live)
      base.fixedFontScale = slot.fontScale != null
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
  // Zone 4 is always the stage monitor page, whose top bar is the title: in an
  // announcement block that's the current announcement's (QA B5-N1). Audience
  // zones keep the deck's own heading slot instead of a second title.
  if (zoneId === 4 && t.deckSlides?.[t.index]?.title && !base.title) base.title = t.deckSlides[t.index].title as string
  return base
}

// What this zone will show on the following slide, as plain text. Returns ''
// at the end of the deck, and for slots that have no text to preview.
function deckNextText(t: LiveTrackState, zoneId: ZoneId): string {
  if (!t.deckSlides) return ''
  const nextIndex = t.index + 1
  if (nextIndex >= t.deckSlides.length) return ''
  const slot = resolveSlot(t.deckSlides, nextIndex, zoneId)
  // The next announcement in a block is named, not run on as if it were more of this one (QA B5-N1).
  const nextTitle = t.deckSlides[nextIndex].title
  if (nextTitle && nextTitle !== t.deckSlides[t.index]?.title && slot.kind === 'text' && slot.text) return `${nextTitle} — ${slot.text}`
  if (slot.kind === 'text' || slot.kind === 'sermon') return slot.text ?? ''
  if (slot.kind === 'slide') return t.deckSource[slot.index ?? -1] ?? ''
  if (slot.kind === 'scripture') return t.deckScripture.get(`${nextIndex}:${zoneId}`) ?? ''
  return ''
}

function zoneBroadcast(): void {
  if (tabletClients.size === 0) return
  const states = computeZoneStates()
  const payload = JSON.stringify({ type: 'zones', states, rehearsal: rehearsalMode })
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

// Sermon notes/reference are the pastor's private prep material — never send
// them to a socket that hasn't proven it holds the tablet PIN. Zone screens
// intentionally never authenticate (see wss.on('connection') below), so this
// strips just those two fields rather than gating the whole payload.
function withoutSermonPrivateFields(state: LiveState): LiveState {
  return { ...state, sermonReference: null, sermonNotes: null }
}

function tabletBroadcast(statePayload?: LiveState): void {
  if (tabletClients.size === 0) return
  const state = statePayload ?? renderState('main')
  const notes = tracks.main.itemNotes
  const items = activeServiceItems.filter((it) => it.track === 'main').map((it) => ({ id: it.id, type: it.type, title: it.title }))
  const fullPayload = JSON.stringify({ type: 'state', state, notes, items })
  const strippedPayload = JSON.stringify({ type: 'state', state: withoutSermonPrivateFields(state), notes, items })
  for (const client of tabletClients) {
    const socket = client as WsSocket
    if (socket.readyState === 1) socket.send(authedTabletClients.has(socket) ? fullPayload : strippedPayload)
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

// Bumped by every broadcast and stamped on its payload (QA B6-N1).
// webContents.send can drain the microtask queue, so a loader awaiting an
// already-settled promise can finish INSIDE this function's send loop — after
// a clicked Go live, loadDeckOnto swapped in the numbered deck and broadcast
// it from under wf:live:setItemId's broadcast, and the rest of that outer loop
// (and its tablet send) then delivered the older, pre-deck payload LAST: the
// projector, the Stage window and the tablet kept '35 And the same day…' while
// state.line said '4:35 …', until Space/←. A broadcast that finds a newer one
// ran under it stops (the newer one already reached every screen), and each
// window drops a payload older than one it has drawn (preload stateOrderGuard).
let broadcastSeq = 0

// Single source of truth for the { main, second } wf:state payload — used by
// broadcast() and by every window's did-finish-load initial paint, so the
// "is Second active" rule can never drift out of sync between call sites
// (that drift is exactly what caused the stale-shape bug this helper fixes).
function buildStatePayload(): { main: LiveState; second: LiveState | null; stageRehearsal: StageRehearsalState; seq: number } {
  // Stage Rehearsal loads songs onto Second ad-hoc (no service item), so the
  // old "does the service have any track:'second' items" check alone would
  // miss it and ship second:null while a song is genuinely live there.
  const secondActive = stageRehearsal.active || activeServiceItems.some((it) => it.track === 'second')
  return { main: renderState('main'), second: secondActive ? renderState('second') : null, stageRehearsal, seq: broadcastSeq }
}

// While crash recovery reloads the last item it must not paint an
// intermediate frame (lyrics at slide 1 before Black / the saved slide is
// re-applied — QA A3-N2). restoreRecovery broadcasts once at the end.
let suppressBroadcast = false
let recoveryHoldTimer: ReturnType<typeof setTimeout> | null = null

function broadcast(): void {
  if (suppressBroadcast) return
  const seq = ++broadcastSeq
  const payload = buildStatePayload()
  for (const w of [operatorWin, stageWin, ...outputWins.values()]) {
    if (seq !== broadcastSeq) return  // superseded mid-send — see broadcastSeq
    if (w && !w.isDestroyed()) w.webContents.send('wf:state', payload)
  }
  if (seq !== broadcastSeq) return
  const snapOf = (t: LiveTrackState): TrackSnapshot => ({ liveServiceItemId: t.serviceItemId, slideIndex: t.index, mode: t.mode, textHidden: t.textHidden, bgHidden: t.bgHidden })
  const recoveryMain: TrackSnapshot = snapOf(tracks.main)
  const recoverySecond: TrackSnapshot | null = payload.second ? snapOf(tracks.second) : null
  // Pins are live-operation state, so a crash mid-sermon must not silently
  // release a held screen — restoreRecovery puts them back.
  const recoveryPins = zonePinsRecord()
  const recoveryKey = JSON.stringify({ main: recoveryMain, second: recoverySecond, pins: recoveryPins })
  // Never overwrite the previous session's crash snapshot before it's been
  // read (A2-N1) — nor before it's been restored (A3-N4): a second crash in
  // that window used to lose it.
  startupRecovery.capture()
  if (recoveryKey !== lastWrittenRecoveryKey && !startupRecovery.writesAllowed()) {
    recoveryHoldTimer ??= setTimeout(() => { recoveryHoldTimer = null; broadcast() }, startupRecovery.holdRemainingMs() + 50)
  } else if (recoveryKey !== lastWrittenRecoveryKey) {
    lastWrittenRecoveryKey = recoveryKey
    writeRecovery({
      serviceId: activeServiceId,
      ts: Date.now(),
      main: recoveryMain,
      second: recoverySecond,
      pins: recoveryPins
    })
  }
  if (seq !== broadcastSeq) return
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
    (item.type === 'announcement' &&
      (item.ref_id != null || ((item.payload.refIds as number[] | undefined)?.length ?? 0) > 0)) ||
    item.type === 'sermon' ||
    item.type === 'livecall'
  )
}

// Find the next/previous go-live service item relative to the current one, within the same track.
// Last item order per track that still contained the live item, so Next/Prev
// keep working if the live item is deleted from Build service (QA B10).
const liveOrderSnapshot: Record<TrackId, number[] | null> = { main: null, second: null }

function adjacentLiveItem(track: TrackId, dir: 1 | -1): ServiceItem | undefined {
  const t = tracks[track]
  const trackItems = activeServiceItems.filter((it) => it.track === track)
  return pickAdjacentItem(trackItems, t.serviceItemId, dir, itemCanGoLive, liveOrderSnapshot[track])
}

// Send a transient banner to the operator window (non-technical-friendly toast).
// QA A-N3: notices raised while the operator renderer is crashed or reloading
// (e.g. "the operator screen keeps crashing") used to go to the dead renderer.
// They're held and delivered on the operator's next did-finish-load.
const pendingOperatorNotices: { message: string; level: 'info' | 'warn' | 'error' }[] = []

function notifyOperator(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  if (!operatorWin || operatorWin.isDestroyed()) return
  if (operatorWin.webContents.isCrashed() || operatorWin.webContents.isLoading()) {
    pendingOperatorNotices.push({ message, level })
    if (pendingOperatorNotices.length > 10) pendingOperatorNotices.shift()
    return
  }
  operatorWin.webContents.send('wf:notify', { message, level })
}

function flushOperatorNotices(): void {
  if (!operatorWin || operatorWin.isDestroyed()) return
  for (const n of pendingOperatorNotices.splice(0)) operatorWin.webContents.send('wf:notify', n)
}

// --- Extracted intent processing (used by both IPC and WebSocket) ---
function processIntent(track: TrackId, type: Intent): void {
  const t = tracks[track]
  // Only clear auto-advance for mode-changing intents (black/logo/lyrics), not for navigation (next/prev)
  if (type !== 'next' && type !== 'prev') {
    clearAutoAdvance(track)
  }
  const last = t.song.lines.length - 1
  if (type === 'next' || type === 'prev') {
    const dir: 1 | -1 = type === 'next' ? 1 : -1
    t.textHidden = false
    // Decision table lives in shared/liveNav.ts (unit-tested). Notes on the
    // individual cases:
    //  - countdown: one continuous view. Next moves to the next item (or the
    //    logo, never the frozen timer value as a lyric slide); Prev moves to
    //    the previous item or is ignored so the timer keeps running (QA B3 —
    //    Prev used to fall into "un-blank", freezing e.g. "4:57" on screen).
    //  - livecall: one continuous view, not a sequence of slides; un-blanking
    //    flipped it to 'lyrics' and kicked the operator's own output off the
    //    call while zone screens kept showing it.
    //  - un-blank: black/logo were operator-blanked. Skipped for decks and
    //    verses-sermons, which deliberately sit at mode 'logo' and advance on
    //    their own index — otherwise the first press after going live on a
    //    sermon was swallowed ("Next is broken").
    const action = planNav(dir, { mode: t.mode, hasDeck: !!t.deckSlides, hasSermonSlides: !!t.sermonSlides, index: t.index, lastIndex: last, pristine: !t.hasLiveContent && t.serviceItemId == null })
    if (action.kind === 'start') {
      // Nothing live yet (B2-N3): go live on the first item of this track that
      // can go live — skipping section headers and placeholders.
      const first = activeServiceItems.find((it) => it.track === track && itemCanGoLive(it))
      if (first) { logServiceEvent(`${type}: start service at item ${first.id}`); void handleTabletLoadItem(track, first.id) }
      return
    }
    if (action.kind === 'none') return
    if (action.kind === 'adjacent') {
      const item = adjacentLiveItem(track, action.dir)
      if (item) { void handleTabletLoadItem(track, item.id); return }
      if (action.fallback === 'logo-after-countdown') {
        clearCountdown(track); t.song = { title: '', lines: [], background: null }; t.mode = 'logo'
      } else if (action.fallback === 'logo') {
        t.mode = 'logo'
      }
      // fallback 'none' (e.g. Prev with nothing before a countdown): leave the
      // track as it is — the countdown timer keeps running.
    } else if (action.kind === 'unblank') {
      clearCountdown(track); t.mode = 'lyrics'
    } else {
      t.index += action.delta
      logServiceEvent(`${type}: ${t.index}/${last}`)
    }
  } else if (type === 'black') { clearCountdown(track); t.mode = 'black'; t.blankedAtGeneration = t.loadGeneration; logServiceEvent('black') }
  else if (type === 'logo') { clearCountdown(track); t.mode = 'logo'; t.blankedAtGeneration = t.loadGeneration; logServiceEvent('logo') }
  else if (type === 'lyrics') {
    clearCountdown(track)
    t.mode = 'lyrics'
    t.textHidden = false
    t.bgHidden = false
    logServiceEvent('lyrics')
  }
  broadcast()
}

// --- Extracted load functions (used by IPC handlers and tablet loadItem) ---
// Per-item state every loader resets when NEW content goes live on a track.
//  - textHidden: QA B2 — "Clear lyrics" (C) used to carry over to the next
//    item's Go Live, so the congregation got no words while the operator's
//    CURRENT preview looked normal. Like ProPresenter, a new item brings the
//    lyrics back; bgHidden (G) stays sticky by design.
//  - isTicker: only doLoadTickerAnnouncement sets it.
//    An async loader passes the generation its load started at, so a C pressed
//    after Go Live (while e.g. an online verse is still being fetched) sticks
//    (QA A-N4).
function resetPerItemLayers(track: TrackId, loadStartGeneration?: number): void {
  const t = tracks[track]
  if (loadStartGeneration === undefined || shouldClearHiddenText(t.textHiddenAtGeneration, loadStartGeneration)) t.textHidden = false
  t.isTicker = false
}

// `item`, when given, is the live ServiceItem this text came from — used to
// look up and load its authored zone-slide deck (if any). Ad-hoc loads (Quick
// Text, tickers, announcements) pass no item, so they never carry a deck.
function doLoadText(track: TrackId, title: string, body: string, background: string | null = null, fontScale?: number, blurBehindText?: boolean, item?: ServiceItem | null, bgFit?: 'cover' | 'contain'): void {
  const t = tracks[track]
  t.loadGeneration++
  t.hasLiveContent = true
  clearCountdown(track)
  clearAutoAdvance(track)
  t.songId = null
  t.scriptureRef = null
  clearSongMeta(track)
  t.bgFit = bgFit ?? 'cover'
  t.deckSlides = null  // dropped here; loadDeckOnto repopulates it below if `item` has one
  t.sermonSlides = null  // not mine to keep — only doLoadSermon sets this
  resetPerItemLayers(track)
  // An untitled card keeps an empty title. It used to default to
  // 'Announcement', which the output treated as "render as ticker" (QA A-C1).
  t.song = { title, lines: textCardSlides(title, body), background }
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
function doLoadSermon(track: TrackId, title: string, speaker: string, passage: string, background?: string | null, blurBehindText?: boolean, item?: ServiceItem | null, bgFit?: 'cover' | 'contain'): void {
  const t = tracks[track]
  t.loadGeneration++
  t.hasLiveContent = true
  clearCountdown(track)
  clearAutoAdvance(track)
  t.songId = null
  t.scriptureRef = null
  clearSongMeta(track)
  t.bgFit = bgFit ?? 'cover'
  t.deckSlides = null  // dropped here; loadDeckOnto repopulates it below if `item` has one
  resetPerItemLayers(track)
  const line = [speaker, passage].filter(Boolean).join('\n')
  const verses = (item?.payload.verses as SermonVerse[] | undefined) ?? []
  const slides = buildSermonSlides(line, verses, lookupScripture)
  t.song = { title, lines: slides.map((s) => s.text), background: background ?? null }
  t.sermonSlides = slides
  t.songTextColor = null; t.songFont = null
  t.blurBehindText = blurBehindText ?? false
  // Unlike every other loader, mode stays 'logo' — the main projector's
  // sermon behavior (show the church logo) is intentional and unchanged.
  // Zone routing reads t.song/t.blurBehindText independently of t.mode, so a
  // zone manually routed to Text/Lyrics mode still picks up this content —
  // only the main projector's own mode-driven rendering is unaffected.
  t.mode = 'logo'
  t.index = 0
  // The operator's own verse list is now the authoritative "what does this
  // sermon step through" source — skip the legacy passage-auto-chunked deck
  // entirely when verses exist, so t.song.lines (what's shown) and
  // t.sermonSlides (reference/notes for it) never desync onto two different
  // arrays sharing one t.index. Sermons with no verses keep the old behavior
  // unchanged (auto-deck from passage, if the item has no hand-authored one).
  if (item && verses.length === 0) void loadDeckOnto(track, item, t.loadGeneration)
}

// Live Call: hand the screens over to the incoming video. There is no slide
// content to load — the pixels arrive over WebRTC, and every screen negotiates
// for them itself. All this does is put the track in the mode that tells them to.
function doLoadLiveCall(track: TrackId, title: string): void {
  const t = tracks[track]
  t.loadGeneration++
  t.hasLiveContent = true
  clearCountdown(track)
  clearAutoAdvance(track)
  t.songId = null
  t.scriptureRef = null
  clearSongMeta(track)
  t.deckSlides = null
  resetPerItemLayers(track)
  t.sermonSlides = null  // not mine to keep — only doLoadSermon sets this
  t.song = { title, lines: [''], background: null }
  t.songTextColor = null; t.songFont = null
  t.blurBehindText = false
  t.mode = 'livecall'
  t.index = 0
}

// Fills t.song.lines with one summary per deck slide, so the EXISTING cursor,
// next/prev and auto-advance all work unchanged — the deck needs no second
// cursor. Pre-resolves every scripture slot because computeZoneStates is
// synchronous and fires as often as every 100ms. Returns false if no deck.
// Shared by loadDeckOnto and the "load reading as slides" IPC below — both
// need the exact same lookup wiring, and drifting between two copies is how
// the composer's preview would end up different from what actually goes live.
function autoDeckDeps(): AutoDeckDeps {
  return {
    budget: zoneChunkBudget(),
    lookupScripture: scriptureFor,
    getAnnouncement: async (id) => {
      const a = getAnnouncement(id)
      return a ? { id: a.id, title: a.title, body: a.body } : null
    },
  }
}

async function loadDeckOnto(track: TrackId, item: ServiceItem, generation: number): Promise<boolean> {
  // A hand-authored deck always wins; generation only fills the gap where there
  // isn't one, so nothing anyone built in the composer changes behaviour.
  const authored = parseZoneSlides(getItemZoneSlides(item.id))
  // The deck and the item's source slides at the same time: for an online
  // translation each used to be its own round trip, one after the other
  // (QA retest8). They now share scriptureFor's lookups, so the reading
  // doLoadScripture already fetched costs no second request at all.
  const [slides, source] = await Promise.all([
    authored ? Promise.resolve(authored) : autoDeckFor(item, autoDeckDeps()),
    computeItemSourceSlides(item),
  ])
  if (!slides) return false
  const isGenerated = authored == null
  if (tracks[track].loadGeneration !== generation) return true

  // QA B7-N1: look the verses up BEFORE the deck goes on screen. The deck used
  // to be broadcast first with every scripture slide summarised as its bare
  // reference, then again once the verses arrived, so after a clicked Go live
  // the projector showed just "Mark 4:35" for about a quarter of a second
  // (and Zone 3 "Mark 4:35 1 / 7") before "4:35 And the same day…". Until
  // the lookups finish, the screens keep what the loader already put up (for
  // a reading: the same verses, from doLoadScripture).
  const versesPerSlide: number[] = []
  const deckScripture = await resolveDeckScripture(slides, versesPerSlide)
  // The await may have let something newer load onto this track.
  if (tracks[track].loadGeneration !== generation) return true

  const t = tracks[track]
  // QA retest8: keep the operator's place. On a slow online lookup they may
  // already have pressed Space through the verse list doLoadScripture put up;
  // resetting to slide 1 here threw those presses away. A deck already landed
  // for this same load (t.deckSlides set) means t.index is a deck index.
  const index = t.deckSlides
    ? Math.min(t.index, slides.length - 1)
    : t.verseListGeneration === generation
      ? deckIndexForVerse(versesPerSlide, t.index)
      : 0
  t.deckSlides = slides
  t.deckIsGenerated = isGenerated
  t.deckSource = source
  t.deckScripture = deckScripture
  // QA B5-N1: an announcement block heads each slide with its own
  // announcement's title (it used to keep the first one over every body).
  const slideTitles = slides.some((s) => s.title) ? slides.map((s) => s.title ?? t.song.title) : null
  t.song = { ...t.song, lines: deckLines(slides, deckScripture, source), slideTitles }
  t.index = index
  // Every caller fires this async and broadcasts immediately — BEFORE the deck
  // exists (the awaits above land on a later turn). Without a broadcast here
  // the zones keep rendering the pre-deck state and are never told about the
  // deck at all: screens sat on logo/black while the operator saw nothing.
  // One broadcast, with the verse text already in it.
  broadcast()
  return true
}

// Every scripture slot's verse text, keyed `${slideIndex}:${zoneId}` (what
// zoneStateFromSlot reads for the live t.index). Memoized by reference, not by
// slide index: resolveSlot walks a 'same' chain back to its nearest real slot,
// so every slide in that chain resolves to the SAME scripture slot and would
// otherwise trigger the identical network lookup once per slide. One lookup
// per distinct reference, all at once, so an online translation costs one
// round trip rather than one per slide; KJV is synchronous.
//
// versesPerSlide (optional) receives how many NEW verses each slide shows, so
// loadDeckOnto can carry a position in the verse list over to the deck.
async function resolveDeckScripture(slides: ZoneSlide[], versesPerSlide?: number[]): Promise<Map<string, string>> {
  const wanted: Array<{ i: number; zoneId: ZoneId; reference: string }> = []
  for (let i = 0; i < slides.length; i++) {
    for (const zoneId of [1, 2, 3, 4] as ZoneId[]) {
      const slot = resolveSlot(slides, i, zoneId)
      if (slot.kind === 'scripture' && slot.reference) wanted.push({ i, zoneId, reference: slot.reference })
    }
  }
  const references = [...new Set(wanted.map((w) => w.reference))]
  // scriptureFor answers a chunk of a passage it already holds ("Mark 4:35" out
  // of "Mark 4:35-41") without the network, so for a generated reading this is
  // no longer a third round trip.
  const results = await Promise.all(references.map(scriptureFor))
  const lookedUp = new Map(references.map((reference, k) => [reference, results[k]] as const))
  if (versesPerSlide) {
    let previous: string | null = null
    for (let i = 0; i < slides.length; i++) {
      // The zone deckLines summarises the slide from, in the same order.
      const zone = ([2, 4, 3, 1] as ZoneId[]).map((z) => wanted.find((w) => w.i === i && w.zoneId === z)).find(Boolean)
      const result = zone ? lookedUp.get(zone.reference) : undefined
      // A 'same' chain repeats the slide before it: no new verses.
      versesPerSlide[i] = zone && zone.reference !== previous && result?.ok ? (result.verses?.length ?? 0) : 0
      previous = zone?.reference ?? null
    }
  }
  const deckScripture = new Map<string, string>()
  for (const { i, zoneId, reference } of wanted) {
    const result = lookedUp.get(reference)
    if (result?.ok && result.verses) {
      // Numbered, with chapter marks (QA B5-N5); a one-slide, one-verse reading stays plain.
      deckScripture.set(`${i}:${zoneId}`, deckVerseText(result.verses, { alone: slides.length === 1 }))
    } else {
      logWarn(`[deck] scripture lookup failed for "${reference}" on slide ${i + 1} zone ${zoneId}`)
    }
  }
  return deckScripture
}

// One line per deck slide (what state.line, the tablet remote and the slide
// grid show).
//
// slideSummary prefers zone 3, which these decks hold on the logo, so it fell
// through to zone 1 — the title card — and EVERY slide summarised as the
// sermon title. That is what the tablet remote and the slide grid display, so
// the preacher's tablet read "He's Risen" on every slide instead of the words
// he is about to read. Prefer the screens that carry content, and use the
// resolved verse rather than the bare reference.
function deckLines(slides: ZoneSlide[], deckScripture: Map<string, string>, source: string[]): string[] {
  const CONTENT_ZONES: ZoneId[] = [2, 4, 3, 1]
  return slides.map((slide, i) => {
    for (const zoneId of CONTENT_ZONES) {
      const verse = deckScripture.get(`${i}:${zoneId}`)
      if (verse) return verse
      const slot = resolveSlot(slides, i, zoneId)
      if (slot.kind === 'text' && slot.text) return slot.text
    }
    return slideSummary(slide, source)
  })
}

function doLoadCountdown(track: TrackId, seconds: number, background?: string | null, blurBehindText?: boolean, bgFit?: 'cover' | 'contain'): void {
  const t = tracks[track]
  t.loadGeneration++
  t.hasLiveContent = true
  clearCountdown(track)
  clearAutoAdvance(track)
  t.songId = null
  t.scriptureRef = null
  clearSongMeta(track)
  t.bgFit = bgFit ?? 'cover'
  t.deckSlides = null  // countdowns never carry a deck
  resetPerItemLayers(track)
  t.sermonSlides = null  // not mine to keep — only doLoadSermon sets this
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
  // Read the reference with the same grammar as KJV first (QA B4-N1): a
  // reference KJV can't address fails the same way online, without a network
  // round trip, and the API gets the canonical form ("Mark 4:35-41", never an
  // en dash or "Psalm 23, 24").
  const kjv = lookupScripture(reference)
  if (!kjv.ok && !/^Internal error/.test(kjv.error ?? '')) return kjv
  const query = kjv.ok ? (kjv.reference ?? reference) : normalizeReference(reference)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)
  try {
    const url = `https://bible-api.com/${encodeURIComponent(query)}?translation=${translation}`
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { reference?: string; verses?: { verse: number; chapter?: number; text: string }[] }
    if (!data.verses || data.verses.length === 0) throw new Error('no verses')
    return {
      ok: true,
      reference: data.reference ?? query,
      book: kjv.ok ? kjv.book : undefined,
      verses: data.verses.map((v) => ({ n: v.verse, ...(typeof v.chapter === 'number' ? { c: v.chapter } : {}), text: v.text.replace(/\s+/g, ' ').trim() }))
    }
  } catch (err) {
    clearTimeout(timeout)
    logWarn(`[scripture] online fetch failed, falling back to KJV: ${(err as Error)?.message ?? err}`)
    return { ...lookupScripture(reference), usedFallback: true }
  }
}

// Every scripture lookup the live path makes goes through here. For an online
// translation one Go live used to ask bible-api.com for the same reading up to
// four times in a row — doLoadScripture, then the generated deck, then the
// item's source slides, then each deck slide's chunk — each waiting up to the
// 4 s timeout on a bad network, so the deck could take 10+ s to land (QA
// retest8). Now concurrent and repeated asks share one request, a chunk of a
// passage already fetched is cut from it, and a failed lookup's KJV fallback is
// reused briefly so every later step doesn't wait out the timeout again.
const ONLINE_OK_TTL_MS = 6 * 60 * 60 * 1000
const ONLINE_FALLBACK_TTL_MS = 30_000
const ONLINE_CACHE_MAX = 200
type OnlineLookup = { at: number; promise: Promise<ScriptureResult>; settled?: ScriptureResult }
const onlineLookups = new Map<string, OnlineLookup>()

function onlineLookupFresh(entry: OnlineLookup, now: number): boolean {
  if (!entry.settled) return true  // still in flight: share it
  const ttl = entry.settled.ok && !entry.settled.usedFallback ? ONLINE_OK_TTL_MS : ONLINE_FALLBACK_TTL_MS
  return now - entry.at < ttl
}

function scriptureFor(reference: string): Promise<ScriptureResult> {
  if (bibleTranslation === 'kjv') return Promise.resolve(lookupScripture(reference))
  const translation = bibleTranslation
  const kjv = lookupScripture(reference)
  const key = `${translation}|${kjv.ok ? kjv.reference : normalizeReference(reference)}`
  const now = Date.now()
  const hit = onlineLookups.get(key)
  if (hit && onlineLookupFresh(hit, now)) return hit.promise
  const cut = kjv.ok ? cutFromFetchedPassage(kjv, translation, now) : null
  if (cut) return Promise.resolve(cut)
  const entry: OnlineLookup = { at: now, promise: fetchScripture(reference, translation) }
  void entry.promise.then((result) => { entry.settled = result; entry.at = Date.now() })
  onlineLookups.delete(key)
  onlineLookups.set(key, entry)
  while (onlineLookups.size > ONLINE_CACHE_MAX) onlineLookups.delete(onlineLookups.keys().next().value as string)
  return entry.promise
}

// The verses of `kjv` (book, chapter and verse numbers from the bundled KJV)
// taken from an already-fetched passage that holds every one of them; null if
// none does (then it is fetched like any other reference). A passage that fell
// back to KJV in the last 30 s counts too, so a deck cut from it is in the same
// translation as the verse list already on screen, without a fresh timeout per
// slide; a real online passage is preferred.
function cutFromFetchedPassage(kjv: ScriptureResult, translation: BibleTranslation, now: number): ScriptureResult | null {
  if (!kjv.verses?.length || !kjv.book) return null
  let fallback: ScriptureResult | null = null
  for (const [key, entry] of onlineLookups) {
    const passage = entry.settled
    if (!key.startsWith(`${translation}|`) || !passage?.ok || passage.book !== kjv.book || !passage.verses) continue
    if (!onlineLookupFresh(entry, now)) continue
    const verses = kjv.verses.map((v) => passage.verses!.find((p) => p.n === v.n && (p.c == null || p.c === v.c)))
    if (!verses.every((v): v is ScriptureVerse => v != null)) continue
    const cut: ScriptureResult = { ok: true, reference: kjv.reference, book: kjv.book, verses: verses.map((v) => ({ ...v })) }
    if (!passage.usedFallback) return cut
    fallback ??= { ...cut, usedFallback: true }
  }
  return fallback
}

// Returns false (leaving the current slide untouched) when the reference can't be
// resolved, so callers don't mark a failed scripture "live" and strand the wrong
// content on the projector.
async function doLoadScripture(track: TrackId, reference: string, background?: string | null, blurBehindText?: boolean, fontScale?: number, bgFit?: 'cover' | 'contain', item?: ServiceItem | null): Promise<boolean> {
  // Bump the generation synchronously, before the (possibly slow, non-KJV)
  // network await, and remember our value. If anything else loads onto this
  // track while we're waiting — including another scripture lookup — that call
  // bumps the generation again, so when we resolve we can tell we've been
  // superseded and bail out without touching live state. See
  // LiveTrackState.loadGeneration.
  const generation = ++tracks[track].loadGeneration
  // A scripture item can hold a whole reading ("John 3:16-18; Romans 8:1").
  // This used to hand the raw field straight to lookupScripture, whose pattern
  // must match the WHOLE string — so a multi-passage item failed to resolve,
  // returned false, and went live as nothing at all with no error shown.
  const refs = parseReferenceList(reference)
  if (!refs.length) return false

  const verses: ScriptureVerse[] = []
  let resolvedTitle: string | null = null
  let sawFallback = false
  const missed: string[] = []
  // All passages at once for an online translation (they used to be fetched
  // one after another); KJV stays synchronous.
  const results = bibleTranslation === 'kjv'
    ? refs.map((ref) => lookupScripture(ref))
    : await Promise.all(refs.map(scriptureFor))
  for (let k = 0; k < refs.length; k++) {
    const ref = refs[k]
    const result = results[k]
    if (!result.ok || !result.verses?.length) {
      logWarn(`[scripture] lookup failed for reference="${ref}" translation=${bibleTranslation}`)
      missed.push(ref)
      continue
    }
    if (result.usedFallback) sawFallback = true
    if (!resolvedTitle) resolvedTitle = result.reference ?? ref
    verses.push(...result.verses)
  }
  // QA B8-N2: one line per verse, numbered exactly as the deck numbers them
  // ("4:35 And the same day…"). This list is what the screens show until a
  // service item's deck lands; it used to be un-numbered ("35 And the same
  // day…"), so leaving countdown/black/logo for a reading put that on the
  // projector for ~¼ s before the deck crossfaded over it.
  const lines = numberedVerseLines(verses)
  // Only a reading where NOTHING resolved is a failure; one bad reference among
  // several still shows the passages either side of it.
  if (!lines.length) {
    // QA B4-N1: this used to return silently — Go Live did nothing, no toast.
    // Not for a superseded load (the operator has already moved on).
    if (tracks[track].loadGeneration === generation) {
      notifyOperator(`Couldn't find “${reference}” — nothing went live. Fix the reference in Build service (e.g. "John 3:16-18").`, 'warn')
    }
    return false
  }
  if (tracks[track].loadGeneration !== generation) {
    logWarn(`[scripture] discarding stale lookup for reference="${reference}" — track "${track}" moved on while fetching`)
    return false
  }
  if (missed.length) {
    notifyOperator(`Skipped ${missed.map((r) => `“${r}”`).join(', ')} — couldn't find ${missed.length === 1 ? 'that passage' : 'those passages'}. The rest of the reading is live.`, 'warn')
  }
  if (sawFallback) {
    notifyOperator(`Online lookup failed — showing KJV for "${reference}"`, 'warn')
  }
  const t = tracks[track]
  t.hasLiveContent = true
  resetPerItemLayers(track, generation)
  clearCountdown(track)
  clearAutoAdvance(track)
  t.songId = null
  t.scriptureRef = reference
  clearSongMeta(track)
  t.bgFit = bgFit ?? 'cover'
  t.deckSlides = null  // dropped here; loadDeckOnto repopulates it below if `item` has one
  t.sermonSlides = null  // not mine to keep — only doLoadSermon sets this
  t.song = {
    title: refs.length > 1 ? formatReferenceList(refs) : (resolvedTitle ?? reference),
    lines,
    background: background ?? null
  }
  t.songTextColor = null; t.songFont = null
  t.blurBehindText = blurBehindText ?? false
  if (fontScale != null) t.fontScale = fontScale
  // Keep a Black/Logo pressed while this verse was loading (QA A2-N2).
  t.mode = modeAfterAsyncLoad(t.mode, t.blankedAtGeneration, generation)
  t.index = 0
  t.verseListGeneration = generation
  // Same as doLoadText/doLoadSermon: an ad-hoc Quick Scripture passes no item
  // and keeps the flat verse list, but a real scripture SERVICE item gets its
  // generated deck (reference on Back Left, verse on the rest). Without this
  // the deck autoDeckFor builds was never applied to anything.
  if (item) void loadDeckOnto(track, item, generation)
  return true
}

// Order a song's sections (honoring arrangement) and split into slide lines,
// using the same shared rule the editors use (src/shared/reflowText.ts) —
// this used to be an independently-maintained mirror of the editor's own
// slide logic; now both read from one place.
function songLines(full: SongFull): string[] {
  return reflowSlideTexts(full.sections, full.arrangement)
}

async function doLoadSong(track: TrackId, id: number): Promise<void> {
  const t = tracks[track]
  // Captured (not just bumped) and re-checked after the await, same as
  // doLoadScripture/loadDeckOnto — getSong is synchronous today (sql.js,
  // in-memory), so this await only yields one microtask and can't actually
  // be overtaken yet, but that safety was accidental: nothing enforced it,
  // unlike every other loader here. Guards against a future async DB layer,
  // or a refactor that adds a real await inside getSong, letting a fast
  // double song-load (double-click Next, or Next right after Go Live) let
  // the older click's response land last and stomp the newer song in.
  const generation = ++t.loadGeneration
  clearCountdown(track)
  clearAutoAdvance(track)
  const full = await getSong(id)
  if (!full) return
  if (tracks[track].loadGeneration !== generation) {
    logWarn(`[song] discarding stale load for id=${id} — track "${track}" moved on while fetching`)
    return
  }
  t.hasLiveContent = true
  resetPerItemLayers(track, generation)
  t.songId = id
  t.scriptureRef = null
  t.bgFit = 'cover'
  t.deckSlides = null  // songs never carry a deck
  t.sermonSlides = null  // not mine to keep — only doLoadSermon sets this
  t.song = { title: full.title, lines: songLines(full), background: full.background ?? null, bgMotion: full.bgMotion ?? null }
  t.fontScale = full.fontScale ?? 6
  t.songTextColor = full.textColor ?? null
  t.songFont = full.font ?? null
  t.blurBehindText = full.blurBehindText ?? false
  t.songMeta = { author: full.author, copyright: full.copyright, ccli: full.ccli }
  t.hmsLoadedAt = Date.now()  // Start hymn timer
  t.verseNumber = 1
  t.mode = modeAfterAsyncLoad(t.mode, t.blankedAtGeneration, generation)  // A2-N2
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

// Slide-display announcements get their own load path instead of doLoadText's
// title/body-become-separate-slides split — the split-layout AnnouncementLayer
// (Output.tsx) shows title and body together on one card, so there's nothing
// to page through. Ticker-display announcements are unaffected; they still
// go through doLoadText (see doLoadAnnouncement below).
function doLoadAnnouncementSlide(
  track: TrackId, title: string, body: string, icon: string | null,
  background: string | null, fontScale?: number, blurBehindText?: boolean
): void {
  const t = tracks[track]
  t.loadGeneration++
  t.hasLiveContent = true
  clearCountdown(track)
  clearAutoAdvance(track)
  t.songId = null
  t.scriptureRef = null
  clearSongMeta(track)
  t.bgFit = 'cover'
  t.deckSlides = null
  resetPerItemLayers(track)
  t.sermonSlides = null
  t.song = { title, lines: [body], background, icon }
  t.songTextColor = null; t.songFont = null
  t.blurBehindText = blurBehindText ?? false
  if (fontScale != null) t.fontScale = fontScale
  t.mode = 'announcement'
  t.index = 0
}

// Ticker-display announcement: ONE slide holding the body, flagged isTicker
// so the audience output scrolls it as a strip (QA A-C1/A-H2 — this used to
// go through doLoadText(track, 'Announcement', body), making the title slide
// "Announcement" the first thing scrolled, and the title the ticker sentinel).
function doLoadTickerAnnouncement(track: TrackId, title: string, body: string): void {
  doLoadText(track, title || 'Announcement', '')
  const t = tracks[track]
  const line = tickerLine(body) || title
  t.song = { title: title || 'Announcement', lines: [line], background: null }
  t.isTicker = true
}

// `item` is optional so the plain "load this one announcement" callers still
// work; when it IS given, the block's generated deck loads on top and the
// screens split into heading + content. The first announcement is shown until
// the deck lands; from then on every slide carries its own announcement's
// title (QA B5-N1 — the first title used to stay over every later body).
async function doLoadAnnouncement(track: TrackId, id: number | null, item?: ServiceItem | null): Promise<void> {
  const refIds = Array.isArray(item?.payload.refIds)
    ? (item!.payload.refIds as unknown[]).filter((n): n is number => typeof n === 'number')
    : []
  // A deleted announcement drops out of a block (as in the deck), so start
  // from the first one that still exists rather than giving up on the block.
  const candidates = refIds.length ? refIds : id != null ? [id] : []
  let a: ReturnType<typeof getAnnouncement> = null
  for (const candidate of candidates) {
    a = getAnnouncement(candidate)
    if (a) break
  }
  if (!a) return
  if (a.display === 'ticker') {
    doLoadTickerAnnouncement(track, a.title, a.body)
  } else {
    // The service item's own background/fontScale (set via its "My Backgrounds"
    // picker) wins when present; falls back to the announcement record's own
    // defaults so a plain "load this one announcement" caller (no item) still works.
    const bg = (item?.payload.background as string | null | undefined) ?? a.background ?? null
    const blur = (item?.payload.blurBehindText as boolean | undefined) ?? a.blurBehindText
    const fontScale = item?.payload.fontScale as number | undefined
    doLoadAnnouncementSlide(track, a.title, a.body, a.icon, bg, fontScale, blur)
  }
  // doLoadText bumped loadGeneration, so read it back rather than capturing it earlier.
  if (item) void loadDeckOnto(track, item, tracks[track].loadGeneration)
}

// Pure: the slides an item would show, without going live (for the slide
// grid). Checks for an authored deck first — when one exists, ITS summaries
// are what the item "shows". Otherwise delegates to computeItemSourceSlides.
async function computeItemSlides(item: ServiceItem): Promise<string[]> {
  const authored = parseZoneSlides(getItemZoneSlides(item.id))
  if (authored) return authored.map((s) => slideSummary(s))
  // Fall back to the GENERATED deck before the item's flat content, because a
  // generated deck is what actually goes live for sermon/scripture/announcement
  // items. Building the operator's grid from the flat content instead meant the
  // thumbnails and the live index described different things: a sermon showed a
  // single thumbnail while the reading had one slide per verse chunk, so the
  // "live" ring stopped matching anything the moment the operator advanced, and
  // there was no way to click ahead to a specific verse.
  const generated = await autoDeckFor(item, autoDeckDeps())
  if (generated) {
    const source = await computeItemSourceSlides(item)
    return generated.map((s) => slideSummary(s, source))
  }
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
    // A scripture item can hold a whole reading ("John 3:16-18; Romans 8:1"),
    // so resolve every passage and lay them end to end in the order typed. A
    // reference that fails to resolve drops out rather than emptying the item.
    const refs = parseReferenceList((item.payload.reference as string | undefined) ?? '')
    if (!refs.length) return []
    const lines: string[] = []
    const results = bibleTranslation === 'kjv' ? refs.map((ref) => lookupScripture(ref)) : await Promise.all(refs.map(scriptureFor))
    for (const result of results) {
      if (!result.ok || !result.verses?.length) continue
      lines.push(...verseLines(result.verses))
    }
    return lines
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
  // QA B2-N1 / B3-N4: never fail silently — a file the projector can't load
  // used to be a blank screen with a 403 only in the log. Here, not in one
  // caller, so the rail, Volunteer "Go live", Next/Space and the tablet all warn.
  const problem = mediaProblemFor(filePath, (x) => validateMediaPath(x) !== null)
  if (problem) {
    const name = basename(filePath)
    notifyOperator(problem === 'missing'
      ? `Can't show “${name}” — the file isn't on this computer any more. Re-link it in Build service.`
      : `Can't show “${name}” — it isn't in WorshipFlow's media folder. Re-link it in Build service.`, 'warn')
  }
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
  resetPerItemLayers(track)
  t.sermonSlides = null  // not mine to keep — only doLoadSermon sets this
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
    if (!(await doLoadScripture(track, ref, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined, item.payload.fontScale as number | undefined, item.payload.bgFit as 'cover' | 'contain' | undefined, item))) return  // lookup failed → don't mark it live
  } else if (item.type === 'text') {
    doLoadText(
      track,
      (item.payload.title as string) ?? '',
      (item.payload.body as string) ?? '',
      (item.payload.background as string) ?? null,
      item.payload.fontScale as number | undefined,
      item.payload.blurBehindText as boolean | undefined,
      item,
      item.payload.bgFit as 'cover' | 'contain' | undefined
    )
  } else if (item.type === 'countdown') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return
    doLoadCountdown(track, secs, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined, item.payload.bgFit as 'cover' | 'contain' | undefined)
  } else if (item.type === 'image') {
    const p = item.payload.path as string
    if (!p) return
    doLoadMedia(track, p, item.title)
  } else if (item.type === 'welcome') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return
    doLoadCountdown(track, secs, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined, item.payload.bgFit as 'cover' | 'contain' | undefined)
  } else if (item.type === 'ticker') {
    const txt = item.payload.text as string
    if (!txt) return
    tracks[track].overlayTicker = txt
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
      item,
      item.payload.bgFit as 'cover' | 'contain' | undefined
    )
  } else if (item.type === 'livecall') {
    doLoadLiveCall(track, item.title)
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
  // Fewer characters per slide is the ONLY thing that makes the words bigger:
  // the verse is shrink-to-fit, so however large it starts, a long chunk still
  // ends up small. 300 was unreadable, 150 was still shrinking well below the
  // reference label above it. 90 is roughly one sentence of a verse.
  return Number.isFinite(raw) && raw > 0 ? raw : 90
}

// The machine's Tailscale HTTPS base, e.g. https://desktop.tailxxxx.ts.net.
//
// This matters because phones refuse camera access on a plain-http origin, so
// the LAN address in the QR code can never carry a real call — it just fails at
// the camera prompt. Asking Ryan to type a MagicDNS name would be one more thing
// to get wrong, so read it from Tailscale directly.
//
// Cached briefly: shelling out on every call would be silly, since both callers
// are IPC handlers fired by a human opening a panel, not a hot path — but caching
// forever meant a `null` result (checked before Tailscale was installed) stuck
// around for the rest of the app's life, requiring a full restart to notice
// Tailscale had shown up. A short TTL keeps the "don't shell out twice in the
// same instant" benefit while self-healing within seconds of the next check.
// null means Tailscale isn't installed or isn't up, and we fall back to the LAN
// address with a warning in the UI.
// Async and cached: this shells out, and doing it synchronously would block the
// main process — a hung Tailscale CLI would freeze the whole app mid-service.
let tailscaleBaseCache: string | null | undefined
let tailscaleBaseCacheAt = 0
const TAILSCALE_CACHE_MS = 30_000
async function tailscaleHttpsBase(): Promise<string | null> {
  if (tailscaleBaseCache !== undefined && Date.now() - tailscaleBaseCacheAt < TAILSCALE_CACHE_MS) {
    return tailscaleBaseCache
  }
  const candidates = [
    'tailscale',
    'C:\\Program Files\\Tailscale\\tailscale.exe',
    'C:\\Program Files (x86)\\Tailscale\\tailscale.exe',
  ]
  let found: string | null = null
  for (const exe of candidates) {
    try {
      const { stdout } = await execFileAsync(exe, ['status', '--json'], { timeout: 4000 })
      const dns = (JSON.parse(stdout) as { Self?: { DNSName?: string } }).Self?.DNSName
      if (dns) {
        found = `https://${dns.replace(/\.$/, '')}`
        break
      }
    } catch { /* not installed at this path, or not running — try the next */ }
  }
  tailscaleBaseCache = found
  tailscaleBaseCacheAt = Date.now()
  logInfo(`[livecall] tailscale base: ${found ?? 'not detected'}`)
  return found
}

// Shared secret for Live Call signaling. Generated once on first use and
// persisted; both the phone client and the relay present it. Anyone on the
// tailnet with this value can join the call room, so it is a password.
function livecallToken(): string {
  let t = getSetting('livecall_token')
  if (!t) {
    t = randomBytes(32).toString('hex')
    setSetting('livecall_token', t)
  }
  return t
}

// Self-contained PIN-entry page shown in place of /phone or /room-feed when
// the request didn't present the correct tablet PIN. These two routes embed
// the raw livecallToken() in the real page (needed so the phone/room-feed
// client can join the signaling room), so unlike /zone/1-4 — which are
// read-only display endpoints and stay unauthenticated by design — they must
// not hand that token to an unverified request. A plain GET form is enough:
// this is a server-side gate on the page load itself, not the client-side
// control gate tabletHtml.ts already does after the page has loaded.
function tabletPinGateHtml(path: string, lockedOutMs: number): string {
  const message = lockedOutMs > 0
    ? `Too many incorrect PINs. Try again in ${Math.ceil(lockedOutMs / 1000)} seconds.`
    : ''
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Enter PIN</title>
<style>
body{font-family:system-ui,sans-serif;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
form{text-align:center;padding:24px}
input{font-size:24px;padding:8px 12px;width:8em;text-align:center;border-radius:6px;border:1px solid #444;background:#222;color:#eee}
button{font-size:18px;padding:8px 20px;margin-left:8px;border-radius:6px;border:none;background:#2a7;color:#fff}
p{color:#f88}
</style></head>
<body>
<form method="GET" action="${path}">
<div>Enter tablet PIN</div>
<input type="text" inputmode="numeric" pattern="[0-9]*" name="pin" autofocus autocomplete="off">
<button type="submit">Go</button>
${message ? `<p>${message}</p>` : ''}
</form>
</body></html>`
}

// --- Tablet HTTP + WebSocket server ---
function startTabletServer(): void {
  const server = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0].replace(/\/+$/, '')
    const zoneMatch = path.match(/^\/zone\/([1-4])$/)
    const zoneId = zoneMatch ? parseInt(zoneMatch[1], 10) as ZoneId : null
    const htmlHeaders = {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    }
    const zonePage = zoneId ? zoneHtmlFor(zoneId, livecallToken(), 'sanctuary') : null
    if (zonePage) {
      res.writeHead(200, htmlHeaders)
      res.end(zonePage)
    } else if (path === '/multiview') {
      res.writeHead(200, htmlHeaders)
      res.end(MULTIVIEW_HTML)
    } else if (path === '/obs' || path === '/overlay') {
      res.writeHead(200, htmlHeaders)
      res.end(OBS_HTML)
    } else if (path === '/phone' || path === '/room-feed') {
      // Unlike /zone/1-4, these routes let a caller actively JOIN the livecall
      // room (not just display it), so the real page — which embeds the raw
      // livecallToken() — is gated behind the same tablet PIN + lockout used
      // for WS control auth above. See tabletPinGateHtml() for why.
      const remoteIp = req.socket.remoteAddress ?? 'unknown'
      const qs = new URLSearchParams((req.url ?? '').split('?')[1] ?? '')
      const pinParam = qs.get('pin')
      const authResult = pinParam === null
        ? { ok: false as const, lockedOutMs: tabletLockoutMs(remoteIp) }
        : checkTabletPin(remoteIp, pinParam)
      if (!authResult.ok) {
        res.writeHead(200, htmlHeaders)
        res.end(tabletPinGateHtml(path, authResult.lockedOutMs))
        return
      }
      const host = req.headers.host ?? `localhost:${boundTabletPort}`
      // Match the scheme the page was loaded over: Tailscale Serve terminates
      // HTTPS in front of this plain-HTTP server, and a page served over https
      // cannot open a ws:// socket.
      const proto = req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws'
      res.writeHead(200, htmlHeaders)
      res.end(path === '/phone'
        ? phoneClientHtml(`${proto}://${host}/livecall`, livecallToken(), 'sanctuary')
        : roomFeedViewerHtml(`${proto}://${host}/livecall`, livecallToken(), 'room-feed'))
    } else if (path === '/pulpit') {
      res.writeHead(200, htmlHeaders)
      res.end(pulpitHtml(getSetting('church_name')?.trim() || 'Snow Hill Church'))
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
        gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
        mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4',
      }
      // Media types only (QA A3-N1) — no generic binary fallback.
      const mime = MIME[ext]
      if (!mime) {
        res.writeHead(403, { 'Content-Type': 'text/plain' })
        res.end('Access denied: not a picture or video')
        return
      }
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
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'public, max-age=3600',
          })
          const stream = createReadStream(validPath, { start, end })
          stream.on('error', safeEnd)
          stream.pipe(res, { end: true })
        } else {
          const buf = readFileSync(validPath)
          res.writeHead(200, {
            'Content-Type': mime,
            'X-Content-Type-Options': 'nosniff',
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

  // Two protocols share this port and must not mix: tablet/zone/OBS clients get
  // broadcast service state on connect, and a livecall client (the preacher's
  // phone, off-site) must never receive that. Routing by URL path at the upgrade
  // keeps them in separate WebSocketServers with separate client sets.
  const wss = new WebSocketServer({ noServer: true })
  livecallWss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0].replace(/\/+$/, '')
    const target = path === '/livecall' ? livecallWss! : wss
    target.handleUpgrade(req, socket, head, (ws) => target.emit('connection', ws, req))
  })
  attachLivecallSignaling(livecallWss, livecallToken())
  tabletHttpServer = server
  tabletWss = wss

  // Liveness: a tablet that drops off WiFi without a clean TCP close stays "open"
  // and would accumulate. The heartbeat pings each client and terminates any that
  // don't pong back before the next tick.
  const aliveClients = new WeakSet<WsSocket>()

  wss.on('connection', (ws: WsSocket, req: IncomingMessage) => {
    const remoteIp = req.socket.remoteAddress ?? 'unknown'
    // Set when this connection's zone identifies itself via `hello` — used
    // both to feed zoneConnections and to know which entry to release if
    // this exact socket later closes (see the close/error handlers below).
    let helloZoneId: ZoneId | null = null
    tabletClients.add(ws)
    aliveClients.add(ws)
    ws.on('pong', () => aliveClients.add(ws))
    // Send current state immediately on connect. No 'auth' message has been
    // processed yet at this point, so this socket is always unauthenticated
    // here — strip the sermon fields.
    ws.send(JSON.stringify({
      type: 'state',
      state: withoutSermonPrivateFields(renderState('main')),
      notes: tracks.main.itemNotes,
      items: activeServiceItems.map((it) => ({ id: it.id, type: it.type, title: it.title }))
    }))
    // Send zone states so zone pages render immediately on connect.
    ws.send(JSON.stringify({ type: 'zones', states: computeZoneStates(), rehearsal: rehearsalMode }))

    // The tablet remote is Main-only (see design's non-goals) — always operates
    // on the 'main' track, same reasoning as tabletBroadcast/maybeAutoSwitchScene.
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string; intent?: string; itemId?: number; pin?: string; zone?: number }

        // Zone screens never authenticate — they're a read-only display, not
        // a control surface — so this must be handled and return here, ahead
        // of the "everything below requires auth" guard a few lines down.
        // Placing it after that guard would mean a zone's hello silently hits
        // the same authResult:false dead end its already-sent-but-unread
        // hello hits today (see the 2026-08-02 design spec).
        if (msg.type === 'hello' && typeof msg.zone === 'number' && Number.isInteger(msg.zone) && msg.zone >= 1 && msg.zone <= 4) {
          helloZoneId = msg.zone as ZoneId
          markZoneConnected(helloZoneId, ws)
          return
        }

        if (msg.type === 'auth') {
          const result = checkTabletPin(remoteIp, msg.pin)
          if (result.ok) {
            authedTabletClients.add(ws)
            ws.send(JSON.stringify({ type: 'authResult', ok: true }))
            // Immediately follow with the full state (sermon fields included) —
            // otherwise this client shows nothing sensitive until the next
            // unrelated broadcast() tick. Route through tabletBroadcast() so
            // there's one place that knows how to build/filter/gate this
            // message; ws is already in authedTabletClients above, so it gets
            // fullPayload while every other connected client gets whatever
            // payload variant is already correct for it.
            tabletBroadcast()
          } else if (result.lockedOutMs > 0) {
            ws.send(JSON.stringify({ type: 'authResult', ok: false, lockedOutMs: result.lockedOutMs }))
          } else {
            ws.send(JSON.stringify({ type: 'authResult', ok: false }))
          }
          return
        }

        // Everything below is a control action — require a prior successful auth.
        if (!authedTabletClients.has(ws)) {
          ws.send(JSON.stringify({ type: 'authResult', ok: false }))
          return
        }
        if (msg.type === 'intent' && isIntent(msg.intent)) {
          processIntent('main', msg.intent)
        } else if (msg.type === 'loadItem' && isPositiveInt(msg.itemId)) {
          void handleTabletLoadItem('main', msg.itemId)
        } else if (msg.type === 'clearStageMessage') {
          // Pastor tapped "Got it" — clear the message everywhere.
          tracks.main.stageMessage = null
          broadcast()
        }
      } catch { /* ignore malformed messages */ }
    })

    ws.on('close', () => {
      tabletClients.delete(ws)
      aliveClients.delete(ws)
      if (helloZoneId !== null) markZoneDisconnected(helloZoneId, ws)
    })
    ws.on('error', () => {
      tabletClients.delete(ws)
      aliveClients.delete(ws)
      if (helloZoneId !== null) markZoneDisconnected(helloZoneId, ws)
    })
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
  }, TABLET_HEARTBEAT_INTERVAL_MS)

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
  watchRenderer(stageWin, 'stage', 'The stage display')
  loadRoute(stageWin, '/stage')
}

// QA A-L4: layoutOutputs() only rebuilds the projector outputs. A fullscreen,
// frameless Stage window on an unplugged display could be dropped by Windows
// onto the operator's screen and cover the UI — close it and say so (it can be
// reopened when the screen is back). The framed multiview is just moved back
// onto the primary display as a normal window.
function rehomeAuxWindows(removed: Electron.Display): void {
  const remaining = screen.getAllDisplays().filter((d) => d.id !== removed.id).map((d) => d.bounds)
  if (stageWin && !stageWin.isDestroyed() && wasOnRemovedDisplay(stageWin.getBounds(), removed.bounds, remaining)) {
    logWarn('[displays] stage display removed — closing the stage window')
    stageWin.close()
    notifyOperator('The stage screen was disconnected, so the Stage window was closed. Reopen it once the screen is back.', 'warn')
  }
  if (multiviewWin && !multiviewWin.isDestroyed() && wasOnRemovedDisplay(multiviewWin.getBounds(), removed.bounds, remaining)) {
    const p = screen.getPrimaryDisplay().workArea
    if (multiviewWin.isFullScreen()) multiviewWin.setFullScreen(false)
    multiviewWin.setBounds({ x: p.x + 100, y: p.y + 100, width: Math.min(1280, p.width - 200), height: Math.min(720, p.height - 200) })
  }
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
    // Floor below a 1280-px laptop screen (QA B17: 1300 pushed the right edge
    // — help, Volunteer mode — off-screen on 1280x720). TopBar collapses its
    // wordier labels under 1440px so the bar still fits at this width.
    minWidth: OPERATOR_MIN_WIDTH,
    show: !app.isPackaged,
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
  operatorWin.on('close', (e) => {
    const win = operatorWin
    const showing = anyTrackShowing()
    const decision = operatorCloseDecision({
      isQuitting,
      anyLiveContent: showing,
      obsStreaming: getObsStatus().streaming,
      obsRecording: getObsStatus().recording
    })
    if (decision === 'allow') return
    // Never close the operator on its own — outputs would be orphaned (QA A-C2).
    e.preventDefault()
    if (decision === 'quit') { app.quit(); return }
    if (operatorCloseConfirmOpen || !win || win.isDestroyed()) return
    operatorCloseConfirmOpen = true
    const text = closePromptText({ showing, obsStreaming: getObsStatus().streaming, obsRecording: getObsStatus().recording })
    void dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Close WorshipFlow?',
      message: text.message,
      detail: text.detail,
      buttons: ['Keep WorshipFlow open', 'Close WorshipFlow'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    }).then(({ response }) => {
      operatorCloseConfirmOpen = false
      if (response === 1) app.quit()
    }).catch(() => { operatorCloseConfirmOpen = false })
  })
  operatorWin.on('closed', () => { operatorWin = null })
  watchRenderer(operatorWin, 'operator', 'The operator screen')
  watchSessionEnd(operatorWin)
  operatorWin.webContents.on('did-finish-load', () => {
    // Give React a moment to subscribe to wf:notify before replaying held notices.
    if (pendingOperatorNotices.length) setTimeout(flushOperatorNotices, 1500)
    // A renderer reload discards the JS realm without running React's
    // unmount cleanup, so useRoomFeed's roomFeedNotifyCapturing(false) call
    // never fires. The reload itself already tore down any real capture
    // (getUserMedia/RTCPeerConnection state doesn't survive navigation), so
    // resetting here just brings the flag back in line with reality instead
    // of leaving Sound Check blocked with no visible cause or way to clear it.
    setRoomFeedActive(false)
  })
  loadRoute(operatorWin, '/')
}

interface OutputOpts {
  x: number; y: number; width: number; height: number
  fullscreen: boolean; alwaysOnTop?: boolean; id: number
  /** The manual on-screen fallback (no projector detected) — closable. */
  windowedFallback?: boolean
}

let operatorCloseConfirmOpen = false

function anyTrackShowing(): boolean {
  return (['main', 'second'] as TrackId[]).some((id) => {
    const t = tracks[id]
    return trackShowing({ hasLiveContent: t.hasLiveContent, mode: t.mode, hasSlides: !!(t.deckSlides || t.sermonSlides) })
  })
}

// Every window watchRenderer() looks after, by key, so a second launch can
// revive any that crashed past the cap (QA A-N3).
const watchedWindows = new Map<string, BrowserWindow>()
const crashRetryTimers = new Map<string, ReturnType<typeof setTimeout>>()

function reviveCrashedWindows(): void {
  for (const [key, w] of watchedWindows) {
    if (w.isDestroyed() || !w.webContents.isCrashed()) continue
    logWarn(`[window] reviving crashed ${key} renderer (app launched again)`)
    rendererRecovery.reset(key)
    const t = crashRetryTimers.get(key)
    if (t) { clearTimeout(t); crashRetryTimers.delete(key) }
    w.webContents.reload()
  }
}

// QA A-H3: a renderer that dies (GPU/OOM crash, e.g. a heavy video background)
// used to leave a dead/sad-face projector or a blank operator UI until the app
// was restarted. Reload it automatically — outputs/stage re-sync their state in
// did-finish-load — with a crash-loop cap, and tell the operator.
function watchRenderer(win: BrowserWindow, key: string, label: string): void {
  watchedWindows.set(key, win)
  win.on('closed', () => {
    if (watchedWindows.get(key) === win) watchedWindows.delete(key)
    const t = crashRetryTimers.get(key)
    if (t) { clearTimeout(t); crashRetryTimers.delete(key) }
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit' || isQuitting || win.isDestroyed()) return
    const what = crashReasonText(details.reason)
    logError(`[window] ${key} renderer gone: ${details.reason} (exit ${details.exitCode})`)
    if (rendererRecovery.allowReload(key, Date.now())) {
      setTimeout(() => { if (!win.isDestroyed() && !isQuitting) win.webContents.reload() }, 300)
      notifyOperator(`${label} ${what} and was reloaded automatically.`, 'warn')
    } else if (!crashRetryTimers.has(key)) {
      // QA A-N3: don't give up for good — try again later, backing off.
      const delay = rendererRecovery.retryAfterMs(key)
      crashRetryTimers.set(key, setTimeout(() => {
        crashRetryTimers.delete(key)
        if (!win.isDestroyed() && !isQuitting && win.webContents.isCrashed()) {
          logWarn(`[window] retrying crashed ${key} renderer`)
          win.webContents.reload()
        }
      }, delay))
      notifyOperator(`${label} keeps crashing (${what}). Trying again in ${Math.round(delay / 1000)} s — or try a simpler background.`, 'error')
    }
    broadcast()
  })
  win.on('unresponsive', () => {
    logWarn(`[window] ${key} renderer unresponsive`)
    if (key !== 'operator') notifyOperator(`${label} is not responding.`, 'warn')
  })
  win.on('responsive', () => logInfo(`[window] ${key} renderer responsive again`))
}

/** Output windows that are actually able to show something (QA A-H3: a crashed one doesn't count). */
function workingOutputCount(): number {
  let n = 0
  for (const w of outputWins.values()) if (!w.isDestroyed() && !w.webContents.isCrashed()) n++
  return n
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
  // QA A-H7: Alt+F4 on the projector must not drop it to the desktop mid-service.
  win.on('close', (e) => {
    if (outputCloseAllowed({ isQuitting, windowedFallback: !!opts.windowedFallback })) return
    e.preventDefault()
    notifyOperator('The projector window can\'t be closed while WorshipFlow is running. Use Black or Logo to clear the screen.', 'warn')
  })
  // layoutOutputs() destroys and re-creates windows under the same label; only
  // forget this label if it still points at THIS window.
  win.on('closed', () => { if (outputWins.get(label) === win) outputWins.delete(label) })
  watchRenderer(win, `output:${label}`, `Projector output ${opts.id}`)
  outputWins.set(label, win)
  watchSessionEnd(win)
  // WF_OUTPUT_DIAG=1 keeps the fps/OUT badges on a packaged build (QA B13).
  loadRoute(win, '/output', { id: String(opts.id), ...(process.env.WF_OUTPUT_DIAG === '1' ? { diag: '1' } : {}) })
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
      width: 960, height: 540, fullscreen: false, id: 1, windowedFallback: true
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
ipcMain.on('wf:intent', (_e, track: TrackId, type: Intent) => { assertTrackId(track); processIntent(track, type) })

ipcMain.handle('wf:getInfo', (): AppInfo => ({
  song: tracks.main.song,
  state: renderState('main'),
  displays: describeDisplays(),
  outputs: workingOutputCount(),
  zonesConnected: getConnectedZoneIds(),
  startupMs: Date.now() - startTime,
  appVersion: app.getVersion(),
  isPackaged: app.isPackaged
}))

// --- Live engine ---
ipcMain.handle('wf:live:loadText', (_e, track: TrackId, title: string, body: string, background?: string | null, fontScale?: number, blurBehindText?: boolean) => {
  assertTrackId(track)
  doLoadText(track, title, body, background ?? null, fontScale, blurBehindText); broadcast()
})
ipcMain.handle('wf:live:loadSermon', (_e, track: TrackId, title: string, speaker: string, passage: string, background?: string | null, blurBehindText?: boolean) => {
  assertTrackId(track)
  doLoadSermon(track, title, speaker, passage, background ?? null, blurBehindText); broadcast()
})

ipcMain.handle('wf:live:loadLiveCall', (_e, track: TrackId, title: string) => {
  doLoadLiveCall(track, title); broadcast()
})

ipcMain.handle('wf:live:loadCountdown', (_e, track: TrackId, seconds: number, background?: string | null, blurBehindText?: boolean) => {
  assertTrackId(track)
  doLoadCountdown(track, seconds, background, blurBehindText); broadcast()
})

ipcMain.handle('wf:live:loadScripture', async (_e, track: TrackId, reference: string, background?: string | null, blurBehindText?: boolean): Promise<boolean> => {
  assertTrackId(track)
  const ok = await doLoadScripture(track, reference, background, blurBehindText)
  if (ok) broadcast()
  return ok
})

ipcMain.handle('wf:live:loadSong', async (_e, track: TrackId, id: number) => {
  assertTrackId(track)
  await doLoadSong(track, id); broadcast()
})

ipcMain.handle('wf:live:loadMedia', (_e, track: TrackId, filePath: string, title: string) => {
  assertTrackId(track)
  doLoadMedia(track, filePath, title); broadcast()
})

ipcMain.handle('wf:live:loadAnnouncement', async (_e, track: TrackId, id: number | null, itemId?: number) => {
  assertTrackId(track)
  const item = itemId != null
    ? activeServiceItems.find((it) => it.id === itemId && it.track === track) ?? null
    : null
  await doLoadAnnouncement(track, id, item); broadcast()
})

ipcMain.handle('wf:getState', (_e, track?: TrackId): LiveState => renderState(track != null ? assertTrackId(track) : 'main'))

ipcMain.handle('wf:stage:open', () => { createStageWindow() })
ipcMain.handle('wf:multiview:open', () => { createMultiviewWindow() })
// Manual re-open of the audience output (e.g. operator closed it, or it never
// opened because the projector was connected before launch with no display event).
ipcMain.handle('wf:output:open', () => { layoutOutputs(true); broadcast() })

ipcMain.handle('wf:live:setItemId', (_e, track: TrackId, id: number | null) => {
  assertTrackId(track)
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
  //
  // Sermons with a verses list must NOT go through loadDeckOnto: Next already
  // skips the auto-deck when verses exist (see doLoadSermon), and sending Go
  // Live down the deck path put a passage-chunked deck on screen while Next
  // showed the operator's verse list.
  if (item && (item.type === 'text' || item.type === 'scripture')) {
    void loadDeckOnto(track, item, t.loadGeneration)
  } else if (item && item.type === 'sermon') {
    const verses = (item.payload.verses as SermonVerse[] | undefined) ?? []
    if (verses.length === 0) {
      void loadDeckOnto(track, item, t.loadGeneration)
    } else {
      doLoadSermon(
        track,
        (item.payload.title as string) ?? '',
        (item.payload.speaker as string) ?? '',
        (item.payload.passage as string) ?? '',
        item.payload.background as string | null | undefined,
        item.payload.blurBehindText as boolean | undefined,
        item,
        item.payload.bgFit as 'cover' | 'contain' | undefined
      )
    }
  }
  broadcast()
  if (item && track === 'main') {
    void recordingSession.onItemLive(item, activeServiceId, activeServiceName, activeServiceDate)
  }
})

ipcMain.handle('wf:live:setFontScale', (_e, track: TrackId, scale: number) => {
  assertTrackId(track)
  tracks[track].fontScale = Math.min(14, Math.max(3, scale))
  broadcast()
})

ipcMain.handle('wf:live:saveFontScale', (_e, track: TrackId) => {
  assertTrackId(track)
  const t = tracks[track]
  if (t.songId == null) return
  setSongFontScale(t.songId, t.fontScale)
})

ipcMain.handle('wf:live:setStageMessage', (_e, track: TrackId, msg: string | null) => {
  assertTrackId(track)
  tracks[track].stageMessage = msg || null
  broadcast()
})

ipcMain.handle('wf:live:setOverlayTicker', (_e, track: TrackId, text: string | null) => {
  assertTrackId(track)
  tracks[track].overlayTicker = text && text.trim() ? text.trim() : null
  broadcast()
})

ipcMain.handle('wf:live:setLayers', (_e, track: TrackId, flags: { textHidden?: boolean; bgHidden?: boolean }) => {
  assertTrackId(track)
  const liveType = activeServiceItems.find((it) => it.id === tracks[track].serviceItemId)?.type ?? null
  const blocker = flags?.textHidden === true ? textHideBlocker(tracks[track].mode, liveType) : null
  if (blocker) {
    // Nothing to hide on a countdown, picture, sermon card or announcement
    // (B2-N11, B3-N5) — don't light "Lyrics off" for nothing or carry it into
    // the next item.
    notifyOperator(textHideNotice(blocker), 'info')
  } else if (typeof flags?.textHidden === 'boolean') {
    tracks[track].textHidden = flags.textHidden
    if (flags.textHidden) tracks[track].textHiddenAtGeneration = tracks[track].loadGeneration
  }
  if (typeof flags?.bgHidden === 'boolean') tracks[track].bgHidden = flags.bgHidden
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

// --- Zone screen scale IPCs ---
ipcMain.handle('wf:zones:getScales', () => zoneScales)
ipcMain.handle('wf:zones:setScale', (_e, zoneId: ZoneId, percent: number) => {
  assertZoneId(zoneId)
  zoneScales = { ...zoneScales, [zoneId]: Math.min(150, Math.max(50, percent)) }
  setSetting('zone_scales', JSON.stringify(zoneScales))
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
ipcMain.handle('wf:live:getRehearsalMode', () => rehearsalMode)
ipcMain.handle('wf:live:setRehearsalMode', (_e, on: boolean) => {
  rehearsalMode = on
  broadcast()
})

// --- Stage Rehearsal: the active service's songs, in order, on the Stage
// Monitor only — Main loops the service's announcements on the other zones.
// See shared/stageRehearsal.ts.
ipcMain.handle('wf:live:getStageRehearsal', () => stageRehearsal)
ipcMain.handle('wf:live:setStageRehearsal', async (_e, on: boolean) => {
  if (on) {
    const songQueue = activeServiceItems
      .filter((it): it is ServiceItem & { ref_id: number } => it.type === 'song' && it.track === 'main' && it.ref_id != null)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((it) => it.ref_id)
    if (songQueue.length === 0) throw new Error('This service has no songs to rehearse.')

    // Mirror the Announcements tab: scheduled-for-this-date if the service
    // has a date, else fall back to the whole library (active, not expired)
    // rather than rehearsing with nothing looping on the other screens.
    let announcementQueue = activeServiceDate ? listScheduledAnnouncements(activeServiceDate).map((a) => a.id) : []
    if (announcementQueue.length === 0) {
      announcementQueue = listAnnouncements('').filter((a) => a.active && !a.expired).map((a) => a.id)
    }

    // Rehearsal Mode blanks every real screen (including these zones) and
    // always wins — arming it is how you'd defeat the entire point of Stage
    // Rehearsal without realizing why nothing's showing. Starting Stage
    // Rehearsal disarms it so the two features can't silently fight.
    if (rehearsalMode) rehearsalMode = false

    stageRehearsal = { active: true, songQueue, songIndex: 0, announcementQueue }
    await doLoadSong('second', songQueue[0])
    tracks.second.serviceItemId = null
    if (announcementQueue.length > 0) {
      await doLoadAnnouncement('main', announcementQueue[0])
      stageRehearsalMainBaselineItemId = tracks.main.serviceItemId
      armStageRehearsalAnnouncementLoop(announcementQueue)
    }
  } else {
    clearStageRehearsalAnnouncementTimer()
    stageRehearsal = STAGE_REHEARSAL_OFF
  }
  broadcast()
})

async function stageRehearsalGoToSong(newIndex: number): Promise<void> {
  if (!stageRehearsal.active) return
  const clamped = clampSongIndex(newIndex, stageRehearsal.songQueue.length)
  stageRehearsal.songIndex = clamped
  await doLoadSong('second', stageRehearsal.songQueue[clamped])
  tracks.second.serviceItemId = null
  broadcast()
}
ipcMain.handle('wf:live:stageRehearsalNextSong', () => stageRehearsalGoToSong(stageRehearsal.songIndex + 1))
ipcMain.handle('wf:live:stageRehearsalPrevSong', () => stageRehearsalGoToSong(stageRehearsal.songIndex - 1))
ipcMain.handle('wf:live:stageRehearsalGoToSong', (_e, index: number) => stageRehearsalGoToSong(index))

ipcMain.handle('wf:getTabletUrl', () => `http://${getLocalIp()}:${boundTabletPort}`)
ipcMain.handle('wf:getTabletPin', () => getTabletPin())
ipcMain.handle('wf:regenerateTabletPin', () => regenerateTabletPin())

// Rebuilds activeServiceItems (and dependent theme/notes state) from the DB.
// This is the cache handleTabletLoadItem/computeZoneStates read to resolve an
// item id into its type/routing when going live — it does NOT update itself
// when items are added/edited in Build Service, so callers must explicitly
// refresh it after any such change or newly-added items silently fail to go
// live (found in the UI, invisible to the live-routing layer).
function refreshActiveServiceItems(serviceId: number, opts: { silent?: boolean } = {}): void {
  const svc = getService(serviceId)
  // A deleted/nonexistent serviceId (e.g. from a stale recovery snapshot) must not
  // be left as the "active" one — otherwise later code trusting a non-null
  // activeServiceId as proof it points at a real service would be wrong.
  const sameService = activeServiceId === serviceId
  const oldItems = activeServiceItems
  activeServiceId = svc ? serviceId : null
  activeServiceItems = (svc as { items: ServiceItem[] } | null)?.items ?? []
  for (const track of ['main', 'second'] as TrackId[]) {
    liveOrderSnapshot[track] = sameService
      ? nextOrderSnapshot(oldItems.filter((it) => it.track === track).map((it) => it.id), tracks[track].serviceItemId, liveOrderSnapshot[track])
      : null
  }
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
  if (!opts.silent) broadcast()  // projector needs the new theme, not just the tablet
}

// QA B-N1: the active service survives a relaunch. Restored silently at startup
// (before any window exists), because broadcast() also writes the crash-recovery
// snapshot and must not overwrite the one restoreRecovery is about to read.
function restoreActiveServiceFromSettings(): void {
  try {
    const id = parseActiveServiceSetting(getSetting(ACTIVE_SERVICE_SETTING))
    if (id != null && getService(id)) refreshActiveServiceItems(id, { silent: true })
  } catch (err) {
    logWarn(`[service] could not restore the active service: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function rememberActiveService(serviceId: number | null): void {
  try { setSetting(ACTIVE_SERVICE_SETTING, activeServiceSettingValue(serviceId)) } catch { /* advisory */ }
}

ipcMain.handle('wf:setActiveService', (_e, serviceId: number | null) => {
  loggedSongIds.clear()  // new/switched service → start CCLI counting fresh
  // Pins belong to the service that was on screen; carrying them into the next
  // one would hold a card from a service nobody is running any more.
  zonePins.clear()
  warnedMissingPins.clear()
  rememberActiveService(serviceId)
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
  // A just-imported .wfservice (or a service from an older version) may point
  // at pictures on a USB stick or in Pictures — copy them in now (B2-N1).
  void migrateOutsideMedia('service opened')
})
ipcMain.handle('wf:getActiveServiceId', () => activeServiceId)

// Same cache rebuild as wf:setActiveService, but without resetting CCLI usage
// tracking — call this after edits to a service that's already active (e.g.
// adding an item), not when switching which service is open.
ipcMain.handle('wf:services:refreshActiveItems', (_e, serviceId: number) => {
  refreshActiveServiceItems(serviceId)
})

ipcMain.handle('wf:service:setDate', (_e, serviceId: number, serviceDate: string | null) => {
  const date = assertIsoDateOrNull(serviceDate, 'serviceDate')
  setServiceDate(serviceId, date)
  // Recordings stamp the service date into their metadata at the moment an item
  // goes live, so the cached copy has to follow — otherwise changing the date
  // mid-session keeps filing recordings under the old one until the service is
  // reselected.
  if (activeServiceId === serviceId) activeServiceDate = date
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
ipcMain.handle('wf:ndi:status', () => detectNdiRuntime((p) => existsSync(p), process.env))

ipcMain.handle('wf:songselect:open', () => {
  openSongSelectWindow(operatorWin, (song) => {
    operatorWin?.webContents.send('wf:songselect:imported', song)
  })
})

ipcMain.handle('wf:songselect:importFile', async () => {
  const song = await importSongSelectFile(operatorWin)
  if (song) operatorWin?.webContents.send('wf:songselect:imported', song)
  return song
})

ipcMain.handle('wf:setup:seedSample', () => seedSampleSunday())
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
ipcMain.handle('wf:recordings:getAnthropicKey', () => getSecretSetting('anthropic_api_key') ?? '')
ipcMain.handle('wf:recordings:setAnthropicKey', (_e, key: string) => { setSecretSetting('anthropic_api_key', key || null) })
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
ipcMain.handle('wf:songs:update', (_e, id: number, input: SongInput) => {
  updateSong(id, input)
  // A song already live on a track (e.g. its lyrics window) was rendering from
  // the snapshot doLoadSong() cached at "go live" time — a background/lyrics/
  // font edit here saved to the DB fine but never reached that snapshot, so
  // the change silently didn't show until the song was reloaded. Re-sync the
  // cached content fields (not playback position) for any track showing it.
  const full = getSong(id)
  if (!full) return
  let changed = false
  for (const track of ['main', 'second'] as TrackId[]) {
    const t = tracks[track]
    if (t.songId !== id) continue
    t.song = { title: full.title, lines: songLines(full), background: full.background ?? null, bgMotion: full.bgMotion ?? null }
    t.fontScale = full.fontScale ?? 6
    t.songTextColor = full.textColor ?? null
    t.songFont = full.font ?? null
    t.blurBehindText = full.blurBehindText ?? false
    changed = true
  }
  if (changed) broadcast()
})
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

// Invalidates the active-service-item cache after a mutation, but only when
// the mutated item/service is the one actually live — Ryan can be editing
// next week's service in Build Service while this week's is live, and a call
// here must not refresh (or broadcast a theme change for) the wrong one.
// Every wf:services:* mutation below goes through this instead of relying on
// the renderer to remember to call wf:services:refreshActiveItems itself:
// that was previously a convention living in exactly one renderer helper
// (ServiceEditor.tsx's reload()), so a second edit surface calling these
// IPCs directly would silently reproduce "newly added/edited item can't go
// live" with nothing to catch it.
// QA B2-N1: mark items whose picture/video (or background) the projector
// can't load, so Build service can show a warning + Re-link and Review plan
// counts it. Computed on read; nothing is stored.
function withMediaProblems(svc: ServiceFull | null): ServiceFull | null {
  if (!svc) return svc
  const servable = (p: string): boolean => validateMediaPath(p) !== null
  return {
    ...svc,
    items: svc.items.map((it) => {
      const problem = mediaProblemFor(it.type === 'image' ? it.payload.path : undefined, servable)
      const bgProblem = mediaProblemFor(it.payload.background, servable)
      return problem || bgProblem ? { ...it, mediaProblem: problem ?? undefined, backgroundProblem: bgProblem ?? undefined } : it
    })
  }
}

function refreshIfActive(serviceId: number | null): void {
  if (serviceId != null && serviceId === activeServiceId) refreshActiveServiceItems(serviceId)
}

// --- Service builder IPC ---
ipcMain.handle('wf:services:list', () => listServices())
ipcMain.handle('wf:services:create', (_e, name: string, date?: string) => createService(name, date))
ipcMain.handle('wf:services:delete', (_e, id: number) => deleteService(id))
ipcMain.handle('wf:services:get', (_e, id: number) => withMediaProblems(getService(id)))
ipcMain.handle('wf:service:setPublished', (_e, id: number, publishedAt: number | null) => setServicePublished(id, publishedAt))
ipcMain.handle('wf:service:getTeam', (_e, id: number) => getServiceTeam(id))
ipcMain.handle('wf:service:setTeam', (_e, id: number, team: import('../shared/types').ServiceTeam) => setServiceTeam(id, team))
ipcMain.handle('wf:services:addItem', (_e, serviceId: number, item: NewServiceItem) => {
  const id = addServiceItem(serviceId, item)
  refreshIfActive(serviceId)
  return id
})
ipcMain.handle('wf:services:replaceItem', (_e, itemId: number, type: import('../shared/types').ServiceItemType, refId: number | null, payload: Record<string, unknown>) => {
  const serviceId = getServiceIdForItem(itemId)
  replaceServiceItem(itemId, type, refId, payload)
  refreshIfActive(serviceId)
})
ipcMain.handle('wf:services:removeItem', (_e, itemId: number) => {
  const serviceId = getServiceIdForItem(itemId)  // must read before the row is deleted
  removeServiceItem(itemId)
  refreshIfActive(serviceId)
})
ipcMain.handle('wf:services:duplicateItem', (_e, itemId: number) => {
  const serviceId = getServiceIdForItem(itemId)
  const id = duplicateServiceItem(itemId)
  refreshIfActive(serviceId)
  return id
})
ipcMain.handle('wf:services:moveItem', (_e, itemId: number, dir: 'up' | 'down') => {
  const serviceId = getServiceIdForItem(itemId)
  moveServiceItem(itemId, dir)
  refreshIfActive(serviceId)
})
ipcMain.handle('wf:services:updateItemNotes', (_e, itemId: number, notes: string | null) => {
  const serviceId = getServiceIdForItem(itemId)
  updateServiceItemNotes(itemId, notes)
  refreshIfActive(serviceId)
})
ipcMain.handle('wf:services:setItemStyle', (_e, itemId: number, style: ItemStyle | null) => {
  const serviceId = getServiceIdForItem(itemId)
  setServiceItemStyle(itemId, style)
  refreshIfActive(serviceId)
})
ipcMain.handle('wf:services:setItemPayload', (_e, itemId: number, payload: Record<string, unknown>) => {
  const serviceId = getServiceIdForItem(itemId)
  setServiceItemPayload(itemId, payload)
  refreshIfActive(serviceId)
})
ipcMain.handle('wf:services:reorder', (_e, serviceId: number, track: TrackId, orderedIds: number[]) => {
  assertTrackId(track)
  reorderServiceItems(serviceId, track, orderedIds)
  refreshIfActive(serviceId)
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

// Computes what the deck WOULD be — the same reading/announcement generation
// loadDeckOnto falls back to when nothing is stored — without saving it. The
// composer calls this once, on "Build slides", to seed real verses/announcement
// text instead of one blank card the operator would have to fill in by hand.
// Takes the whole item because the Build Service editor holds a service that
// may not be the live one, so there is no activeServiceItems entry to look up.
ipcMain.handle('wf:zone:generateSlides', async (_e, item: ServiceItem): Promise<ZoneSlide[] | null> =>
  autoDeckFor(item, autoDeckDeps())
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
  assertZoneId(zoneId)
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

// --- Looks (saved zone-pin presets) ---

ipcMain.handle('wf:looks:list', (): Look[] => parseLooksConfig(getSetting('zone_looks')))

ipcMain.handle('wf:looks:save', (_e: unknown, name: string): void => {
  const looks = parseLooksConfig(getSetting('zone_looks'))
  const look: Look = { id: randomUUID(), name: name.trim(), pins: zonePinsRecord() }
  // parseLooksConfig validates the WHOLE stored array atomically — one
  // blank-named entry slipping in would make every future read of this
  // setting (including the next save/delete's own read-modify-write) treat
  // the entire list as corrupt and silently discard every previously saved
  // Look, not just the bad one. Guard here, the same way wf:scenes:set
  // validates before persisting.
  if (!validateLook(look)) throw new Error('A Look needs a name')
  setSetting('zone_looks', JSON.stringify([...looks, look]))
})

ipcMain.handle('wf:looks:delete', (_e: unknown, lookId: string): void => {
  const looks = parseLooksConfig(getSetting('zone_looks'))
  setSetting('zone_looks', JSON.stringify(looks.filter((l) => l.id !== lookId)))
})

// Applying a Look sets exactly what was saved for all 4 zones — a zone
// absent from look.pins is explicitly unpinned here, not left alone, so a
// recall always reproduces the saved combination regardless of whatever the
// zones were doing beforehand. looks came from parseLooksConfig, which
// already ran validateZonePins over the whole pins object, so no per-zone
// re-validation is needed here. A pinned item that's since been deleted
// isn't this handler's problem to solve — computeZoneStates() already
// degrades a missing pinned item to 'logo' on its own.
ipcMain.handle('wf:looks:apply', (_e: unknown, lookId: string): void => {
  const looks = parseLooksConfig(getSetting('zone_looks'))
  const look = looks.find((l) => l.id === lookId)
  if (!look) throw new Error('Look not found')
  for (const zoneId of [1, 2, 3, 4] as ZoneId[]) {
    const pin = look.pins[zoneId] ?? null
    if (pin == null) zonePins.delete(zoneId)
    else zonePins.set(zoneId, pin)
  }
  warnedMissingPins.clear()
  broadcast()
})

// Hardcoded, not a user-editable Look — always available, never accidentally
// renamed or deleted. Screens only: no Sound Check, Room Feed, or track
// changes, per the design's explicit scope decision.
ipcMain.handle('wf:zone:safetyReset', (): void => {
  for (const zoneId of [1, 2, 3, 4] as ZoneId[]) {
    zonePins.set(zoneId, { kind: 'mode', mode: 'logo' })
  }
  warnedMissingPins.clear()
  broadcast()
})

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

// --- Service Control mode mapping (Live Control's Sermon/Worship/Invitation
// Mode shortcuts — which of the church's own scene presets each one applies) ---
ipcMain.handle('wf:service-control-modes:get', () => parseServiceControlModeMapping(getSetting('service_control_mode_mapping')))
ipcMain.handle('wf:service-control-modes:set', (_e, mapping: ServiceControlModeMapping) => {
  if (!validateServiceControlModeMapping(mapping)) throw new Error('Invalid service control mode mapping')
  setSetting('service_control_mode_mapping', JSON.stringify(mapping))
})

ipcMain.handle('wf:app:getTabletPort', async (): Promise<number> => {
  return boundTabletPort
})

// Everything a renderer needs to reach Live Call signaling. The renderer runs on
// the Vite dev server (or file://) in packaged builds, so it cannot derive the
// tablet server's origin from location.host — it has to be told.
ipcMain.handle('wf:livecall:config', async (): Promise<LivecallConfig> => {
  // Prefer the Tailscale HTTPS name: it is the only address a phone will grant
  // camera access on, and the only one reachable when he is out of town.
  const ts = await tailscaleHttpsBase()
  return {
    url: `ws://127.0.0.1:${boundTabletPort}/livecall`,
    phoneUrl: ts ? `${ts}/phone` : `http://${getLocalIp()}:${boundTabletPort}/phone`,
    phoneUrlIsSecure: ts !== null,
    tabletPort: boundTabletPort,
    token: livecallToken(),
    room: 'sanctuary',
  }
})

ipcMain.handle('wf:roomfeed:config', async (): Promise<LivecallConfig> => {
  // Same server, same shared token, same Tailscale-detection logic as the
  // outbound call — just a different room and a different served page.
  const ts = await tailscaleHttpsBase()
  return {
    url: `ws://127.0.0.1:${boundTabletPort}/livecall`,
    phoneUrl: ts ? `${ts}/room-feed` : `http://${getLocalIp()}:${boundTabletPort}/room-feed`,
    phoneUrlIsSecure: ts !== null,
    tabletPort: boundTabletPort,
    token: livecallToken(),
    room: 'room-feed',
  }
})

// A crash-and-relaunch might not happen right away — nobody may notice the
// app died until well into the service — so this needs to be generous enough
// to cover "mid-service crash, relaunched a couple hours later" without
// resurrecting a snapshot from a completely different day (e.g. Wednesday
// rehearsal state showing up the following Sunday).
const RECOVERY_STALE_MS = 12 * 60 * 60 * 1000 // 12 hours

ipcMain.handle('wf:app:restoreRecovery', async (): Promise<{
  ok: boolean
  restored: boolean
  fallback: boolean
  stale: boolean
  serviceName: string | null
  blanked: 'black' | 'logo' | null
}> => {
  // The snapshot as it was when this process started (A2-N1) — by now
  // recovery.json already holds this session's own state. Handed out once, so
  // a renderer reload/crash-revive doesn't re-load the old item.
  const startup = startupRecovery.take()
  const recovered = startup?.snap ?? null
  // Writes are allowed again now (A3-N4); persist this session's state.
  const nothing = (stale = false): { ok: boolean; restored: boolean; fallback: boolean; stale: boolean; serviceName: string | null; blanked: null } => {
    broadcast()
    return { ok: true, restored: false, fallback: false, stale, serviceName: null, blanked: null }
  }
  if (!recovered) return nothing()

  if (isRecoveryStale(recovered, Date.now(), RECOVERY_STALE_MS)) return nothing(true)

  // A normal quit writes cleanExit=true. Restoring after that put Saturday's
  // rehearsal (or last Sunday's closer) live on the projectors the next time
  // someone opened the app — including first-thing Sunday morning. Crash
  // recovery is for crashes; a clean quit stays idle.
  if (startup?.cleanExit) return nothing()

  // The renderer fires this on mount, before the operator has necessarily
  // opened any service, so activeServiceItems is very likely still empty —
  // self-load the service the snapshot was taken from rather than relying on
  // the operator having navigated anywhere first. If the service was since
  // deleted, this just leaves activeServiceItems empty and restore/fallback
  // below both no-op gracefully.
  if (recovered.serviceId != null) {
    refreshActiveServiceItems(recovered.serviceId)
  }
  const serviceName = recovered.serviceId != null && activeServiceId === recovered.serviceId
    ? activeServiceName || null
    : null

  let restoredAny = false
  let fallbackAny = false
  let blanked: 'black' | 'logo' | null = null

  const restoreTrack = async (track: TrackId, snap: TrackSnapshot | null): Promise<void> => {
    if (!snap?.liveServiceItemId) return
    const item = activeServiceItems.find((i) => i.id === snap.liveServiceItemId && i.track === track)
    if (item) {
      await handleTabletLoadItem(track, item.id)
      const t = tracks[track]
      if (snap.slideIndex >= 0 && snap.slideIndex < t.song.lines.length) {
        t.index = snap.slideIndex
      }
      // Black / Logo / C as the room last saw them (QA A3-N2).
      const layers = recoveredLayers(snap, t.mode)
      t.textHidden = layers.textHidden
      t.bgHidden = layers.bgHidden
      if (layers.screen) {
        clearCountdown(track)
        t.mode = layers.screen
        if (track === 'main') blanked = layers.screen
      }
      restoredAny = true
    } else {
      // The item is gone (deleted, or a bad id). Putting the first item live
      // used to put the pre-service countdown up mid-service (QA A3-N5) —
      // keep the screens on the logo and let the operator pick.
      if (activeServiceItems.some((i) => i.track === track)) {
        const t = tracks[track]
        clearCountdown(track)
        clearAutoAdvance(track)
        t.mode = 'logo'
        fallbackAny = true
      }
    }
  }

  suppressBroadcast = true
  try {
    await restoreTrack('main', recovered.main)
    await restoreTrack('second', recovered.second)
  } finally {
    suppressBroadcast = false
  }

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

  if (restoredAny) {
    const where = serviceName ? `Restored "${serviceName}" after a restart` : 'Restored where you left off after a restart'
    notifyOperator(blanked
      ? `${where} — the screens are still on ${blanked === 'black' ? 'Black' : 'the logo'}, as you left them. Press Space to show the slide.`
      : `${where}.`, 'info')
  } else if (fallbackAny) {
    notifyOperator(
      serviceName
        ? `Couldn't find the exact spot in "${serviceName}" after a restart — the screens are on the logo. Pick the item to go live.`
        : "Couldn't find the exact spot after a restart — the screens are on the logo. Pick the item to go live.",
      'warn'
    )
  }

  return { ok: true, restored: restoredAny, fallback: fallbackAny, stale: false, serviceName, blanked }
})

ipcMain.handle('wf:services:export', async (_e, serviceId: number): Promise<{ canceled: boolean; filePath?: string; error?: string }> => {
  const svc = getService(serviceId)
  if (!svc) return { canceled: true }
  const itemsWithSongs = await Promise.all(
    svc.items.map(async (item) => {
      const song = item.type === 'song' && item.ref_id != null ? getSong(item.ref_id) : null
      return { ...item, song }
    })
  )
  // B2-N2: embed every announcement the service points at (ref_id or a
  // block's refIds) — the id alone means nothing on the booth PC.
  const announcements: Record<string, BundleAnnouncement> = {}
  for (const item of svc.items) {
    for (const id of announcementRefs(item)) {
      const a = getAnnouncement(id)
      if (a) announcements[String(id)] = bundleAnnouncementFrom(a)
    }
  }
  const bundle = { version: BUNDLE_VERSION, name: svc.name, service_date: svc.service_date, published_at: svc.published_at ?? null, team: svc.team, theme: svc.theme, themeColors: svc.themeColors, items: itemsWithSongs, announcements }
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Export Service',
    defaultPath: `${svc.name.replace(/[/\\?%*:|"<>]/g, '-')}.wfservice`,
    filters: [{ name: 'WorshipFlow Service', extensions: ['wfservice'] }]
  })
  if (canceled || !filePath) return { canceled: true }
  try {
    writeFileSync(filePath, JSON.stringify(bundle, null, 2), 'utf-8')
  } catch (err) {
    // e.g. the USB stick was pulled or is read-only — tell the operator (QA B24).
    return { canceled: false, error: `Couldn't save the service file: ${err instanceof Error ? err.message : String(err)}` }
  }
  return { canceled: false, filePath }
})

ipcMain.handle('wf:services:import', async (): Promise<ServiceImportResult> => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: 'Import Service',
    filters: [{ name: 'WorshipFlow Service', extensions: ['wfservice'] }],
    properties: ['openFile']
  })
  if (canceled || filePaths.length === 0) return { canceled: true, serviceId: null }
  // Errors come back to the renderer as a message (toast) — no native dialog,
  // so live control never waits on a modal (QA A-H4) and a bad file is never
  // silent (QA B12).
  let text: string
  try {
    text = readFileSync(filePaths[0], 'utf-8')
  } catch (err) {
    return { canceled: false, serviceId: null, error: `Couldn't read that file: ${err instanceof Error ? err.message : String(err)}` }
  }
  const parsed = parseServiceBundle(text)
  if (!parsed.ok) return { canceled: false, serviceId: null, error: parsed.error }
  const bundle = parsed.bundle

  // B11: a song already in the library whose words differ from the file's copy
  // used to be silently replaced by the booth copy. Ask what to do instead.
  type SongPlan = { item: BundleItem; localId: number | null; differs: boolean }
  const plans: SongPlan[] = bundle.items.filter((it) => it.song).map((item) => {
    const incoming = item.song!
    const local = listSongs(incoming.title)
      .map((s) => getSong(s.id))
      .find((s): s is SongFull => !!s && sameSong(s, incoming))
    return { item, localId: local?.id ?? null, differs: local ? songContentDiffers(local, incoming) : false }
  })
  const conflicts = [...new Map(plans.filter((p) => p.differs).map((p) => [p.localId, p])).values()]
  let choice: 'keep' | 'replace' | 'copy' = 'keep'
  if (conflicts.length) {
    const names = conflicts.map((p) => `• ${p.item.song!.title}`).join('\n')
    const opts = {
      type: 'question' as const,
      title: 'Songs differ from this computer',
      message: `${conflicts.length === 1 ? 'This song is' : `${conflicts.length} songs are`} different in the file than in this computer’s library:`,
      detail: `${names}\n\n“Use the file’s version” updates the library song (every service that uses it will show the new words).`,
      buttons: ['Keep this computer’s version', 'Use the file’s version', 'Keep both (add as a copy)'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    }
    const parent = operatorWin && !operatorWin.isDestroyed() ? operatorWin : null
    const res = parent ? await dialog.showMessageBox(parent, opts) : await dialog.showMessageBox(opts)
    choice = res.response === 1 ? 'replace' : res.response === 2 ? 'copy' : 'keep'
  }

  const renamedName = uniqueServiceName(bundle.name, listServices().map((sv) => sv.name))
  const summary: ImportSummary = {
    serviceName: renamedName, renamedFrom: renamedName !== bundle.name ? bundle.name : null,
    items: 0, skipped: parsed.skipped, songsAdded: 0, songsMatched: 0,
    songsUpdated: [], songsKept: [], songsCopied: [],
    missingMedia: referencedMediaPaths(bundle).filter((p) => !existsSync(p)),
    announcementsAdded: 0, announcementsMatched: 0, announcementsMissing: [],
    newerVersion: parsed.newerVersion
  }
  const createdSongs: number[] = []
  const createdAnnouncements: number[] = []
  const announcementIds = new Map<number, number>()  // exporting PC's id → this PC's
  let serviceId: number | null = null
  const copyIds = new Map<number, number>()  // local song id → its "(from file)" copy
  try {
    serviceId = createService(renamedName, bundle.service_date ?? undefined)
    if (bundle.theme) setServiceTheme(serviceId, bundle.theme, bundle.themeColors ?? null)
    if (bundle.team) setServiceTeam(serviceId, bundle.team as import('../shared/types').ServiceTeam)
    // B2-N2: match each embedded announcement to the booth library (same
    // title + words + display) or add it, then remap the items' ids below.
    if (Object.keys(bundle.announcements).length) {
      const local = listAnnouncements().map((a) => getAnnouncement(a.id)).filter((a): a is NonNullable<typeof a> => !!a)
      for (const [key, incoming] of Object.entries(bundle.announcements)) {
        const match = local.find((a) => sameAnnouncement(a, incoming))
        if (match) { announcementIds.set(Number(key), match.id); summary.announcementsMatched!++; continue }
        const id = createAnnouncement(announcementInputFrom(incoming))
        createdAnnouncements.push(id)
        announcementIds.set(Number(key), id)
        summary.announcementsAdded!++
      }
    }
    for (const item of bundle.items) {
      let ref_id: number | null = null
      let payload = item.payload
      if (item.type === 'announcement') {
        const remapped = remapAnnouncementItem(item, announcementIds)
        ref_id = remapped.ref_id
        payload = remapped.payload
        if (remapped.missing) summary.announcementsMissing!.push(item.title || 'Announcement')
      }
      if (item.song) {
        const plan = plans.find((p) => p.item === item)!
        if (plan.localId == null) {
          ref_id = createSong(songInputFrom(item.song))
          createdSongs.push(ref_id)
          summary.songsAdded++
        } else if (plan.differs && choice === 'copy') {
          ref_id = copyIds.get(plan.localId) ?? createSong(songInputFrom(item.song, `${item.song.title} (from file)`))
          if (!copyIds.has(plan.localId)) { copyIds.set(plan.localId, ref_id); createdSongs.push(ref_id); summary.songsCopied.push(item.song.title) }
        } else {
          ref_id = plan.localId
          summary.songsMatched++
          if (plan.differs && choice === 'keep' && !summary.songsKept.includes(item.song.title)) summary.songsKept.push(item.song.title)
        }
      }
      const itemId = addServiceItem(serviceId, { type: item.type, ref_id, payload, track: item.track })
      if (item.notes) updateServiceItemNotes(itemId, item.notes)
      if (item.style) setServiceItemStyle(itemId, item.style)
      if (item.zoneRouting) setItemZoneRouting(itemId, JSON.stringify(item.zoneRouting))
      summary.items++
    }
    // Keep the published flag the file carried (zone routing above clears it).
    if (bundle.published_at) setServicePublished(serviceId, bundle.published_at)
  } catch (err) {
    // Undo the half-made import rather than leave a partial service behind.
    logError(`[import] .wfservice import failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
    try { if (serviceId != null) deleteService(serviceId) } catch { /* best effort */ }
    for (const id of createdSongs) { try { deleteSong(id) } catch { /* best effort */ } }
    for (const id of createdAnnouncements) { try { deleteAnnouncement(id) } catch { /* best effort */ } }
    return { canceled: false, serviceId: null, error: `The service couldn't be imported (${err instanceof Error ? err.message : String(err)}). Nothing was changed.` }
  }
  // Library updates last, once the service itself imported cleanly.
  if (choice === 'replace') {
    for (const p of conflicts) {
      try { updateSong(p.localId!, songInputFrom(p.item.song!, getSong(p.localId!)?.title ?? p.item.song!.title)); summary.songsUpdated.push(p.item.song!.title) } catch (err) {
        logError(`[import] couldn't update song ${p.localId}: ${err instanceof Error ? err.message : String(err)}`)
        summary.songsKept.push(p.item.song!.title)
      }
    }
  }
  logInfo(`[import] ${describeImport(summary)}`)
  return { canceled: false, serviceId, summary: describeImport(summary), warn: summary.skipped.length > 0 || summary.missingMedia.length > 0 || (summary.announcementsMissing?.length ?? 0) > 0 || !!summary.newerVersion }
})

// Import a service plan exported from the Snow Hill Church app (.wfplan / .json).
// Songs are matched to the library by title; scripture/sermon map to their real
// types; everything else becomes a labeled placeholder to fill in.
ipcMain.handle(
  'wf:services:importPlan',
  async (): Promise<{ canceled: boolean; serviceId: number | null; matched: number; missing: string[] }> => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Import Service Plan',
      filters: [{ name: 'Service Plan', extensions: ['wfplan', 'json'] }],
      properties: ['openFile']
    })
    if (canceled || filePaths.length === 0)
      return { canceled: true, serviceId: null, matched: 0, missing: [] }

    let plan: {
      kind?: string
      date?: string
      service?: string
      title?: string
      items?: Array<{ type: string; title?: string; detail?: string; leader?: string }>
    }
    try {
      plan = JSON.parse(readFileSync(filePaths[0], 'utf-8'))
    } catch (err) {
      await showErrorAsync(operatorWin, 'Import Failed', `Invalid plan file: ${err instanceof Error ? err.message : String(err)}`)
      return { canceled: false, serviceId: null, matched: 0, missing: [] }
    }
    if (plan.kind !== 'service-plan' || !Array.isArray(plan.items)) {
      await showErrorAsync(operatorWin, 'Import Failed', 'That file is not a WorshipFlow service plan.')
      return { canceled: false, serviceId: null, matched: 0, missing: [] }
    }

    const name = plan.title?.trim()
      ? `${plan.title.trim()} — ${plan.service ?? ''} ${plan.date ?? ''}`.trim()
      : `${plan.service ?? 'Service'} — ${plan.date ?? ''}`.trim()

    const findSongId = (t: string): number | null => {
      const f = listSongs(t).find((s) => s.title.toLowerCase() === t.toLowerCase())
      return f ? f.id : null
    }
    const { mapped, matched, missing } = mapPlanItems(plan.items, findSongId)

    const serviceId = createService(name, plan.date || undefined)
    for (const m of mapped) {
      const itemId = addServiceItem(serviceId, { type: m.type, ref_id: m.ref_id, payload: m.payload })
      if (m.notes) updateServiceItemNotes(itemId, m.notes)
    }

    return { canceled: false, serviceId, matched, missing }
  }
)

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
  assertTrackId(track)
  await handleTabletLoadItem(track, itemId)  // loads the item live (index 0) + broadcasts + resolves theme
  const t = tracks[track]
  const last = t.song.lines.length - 1
  t.index = Math.max(0, Math.min(slideIndex, last < 0 ? 0 : last))
  broadcast()
})

// --- Scripture IPC ---
ipcMain.handle('wf:scripture:lookup', (_e, reference: string) => lookupScripture(reference))

// Validates a whole scripture field as it is typed, so a mistyped reference is
// caught while building rather than discovered as a blank screen mid-service.
// KJV only and deliberately synchronous: this fires on every keystroke, and the
// online translations are a network round-trip. A reference that resolves in KJV
// resolves in the others too — the text differs, the addressing does not.
// How a reference should break across slides, as sub-references. The composer
// uses this to expand a long passage the operator typed into one Verse slot:
// resolving it as a single slot joins every verse onto ONE slide, and
// shrink-to-fit then makes the words unreadable — which is exactly the problem
// the 90-character budget exists to prevent, and which only the generated deck
// was benefiting from. Returns one entry for a passage that already fits.
ipcMain.handle('wf:scripture:chunkRefs', (_e, reference: string): string[] => {
  const ref = typeof reference === 'string' ? reference.trim() : ''
  if (!ref) return []
  const result = lookupScripture(ref)
  if (!result.ok || !result.verses?.length) return []
  return chunkVerses(result.verses, zoneChunkBudget()).map((range) => rangeReference(result, ref, range))
})

ipcMain.handle('wf:scripture:validate', (_e, field: string) => {
  return parseReferenceList(typeof field === 'string' ? field : '').map((reference) => {
    const result = lookupScripture(reference)
    return {
      reference,
      ok: result.ok && !!result.verses?.length,
      resolved: result.ok ? (result.reference ?? reference) : null,
      verseCount: result.verses?.length ?? 0
    }
  })
})

// --- Song background / file dialog ---
ipcMain.handle('wf:songs:setBackground', (_e, id: number, path: string | null) =>
  setSongBackground(id, path)
)

// Push a background update to whatever's currently live, without resetting slide
// index/timer/other live state (used by the Live-tab drawer's Backgrounds tab so
// a background change mid-service doesn't jump back to the first slide/reset a timer).
ipcMain.handle('wf:live:setBackground', (_e, track: TrackId, path: string) => {
  assertTrackId(track)
  const t = tracks[track]
  t.song = { ...t.song, background: path }
  t.bgHidden = false
  broadcast()
})

// Background library
ipcMain.handle('wf:bg:list', () => listBackgrounds())

ipcMain.handle('wf:bg:listFolders', () => listBackgroundFolders())

ipcMain.handle('wf:bg:createFolder', (_e: unknown, name: string) => {
  createBackgroundFolder(name)
})

ipcMain.handle('wf:bg:renameFolder', (_e: unknown, oldName: string, newName: string) => {
  const moves = renameBackgroundFolder(oldName, newName)
  for (const m of moves) renameBackgroundTagPath(m.oldPath, m.newPath)
})

ipcMain.handle('wf:bg:deleteFolder', (_e: unknown, name: string) => {
  const moves = deleteBackgroundFolder(name)
  for (const m of moves) renameBackgroundTagPath(m.oldPath, m.newPath)
})

ipcMain.handle('wf:bg:move', (_e: unknown, filePath: string, folderName: string | null) => {
  const newPath = moveBackground(filePath, folderName)
  if (newPath !== filePath) renameBackgroundTagPath(filePath, newPath)
  return newPath
})

ipcMain.handle('wf:bg:usage', (_e: unknown, filePath: string) => {
  return findBackgroundUsage(filePath)
})

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
    const apiKey = getSecretSetting('replicate_api_key')
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

// Settings getter/setter (used by Settings tab for API keys etc.). A handful
// of keys are secrets (API keys, credentials) and route through the
// safeStorage-encrypted helpers instead of the plaintext ones — everything
// else (church name, chunk budgets, provider choice, ...) is unaffected.
const SECRET_SETTING_KEYS = new Set(['replicate_api_key', 'anthropic_api_key', 'obs_password'])
ipcMain.handle('wf:setting:get', (_e: unknown, key: string) =>
  SECRET_SETTING_KEYS.has(key) ? getSecretSetting(key) : getSetting(key))
ipcMain.handle('wf:setting:set', (_e: unknown, key: string, value: string | null) =>
  SECRET_SETTING_KEYS.has(key) ? setSecretSetting(key, value) : setSetting(key, value))

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

// The database bytes as they were before initDb() ran its migrations. Read in
// memory and only written to backups/ once initDb() has succeeded (QA A-N1): a
// file that fails to start must never become the newest "launch backup", or the
// recovery path keeps restoring it.
function readPreInitSnapshot(): Buffer | null {
  try {
    const p = join(app.getPath('userData'), 'worshipflow.db')
    return existsSync(p) ? readFileSync(p) : null
  } catch { return null }
}

// QA B2-N1: pick a picture/video for the projector (image items, song and item
// backgrounds) and copy it into WorshipFlow's imported-media folder, returning
// the copy's path. Storing the original path (Pictures, Downloads, a USB
// stick) used to give a blank projector, because wf-asset:// only serves files
// inside the app's own folders. The logo pickers keep wf:dialog:openFile —
// validateMediaPath explicitly allows the configured logo files.
ipcMain.handle('wf:media:pick', async (): Promise<{ canceled: boolean; path?: string; error?: string }> => {
  const opts = {
    title: 'Choose a picture or video',
    filters: [
      { name: 'Pictures and videos', extensions: MEDIA_EXTENSIONS },
      { name: 'Video', extensions: ['mp4', 'webm', 'mov', 'm4v'] },
      { name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }
    ],
    properties: ['openFile'] as ['openFile']
  }
  const res = operatorWin
    ? await dialog.showOpenDialog(operatorWin, opts)
    : await dialog.showOpenDialog(opts)
  if (res.canceled || !res.filePaths[0]) return { canceled: true }
  try {
    return { canceled: false, path: await importMediaFile(res.filePaths[0], mediaRoots()) }
  } catch (err) {
    if (err instanceof MediaImportRefused) return { canceled: false, error: `Can't use ${err.message}.` }
    const why = (err as NodeJS.ErrnoException)?.code === 'ENOSPC' ? 'the disk is full' : ((err as Error)?.message ?? String(err))
    logWarn(`[media] couldn't copy ${res.filePaths[0]} into imported-media: ${why}`)
    return { canceled: false, error: `Couldn't copy ${basename(res.filePaths[0])} into WorshipFlow's media folder (${why}).` }
  }
})

// Startup (and after a .wfservice import): copy any stored picture/video path
// that points outside the app's folders — items saved by 0.20.2 and earlier —
// into imported-media and rewrite the database to the copy. Files that no
// longer exist are left alone; Build service flags them with a Re-link button
// and Go Live warns. Never throws; one run at a time.
let mediaMigration: Promise<void> | null = null
const mediaReported = new Set<string>()
function firstMediaReport(key: string): boolean {
  if (mediaReported.has(key)) return false
  mediaReported.add(key)
  return true
}
function migrateOutsideMedia(reason: string): Promise<void> {
  if (mediaMigration) return mediaMigration
  mediaMigration = (async () => {
    try {
      const { relinked, failed, missing, refused } = await migrateOutsidePaths(listStoredMediaPaths(), mediaRoots(), (p) => validateMediaPath(p) !== null)
      const rows = rewriteStoredMediaPaths(relinked)
      if (relinked.size > 0) {
        logInfo(`[media] ${reason}: copied ${relinked.size} outside picture/video file(s) into imported-media (${rows} row(s) updated)`)
        refreshIfActive(activeServiceId)
        operatorWin?.webContents.send('wf:media:relinked', { count: relinked.size })
        notifyOperator(`Copied ${relinked.size} picture/video file${relinked.size === 1 ? '' : 's'} into WorshipFlow's media folder so ${relinked.size === 1 ? 'it shows' : 'they show'} on the projector.`, 'info')
      }
      // Each path is reported once per session, not on every service open (A3-N7).
      for (const f of failed) if (firstMediaReport(`fail:${f.path}`)) logWarn(`[media] ${reason}: couldn't copy ${f.path}: ${f.error}`)
      for (const r of refused) if (firstMediaReport(`refused:${r.path}`)) logWarn(`[media] ${reason}: not copying ${r.path} — ${r.reason} (QA A3-N1)`)
      const newMissing = missing.filter((m) => firstMediaReport(`missing:${m}`))
      if (newMissing.length > 0) logWarn(`[media] ${reason}: ${newMissing.length} stored picture/video path(s) no longer exist (Build service shows Re-link)`)
    } catch (err) {
      logWarn(`[media] ${reason}: migration failed: ${(err as Error)?.message ?? err}`)
    } finally {
      mediaMigration = null
    }
  })()
  return mediaMigration
}

// QA A3-N6: imported-media only ever grew. Once per launch (after the
// migration): delete copies cut short more than an hour ago, and copies
// nothing in the database mentions any more — but only after they've been
// unreferenced for 30 days (remembered in imported-media/.cleanup.json), so
// an undo, a re-import or restoring a backup still finds them. Never throws;
// never touches anything but plain files directly inside imported-media.
async function cleanImportedMedia(): Promise<void> {
  const { mediaDir } = mediaRoots()
  const statePath = join(mediaDir, '.cleanup.json')
  try {
    if (!existsSync(mediaDir)) return
    const entries = await fsPromises.readdir(mediaDir, { withFileTypes: true })
    const files: Array<{ name: string; mtimeMs: number }> = []
    for (const e of entries) {
      if (!e.isFile() || !safeCleanupName(e.name)) continue
      try { files.push({ name: e.name, mtimeMs: (await fsPromises.stat(join(mediaDir, e.name))).mtimeMs }) } catch { /* vanished */ }
    }
    let orphanSince: Record<string, number> = {}
    try { orphanSince = JSON.parse(await fsPromises.readFile(statePath, 'utf8')) as Record<string, number> } catch { /* first run */ }
    const candidates = files.filter((f) => !f.name.startsWith('.')).map((f) => f.name)
    const referenced = databaseMentions(candidates)
    for (const configured of [logoPath, logoBg]) if (configured) referenced.add(basename(configured))
    const plan = planImportedMediaCleanup(files, (n) => referenced.has(n), orphanSince, Date.now())
    let freed = 0
    for (const name of plan.remove) {
      if (!safeCleanupName(name)) continue
      const full = join(mediaDir, name)
      try { freed += (await fsPromises.stat(full)).size; await fsPromises.rm(full, { force: true }) } catch { /* in use / gone */ }
    }
    await fsPromises.writeFile(statePath, JSON.stringify(plan.orphanSince))
    if (plan.remove.length > 0) logInfo(`[media] cleanup: removed ${plan.remove.length} unused/partial file(s) from imported-media (${Math.round(freed / 1048576)} MB)`)
  } catch (err) {
    logWarn(`[media] cleanup failed: ${(err as Error)?.message ?? err}`)
  }
}

// Create a timestamped backup of the database on app launch
function createTimestampedBackup(snapshot: Buffer | null): void {
  const bakDir = join(app.getPath('userData'), 'backups')

  try {
    if (!existsSync(bakDir)) mkdirSync(bakDir, { recursive: true })
    const now = new Date()
    const timestamp = now.toISOString().replace(/[:\-]/g, '').split('.')[0]
    const backupPath = join(bakDir, `worshipflow-${timestamp}.db`)
    if (snapshot && snapshot.length > 0) {
      writeFileSync(backupPath, snapshot)
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
      // Only the per-launch snapshots rotate. The pre-restore safety copies
      // (worshipflow-pre-restore-*.db) used to match too and, sorting last,
      // permanently ate one of the 40 slots each.
      .filter((f) => /^worshipflow-\d{8}T\d{6}\.db$/.test(f))
      .sort()  // ISO-ish timestamp in the name sorts chronologically
    for (const f of files.slice(0, Math.max(0, files.length - keep))) {
      try { unlinkSync(join(bakDir, f)) } catch { /* ignore individual failures */ }
    }
    // Pre-restore copies rotate separately; the newest 10 are kept.
    for (const f of preRestoreCopiesToPrune(readdirSync(bakDir), 10)) {
      try { unlinkSync(join(bakDir, f)) } catch { /* ignore individual failures */ }
    }
  } catch (err) {
    console.error('Failed to prune backups:', err)
  }
}

// (Backup filename parsing lives in shared/backupNames.ts.)

// The automatic per-launch backup (createTimestampedBackup) protects against a
// bad migration, but the backups just sat in a folder with no way to actually
// use one short of manual file surgery — closing that gap with a real
// restore path, gated behind an explicit operator confirmation + relaunch
// (restoring into the live sql.js instance mid-session would mean resetting
// every module-level cache in this file by hand — relaunching the whole app
// is the same recovery path the operator already gets after any crash).
ipcMain.handle('wf:backups:list', (): { filename: string; timestamp: number; kind: BackupKind }[] => {
  const bakDir = join(app.getPath('userData'), 'backups')
  if (!existsSync(bakDir)) return []
  try {
    // Launch snapshots AND pre-restore copies (QA A-M3: the latter undo a wrong restore).
    return readdirSync(bakDir)
      .map((filename) => ({ filename, parsed: parseBackupFilename(filename) }))
      .filter((f): f is { filename: string; parsed: NonNullable<ReturnType<typeof parseBackupFilename>> } => f.parsed != null)
      .sort((a, b) => b.parsed.timestamp - a.parsed.timestamp)
      .map((f) => ({ filename: f.filename, timestamp: f.parsed.timestamp, kind: f.parsed.kind }))
  } catch (err) {
    logError('[backups] failed to list', err)
    return []
  }
})

ipcMain.handle('wf:backups:restore', async (_e, filename: string): Promise<void> => {
  if (!isRestorableBackupName(filename)) {
    throw new Error(`Invalid backup filename: ${filename}`)
  }
  const bakDir = join(app.getPath('userData'), 'backups')
  const backupPath = join(bakDir, filename)
  if (!existsSync(backupPath)) throw new Error('Backup file not found')
  const dbPath = join(app.getPath('userData'), 'worshipflow.db')
  // One more safety copy of the CURRENT (pre-restore) database, in case the
  // chosen backup was the wrong one — this is not pruned by pruneBackups'
  // normal cadence rotation, it's a single just-in-case snapshot.
  const preRestorePath = join(bakDir, `worshipflow-pre-restore-${Date.now()}.db`)
  // Never restore a backup that is itself damaged — that would turn a working
  // install into the A-C3 "corrupt DB" startup path.
  const check = await validateDatabaseFile(backupPath)
  if (!check.ok) throw new Error(`That backup is damaged and can't be restored (${check.reason}). Pick an older one.`)
  try {
    if (existsSync(dbPath)) copyFileSync(dbPath, preRestorePath)
    // Temp file + rename: a full disk mid-copy can't leave a half-written DB.
    atomicCopy(backupPath, dbPath)
  } catch (err) {
    logError('[backups] restore failed', err)
    // Nothing changed, so the safety copy taken for this attempt isn't needed.
    try { if (existsSync(preRestorePath)) unlinkSync(preRestorePath) } catch { /* leave it */ }
    throw err instanceof Error ? err : new Error(String(err))
  }
  // app.exit() skips before-quit; mark the exit clean ourselves so the
  // relaunch doesn't treat this as a crash and push the old live item back
  // onto the projectors from recovery.json.
  markCleanExit(true)
  app.relaunch()
  app.exit(0)
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

// Export the song list (titles + authors) as a file the Snow Hill Church
// planning app can import for its song picker.
ipcMain.handle('wf:songs:exportList', async (): Promise<{ canceled: boolean; count: number }> => {
  const all = listSongs('')
  const bundle = {
    app: 'worshipflow',
    kind: 'song-list',
    version: 1,
    songs: all.map((s) => ({ title: s.title, author: s.author ?? undefined }))
  }
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Export Song List',
    defaultPath: 'worshipflow-songs.wfsongs',
    filters: [{ name: 'Song List', extensions: ['wfsongs', 'json'] }]
  })
  if (canceled || !filePath) return { canceled: true, count: 0 }
  writeFileSync(filePath, JSON.stringify(bundle, null, 2), 'utf-8')
  return { canceled: false, count: all.length }
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
  // Copy each slide into imported-media first (QA B2-N1) — the original
  // export folder is outside what the projector may load.
  const copies: string[] = []
  for (const f of files) {
    try {
      copies.push(await importMediaFile(f, mediaRoots()))
    } catch (err) {
      logWarn(`[media] importImages: couldn't copy ${f}: ${(err as Error)?.message ?? err}`)
      copies.push(f) // keep the slide; Build service flags it with Re-link
    }
  }
  const id = createService(name)
  for (const f of copies) addServiceItem(id, { type: 'image', payload: { path: f } })
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


// --- Startup database recovery UI (QA A-C3) ---------------------------------
// These run before (or instead of) the operator window, so they use async
// native dialogs; nothing else is live yet, so nothing is being blocked.

function userDataDir(): string {
  return app.getPath('userData')
}

// No good backup anywhere: the damaged file has been moved aside; let the
// operator decide rather than silently starting empty. Returns true to
// continue (with an empty library), false if the app is exiting.
async function confirmStartWithEmptyLibrary(report: Extract<DbStartupReport, { status: 'unrecoverable' }>): Promise<boolean | 'retry'> {
  // QA A2-N5: a good backup exists but couldn't be copied (disk full, OneDrive
  // or antivirus holding the file). This used to fall into the "couldn't
  // check / Try to open it anyway" wording, and that button actually started
  // an empty library. Say what happened and offer a retry.
  if (report.restoreFailed) {
    logError('[db] a good backup exists but could not be restored', report.reason)
    const { response } = await dialog.showMessageBox({
      type: 'error',
      title: 'WorshipFlow Pro — couldn’t restore the backup',
      message: "WorshipFlow found a good backup but couldn't put it in place.",
      detail:
        `Problem: ${report.reason}\n\n` +
        'This usually means the disk is full, or another program (OneDrive, Google Drive, antivirus) has the file open. ' +
        'Free some disk space or close that program, then choose Try again. Your backups have not been touched.',
      buttons: ['Try again', 'Start with an empty library', 'Quit'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    })
    if (response === 0) return 'retry'
    if (response === 2) { app.exit(1); return false }
    if (report.damagedInPlace) {
      const kept = moveAside(join(userDataDir(), 'worshipflow.db'))
      if (kept) logWarn(`[db] starting with an empty library; damaged file kept at ${kept}`)
    }
    return true
  }
  logError('[db] database damaged and no good backup found', report.reason)
  const dbExists = existsSync(join(userDataDir(), 'worshipflow.db'))
  const { response } = await dialog.showMessageBox({
    type: 'error',
    title: 'WorshipFlow Pro — database problem',
    message: report.damagedInPlace
      ? "WorshipFlow's song and service database is damaged, and no backup could be restored."
      : "WorshipFlow couldn't check its song and service database.",
    detail:
      `Problem: ${report.reason}\n\n` +
      (report.corruptPath ? `The damaged file was kept (not deleted) at:\n${report.corruptPath}\n\n` : '') +
      'You can start with an empty library now (the damaged file is kept beside it, so it can still be recovered later), ' +
      'or quit and copy a backup into the data folder.',
    // "Try to open it anyway" only makes sense when there IS a file to open.
    buttons: [report.damagedInPlace || !dbExists ? 'Start with an empty library' : 'Try to open it anyway', 'Open data folder', 'Quit'],
    defaultId: 2,
    cancelId: 2,
    noLink: true
  })
  if (response === 0) {
    // The damaged file is still in place (nothing was restored): set it aside now
    // so initDb() starts clean, and it stays recoverable.
    if (report.damagedInPlace) {
      const kept = moveAside(join(userDataDir(), 'worshipflow.db'))
      if (kept) logWarn(`[db] starting with an empty library; damaged file kept at ${kept}`)
    }
    return true
  }
  if (response === 1) await shell.openPath(userDataDir())
  app.exit(1)
  return false
}

// QA A-N2: worshipflow.db is missing but a good backup exists (a failed restore
// copy, OneDrive/antivirus moving it, someone deleting it). Starting silently
// with an empty library used to overwrite the .bak copies within seconds.
async function confirmMissingDatabase(report: Extract<DbStartupReport, { status: 'missing' }>): Promise<DbStartupReport | null> {
  const when = new Date(report.candidateMtimeMs).toLocaleString()
  logWarn(`[db] database file missing; newest good backup is ${report.candidate}`)
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: 'WorshipFlow Pro — database missing',
    message: "WorshipFlow's song and service database is missing, but a backup was found.",
    detail: `Newest good backup: ${basename(report.candidate)} (saved ${when}).\n\nRestore it, or start with an empty library?`,
    buttons: ['Restore the backup', 'Start with an empty library', 'Quit'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  })
  if (response === 1) return { status: 'fresh' }
  if (response === 2) { app.exit(1); return null }
  return restoreMissingFromBackup()
}

// The file validated but initDb() still threw (e.g. a migration failed).
// Offer to restore an older good backup and relaunch; never leave a running
// process with no window.
async function handleDbInitFailure(err: unknown): Promise<void> {
  const reason = err instanceof Error ? err.message : String(err)
  // QA A-N1: one automatic restore only. If the restored backup fails too, the
  // problem is the software, not the data — restoring older and older backups
  // would walk the library backwards. Leave everything where it is.
  const previous = readRestoreAttempt(userDataDir())
  if (previous) {
    logError('[db] initDb failed again after an automatic restore; not restoring another backup', reason)
    const { response } = await dialog.showMessageBox({
      type: 'error',
      title: 'WorshipFlow Pro — database problem',
      message: 'WorshipFlow still can\'t open its database, even after restoring a backup.',
      detail:
        `Problem: ${reason}\n\n` +
        'This usually means a software problem rather than damaged data, so no further backups were restored. ' +
        'Nothing has been deleted' + (previous.corruptPath ? ` — the newest data is in:\n${previous.corruptPath}` : '.') +
        '\n\nPlease contact your WorshipFlow administrator and send the logs from the data folder.',
      buttons: ['Open data folder', 'Quit'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    })
    if (response === 0) await shell.openPath(userDataDir())
    app.exit(1)
    return
  }
  const { response } = await dialog.showMessageBox({
    type: 'error',
    title: 'WorshipFlow Pro — database problem',
    message: "WorshipFlow couldn't open its song and service database.",
    detail:
      `Problem: ${reason}\n\n` +
      'Restore the newest good backup and restart? The current file is kept (renamed, not deleted) so nothing is lost.',
    buttons: ['Restore newest good backup', 'Open data folder', 'Quit'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  })
  if (response === 0) {
    try {
      const result = await forceRestoreLatestBackup()
      if (result.status === 'recovered') {
        logWarn(`[db] restored ${result.restoredFrom} after initDb failure; damaged copy kept at ${result.corruptPath}`)
        recordRestoreAttempt(userDataDir(), { at: Date.now(), restoredFrom: result.restoredFrom, corruptPath: result.corruptPath, restoredFromMtimeMs: result.restoredFromMtimeMs })
        app.relaunch()
      } else {
        await dialog.showMessageBox({
          type: 'error',
          title: 'WorshipFlow Pro — database problem',
          message: 'No other good backup was found.',
          detail: 'The current database file was left where it is (nothing was deleted). Please contact your WorshipFlow administrator.',
          buttons: ['OK']
        })
      }
    } catch (restoreErr) {
      logError('[db] restore after initDb failure failed', restoreErr)
    }
  } else if (response === 1) {
    await shell.openPath(userDataDir())
  }
  app.exit(1)
}

// Tell the operator, clearly, that a restore happened and what may be missing.
// Async message box attached to the operator window: never blocks live control.
function announceDbRecovery(report: Extract<DbStartupReport, { status: 'recovered' }>): void {
  const when = new Date(report.restoredFromMtimeMs).toLocaleString()
  // A2-N8: "damaged (the database file was missing)" read oddly.
  const what = report.reason === 'the database file was missing'
    ? 'The database file was missing'
    : `The database file was damaged (${report.reason})`
  const detail =
    `${what}, so WorshipFlow restored the newest good backup, saved ${when} ` +
    `(${basename(report.restoredFrom)}).\n\nAnything changed after that time may be missing — check this Sunday's service.` +
    (report.corruptPath ? `\n\nThe damaged file was kept (not deleted) at:\n${report.corruptPath}` : '')
  logWarn(`[db] recovered from ${report.restoredFrom}; ${report.corruptPath ? `damaged file kept at ${report.corruptPath}` : (report.reason === 'the database file was missing' ? 'no damaged file to keep (it was missing)' : 'damaged file could not be kept')}`)
  const show = (): void => {
    const opts = {
      type: 'warning' as const,
      title: 'WorshipFlow Pro — restored from backup',
      message: 'Your songs and services were restored from a backup.',
      detail,
      buttons: ['OK', 'Open data folder'],
      defaultId: 0,
      noLink: true
    }
    const p = operatorWin && !operatorWin.isDestroyed() ? dialog.showMessageBox(operatorWin, opts) : dialog.showMessageBox(opts)
    void p.then((r) => { if (r.response === 1) void shell.openPath(userDataDir()) })
    notifyOperator(`Restored from the backup saved ${when}. Changes after that may be missing.`, 'warn')
  }
  if (operatorWin && !operatorWin.isDestroyed() && !operatorWin.webContents.isLoading()) show()
  else operatorWin?.webContents.once('did-finish-load', show)
}

app.whenReady().then(async () => {
  // Belt-and-suspenders: never touch the DB or open windows on a losing instance.
  if (!gotSingleInstanceLock) return
  // Read last session's crash snapshot before anything can broadcast (A2-N1).
  startupRecovery.capture()
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

  // QA A-C3: validate the database BEFORE anything opens it. A damaged file is
  // moved aside (never deleted) and the newest good backup restored; with no
  // good backup the operator chooses what happens instead of getting a
  // windowless zombie process that holds the single-instance lock.
  let dbReport: DbStartupReport = { status: 'ok' }
  try {
    dbReport = await checkDatabaseOnStartup()
  } catch (err) {
    // QA A-N2: never carry on as if the check passed — a thrown restore copy
    // used to fall through to a silent empty library.
    logError('[db] startup validation failed to run', err)
    dbReport = { status: 'unrecoverable', reason: `the startup check failed (${err instanceof Error ? err.message : String(err)})`, corruptPath: null }
  }
  if (dbReport.status === 'missing') {
    const next = await confirmMissingDatabase(dbReport)
    if (!next) return
    dbReport = next
  }
  while (dbReport.status === 'unrecoverable') {
    const choice = await confirmStartWithEmptyLibrary(dbReport)
    if (choice === false) return
    if (choice === true) break
    // 'retry' (A2-N5): run the same restore again.
    try {
      dbReport = existsSync(join(userDataDir(), 'worshipflow.db')) ? await checkDatabaseOnStartup() : await restoreMissingFromBackup()
    } catch (err) {
      dbReport = { status: 'unrecoverable', reason: `the restore failed (${err instanceof Error ? err.message : String(err)})`, corruptPath: null, restoreFailed: true }
    }
    if (dbReport.status === 'missing') {
      const next = await confirmMissingDatabase(dbReport)
      if (!next) return
      dbReport = next
    }
  }
  // Snapshot the database bytes BEFORE initDb() runs migrations (so a bad
  // migration can't poison the day's backup), but only write the launch backup
  // once initDb() has succeeded (QA A-N1).
  const preInitSnapshot = readPreInitSnapshot()
  // The database must be initialized before anything reads it — SoundCheckState
  // loads its saved rules/reference mixes during initialize(), so initDb() has to
  // run first or that read hits an undefined db handle and silently fails.
  try {
    await initDb()
  } catch (err) {
    logError('[db] initDb failed', err)
    await handleDbInitFailure(err)
    return
  }
  createTimestampedBackup(preInitSnapshot)
  // QA A2-N6: the "couldn't open — restore and restart?" path relaunches; tell
  // the operator on this launch which backup was restored, like the
  // validation path does, instead of clearing the marker silently.
  const restoredAfterInitFailure = readRestoreAttempt(userDataDir())
  clearRestoreAttempt(userDataDir())
  if (restoredAfterInitFailure && dbReport.status !== 'recovered') {
    let mtime = restoredAfterInitFailure.restoredFromMtimeMs ?? 0
    if (!mtime) { try { mtime = statSync(restoredAfterInitFailure.restoredFrom).mtimeMs } catch { mtime = restoredAfterInitFailure.at } }
    dbReport = { status: 'recovered', reason: "WorshipFlow couldn't start on the previous database file", restoredFrom: restoredAfterInitFailure.restoredFrom, restoredFromMtimeMs: mtime, corruptPath: restoredAfterInitFailure.corruptPath }
  }
  // Reconcile any recording left open by a crash/hard-quit so it doesn't stay
  // dangling forever — mark it ended now.
  closeDanglingRecordings(Date.now())
  restoreActiveServiceFromSettings()
  // Surface save failures to the operator instead of losing them to the console.
  onPersistError((err) => {
    logError('[persist] save failed', err)
    // A conflict isn't a disk problem, so it carries its own instructions —
    // telling the operator to free up space would send them chasing the
    // wrong thing entirely.
    notifyOperator(
      err instanceof DbConflictError
        ? err.message
        : 'Save failed — your last change may not be saved. Check disk space and pause Google Drive/OneDrive sync.',
      'error'
    )
  })
  ccliLicense = getSetting('ccli_license')
  logoPath = getSetting('logo_path')
  logoBg = getSetting('logo_bg')
  const storedZoneScales = getSetting('zone_scales')
  if (storedZoneScales) {
    try { zoneScales = { ...zoneScales, ...JSON.parse(storedZoneScales) } } catch { /* keep defaults */ }
  }

  const soundCheckState = new SoundCheckState()
  await soundCheckState.initialize()
  registerSoundCheckHandlers(soundCheckState)

  ipcMain.handle('wf:roomfeed:notifyCapturing', (_e, active: boolean) => {
    setRoomFeedActive(active)
    // Room feed always wins — see roomFeedPrecedence.ts. Stopping Sound Check
    // here does not restart it when the room feed later stops; the operator
    // starts it again if they still want it.
    if (active && soundCheckState.audioCapture.isActive()) {
      soundCheckState.audioCapture.stop()
    }
  })

  startTabletServer()
  createOperator()
  if (dbReport.status === 'recovered') announceDbRecovery(dbReport)
  // Fullscreen the audience output on a projector at launch, so the congregation
  // screen is never left dark waiting for a hotplug event. With no projector
  // attached this opens the zone multiview instead of a stray output window.
  layoutOutputs()
  broadcast()
  // Copy pictures/videos older versions stored outside the app folder (B2-N1).
  void migrateOutsideMedia('startup').then(() => cleanImportedMedia())
  // Reconnect to OBS in the background if the operator connected before (non-blocking).
  void initObsAutoConnect()
  // Startup-only update check (never repeats while the app stays open) — see
  // the 2026-08-02 design spec.
  initAutoUpdate({
    installBlockReason: () => {
      const obs = getObsStatus()
      return updateInstallBlockReason({
        tracks: [tracks.main, tracks.second].map((t) => ({ hasLiveContent: t.hasLiveContent, mode: t.mode })),
        obsStreaming: obs.streaming,
        obsRecording: obs.recording,
        stageRehearsalActive: stageRehearsal.active
      })
    },
    parentWindow: () => operatorWin,
    getMode: () => getSetting('auto_update_mode')
  })
  // Debounced + change-guarded so DPI/resolution/sleep-wake churn doesn't tear
  // down and rebuild the live output (a mid-service black flash).
  screen.on('display-added', scheduleLayoutOutputs)
  screen.on('display-removed', scheduleLayoutOutputs)
  screen.on('display-removed', (_e, removed) => rehomeAuxWindows(removed))
  // Linux/macOS equivalent of Windows' session-end (QA A-L3).
  powerMonitor.on('shutdown', onSessionEnd)
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
  isQuitting = true
  quitStarted = true
  markCleanExit(true)
  // Best-effort final stop so a quit mid-service still finalizes the recording +
  // writes its sidecar (fire-and-forget; the app is shutting down regardless).
  if (recordingSession.isActive()) void recordingSession.onServiceEnded()
  stopTabletServer()
  clearCountdown('main')
  clearAutoAdvance('main')
  clearCountdown('second')
  clearAutoAdvance('second')
})
