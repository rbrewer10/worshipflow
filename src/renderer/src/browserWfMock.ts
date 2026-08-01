import type {
  AppInfo,
  DisplayInfo,
  Intent,
  LiveState,
  NewServiceItem,
  ObsStatus,
  ParsedPptxSong,
  RecordingMarker,
  RecordingRow,
  ScriptureResult,
  ServiceFull,
  ServiceItem,
  ServiceSummary,
  SongFull,
  SongInput,
  SongSummary,
  SongUsage,
  Theme,
  BibleTranslation,
  SceneContext,
  ThemeColors,
  ItemStyle,
  ZoneId,
  ZoneRouting,
  ZoneState,
  TrackId,
  LivecallConfig
} from '../../shared/types'
import { parseReferenceList } from '../../shared/scriptureRefs'
import { starterConfig } from '../../shared/zoneScenes'
import type { Channel, AutomationRule, ReferenceMix, Heuristic } from '../../main/types/sound-check-types'
import type { ZoneSlide } from '../../shared/zoneSlides'
import type { ZonePin, ZonePins } from '../../shared/zonePins'

const mockPins: ZonePins = {}

const demoLines = [
  'Amazing grace, how sweet the sound',
  'That saved a wretch like me',
  'I once was lost, but now am found',
  'Was blind, but now I see'
]

let liveState: LiveState = {
  mode: 'lyrics',
  index: 0,
  line: demoLines[0],
  next: demoLines[1],
  total: demoLines.length,
  songTitle: 'Amazing Grace',
  background: null,
  bgFit: 'cover',
  bgMotion: null,
  liveServiceItemId: null,
  fontScale: 6,
  stageMessage: null,
  ts: Date.now(),
  hmsLoadedAt: null,
  autoAdvanceMs: null,
  theme: 'modern-church',
  verseNumber: null,
  songAuthor: null,
  songCopyright: null,
  songCcli: null,
  ccliLicense: null,
  slideTheme: 'soft-aurora',
  slideThemeColors: null,
  songTextColor: null,
  songFont: null
}

const displays: DisplayInfo[] = [
  {
    id: 1,
    bounds: { x: 0, y: 0, width: 1280, height: 720 },
    primary: true,
    internal: true
  }
]

let nextSongId = 2
let nextServiceId = 2
let nextItemId = 2

const songs: SongFull[] = [
  {
    id: 1,
    title: 'Amazing Grace',
    author: 'John Newton',
    background: null,
    ccli: null,
    copyright: null,
    publisher: null,
    sections: [{ id: 1, kind: 'verse', label: 'Verse 1', ordinal: 1, lyrics: demoLines.join('\n') }],
    arrangement: null,
    fontScale: 6,
    linesPerSlide: 2,
    bgMotion: null,
    textColor: null,
    font: null
  }
]

const services: ServiceFull[] = [
  {
    id: 1,
    name: 'Browser Preview Service',
    service_date: null,
    theme: null,
    themeColors: null,
    items: [
      {
        id: 1,
        ordinal: 1,
        type: 'song',
        ref_id: 1,
        payload: {},
        title: 'Amazing Grace',
        notes: null,
        style: null,
        zoneRouting: null,
        track: 'main'
      }
    ]
  }
]

let activeServiceId: number | null = services[0]?.id ?? null
const stateListeners = new Set<(state: LiveState) => void>()

const automationRules: AutomationRule[] = []

// In-memory stand-in for the DB's flat setting table so settingGet/settingSet
// round-trip in browser-preview mode (matches automationRules/soundCheckChannels
// module-level state). Passing null to settingSet deletes, mirroring setSetting.
const settings = new Map<string, string>()

