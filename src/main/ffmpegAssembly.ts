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
