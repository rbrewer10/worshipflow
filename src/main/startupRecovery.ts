// QA A2-N1: crash recovery never restored anything. whenReady runs
// createOperator(); layoutOutputs(); broadcast(), and broadcast() writes the
// recovery snapshot whenever the live state differs from the last write —
// which on a fresh process is always (the "last written" key starts null). So
// the empty startup state overwrote recovery.json (and flipped cleanExit to
// false) before the renderer's restoreRecovery() ever read it.
//
// The fix: capture the previous session's snapshot + cleanExit flag exactly
// once, before the first recovery write of this session, and have
// restoreRecovery use that copy. It is handed out once: a later renderer
// remount (crash revive, reload) must not re-load the old item over whatever
// the operator has put up since.
//
// Pure (reads are injected) so it's unit-testable without electron-store.

export interface StartupSnapshot<S> {
  snap: S | null
  cleanExit: boolean
}

// QA A3-N4: capture() kept an in-memory copy, but this session's first
// broadcast still wrote its idle state to disk straight away — a second crash
// in the ~1 s before the renderer restored lost the snapshot. Writes are now
// held until the restore has run (take()), or until RECOVERY_WRITE_HOLD_MS has
// passed in case the operator window never asks (so a long session is still
// protected).
export const RECOVERY_WRITE_HOLD_MS = 30_000

export class StartupRecovery<S> {
  private captured: StartupSnapshot<S> | null = null
  private consumed = false
  private capturedAt = 0

  constructor(
    private readonly readSnapshot: () => S | null,
    private readonly readCleanExit: () => boolean,
    private readonly holdMs = RECOVERY_WRITE_HOLD_MS,
    private readonly clock: () => number = Date.now
  ) {}

  /** May this session overwrite the on-disk snapshot yet? */
  writesAllowed(): boolean {
    if (this.consumed) return true
    if (!this.captured) return false
    return this.clock() - this.capturedAt >= this.holdMs
  }

  /** ms until writesAllowed() turns true on its own (0 when it already is). */
  holdRemainingMs(): number {
    if (this.writesAllowed()) return 0
    if (!this.captured) return this.holdMs
    return Math.max(0, this.holdMs - (this.clock() - this.capturedAt))
  }

  /** Read the previous session's state if not already read. Idempotent. Call before any write. */
  capture(): void {
    if (this.captured) return
    let snap: S | null = null
    let cleanExit = false
    try { snap = this.readSnapshot() } catch { snap = null }
    try { cleanExit = this.readCleanExit() } catch { cleanExit = false }
    this.captured = { snap, cleanExit }
    this.capturedAt = this.clock()
  }

  get isCaptured(): boolean {
    return this.captured !== null
  }

  /** The previous session's state, the first time only; null afterwards. */
  take(): StartupSnapshot<S> | null {
    this.capture()
    if (this.consumed) return null
    this.consumed = true
    return this.captured
  }
}
