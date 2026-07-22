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
  ZoneRouting,
  AnnouncementSummary,
  Announcement,
  AnnouncementInput
} from '../shared/types'
import type { SceneConfig } from '../shared/zoneScenes'
import type { Channel, AutomationRule, ReferenceMix, Heuristic } from '../main/types/sound-check-types'

const wf = {
  // The real build version comes from the main process via getInfo() — don't
  // hardcode it here (it silently went stale at 0.6.3).
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

  // Announcements library
  announcementsList: (search?: string): Promise<AnnouncementSummary[]> => ipcRenderer.invoke('wf:announcements:list', search),
  announcementGet: (id: number): Promise<Announcement | null> => ipcRenderer.invoke('wf:announcements:get', id),
  announcementCreate: (input: AnnouncementInput): Promise<number> => ipcRenderer.invoke('wf:announcements:create', input),
  announcementUpdate: (id: number, input: AnnouncementInput): Promise<void> => ipcRenderer.invoke('wf:announcements:update', id, input),
  announcementDelete: (id: number): Promise<void> => ipcRenderer.invoke('wf:announcements:delete', id),
  announcementsScheduled: (serviceDate: string): Promise<AnnouncementSummary[]> => ipcRenderer.invoke('wf:announcements:scheduled', serviceDate),
  liveLoadAnnouncement: (id: number): Promise<void> => ipcRenderer.invoke('wf:live:loadAnnouncement', id),

  // Service builder
  servicesList: (): Promise<ServiceSummary[]> => ipcRenderer.invoke('wf:services:list'),
  serviceCreate: (name: string, date?: string): Promise<number> =>
    ipcRenderer.invoke('wf:services:create', name, date),
  serviceDelete: (id: number): Promise<void> => ipcRenderer.invoke('wf:services:delete', id),
  serviceGet: (id: number): Promise<ServiceFull | null> => ipcRenderer.invoke('wf:services:get', id),
  serviceRefreshActiveItems: (id: number): Promise<void> =>
    ipcRenderer.invoke('wf:services:refreshActiveItems', id),
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

  // Service templates
  templatesList: (): Promise<any[]> => ipcRenderer.invoke('wf:templates:list'),
  templatesSave: (template: any): Promise<any> => ipcRenderer.invoke('wf:templates:save', template),
  templatesDelete: (id: string): Promise<void> => ipcRenderer.invoke('wf:templates:delete', id),
  templatesFromService: (serviceId: number, name: string, description?: string): Promise<string> =>
    ipcRenderer.invoke('wf:templates:fromService', serviceId, name, description),
  serviceImportImages: (): Promise<{ id: number; name: string; count: number } | null> =>
    ipcRenderer.invoke('wf:service:importImages'),
  serviceImportPptx: (): Promise<{ id: number; name: string; count: number } | null> =>
    ipcRenderer.invoke('wf:service:importPptx'),
  // Scripture
  scriptureLookup: (reference: string): Promise<ScriptureResult> =>
    ipcRenderer.invoke('wf:scripture:lookup', reference),

  // Live engine
  stageOpen: (): Promise<void> => ipcRenderer.invoke('wf:stage:open'),
  outputOpen: (): Promise<void> => ipcRenderer.invoke('wf:output:open'),
  onNotify: (cb: (n: { message: string; level: 'info' | 'warn' | 'error' }) => void): (() => void) => {
    const handler = (_e: unknown, n: { message: string; level: 'info' | 'warn' | 'error' }): void => cb(n)
    ipcRenderer.on('wf:notify', handler)
    return () => ipcRenderer.removeListener('wf:notify', handler)
  },
  onRenderProgress: (cb: (p: { recordingId: number; fraction: number }) => void): (() => void) => {
    const handler = (_e: unknown, p: { recordingId: number; fraction: number }): void => cb(p)
    ipcRenderer.on('wf:recordings:renderProgress', handler)
    return () => ipcRenderer.removeListener('wf:recordings:renderProgress', handler)
  },
  onRenderState: (cb: (p: { recordingId: number; state: string }) => void): (() => void) => {
    const handler = (_e: unknown, p: { recordingId: number; state: string }): void => cb(p)
    ipcRenderer.on('wf:recordings:renderState', handler)
    return () => ipcRenderer.removeListener('wf:recordings:renderState', handler)
  },
  onAiProgress: (cb: (p: { recordingId: number; label: string }) => void): (() => void) => {
    const handler = (_e: unknown, p: { recordingId: number; label: string }): void => cb(p)
    ipcRenderer.on('wf:recordings:aiProgress', handler)
    return () => ipcRenderer.removeListener('wf:recordings:aiProgress', handler)
  },
  liveSetItemId: (id: number | null): Promise<void> => ipcRenderer.invoke('wf:live:setItemId', id),
  liveGoLiveAt: (itemId: number, slideIndex: number): Promise<void> =>
    ipcRenderer.invoke('wf:live:goLiveAt', itemId, slideIndex),
  liveSetFontScale: (scale: number): Promise<void> => ipcRenderer.invoke('wf:live:setFontScale', scale),
  liveSaveFontScale: (): Promise<void> => ipcRenderer.invoke('wf:live:saveFontScale'),
  liveSetStageMessage: (msg: string | null): Promise<void> => ipcRenderer.invoke('wf:live:setStageMessage', msg),
  liveLoadSong: (id: number): Promise<void> => ipcRenderer.invoke('wf:live:loadSong', id),
  liveLoadScripture: (reference: string): Promise<boolean> =>
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
  bgGetTags: (filePath: string): Promise<string[]> =>
    ipcRenderer.invoke('wf:bg:getTags', filePath),
  bgSetTags: (filePath: string, tags: string[]): Promise<void> =>
    ipcRenderer.invoke('wf:bg:setTags', filePath, tags),
  bgSearch: (tags: string[]): Promise<string[]> =>
    ipcRenderer.invoke('wf:bg:search', tags),
  bgAutoTag: (filePath: string): Promise<string[]> =>
    ipcRenderer.invoke('wf:bg:autoTag', filePath),
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
  getActiveServiceId: (): Promise<number | null> =>
    ipcRenderer.invoke('wf:getActiveServiceId'),

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

  // Diagnostics log
  logsGetRecent: (): Promise<string[]> => ipcRenderer.invoke('wf:logs:getRecent'),
  logsOpenFolder: (): Promise<void> => ipcRenderer.invoke('wf:logs:openFolder'),

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

  // Recordings (Phase 1)
  recordingsList: (): Promise<import('../shared/types').RecordingRow[]> =>
    ipcRenderer.invoke('wf:recordings:list'),
  recordingMarkers: (recordingId: number): Promise<import('../shared/types').RecordingMarker[]> =>
    ipcRenderer.invoke('wf:recordings:markers', recordingId),
  getAutoRecord: (): Promise<boolean> => ipcRenderer.invoke('wf:recordings:getAutoRecord'),
  setAutoRecord: (on: boolean): Promise<void> => ipcRenderer.invoke('wf:recordings:setAutoRecord', on),

  // Recordings — Phase 2 assembly
  produceRecording: (recordingId: number, override?: { startMs?: number; endMs?: number }): Promise<void> =>
    ipcRenderer.invoke('wf:recordings:produce', recordingId, override),
  cancelRender: (recordingId: number): Promise<void> =>
    ipcRenderer.invoke('wf:recordings:cancelRender', recordingId),
  revealOutput: (outputPath: string): Promise<void> =>
    ipcRenderer.invoke('wf:recordings:revealOutput', outputPath),
  getAssemblySettings: (): Promise<{ introPath: string | null; outroPath: string | null; outputFolder: string | null }> =>
    ipcRenderer.invoke('wf:recordings:getAssemblySettings'),
  setAssemblySetting: (key: 'introPath' | 'outroPath' | 'outputFolder', value: string | null): Promise<void> =>
    ipcRenderer.invoke('wf:recordings:setAssemblySetting', key, value),
  pickAssemblyFile: (kind: 'video' | 'folder'): Promise<string | null> =>
    ipcRenderer.invoke('wf:recordings:pickAssemblyFile', kind),

  // Recordings — Phase 3 AI content
  generateContent: (recordingId: number): Promise<void> => ipcRenderer.invoke('wf:recordings:generateContent', recordingId),
  saveAi: (recordingId: number, fields: { aiTitle?: string; aiDescription?: string }): Promise<void> =>
    ipcRenderer.invoke('wf:recordings:saveAi', recordingId, fields),
  revealPath: (p: string): Promise<void> => ipcRenderer.invoke('wf:recordings:revealPath', p),
  getAnthropicKey: (): Promise<string> => ipcRenderer.invoke('wf:recordings:getAnthropicKey'),
  setAnthropicKey: (key: string): Promise<void> => ipcRenderer.invoke('wf:recordings:setAnthropicKey', key),

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
  scenesGet: (): Promise<SceneConfig> => ipcRenderer.invoke('wf:scenes:get'),
  scenesSet: (config: SceneConfig): Promise<void> => ipcRenderer.invoke('wf:scenes:set', config),
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
    ipcRenderer.invoke('wf:services:import'),

  // Sound check
  soundCheck: {
    init: (manualIp?: string): Promise<Channel[]> => ipcRenderer.invoke('wf:sound-check:init', manualIp),
    getChannels: (): Promise<Channel[]> => ipcRenderer.invoke('wf:sound-check:getChannels'),
    setChannelClassification: (
      channelId: number,
      property: 'isMic' | 'isBackingTrack',
      value: boolean
    ): Promise<void> =>
      ipcRenderer.invoke('wf:sound-check:setChannelClassification', channelId, property, value),
    muteChannel: (channelId: number, mute: boolean): Promise<void> =>
      ipcRenderer.invoke('wf:sound-check:muteChannel', channelId, mute),
    setFader: (channelId: number, db: number): Promise<void> =>
      ipcRenderer.invoke('wf:sound-check:setFader', channelId, db),
    recallScene: (sceneName: string): Promise<void> =>
      ipcRenderer.invoke('wf:sound-check:recallScene', sceneName),
    recordReferenceMix: (durationSeconds: number, notes: string): Promise<ReferenceMix> =>
      ipcRenderer.invoke('wf:sound-check:recordReferenceMix', durationSeconds, notes),
    saveAutomationRule: (rule: AutomationRule): Promise<AutomationRule> =>
      ipcRenderer.invoke('wf:sound-check:saveAutomationRule', rule),
    getAutomationRules: (): Promise<AutomationRule[]> =>
      ipcRenderer.invoke('wf:sound-check:getAutomationRules'),
    deleteAutomationRule: (id: string): Promise<void> =>
      ipcRenderer.invoke('wf:sound-check:deleteAutomationRule', id),
    startAudioCapture: (deviceId?: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('wf:sound-check:startAudioCapture', deviceId),
    stopAudioCapture: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('wf:sound-check:stopAudioCapture'),
    isAudioCapturing: (): Promise<boolean> =>
      ipcRenderer.invoke('wf:sound-check:isAudioCapturing'),
    getLiveHeuristics: (): Promise<Heuristic[]> =>
      ipcRenderer.invoke('wf:sound-check:getLiveHeuristics')
  }
}

try {
  contextBridge.exposeInMainWorld('wf', wf)
} catch (error) {
  console.error(error)
}

export type WorshipFlowApi = typeof wf
