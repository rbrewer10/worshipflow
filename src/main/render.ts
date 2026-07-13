import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { RecordingRow, RecordingMarker, RecordingSidecar } from '../shared/types'
import { buildFfmpegArgs, computeTrim, parseFfmpegProgress } from './ffmpegAssembly'

export interface RenderDeps {
  ffmpegPath: string
  getRecording: (id: number) => RecordingRow | null
  listMarkers: (id: number) => RecordingMarker[]
  setRenderState: (id: number, state: RecordingRow['renderState'], outputPath?: string | null) => void
  getSetting: (key: string) => string | null
  onProgress: (id: number, fraction: number) => void
  toast: (message: string, level?: 'info' | 'warn' | 'error') => void
}

export interface Renderer {
  produce: (recordingId: number, override?: { startMs?: number; endMs?: number }) => Promise<void>
  cancel: (recordingId: number) => void
  isRendering: () => boolean
}

// Load the sidecar written by Phase 1 next to the video; if it's missing, rebuild
// an equivalent from the DB markers + the recording row.
function loadSidecar(rec: RecordingRow, markers: RecordingMarker[]): RecordingSidecar | null {
  if (!rec.filePath) return null
  const sidecarPath = rec.filePath.replace(/\.[^.\\/]+$/, '') + '.worshipflow.json'
  if (existsSync(sidecarPath)) {
    try { return JSON.parse(readFileSync(sidecarPath, 'utf-8')) as RecordingSidecar } catch { /* fall through */ }
  }
  const durationMs = rec.endedAt != null ? rec.endedAt - rec.startedAt : 0
  return {
    worshipflowVersion: 'rebuilt',
    service: { id: rec.serviceId, name: '', date: null },
    recording: { startedAt: rec.obsRecordStartedMs, durationMs, file: basename(rec.filePath) },
    markers: markers.map((m) => ({ kind: m.kind, label: m.label, offsetMs: m.offsetMs }))
  }
}

export function createRenderer(deps: RenderDeps): Renderer {
  let child: ChildProcessWithoutNullStreams | null = null
  let activeId: number | null = null
  let canceledId: number | null = null

  function outputPathFor(servicePath: string): string {
    const folder = deps.getSetting('assemblyOutputFolder') || dirname(servicePath)
    const stem = basename(servicePath, extname(servicePath))
    return join(folder, `${stem}-final.mp4`)
  }

  return {
    isRendering: () => child != null,

    cancel(recordingId: number) {
      if (activeId === recordingId && child) {
        canceledId = recordingId
        child.kill()
      }
    },

    async produce(recordingId, override) {
      if (child) { deps.toast('A video is already being produced — wait for it to finish.', 'warn'); return }
      const rec = deps.getRecording(recordingId)
      if (!rec || !rec.filePath || !existsSync(rec.filePath)) {
        deps.toast('Recording file not found — cannot produce.', 'error'); return
      }
      const sidecar = loadSidecar(rec, deps.listMarkers(recordingId))
      if (!sidecar) { deps.toast('Recording metadata missing — cannot produce.', 'error'); return }

      const { startMs, endMs } = computeTrim(sidecar, override)
      const outputPath = outputPathFor(rec.filePath)
      const args = buildFfmpegArgs({
        servicePath: rec.filePath,
        introPath: deps.getSetting('assemblyIntroPath'),
        outroPath: deps.getSetting('assemblyOutroPath'),
        startMs, endMs, outputPath
      })
      const totalSec = (endMs - startMs) / 1000

      deps.setRenderState(recordingId, 'rendering')
      activeId = recordingId
      canceledId = null

      await new Promise<void>((resolve) => {
        // A failed spawn emits both 'error' and 'close' (code null); this flag keeps
        // the close handler from re-reporting a bogus "exit null" failure.
        let errored = false
        child = spawn(deps.ffmpegPath, args)
        child.stderr.on('data', (buf: Buffer) => {
          const frac = parseFfmpegProgress(buf.toString(), totalSec)
          if (frac != null) deps.onProgress(recordingId, frac)
        })
        child.on('error', (err) => {
          errored = true
          child = null; activeId = null
          deps.setRenderState(recordingId, 'failed')
          deps.toast(`Video production failed: ${err.message}`, 'error')
          resolve()
        })
        child.on('close', (code) => {
          if (errored) { resolve(); return }
          const wasCanceled = canceledId === recordingId
          child = null; activeId = null
          if (wasCanceled) {
            try { if (existsSync(outputPath)) rmSync(outputPath) } catch { /* ignore */ }
            deps.setRenderState(recordingId, 'idle')
            deps.toast('Video production canceled.', 'info')
          } else if (code === 0) {
            deps.setRenderState(recordingId, 'done', outputPath)
            deps.toast('Video produced successfully.', 'info')
          } else {
            try { if (existsSync(outputPath)) rmSync(outputPath) } catch { /* ignore */ }
            deps.setRenderState(recordingId, 'failed')
            deps.toast(`Video production failed (ffmpeg exit ${code}).`, 'error')
          }
          resolve()
        })
      })
    }
  }
}
