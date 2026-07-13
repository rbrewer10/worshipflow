// OBS Studio control via obs-websocket (OBS 28+). Wraps a single connection and
// exposes connect/stream/record/scene helpers plus a status callback the main
// process forwards to the renderer. Persists connection settings so it can
// auto-connect on startup and silently retry when the connection drops.
import OBSWebSocket from 'obs-websocket-js'
import type { ObsStatus } from '../shared/types'
import { getSetting, setSetting } from './db'

const obs = new OBSWebSocket()

let status: ObsStatus = {
  connected: false,
  streaming: false,
  recording: false,
  currentScene: null,
  scenes: [],
  error: null,
  streamStartedAt: null,
  recordStartedAt: null,
  reconnecting: false
}

let onChange: ((s: ObsStatus) => void) | null = null
let creds: { host: string; port: number; password: string } | null = null
let manualDisconnect = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0

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
  status = { ...status, connected: false, streaming: false, recording: false, streamStartedAt: null, recordStartedAt: null }
  emit()
  // Auto-reconnect unless the operator explicitly disconnected.
  if (!manualDisconnect && creds) scheduleReconnect()
})
obs.on('StreamStateChanged', (d) => {
  status = { ...status, streaming: d.outputActive, streamStartedAt: d.outputActive ? Date.now() : null }
  emit()
})
obs.on('RecordStateChanged', (d) => {
  status = { ...status, recording: d.outputActive, recordStartedAt: d.outputActive ? Date.now() : null }
  emit()
})
obs.on('CurrentProgramSceneChanged', (d) => { status = { ...status, currentScene: d.sceneName }; emit() })

async function refreshScenes(): Promise<void> {
  try {
    const list = await obs.call('GetSceneList')
    status.scenes = list.scenes.map((s) => String((s as { sceneName: string }).sceneName)).reverse()
    status.currentScene = list.currentProgramSceneName
  } catch { /* ignore */ }
}

async function refreshOutputs(): Promise<void> {
  // Back-date the start time from OBS's reported duration so a stream/record
  // already running when we connect shows the correct elapsed time.
  try {
    const stream = await obs.call('GetStreamStatus')
    status.streaming = stream.outputActive
    status.streamStartedAt = stream.outputActive ? Date.now() - (stream.outputDuration ?? 0) : null
  } catch { /* ignore */ }
  try {
    const rec = await obs.call('GetRecordStatus')
    status.recording = rec.outputActive
    status.recordStartedAt = rec.outputActive ? Date.now() - (rec.outputDuration ?? 0) : null
  } catch { /* ignore */ }
}

function scheduleReconnect(): void {
  if (reconnectTimer || manualDisconnect || !creds) return
  status = { ...status, reconnecting: true }
  emit()
  const delay = Math.min(2000 * Math.pow(1.5, Math.min(reconnectAttempts, 6)), 15000)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    reconnectAttempts++
    if (creds && !manualDisconnect) void connectObs(creds.host, creds.port, creds.password)
  }, delay)
}

export async function connectObs(host: string, port: number, password: string): Promise<ObsStatus> {
  manualDisconnect = false
  // Cancel any pending background retry so it can't fire a second, overlapping
  // reconnect after this connect succeeds (which would drop OBS mid-stream).
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  creds = { host: host || 'localhost', port: port || 4455, password: password || '' }
  setSetting('obs_host', creds.host)
  setSetting('obs_port', String(creds.port))
  setSetting('obs_password', creds.password)
  try {
    await obs.disconnect().catch(() => undefined)
    const url = `ws://${creds.host}:${creds.port}`
    await obs.connect(url, creds.password || undefined)
    reconnectAttempts = 0
    status = { ...status, connected: true, error: null, reconnecting: false }
    await refreshScenes()
    await refreshOutputs()
    emit()
  } catch (e) {
    status = { ...status, connected: false, error: (e as Error)?.message ?? 'Connection failed' }
    emit()
    // Keep trying in the background (OBS may not be up yet).
    if (!manualDisconnect && creds) scheduleReconnect()
  }
  return { ...status }
}

export async function disconnectObs(): Promise<void> {
  manualDisconnect = true
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  status = { ...status, reconnecting: false }
  await obs.disconnect().catch(() => undefined)
  status = { ...status, connected: false, streaming: false, recording: false, streamStartedAt: null, recordStartedAt: null }
  emit()
}

// Auto-connect on startup if the operator connected before (creds saved).
export async function initObsAutoConnect(): Promise<void> {
  const host = getSetting('obs_host')
  if (!host) return
  const port = Number(getSetting('obs_port')) || 4455
  const password = getSetting('obs_password') ?? ''
  await connectObs(host, port, password)
}

export async function obsStartStream(): Promise<void> { await safe(() => obs.call('StartStream')) }
export async function obsStopStream(): Promise<void> { await safe(() => obs.call('StopStream')) }
export async function obsStartRecord(): Promise<void> { await safe(() => obs.call('StartRecord')) }
export async function obsStopRecord(): Promise<string | null> {
  try {
    const res = await obs.call('StopRecord')
    return (res as { outputPath?: string }).outputPath ?? null
  } catch (err) {
    console.error('[obs] StopRecord failed', err)
    return null
  }
}

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
