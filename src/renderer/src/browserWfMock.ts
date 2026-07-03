import type {
  AppInfo,
  DisplayInfo,
  Intent,
  LiveState,
  NewServiceItem,
  ObsStatus,
  ParsedPptxSong,
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
  ZoneState
} from '../../shared/types'

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
        zoneRouting: null
      }
    ]
  }
]

let activeServiceId: number | null = services[0]?.id ?? null
const stateListeners = new Set<(state: LiveState) => void>()

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
    startupMs: 0
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
  secondsLeft: 0,
  stageMessage: null,
  imagePath: null,
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
    sendIntent: (type: Intent): void => {
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
    onState: (cb: (s: LiveState) => void): (() => void) => {
      stateListeners.add(cb)
      cb(clone(liveState))
      return () => stateListeners.delete(cb)
    },
    getInfo: async (): Promise<AppInfo> => appInfo(),
    getState: async (): Promise<LiveState> => clone(liveState),

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

    servicesList: async (): Promise<ServiceSummary[]> =>
      services.map(({ id, name, service_date }) => ({ id, name, service_date })),
    serviceCreate: async (name: string, date?: string): Promise<number> => {
      const id = nextServiceId++
      services.push({ id, name, service_date: date ?? null, theme: null, themeColors: null, items: [] })
      return id
    },
    serviceDelete: noop,
    serviceGet: async (id: number): Promise<ServiceFull | null> => clone(services.find((svc) => svc.id === id) ?? null),
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
        zoneRouting: null
      }
      service?.items.push(nextItem)
      return id
    },
    serviceRemoveItem: noop,
    serviceMoveItem: noop,
    serviceUpdateItemNotes: noop,
    serviceSetTheme: async (serviceId: number, themeId: string | null, colors: ThemeColors | null): Promise<void> => {
      const service = services.find((svc) => svc.id === serviceId)
      if (service) {
        service.theme = themeId
        service.themeColors = colors
      }
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

    stageOpen: noop,
    liveSetItemId: async (id: number | null): Promise<void> => publish({ liveServiceItemId: id }),
    liveGoLiveAt: async (_itemId: number, slideIndex: number): Promise<void> => {
      const index = Math.max(0, Math.min(slideIndex, demoLines.length - 1))
      publish({ index, line: demoLines[index] ?? '', next: demoLines[index + 1] ?? '' })
    },
    liveSetFontScale: async (scale: number): Promise<void> => publish({ fontScale: scale }),
    liveSaveFontScale: noop,
    liveSetStageMessage: async (msg: string | null): Promise<void> => publish({ stageMessage: msg }),
    liveLoadSong: async (id: number): Promise<void> => {
      const song = songs.find((s) => s.id === id)
      if (song) publish({ songTitle: song.title, index: 0, line: demoLines[0], next: demoLines[1], total: demoLines.length })
    },
    liveLoadScripture: async (reference: string): Promise<void> => publish({ songTitle: reference, line: 'Browser preview scripture text.', next: '', total: 1, index: 0 }),
    liveLoadText: async (title: string, body: string): Promise<void> => publish({ songTitle: title || 'Announcement', line: body || title, next: '', total: 1, index: 0 }),
    liveLoadCountdown: async (seconds: number): Promise<void> => publish({ mode: 'countdown', songTitle: 'Countdown', line: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, next: '', total: 1, index: 0 }),
    liveLoadMedia: async (_filePath: string, title: string): Promise<void> => publish({ songTitle: title || 'Media', line: '', next: '', total: 1, index: 0 }),

    songSetBackground: noop,
    songSetFontScale: noop,
    dialogOpenFile: async (): Promise<{ canceled: boolean; filePaths: string[] }> => ({ canceled: true, filePaths: [] }),
    bgList: async (): Promise<{ filename: string; path: string; kind: 'upload' | 'generated'; isVideo: boolean }[]> => [],
    bgUpload: async (srcPath: string): Promise<string> => srcPath,
    bgDelete: noop,
    bgGenerate: async (): Promise<string> => '',
    bgOpenDialog: async (): Promise<{ canceled: boolean; filePaths: string[] }> => ({ canceled: true, filePaths: [] }),
    songSetBgMotion: noop,
    songSetTextColor: noop,
    songSetFont: noop,
    settingGet: async (): Promise<string | null> => null,
    settingSet: noop,
    editorOpen: noop,
    serviceOpen: noop,

    getTabletUrl: async (): Promise<string> => 'Browser preview only',
    setActiveService: async (serviceId: number | null): Promise<void> => { activeServiceId = serviceId },
    featuresStartAutoAdvance: noop,
    featuresStopAutoAdvance: noop,
    featuresSetTheme: async (theme: Theme): Promise<void> => publish({ theme }),
    featuresSetBibleTranslation: async (_trans: BibleTranslation): Promise<void> => {},
    featuresSetVerseNumber: async (v: number | null): Promise<void> => publish({ verseNumber: v }),
    featuresGetServiceLog: async (): Promise<Array<{ ts: number; event: string }>> => [],
    featuresClearServiceLog: noop,

    getObsUrl: async (): Promise<string> => 'Browser preview only',
    obsOnStatus: (cb: (s: ObsStatus) => void): (() => void) => {
      cb({ connected: false, streaming: false, recording: false, currentScene: null, scenes: [], error: null })
      return () => {}
    },
    obsGetStatus: async (): Promise<ObsStatus> => ({ connected: false, streaming: false, recording: false, currentScene: null, scenes: [], error: null }),
    obsConnect: async (): Promise<ObsStatus> => ({ connected: false, streaming: false, recording: false, currentScene: null, scenes: [], error: 'OBS is available in Electron only.' }),
    obsDisconnect: noop,
    obsStartStream: noop,
    obsStopStream: noop,
    obsStartRecord: noop,
    obsStopRecord: noop,
    obsSetScene: noop,
    obsSetAutoSwitch: async (_enabled: boolean, _map: Record<SceneContext, string>): Promise<void> => {},

    logoGet: async (): Promise<{ logoPath: string | null; logoBg: string | null }> => ({ logoPath: null, logoBg: null }),
    logoSet: noop,
    ccliGetLicense: async (): Promise<string | null> => null,
    ccliSetLicense: noop,
    ccliListUsage: async (): Promise<SongUsage[]> => [],
    ccliClearUsage: noop,

    zoneGetRouting: async (): Promise<ZoneRouting | null> => null,
    zoneSetRouting: noop,
    zoneSetOverride: noop,
    zoneClearOverrides: noop,
    zoneGetStates: async (): Promise<Record<ZoneId, ZoneState>> => ({
      1: clone(emptyZone),
      2: clone(emptyZone),
      3: clone(emptyZone),
      4: clone(emptyZone)
    }),
    zoneGetIp: async (): Promise<string> => '127.0.0.1',
    getTabletPort: async (): Promise<number> => 3691,
    restoreRecovery: async (): Promise<{ ok: boolean; restored?: boolean; fallback?: boolean }> => ({ ok: true, restored: false }),
    multiviewOpen: noop,
    serviceExport: async (): Promise<{ canceled: boolean }> => ({ canceled: true }),
    serviceImportFile: async (): Promise<{ canceled: boolean; serviceId: number | null }> => ({ canceled: true, serviceId: null })
  }

  target.wf = new Proxy(api, {
    get(object, key) {
      if (key in object) return object[key as keyof typeof object]
      return noop
    }
  }) as Window['wf']
}
