// Window-lifecycle decisions for the Electron main process, kept pure so they
// can be unit-tested without Electron (QA A-C2, A-H3, A-H7).

export interface OperatorCloseInput {
  /**
   * We're already quitting: before-quit fired (app.quit(), the test harness
   * close), or the OS is ending the session. Note that on Windows before-quit
   * is NOT emitted for shutdown/logoff — index.ts's session-end handler sets
   * the flag there (QA A-L3; retest note N8).
   */
  isQuitting: boolean
  /** A track is actually showing service content (trackShowing) — not merely "something was live once". */
  anyLiveContent: boolean
  obsStreaming: boolean
  obsRecording: boolean
}

/**
 * What to do when the operator clicks the Operator window's X.
 *  - 'allow':   we're already quitting — let the window close.
 *  - 'confirm': something is live — ask first, and on yes quit the WHOLE app.
 *  - 'quit':    nothing live — quit the whole app straight away.
 *
 * Never just close the operator window on its own: the audience outputs would
 * keep running with no control, and the single-instance lock would make a
 * relaunch silently do nothing (QA A-C2).
 */
export function operatorCloseDecision(i: OperatorCloseInput): 'allow' | 'confirm' | 'quit' {
  if (i.isQuitting) return 'allow'
  if (i.anyLiveContent || i.obsStreaming || i.obsRecording) return 'confirm'
  return 'quit'
}

/** Modes where the projectors show service content (black / logo are holds). */
const SHOWING_MODES = new Set(['lyrics', 'countdown', 'announcement', 'livecall'])

/**
 * Is this track showing something the room would lose if WorshipFlow closed?
 * QA A-N6: the close prompt used `hasLiveContent`, which never clears, so after
 * Black or Logo it still said "the projectors are live". Decks and
 * verses-sermons deliberately sit at mode 'logo' while their slides show, so
 * they count unless the operator went to Black.
 */
export function trackShowing(t: { hasLiveContent: boolean; mode: string; hasSlides?: boolean }): boolean {
  if (!t.hasLiveContent) return false
  return SHOWING_MODES.has(t.mode) || (!!t.hasSlides && t.mode === 'logo')
}

/** Wording for the operator close confirm — says what is actually going on. */
export function closePromptText(i: { showing: boolean; obsStreaming: boolean; obsRecording: boolean }): { message: string; detail: string } {
  const detail = 'Closing WorshipFlow turns off every projector, stage screen and zone display.'
  if (i.showing) return { message: 'The projectors are showing the service. Close WorshipFlow?', detail }
  if (i.obsStreaming) return { message: 'OBS is streaming. Close WorshipFlow?', detail: `${detail} The stream keeps running in OBS, but WorshipFlow's overlay stops.` }
  if (i.obsRecording) return { message: 'OBS is recording. Close WorshipFlow?', detail: `${detail} The recording keeps running in OBS, but its service markers stop.` }
  return { message: 'Close WorshipFlow?', detail }
}

/**
 * Audience output windows are frameless/fullscreen, so the only way they close
 * is Alt+F4 (or a stray OS gesture) after focus lands on the projector. Block
 * that unless the app is quitting (QA A-H7). The manual windowed fallback
 * ("Open output" with no projector detected) stays closable — it sits on the
 * operator's own screen and closing it is deliberate.
 */
export function outputCloseAllowed(i: { isQuitting: boolean; windowedFallback: boolean }): boolean {
  return i.isQuitting || i.windowedFallback
}

/**
 * Crash-loop guard for automatic renderer reloads (QA A-H3): reload a crashed
 * window at most `max` times per `windowMs`, per window key, so a renderer that
 * dies on every load (e.g. a video background that OOMs the GPU process) can't
 * spin forever.
 */
/**
 * QA A-N3: once the cap was hit the window used to stay dead for good (a black
 * or sad-face projector until someone restarted the app). Now a capped window
 * is retried later with back-off; a crash after that window has passed goes
 * back to normal immediate reloads.
 */
export const CRASH_RETRY_BACKOFF_MS = [30_000, 120_000, 300_000]

export class RendererRecovery {
  private hits = new Map<string, number[]>()
  private giveUps = new Map<string, number>()
  constructor(private max = 3, private windowMs = 60_000, private backoff: readonly number[] = CRASH_RETRY_BACKOFF_MS) {}

  /** Record a crash; true = reload it now, false = cap reached (use retryAfterMs). */
  allowReload(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs)
    if (recent.length >= this.max) { this.hits.set(key, recent); return false }
    recent.push(now)
    this.hits.set(key, recent)
    this.giveUps.delete(key)
    return true
  }

  /** After allowReload() said no: wait this long, then try one more reload. Grows each time. */
  retryAfterMs(key: string): number {
    const n = this.giveUps.get(key) ?? 0
    this.giveUps.set(key, n + 1)
    return this.backoff[Math.min(n, this.backoff.length - 1)]
  }

  /** A deliberate revive (second launch of the app) starts the count fresh. */
  reset(key: string): void {
    this.hits.delete(key)
    this.giveUps.delete(key)
  }
}

/** Human label for a render-process-gone reason. */
export function crashReasonText(reason: string): string {
  switch (reason) {
    case 'oom': return 'ran out of memory'
    case 'crashed': return 'crashed'
    case 'killed': return 'was killed'
    case 'launch-failed': return 'failed to start'
    case 'integrity-failure': return 'failed an integrity check'
    case 'abnormal-exit': return 'exited unexpectedly'
    default: return 'stopped'
  }
}

// QA A-L4: when a display is unplugged, a stage window that was fullscreen on
// it can be moved by Windows onto the operator's screen — frameless and
// fullscreen, covering the operator UI. Was this window on the removed display
// (or now on no display at all)?
export interface Rect { x: number; y: number; width: number; height: number }
const contains = (r: Rect, px: number, py: number): boolean => px >= r.x && px < r.x + r.width && py >= r.y && py < r.y + r.height
export function wasOnRemovedDisplay(win: Rect, removed: Rect, remaining: Rect[]): boolean {
  const cx = win.x + win.width / 2
  const cy = win.y + win.height / 2
  if (contains(removed, cx, cy)) return true
  return !remaining.some((d) => contains(d, cx, cy))
}
