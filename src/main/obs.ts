// OBS Studio control via obs-websocket (OBS 28+). Wraps a single connection and
// exposes connect/stream/record/scene helpers plus a status callback the main
// process forwards to the renderer.
import OBSWebSocket from 'obs-websocket-js'
import type { ObsStatus } from '../shared/types'

const obs = new OBSWebSocket()

let status: ObsStatus = {
  connected: false,
  streaming: false,
  recording: false,
  currentScene: null,
  scenes: [],
  error: null
}

let onChange: ((s: ObsStatus) => void) | null = null

export function onObsStatus(cb: (s: ObsStatus) => void): void {
  onChange = cb
}

function emit(): void {
  if (onChange) onChange({ ...status })
}

export function getObsStatus(): ObsStatus {
  return { ...status }
}

// Wire OBS events once.
obs.on('ConnectionClosed', () => {
  status = { ...status, connected: false, streaming: false, recording: false }
  emit()
})
obs.on('StreamStateChanged', (d) => { status = { ...status, streaming: d.outputActive }; emit() })
obs.on('RecordStateChanged', (d) => { status = { ...status, recording: d.outputActive }; emit() })
obs.on('CurrentProgramSceneChanged', (d) => { status = { ...status, currentScene: d.sceneName }; emit() })

async function refreshScenes(): Promise<void> {
  try {
    const list = await obs.call('GetSceneList')
    status.scenes = list.scenes.map((s) => String((s as { sceneName: string }).sceneName)).reverse()
    status.currentScene = list.currentProgramSceneName
  } catch { /* ignore */ }
}

async function refreshOutputs(): Promise<void> {
  try {
    const stream = await obs.call('GetStreamStatus')
    status.streaming = stream.outputActive
  } catch { /* ignore */ }
  try {
    const rec = await obs.call('GetRecordStatus')
    status.recording = rec.outputActive
  } catch { /* ignore */ }
}

export async function connectObs(host: string, port: number, password: string): Promise<ObsStatus> {
  try {
    await obs.disconnect().catch(() => undefined)
    const url = `ws://${host || 'localhost'}:${port || 4455}`
    await obs.connect(url, password || undefined)
    status = { ...status, connected: true, error: null }
    await refreshScenes()
    await refreshOutputs()
    emit()
  } catch (e) {
    status = { ...status, connected: false, error: (e as Error)?.message ?? 'Connection failed' }
    emit()
  }
  return { ...status }
}

export async function disconnectObs(): Promise<void> {
  await obs.disconnect().catch(() => undefined)
  status = { ...status, connected: false, streaming: false, recording: false }
  emit()
}

export async function obsStartStream(): Promise<void> { await safe(() => obs.call('StartStream')) }
export async function obsStopStream(): Promise<void> { await safe(() => obs.call('StopStream')) }
export async function obsStartRecord(): Promise<void> { await safe(() => obs.call('StartRecord')) }
export async function obsStopRecord(): Promise<void> { await safe(() => obs.call('StopRecord')) }

export async function obsSetScene(sceneName: string): Promise<void> {
  if (!status.connected || !sceneName) return
  await safe(() => obs.call('SetCurrentProgramScene', { sceneName }))
}

async function safe(fn: () => Promise<unknown>): Promise<void> {
  if (!status.connected) return
  try { await fn() } catch (e) {
    status = { ...status, error: (e as Error)?.message ?? 'OBS command failed' }
    emit()
  }
}
