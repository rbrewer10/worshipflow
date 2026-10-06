// Window-lifecycle decisions for the Electron main process, kept pure so they
// can be unit-tested without Electron (QA A-C2, A-H3, A-H7).

export interface OperatorCloseInput {
  /** before-quit has fired (app.quit(), OS shutdown, test harness close). */
  isQuitting: boolean
  /** Any live track has real content loaded (projector/zones are showing something). */
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
export class RendererRecovery {
  private hits = new Map<string, number[]>()
  constructor(private max = 3, private windowMs = 60_000) {}

  /** Record a crash; true = reload it, false = give up (cap reached). */
  allowReload(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs)
    if (recent.length >= this.max) { this.hits.set(key, recent); return false }
    recent.push(now)
    this.hits.set(key, recent)
    return true
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
