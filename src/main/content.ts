import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { RecordingRow, RecordingMarker, RecordingSidecar } from '../shared/types'
import { buildSrt, buildChapters, buildContentPrompt } from './aiContent'
import { transcribeAudio, generateBackgroundImage } from './replicateApi'
import { generateSermonContent } from './anthropicApi'
import { computeTrim } from './ffmpegAssembly'

export interface ContentDeps {
  ffmpegPath: string
  getRecording: (id: number) => RecordingRow | null
  listMarkers: (id: number) => RecordingMarker[]
  getSetting: (key: string) => string | null
  saveAi: (id: number, fields: Partial<Pick<RecordingRow,
    'transcript' | 'aiTitle' | 'aiDescription' | 'chapters' | 'srtPath' | 'thumbnailPath' | 'aiState'>>) => void
  renderThumbnail: (bgImagePath: string | null, title: string, speaker: string, outPath: string) => Promise<void>
  onProgress: (id: number, label: string) => void
  toast: (message: string, level?: 'info' | 'warn' | 'error') => void
}

export interface ContentRunner {
  generate: (recordingId: number) => Promise<void>
  isBusy: () => boolean
}

function extractAudio(ffmpegPath: string, videoPath: string, outMp3: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ['-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', outMp3])
    p.on('error', reject)
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg audio extract failed (${code})`)))
  })
}

function loadSidecar(rec: RecordingRow, markers: RecordingMarker[]): RecordingSidecar {
  if (rec.filePath) {
    const sc = rec.filePath.replace(/\.[^.\\/]+$/, '') + '.worshipflow.json'
    if (existsSync(sc)) { try { return JSON.parse(readFileSync(sc, 'utf-8')) as RecordingSidecar } catch { /* fall */ } }
  }
  const durationMs = rec.endedAt != null ? rec.endedAt - rec.startedAt : 0
  return {
    worshipflowVersion: 'rebuilt',
    service: { id: rec.serviceId, name: '', date: null },
    recording: { startedAt: rec.obsRecordStartedMs, durationMs, file: rec.filePath ? basename(rec.filePath) : '' },
    markers: markers.map((m) => ({ kind: m.kind, label: m.label, offsetMs: m.offsetMs }))
  }
}

// Pull sermon title/speaker/passage from the sermon marker's label (title) — the
// richer payload isn't on the marker, so title comes from the marker label.
function sermonMeta(markers: RecordingMarker[]): { title?: string; speaker?: string; passage?: string } {
  const sermon = markers.find((m) => m.kind === 'sermon')
  return sermon ? { title: sermon.label } : {}
}

export function createContentRunner(deps: ContentDeps): ContentRunner {
  let busy = false
  return {
    isBusy: () => busy,
    async generate(recordingId) {
      if (busy) { deps.toast('Already generating content — wait for it to finish.', 'warn'); return }
      const rec = deps.getRecording(recordingId)
      if (!rec || rec.renderState !== 'done' || !rec.outputPath || !existsSync(rec.outputPath)) {
        deps.toast('Produce the video first — AI content runs on the finished MP4.', 'warn'); return
      }
      const replicateKey = deps.getSetting('replicate_api_key')
      const anthropicKey = deps.getSetting('anthropic_api_key')
      if (!replicateKey) { deps.saveAi(recordingId, { aiState: 'failed' }); deps.toast('Set your Replicate API key first.', 'error'); return }
      if (!anthropicKey) { deps.saveAi(recordingId, { aiState: 'failed' }); deps.toast('Set your Anthropic API key first.', 'error'); return }

      busy = true
      const finalPath = rec.outputPath
      const stem = join(dirname(finalPath), basename(finalPath, extname(finalPath)))
      const mp3Path = stem + '.tmp.mp3'
      const srtPath = stem + '.srt'
      const thumbPath = stem + '-thumb.jpg'
      const markers = deps.listMarkers(recordingId)
      try {
        deps.saveAi(recordingId, { aiState: 'generating' })

        deps.onProgress(recordingId, 'Extracting audio…')
        await extractAudio(deps.ffmpegPath, finalPath, mp3Path)

        deps.onProgress(recordingId, 'Transcribing…')
        const whisper = await transcribeAudio(mp3Path, replicateKey)

        deps.onProgress(recordingId, 'Writing captions…')
        writeFileSync(srtPath, buildSrt(whisper.segments), 'utf-8')

        const sidecar = loadSidecar(rec, markers)
        const { startMs } = computeTrim(sidecar)
        const chapters = buildChapters(markers, startMs)
        const meta = sermonMeta(markers)

        deps.onProgress(recordingId, 'Writing title & description…')
        const content = await generateSermonContent(
          buildContentPrompt({ transcript: whisper.text, ...meta, chapters }), anthropicKey
        )

        deps.onProgress(recordingId, 'Making thumbnail…')
        let bgImage: string | null = null
        try { bgImage = await generateBackgroundImage(meta.title ?? 'sermon', replicateKey) } catch { bgImage = null }
        await deps.renderThumbnail(bgImage, content.title, meta.speaker ?? '', thumbPath)

        deps.saveAi(recordingId, {
          transcript: whisper.text, aiTitle: content.title, aiDescription: content.description,
          chapters, srtPath, thumbnailPath: thumbPath, aiState: 'done'
        })
        deps.toast('AI content generated.', 'info')
      } catch (err) {
        deps.saveAi(recordingId, { aiState: 'failed' })
        deps.toast(`Content generation failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
      } finally {
        try { if (existsSync(mp3Path)) rmSync(mp3Path) } catch { /* ignore */ }
        busy = false
      }
    }
  }
}
