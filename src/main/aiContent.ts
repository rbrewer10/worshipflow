export interface TranscriptSegment {
  start: number // seconds
  end: number   // seconds
  text: string
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000))
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`
}

export function buildSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((seg, i) => `${i + 1}\n${srtTime(seg.start)} --> ${srtTime(seg.end)}\n${seg.text.trim()}\n`)
    .join('\n')
}

import type { RecordingMarker } from '../shared/types'

function chapterTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

// Chapters from Phase-1 markers, rebased to the trimmed (produced) video by
// subtracting the trim start. Markers before the trim are dropped. YouTube requires
// the first chapter at 0:00, so prepend "0:00 Intro" when nothing lands exactly there.
export function buildChapters(markers: RecordingMarker[], trimStartMs: number): string {
  const kept = markers
    .map((m) => ({ label: m.label, ms: m.offsetMs - trimStartMs }))
    .filter((m) => m.ms >= 0)
    .sort((a, b) => a.ms - b.ms)
  const lines: string[] = []
  if (kept.length === 0 || kept[0].ms > 0) lines.push('0:00 Intro')
  for (const k of kept) lines.push(`${chapterTime(k.ms)} ${k.label}`)
  return lines.join('\n')
}