const soundCheckChannels: Channel[] = [
  { id: 1, name: 'Pastor Mic', yamahaChannel: 1, isMic: true, isBackingTrack: false, currentFaderDb: -18, isMuted: false },
  { id: 2, name: 'Worship Leader Vox', yamahaChannel: 2, isMic: true, isBackingTrack: false, currentFaderDb: -14, isMuted: false },
  { id: 3, name: 'Tracks L', yamahaChannel: 3, isMic: false, isBackingTrack: true, currentFaderDb: -12, isMuted: false },
  { id: 4, name: 'Keys', yamahaChannel: 4, isMic: false, isBackingTrack: false, currentFaderDb: -19, isMuted: false }
]

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function publish(next: Partial<LiveState>): void {
  liveState = { ...liveState, ...next, ts: Date.now() }
  for (const listener of stateListeners) listener(clone(liveState))
}

function appInfo(): AppInfo {
  return {
    song: { title: liveState.songTitle, lines: demoLines, background: liveState.background },
    state: clone(liveState),
    displays,
    outputs: 0,
    startupMs: 0,
    appVersion: '0.0.0-browser',
    isPackaged: false
  }
}

function itemTitle(item: NewServiceItem): string {
  if (item.type === 'song') {
    const song = songs.find((s) => s.id === item.ref_id)
    return song?.title ?? 'Song'
  }
  if (item.type === 'scripture') return String(item.payload?.reference ?? 'Scripture')
  if (item.type === 'text') return String(item.payload?.title ?? 'Text slide')
  if (item.type === 'countdown') return 'Countdown'
  if (item.type === 'welcome') return 'Welcome'
  if (item.type === 'ticker') return 'Ticker'
  return 'Image'
}

const emptyZone: ZoneState = {
  mode: 'off',
  line: '',
  next: '',
  title: '',
  index: 0,
  total: 0,
  background: null,
  themeColors: null,
  fontScale: 6,
  fixedFontScale: false,
  secondsLeft: 0,
  stageMessage: null,
  imagePath: null,
  speaker: null,
  passage: null,
  bgColor: null,
  bgOverlay: null,
  textAlign: null,
  textPosition: null
}

