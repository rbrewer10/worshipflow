import { contextBridge } from 'electron'

// WorshipFlow bridge — the safe API surface exposed to the renderer.
// Engine IPC (state broadcast, display info, output control) lands here in Phase 0.
const wf = {
  version: '0.0.1'
}

try {
  contextBridge.exposeInMainWorld('wf', wf)
} catch (error) {
  console.error(error)
}

export type WorshipFlowApi = typeof wf
