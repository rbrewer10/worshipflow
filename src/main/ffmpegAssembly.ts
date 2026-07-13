import type { RecordingSidecar } from '../shared/types'

export interface TrimResult {
  startMs: number
  endMs: number
}

// Default trim: skip a leading pre-service countdown by starting at the first
// worship song or the sermon; keep everything through the recording's end.
// An operator override (either bound) wins; both bounds are clamped to the
// recording, and an inverted range falls back to the full recording.
export function computeTrim(
  sidecar: RecordingSidecar,
  override?: { startMs?: number; endMs?: number }
): TrimResult {
  const dur = sidecar.recording.durationMs
  const firstContent = sidecar.markers.find((m) => m.kind === 'song' || m.kind === 'sermon')
  let startMs = firstContent ? firstContent.offsetMs : 0
  let endMs = dur
  if (override?.startMs != null) startMs = override.startMs
  if (override?.endMs != null) endMs = override.endMs
  startMs = Math.max(0, Math.min(startMs, dur))
  endMs = Math.max(0, Math.min(endMs, dur))
  if (endMs <= startMs) return { startMs: 0, endMs: dur }
  return { startMs, endMs }
}

export interface FfmpegBuildInput {
  servicePath: string
  introPath?: string | null
  outroPath?: string | null
  startMs: number
  endMs: number
  outputPath: string
  width?: number
  height?: number
  fps?: number
  crf?: number
}

// Builds the ffmpeg argv for: [intro?] + trimmed service + [outro?], each segment
// normalized to the same WxH/fps/format so concat works across differing sources,
// re-encoded to H.264/AAC MP4. Trimming uses input seeking on the service input.
export function buildFfmpegArgs(input: FfmpegBuildInput): string[] {
  const width = input.width ?? 1920
  const height = input.height ?? 1080
  const fps = input.fps ?? 30
  const crf = input.crf ?? 20
  const startSec = (input.startMs / 1000).toFixed(3)
  const endSec = (input.endMs / 1000).toFixed(3)

  const args: string[] = ['-y']
  const inputIndices: number[] = [] // ffmpeg input indices in play order
  let idx = 0
  if (input.introPath) { args.push('-i', input.introPath); inputIndices.push(idx++) }
  args.push('-ss', startSec, '-to', endSec, '-i', input.servicePath); inputIndices.push(idx++)
  if (input.outroPath) { args.push('-i', input.outroPath); inputIndices.push(idx++) }

  const vf =
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p`
  const af = 'aformat=sample_rates=48000:channel_layouts=stereo'

  const filters: string[] = []
  let concatInputs = ''
  inputIndices.forEach((inIdx, i) => {
    filters.push(`[${inIdx}:v]${vf}[v${i}]`)
    filters.push(`[${inIdx}:a]${af}[a${i}]`)
    concatInputs += `[v${i}][a${i}]`
  })
  filters.push(`${concatInputs}concat=n=${inputIndices.length}:v=1:a=1[v][a]`)

  args.push('-filter_complex', filters.join(';'))
  args.push('-map', '[v]', '-map', '[a]')
  args.push('-c:v', 'libx264', '-crf', String(crf), '-preset', 'veryfast')
  args.push('-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart')
  args.push(input.outputPath)
  return args
}
