import { contextBridge, ipcRenderer } from 'electron'
import type {
  Intent,
  LiveState,
  AppInfo,
  SongSummary,
  SongFull,
  SongInput,
  ServiceSummary,
  ServiceFull,
  NewServiceItem,
  ScriptureResult,
  Theme,
  ObsStatus,
  SceneContext,
  BibleTranslation,
  SongUsage,
  ParsedPptxSong,
  ThemeColors,
  ItemStyle,
  ZoneId,
  ZoneState,
  ZoneRouting
} from '../shared/types'

const wf = {
  version: '0.0.1',
  sendIntent: (type: Intent): void => ipcRenderer.send('wf:intent', type),
  onState: (cb: (s: LiveState) => void): (() => void) => {
    const handler = (_e: unknown, s: LiveState): void => cb(s)
    ipcRenderer.on('wf:state', handler)
    return () => ipcRenderer.removeListener('wf:state', handler)
  },
  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('wf:getInfo'),
  getState: (): Promise<LiveState> => ipcRenderer.invoke('wf:getState'),

  // Song library
  songsList: (search?: string): Promise<SongSummary[]> => ipcRenderer.invoke('wf:songs:list', search),
  songGet: (id: number): Promise<SongFull | null> => ipcRenderer.invoke('wf:songs:get', id),
  songCreate: (input: SongInput): Promise<number> => ipcRenderer.invoke('wf:songs:create', input),
  songUpdate: (id: number, input: SongInput): Promise<void> => ipcRenderer.invoke('wf:songs:update', id, input),
  songDelete: (id: number): Promise<void> => ipcRenderer.invoke('wf:songs:delete', id),
  songsImportPptx: (): Promise<ParsedPptxSong[]> => ipcRenderer.invoke('wf:songs:importPptx'),

  // Service builder
  servicesList: (): Promise<ServiceSummary[]> => ipcRenderer.invoke('wf:services:list'),
  serviceCreate: (name: string, date?: string): Promise<number> =>
    ipcRenderer.invoke('wf:services:create', name, date),
  serviceDelete: (id: number): Promise<void> => ipcRenderer.invoke('wf:services:delete', id),
  serviceGet: (id: number): Promise<ServiceFull | null> => ipcRenderer.invoke('wf:services:get', id),
  serviceAddItem: (serviceId: number, item: NewServiceItem): Promise<number> =>
    ipcRenderer.invoke('wf:services:addItem', serviceId, item),
  serviceRemoveItem: (itemId: number): Promise<void> =>
    ipcRenderer.invoke('wf:services:removeItem', itemId),
  serviceMoveItem: (itemId: number, dir: 'up' | 'down'): Promise<void> =>
    ipcRenderer.invoke('wf:services:moveItem', itemId, dir),
  serviceUpdateItemNotes: (itemId: number, notes: string | null): Promise<void> =>
    ipcRenderer.invoke('wf:services:updateItemNotes', itemId, notes),
  serviceSetTheme: (serviceId: number, themeId: string | null, colors: ThemeColors | null): Promise<void> =>
    ipcRenderer.invoke('wf:service:setTheme', serviceId, themeId, colors),
  serviceSetItemStyle: (itemId: number, style: ItemStyle | null): Promise<void> =>
    ipcRenderer.invoke('wf:services:setItemStyle', itemId, style),
  serviceSetItemPayload: (itemId: number, payload: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('wf:services:setItemPayload', itemId, payload),
  serviceReorder: (serviceId: number, orderedIds: number[]): Promise<void> =>
    ipcRenderer.invoke('wf:services:reorder', serviceId, orderedIds),
  serviceSlides: (serviceId: number): Promise<{ id: number; slides: string[] }[]> =>
    ipcRenderer.invoke('wf:service:slides', serviceId),
  serviceImportImages: (): Promise<{ id: number; name: string; count: number } | null> =>
    ipcRenderer.invoke('wf:service:importImages'),
  serviceImportPptx: (): Promise<{ id: number; name: string; count: number } | null> =>
    ipcRenderer.invoke('wf:service:importPptx'),
  // Scripture
  scriptureLookup: (reference: string): Promise<ScriptureResult> =>
    ipcRenderer.invoke('wf:scripture:lookup', reference),

  // Live engine
  stageOpen: (): Promise<void> => ipcRenderer.invoke('wf:stage:open'),
  liveSetItemId: (id: number | null): Promise<void> => ipcRenderer.invoke('wf:live:setItemId', id),
  liveGoLiveAt: (itemId: number, slideIndex: number): Promise<void> =>
    ipcRenderer.invoke('wf:live:goLiveAt', itemId, slideIndex),
  liveSetFontScale: (scale: number): Promise<void> => ipcRenderer.invoke('wf:live:setFontScale', scale),
  liveSaveFontScale: (): Promise<void> => ipcRenderer.invoke('wf:live:saveFontScale'),
  liveSetStageMessage: (msg: string | null): Promise<void> => ipcRenderer.invoke('wf:live:setStageMessage', msg),
  liveLoadSong: (id: number): Promise<void> => ipcRenderer.invoke('wf:live:loadSong', id),
  liveLoadScripture: (reference: string): Promise<void> =>
    ipcRenderer.invoke('wf:live:loadScripture', reference),
  liveLoadText: (title: string, body: string, background?: string | null): Promise<void> =>
    ipcRenderer.invoke('wf:live:loadText', title, body, background ?? null),
  liveLoadCountdown: (seconds: number): Promise<void> =>
    ipcRenderer.invoke('wf:live:loadCountdown', seconds),
  liveLoadMedia: (filePath: string, title: string): Promise<void> =>
    ipcRenderer.invoke('wf:live:loadMedia', filePath, title),

  // Song background + file dialog
  songSetBackground: (id: number, path: string | null): Promise<void> =>
    ipcRenderer.invoke('wf:songs:setBackground', id, path),
  songSetFontScale: (id: number, scale: number): Promise<void> =>
    ipcRenderer.invoke('wf:songs:setFontScale', id, scale),
  dialogOpenFile: (): Promise<{ canceled: boolean; filePaths: string[] }> =>
    ipcRenderer.invoke('wf:dialog:openFile'),

  // Background library
  bgList: (): Promise<{ filename: string; path: string; kind: 'upload' | 'generated'; isVideo: boolean }[]> =>
    ipcRenderer.invoke('wf:bg:list'),
  bgUpload: (srcPath: string): Promise<string> => ipcRenderer.invoke('wf:bg:upload', srcPath),
  bgDelete: (filePath: string): Promise<void> => ipcRenderer.invoke('wf:bg:delete', filePath),
  bgGenerate: (prompt: string): Promise<string> => ipcRenderer.invoke('wf:bg:generate', prompt),
  bgOpenDialog: (): Promise<{ canceled: boolean; filePaths: string[] }> =>
    ipcRenderer.invoke('wf:bg:openDialog'),
  songSetBgMotion: (id: number, motion: string | null): Promise<void> =>
    ipcRenderer.invoke('wf:songs:setBgMotion', id, motion),
  songSetTextColor: (id: number, color: string | null): Promise<void> =>
    ipcRenderer.invoke('wf:songs:setTextColor', id, color),
  songSetFont: (id: number, font: string | null): Promise<void> =>
    ipcRenderer.invoke('wf:songs:setFont', id, font),
  settingGet: (key: string): Promise<string | null> => ipcRenderer.invoke('wf:setting:get', key),
  settingSet: (key: string, value: string | null): Promise<void> =>
    ipcRenderer.invoke('wf:setting:set', key, value),
  editorOpen: (songId: number): Promise<void> => ipcRenderer.invoke('wf:editor:open', songId),
  serviceOpen: (serviceId: number): Promise<void> => ipcRenderer.invoke('wf:service:open', serviceId),

  // Tablet remote
  getTabletUrl: (): Promise<string> =>
    ipcRenderer.invoke('wf:getTabletUrl'),
  setActiveService: (serviceId: number | null): Promise<void> =>
    ipcRenderer.invoke('wf:setActiveService', serviceId),

  // Features
  featuresStartAutoAdvance: (durationMs: number, loop?: boolean): Promise<void> =>
    ipcRenderer.invoke('wf:features:startAutoAdvance', durationMs, loop),
  featuresStopAutoAdvance: (): Promise<void> =>
    ipcRenderer.invoke('wf:features:stopAutoAdvance'),
  featuresSetTheme: (theme: Theme): Promise<void> =>
    ipcRenderer.invoke('wf:features:setTheme', theme),
  featuresSetBibleTranslation: (trans: BibleTranslation): Promise<void> =>
    ipcRenderer.invoke('wf:features:setBibleTranslation', trans),
  featuresSetVerseNumber: (v: number | null): Promise<void> =>
    ipcRenderer.invoke('wf:features:setVerseNumber', v),
  featuresGetServiceLog: (): Promise<Array<{ ts: number; event: string }>> =>
    ipcRenderer.invoke('wf:features:getServiceLog'),
  featuresClearServiceLog: (): Promise<void> =>
    ipcRenderer.invoke('wf:features:clearServiceLog'),

  // OBS integration
  getObsUrl: (): Promise<string> => ipcRenderer.invoke('wf:getObsUrl'),
  obsOnStatus: (cb: (s: ObsStatus) => void): (() => void) => {
    const handler = (_e: unknown, s: ObsStatus): void => cb(s)
    ipcRenderer.on('wf:obs:status', handler)
    return () => ipcRenderer.removeListener('wf:obs:status', handler)
  },
  obsGetStatus: (): Promise<ObsStatus> => ipcRenderer.invoke('wf:obs:getStatus'),
  obsConnect: (host: string, port: number, password: string): Promise<ObsStatus> =>
    ipcRenderer.invoke('wf:obs:connect', host, port, password),
  obsDisconnect: (): Promise<void> => ipcRenderer.invoke('wf:obs:disconnect'),
  obsStartStream: (): Promise<void> => ipcRenderer.invoke('wf:obs:startStream'),
  obsStopStream: (): Promise<void> => ipcRenderer.invoke('wf:obs:stopStream'),
  obsStartRecord: (): Promise<void> => ipcRenderer.invoke('wf:obs:startRecord'),
  obsStopRecord: (): Promise<void> => ipcRenderer.invoke('wf:obs:stopRecord'),
  obsSetScene: (sceneName: string): Promise<void> =>
    ipcRenderer.invoke('wf:obs:setScene', sceneName),
  obsSetAutoSwitch: (enabled: boolean, map: Record<SceneContext, string>): Promise<void> =>
    ipcRenderer.invoke('wf:obs:setAutoSwitch', enabled, map),

  // Logo settings
  logoGet: (): Promise<{ logoPath: string | null; logoBg: string | null }> =>
    ipcRenderer.invoke('wf:logo:get'),
  logoSet: (path: string | null, bg: string | null): Promise<void> =>
    ipcRenderer.invoke('wf:logo:set', path, bg),

  // CCLI
  ccliGetLicense: (): Promise<string | null> => ipcRenderer.invoke('wf:ccli:getLicense'),
  ccliSetLicense: (license: string | null): Promise<void> =>
    ipcRenderer.invoke('wf:ccli:setLicense', license),
  ccliListUsage: (): Promise<SongUsage[]> => ipcRenderer.invoke('wf:ccli:listUsage'),
  ccliClearUsage: (): Promise<void> => ipcRenderer.invoke('wf:ccli:clearUsage'),

  // Zone display system
  zoneGetRouting: (itemId: number): Promise<ZoneRouting | null> =>
    ipcRenderer.invoke('wf:zone:getRouting', itemId),
  zoneSetRouting: (itemId: number, routing: ZoneRouting | null): Promise<void> =>
    ipcRenderer.invoke('wf:zone:setRouting', itemId, routing),
  zoneSetOverride: (zoneId: ZoneId, mode: ZoneState['mode'] | null): Promise<void> =>
    ipcRenderer.invoke('wf:zone:setOverride', zoneId, mode),
  zoneClearOverrides: (): Promise<void> =>
    ipcRenderer.invoke('wf:zone:clearOverrides'),
  zoneGetStates: (): Promise<Record<ZoneId, ZoneState>> =>
    ipcRenderer.invoke('wf:zone:getStates'),
  zoneGetIp: (): Promise<string> =>
    ipcRenderer.invoke('wf:zone:getIp'),
  getTabletPort: (): Promise<number> =>
    ipcRenderer.invoke('wf:app:getTabletPort'),
  restoreRecovery: (): Promise<{ ok: boolean; restored?: boolean; fallback?: boolean }> =>
    ipcRenderer.invoke('wf:app:restoreRecovery'),
  multiviewOpen: (): Promise<void> =>
    ipcRenderer.invoke('wf:multiview:open'),

  // Service export/import
  serviceExport: (serviceId: number): Promise<{ canceled: boolean }> =>
    ipcRenderer.invoke('wf:services:export', serviceId),
  serviceImportFile: (): Promise<{ canceled: boolean; serviceId: number | null }> =>
    ipcRenderer.invoke('wf:services:import')
}

try {
  contextBridge.exposeInMainWorld('wf', wf)
} catch (error) {
  console.error(error)
}

export type WorshipFlowApi = typeof wf
