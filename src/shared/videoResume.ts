// QA B12-N5: "Reload projector" restarted a playing video from 0 (t=4.96 before,
// 2.99 three seconds after). Main reads each output window's background video
// (where it is, playing or paused) just before the reload and hands it back
// once the window has loaded; the window seeks there when the video's metadata
// is in and keeps it paused if it was.

export interface VideoResume {
  /** The live background path the video was showing (must still be the live one). */
  src: string
  time: number
  paused: boolean
  /** Date.now() when it was read — a playing video moved on meanwhile. */
  capturedAt: number
}

/** Read in the output window before the reload (webContents.executeJavaScript). */
export const READ_OUTPUT_VIDEO_JS =
  "(() => { const v = document.querySelector('video[data-wf-bg]'); return v && v.readyState > 0 ? { src: v.getAttribute('data-wf-src'), time: v.currentTime, paused: v.paused } : null })()"

/** A resume is only worth applying for this long after it was read. */
export const RESUME_MAX_AGE_MS = 20_000

export function isVideoSnapshot(v: unknown): v is { src: string; time: number; paused: boolean } {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.src === 'string' && o.src !== '' && typeof o.time === 'number' && Number.isFinite(o.time) && o.time >= 0 && typeof o.paused === 'boolean'
}

/** Where to seek: a paused video where it was; a playing one plus the time the reload took (wrapping, the background loops). */
export function resumeTime(r: VideoResume, now: number, duration: number): number {
  const t = r.paused ? r.time : r.time + Math.max(0, now - r.capturedAt) / 1000
  return Number.isFinite(duration) && duration > 0 ? t % duration : t
}