export function installBrowserWfMock(target: Window | { wf?: Window['wf'] }): void {
  if (target.wf) return

  const noop = async (): Promise<void> => {}
  const api = {
    version: 'browser-preview',
    sendIntent: (_track: TrackId, type: Intent): void => {
      if (type === 'next') {
        const index = Math.min(liveState.index + 1, liveState.total - 1)
        publish({ index, line: demoLines[index] ?? '', next: demoLines[index + 1] ?? '' })
      } else if (type === 'prev') {
        const index = Math.max(liveState.index - 1, 0)
        publish({ index, line: demoLines[index] ?? '', next: demoLines[index + 1] ?? '' })
      } else {
        publish({ mode: type })
      }
    },
    onState: (cb: (s: { main: LiveState; second: LiveState | null }) => void): (() => void) => {
      const wrapped = (main: LiveState): void => cb({ main, second: null })
      stateListeners.add(wrapped)
      wrapped(clone(liveState))
      return () => stateListeners.delete(wrapped)
    },
    getInfo: async (): Promise<AppInfo> => appInfo(),
    getState: async (_track?: TrackId): Promise<LiveState> => clone(liveState),

    songsList: async (search?: string): Promise<SongSummary[]> =>
      songs
        .filter((song) => !search || song.title.toLowerCase().includes(search.toLowerCase()))
        .map(({ id, title, author, background }) => ({ id, title, author, background })),
    songGet: async (id: number): Promise<SongFull | null> => clone(songs.find((song) => song.id === id) ?? null),
    songCreate: async (input: SongInput): Promise<number> => {
      const id = nextSongId++
      songs.push({
        id,
        title: input.title,
        author: input.author ?? null,
        background: input.background ?? null,
        ccli: input.ccli ?? null,
        copyright: input.copyright ?? null,
        publisher: input.publisher ?? null,
        sections: input.sections,
        arrangement: input.arrangement ?? null,
        fontScale: input.fontScale ?? null,
        linesPerSlide: input.linesPerSlide ?? null,
        bgMotion: input.bgMotion ?? null,
        textColor: input.textColor ?? null,
        font: input.font ?? null
      })
      return id
    },
    songUpdate: noop,
    songDelete: noop,
    songsImportPptx: async (): Promise<ParsedPptxSong[]> => [],
    songsExportList: async (): Promise<{ canceled: boolean; count: number }> => ({ canceled: true, count: 0 }),

    announcementsList: async () => [],
    announcementGet: async () => null,
    announcementCreate: async () => 1,
    announcementUpdate: noop,
    announcementDelete: noop,
    announcementsScheduled: async () => [],
    liveLoadAnnouncement: noop,

    servicesList: async (): Promise<ServiceSummary[]> =>
      services.map(({ id, name, service_date }) => ({ id, name, service_date })),
    serviceCreate: async (name: string, date?: string): Promise<number> => {
      const id = nextServiceId++
      services.push({ id, name, service_date: date ?? null, theme: null, themeColors: null, items: [] })
      return id
    },
    serviceDelete: noop,
    serviceGet: async (id: number): Promise<ServiceFull | null> => clone(services.find((svc) => svc.id === id) ?? null),
    serviceRefreshActiveItems: noop,
    serviceAddItem: async (serviceId: number, item: NewServiceItem): Promise<number> => {
      const service = services.find((svc) => svc.id === serviceId)
      const id = nextItemId++
      const nextItem: ServiceItem = {
        id,
        ordinal: service ? service.items.length + 1 : 1,
        type: item.type,
        ref_id: item.ref_id ?? null,
        payload: item.payload ?? {},
        title: itemTitle(item),
        notes: null,
        style: null,
        zoneRouting: null,
        track: item.track ?? 'main'
      }
      service?.items.push(nextItem)
      return id
    },
    serviceRemoveItem: noop,
    serviceDuplicateItem: async (): Promise<number | null> => null,
    serviceMoveItem: noop,
    serviceUpdateItemNotes: noop,
    serviceSetTheme: async (serviceId: number, themeId: string | null, colors: ThemeColors | null): Promise<void> => {
      const service = services.find((svc) => svc.id === serviceId)
      if (service) {
        service.theme = themeId
        service.themeColors = colors
      }
    },
    serviceSetDate: async (serviceId: number, serviceDate: string | null): Promise<void> => {
      const service = services.find((svc) => svc.id === serviceId)
      if (service) service.service_date = serviceDate
    },
    serviceSetItemStyle: async (_itemId: number, _style: ItemStyle | null): Promise<void> => {},
    serviceSetItemPayload: noop,
    serviceReorder: noop,
    serviceSlides: async (): Promise<{ id: number; slides: string[] }[]> => [{ id: 1, slides: demoLines }],
    serviceImportImages: async (): Promise<{ id: number; name: string; count: number } | null> => null,
    serviceImportPptx: async (): Promise<{ id: number; name: string; count: number } | null> => null,

    scriptureLookup: async (reference: string): Promise<ScriptureResult> => ({
      ok: true,
      reference,
      verses: [{ n: 1, text: 'Browser preview scripture text. Open the Electron app for the full offline KJV lookup.' }]
    }),
    scriptureValidate: async (field: string) =>
      parseReferenceList(field).map((reference) => ({ reference, ok: true, resolved: reference, verseCount: 1 })),
    scriptureChunkRefs: async (reference: string): Promise<string[]> => (reference.trim() ? [reference.trim()] : []),

    stageOpen: noop,
    outputOpen: noop,
    onNotify: () => () => {},
    onRenderProgress: () => () => {},
    onRenderState: () => () => {},
    onAiProgress: () => () => {},
    liveSetItemId: async (_track: TrackId, id: number | null): Promise<void> => publish({ liveServiceItemId: id }),
    liveGoLiveAt: async (_track: TrackId, _itemId: number, slideIndex: number): Promise<void> => {
      const index = Math.max(0, Math.min(slideIndex, demoLines.length - 1))
      publish({ index, line: demoLines[index] ?? '', next: demoLines[index + 1] ?? '' })
    },
    liveSetFontScale: async (_track: TrackId, scale: number): Promise<void> => publish({ fontScale: scale }),
    liveSaveFontScale: noop,
    liveSetStageMessage: async (_track: TrackId, msg: string | null): Promise<void> => publish({ stageMessage: msg }),
    liveLoadSong: async (_track: TrackId, id: number): Promise<void> => {
      const song = songs.find((s) => s.id === id)
      if (song) publish({ songTitle: song.title, index: 0, line: demoLines[0], next: demoLines[1], total: demoLines.length })
    },
    liveLoadScripture: async (_track: TrackId, reference: string): Promise<boolean> => { publish({ songTitle: reference, line: 'Browser preview scripture text.', next: '', total: 1, index: 0 }); return true },
    liveLoadText: async (_track: TrackId, title: string, body: string): Promise<void> => publish({ songTitle: title || 'Announcement', line: body || title, next: '', total: 1, index: 0 }),
    liveLoadSermon: async (_track: TrackId, title: string, speaker: string, passage: string): Promise<void> => publish({ songTitle: title || 'Sermon', line: [speaker, passage].filter(Boolean).join('\n'), next: '', total: 1, index: 0 }),
    liveLoadLiveCall: async (_track: TrackId, title: string): Promise<void> => publish({ mode: 'livecall', songTitle: title || 'Live Call', line: '', next: '', total: 1, index: 0 }),
    liveLoadCountdown: async (_track: TrackId, seconds: number): Promise<void> => publish({ mode: 'countdown', songTitle: 'Countdown', line: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, next: '', total: 1, index: 0 }),
    liveLoadMedia: async (_track: TrackId, _filePath: string, title: string): Promise<void> => publish({ songTitle: title || 'Media', line: '', next: '', total: 1, index: 0 }),

    songSetBackground: noop,
    liveSetBackground: noop,
    songSetFontScale: noop,
    dialogOpenFile: async (): Promise<{ canceled: boolean; filePaths: string[] }> => ({ canceled: true, filePaths: [] }),
    bgList: async (): Promise<{ filename: string; path: string; kind: 'upload' | 'generated'; isVideo: boolean }[]> => [],
    bgUpload: async (srcPath: string): Promise<string> => srcPath,
    bgDelete: noop,
    bgGenerate: async (): Promise<string> => '',
    bgOpenDialog: async (): Promise<{ canceled: boolean; filePaths: string[] }> => ({ canceled: true, filePaths: [] }),
    bgOpenFolder: noop,
    bgGetTags: async (): Promise<string[]> => [],
    bgSetTags: async (): Promise<void> => {},
    bgSearch: async (): Promise<string[]> => [],
    bgAutoTag: async (): Promise<string[]> => ['other'],
    songSetBgMotion: noop,
    songSetTextColor: noop,
    songSetFont: noop,
    songSetBlurBehindText: noop,
    settingGet: async (key: string): Promise<string | null> => settings.get(key) ?? null,
    settingSet: async (key: string, value: string | null): Promise<void> => {
      if (value === null) settings.delete(key)
      else settings.set(key, value)
    },
    editorOpen: noop,
    serviceOpen: noop,

    getRehearsalMode: async (): Promise<boolean> => false,
    setRehearsalMode: async (): Promise<void> => {},
    getTabletUrl: async (): Promise<string> => 'Browser preview only',
    getTabletPin: async (): Promise<string> => '000000',
    regenerateTabletPin: async (): Promise<string> => '000000',
    setActiveService: async (serviceId: number | null): Promise<void> => { activeServiceId = serviceId },
    getActiveServiceId: async (): Promise<number | null> => activeServiceId,
    featuresStartAutoAdvance: noop,
    featuresStopAutoAdvance: noop,
    featuresSetTheme: async (theme: Theme): Promise<void> => publish({ theme }),
    featuresSetBibleTranslation: async (_trans: BibleTranslation): Promise<void> => {},
    featuresSetVerseNumber: async (v: number | null): Promise<void> => publish({ verseNumber: v }),
    featuresGetServiceLog: async (): Promise<Array<{ ts: number; event: string }>> => [],
    featuresClearServiceLog: noop,

    logsGetRecent: async (): Promise<string[]> => [],
    logsOpenFolder: noop,
    backupsList: async (): Promise<{ filename: string; timestamp: number }[]> => [],
    backupsRestore: noop,

    getObsUrl: async (): Promise<string> => 'Browser preview only',
    obsOnStatus: (cb: (s: ObsStatus) => void): (() => void) => {
      cb({ connected: false, streaming: false, recording: false, currentScene: null, scenes: [], error: null, streamStartedAt: null, recordStartedAt: null, reconnecting: false })
      return () => {}
    },
    obsGetStatus: async (): Promise<ObsStatus> => ({ connected: false, streaming: false, recording: false, currentScene: null, scenes: [], error: null, streamStartedAt: null, recordStartedAt: null, reconnecting: false }),
    obsConnect: async (): Promise<ObsStatus> => ({ connected: false, streaming: false, recording: false, currentScene: null, scenes: [], error: 'OBS is available in Electron only.', streamStartedAt: null, recordStartedAt: null, reconnecting: false }),
    obsDisconnect: noop,
    obsStartStream: noop,
    obsStopStream: noop,
    obsStartRecord: noop,
    obsStopRecord: noop,
    obsSetScene: noop,
    obsSetAutoSwitch: async (_enabled: boolean, _map: Record<SceneContext, string>): Promise<void> => {},

    recordingsList: async (): Promise<RecordingRow[]> => [],
    recordingMarkers: async (_recordingId: number): Promise<RecordingMarker[]> => [],
    getAutoRecord: async (): Promise<boolean> => true,
    setAutoRecord: noop,

    produceRecording: async () => {},
    cancelRender: async () => {},
    revealOutput: async () => {},
    getAssemblySettings: async () => ({ introPath: null, outroPath: null, outputFolder: null }),
    setAssemblySetting: async () => {},
    pickAssemblyFile: async () => null,

    generateContent: async () => {},
    saveAi: async () => {},
    revealPath: async () => {},
    getAnthropicKey: async () => '',
    setAnthropicKey: async () => {},

    logoGet: async (): Promise<{ logoPath: string | null; logoBg: string | null }> => ({ logoPath: null, logoBg: null }),
    logoSet: noop,
    zonesGetScales: async (): Promise<Record<ZoneId, number>> => ({ 1: 100, 2: 100, 3: 100, 4: 100 }),
    zonesSetScale: noop,
    ccliGetLicense: async (): Promise<string | null> => null,
    ccliSetLicense: noop,
    ccliListUsage: async (): Promise<SongUsage[]> => [],
    ccliClearUsage: noop,

    zoneGetRouting: async (): Promise<ZoneRouting | null> => null,
    zoneSetRouting: noop,
    zoneGetSlides: async (): Promise<ZoneSlide[] | null> => null,
    zoneGenerateSlides: async (): Promise<ZoneSlide[] | null> => null,
    zoneSetSlides: noop,
    // Pins live in the main process for real; in the browser mock they live in
    // this object, so the Live tab's cards actually latch when clicked instead
    // of silently snapping back on the next zoneGetPins().
    zoneSetPin: async (zoneId: ZoneId, pin: ZonePin | null): Promise<void> => {
      if (pin == null) delete mockPins[zoneId]
      else mockPins[zoneId] = pin
    },
    zoneClearPins: async (): Promise<void> => {
      for (const key of Object.keys(mockPins)) delete mockPins[Number(key) as ZoneId]
    },
    zoneGetPins: async (): Promise<ZonePins> => ({ ...mockPins }),
    zoneGetStates: async (): Promise<Record<ZoneId, ZoneState>> => ({
      1: clone(emptyZone),
      2: clone(emptyZone),
      3: clone(emptyZone),
      4: clone(emptyZone)
    }),
    zoneGetIp: async (): Promise<string> => '127.0.0.1',
    zoneTrackAssignmentGet: async (): Promise<import('../../shared/zoneTrack').ZoneTrackAssignment> =>
      ({ 1: 'main', 2: 'second', 3: 'main', 4: 'main' }),
    zoneTrackAssignmentSet: noop,
    scenesGet: async () => starterConfig(),
    scenesSet: noop,
    getTabletPort: async (): Promise<number> => 3691,
    livecallConfig: async (): Promise<LivecallConfig> => ({
      url: 'ws://127.0.0.1:3691/livecall',
      phoneUrl: 'http://127.0.0.1:3691/phone',
      phoneUrlIsSecure: false,
      tabletPort: 3691,
      token: '',
      room: 'sanctuary',
    }),
    roomFeedConfig: async (): Promise<LivecallConfig> => ({
      url: 'ws://127.0.0.1:3691/livecall',
      phoneUrl: 'http://127.0.0.1:3691/room-feed',
      phoneUrlIsSecure: false,
      tabletPort: 3691,
      token: '',
      room: 'room-feed',
    }),
    restoreRecovery: async (): Promise<{ ok: boolean; restored?: boolean; fallback?: boolean }> => ({ ok: true, restored: false }),
    multiviewOpen: noop,
    serviceExport: async (): Promise<{ canceled: boolean }> => ({ canceled: true }),
    serviceImportFile: async (): Promise<{ canceled: boolean; serviceId: number | null }> => ({ canceled: true, serviceId: null }),
    serviceImportPlan: async (): Promise<{ canceled: boolean; serviceId: number | null; matched: number; missing: string[] }> => ({ canceled: true, serviceId: null, matched: 0, missing: [] }),

    templatesList: async (): Promise<any[]> => [],
    templatesSave: async (template: any): Promise<any> => template,
    templatesDelete: noop,
    templatesFromService: async (): Promise<string> => 'template-id',

    soundCheck: {
      init: async (): Promise<Channel[]> => clone(soundCheckChannels),
      getChannels: async (): Promise<Channel[]> => clone(soundCheckChannels),
      setChannelClassification: async (
        channelId: number,
        property: 'isMic' | 'isBackingTrack',
        value: boolean
      ): Promise<void> => {
        const channel = soundCheckChannels.find((c) => c.id === channelId)
        if (channel) channel[property] = value
      },
      muteChannel: async (channelId: number, mute: boolean): Promise<void> => {
        const channel = soundCheckChannels.find((c) => c.id === channelId)
        if (channel) channel.isMuted = mute
      },
      setFader: async (channelId: number, db: number): Promise<void> => {
        const channel = soundCheckChannels.find((c) => c.id === channelId)
        if (channel) channel.currentFaderDb = db
      },
      recallScene: noop,
      recordReferenceMix: async (durationSeconds: number, notes: string): Promise<ReferenceMix> => ({
        id: 'browser-preview',
        spectralProfile: { low: 0, mid: 0, high: 0, presence: 0, dynamicRange: 0 },
        recordedAt: new Date(),
        durationSeconds,
        notes
      }),
      saveAutomationRule: async (rule: AutomationRule): Promise<AutomationRule> => {
        // Upsert by id (mirrors SoundCheckState.saveAutomationRule) so edits
        // round-trip in browser-preview instead of appending duplicates.
        const i = automationRules.findIndex((r) => r.id === rule.id)
        if (i >= 0) automationRules[i] = rule
        else automationRules.push(rule)
        return rule
      },
      getAutomationRules: async (): Promise<AutomationRule[]> => clone(automationRules),
      deleteAutomationRule: async (id: string): Promise<void> => {
        const i = automationRules.findIndex((r) => r.id === id)
        if (i >= 0) automationRules.splice(i, 1)
      },
      startAudioCapture: async (): Promise<{ success: boolean }> => ({ success: true }),
      stopAudioCapture: async (): Promise<{ success: boolean }> => ({ success: true }),
      isAudioCapturing: async (): Promise<boolean> => false,
      getLiveHeuristics: async (): Promise<Heuristic[]> => []
    }
  }

  target.wf = new Proxy(api, {
    get(object, key) {
      if (key in object) return object[key as keyof typeof object]
      return noop
    }
  }) as Window['wf']
}
