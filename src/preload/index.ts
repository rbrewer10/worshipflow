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
  ScriptureResult
} from '../shared/types'

// The safe API surface exposed to the renderer (window.wf).
// The main process is the single source of truth; renderers send intents and
// subscribe to broadcast state — they never hold authority.
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
  songDelete: (id: number): Promise<void> => ipcRenderer.invoke('wf:songs:delete', id),

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

  // Scripture
  scriptureLookup: (reference: string): Promise<ScriptureResult> =>
    ipcRenderer.invoke('wf:scripture:lookup', reference),

  // Live engine
  liveLoadSong: (id: number): Promise<void> => ipcRenderer.invoke('wf:live:loadSong', id),

  // Song background + file dialog
  songSetBackground: (id: number, path: string | null): Promise<void> =>
    ipcRenderer.invoke('wf:songs:setBackground', id, path),
  dialogOpenFile: (): Promise<{ canceled: boolean; filePaths: string[] }> =>
    ipcRenderer.invoke('wf:dialog:openFile')
}

try {
  contextBridge.exposeInMainWorld('wf', wf)
} catch (error) {
  console.error(error)
}

export type WorshipFlowApi = typeof wf
