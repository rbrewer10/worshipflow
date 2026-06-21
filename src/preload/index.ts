import { contextBridge, ipcRenderer } from 'electron'
import type { Intent, LiveState, AppInfo } from '../shared/types'

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
  getState: (): Promise<LiveState> => ipcRenderer.invoke('wf:getState')
}

try {
  contextBridge.exposeInMainWorld('wf', wf)
} catch (error) {
  console.error(error)
}

export type WorshipFlowApi = typeof wf
