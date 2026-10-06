// When is it safe to install a downloaded update? (QA A-H6)
//
// 0.20.2 downloaded updates silently and electron-updater's defaults then
// installed them on ANY quit (autoInstallOnAppQuit) — including a mid-service
// quit-and-relaunch to recover a frozen screen — and a one-click "Restart to
// update" sat next to the version label with no live check. Installing closes
// every output window and runs the installer, so it must only happen on an
// explicit, confirmed action while nothing is being shown or streamed.

export interface UpdateSafetyState {
  /** Per live track: is real content showing, and in what mode? */
  tracks: { hasLiveContent: boolean; mode: string }[]
  obsStreaming: boolean
  obsRecording: boolean
  stageRehearsalActive: boolean
}

/** Modes where the projectors are showing service content (not black/logo hold). */
const SHOWING_MODES = new Set(['lyrics', 'countdown', 'announcement', 'livecall'])

/** null when installing now is allowed; otherwise a sentence for the operator. */
export function updateInstallBlockReason(s: UpdateSafetyState): string | null {
  if (s.obsStreaming) return 'OBS is streaming.'
  if (s.obsRecording) return 'OBS is recording.'
  if (s.stageRehearsalActive) return 'Stage rehearsal is running.'
  if (s.tracks.some((t) => t.hasLiveContent && SHOWING_MODES.has(t.mode))) return 'Something is live on the screens.'
  return null
}

export type AutoUpdateMode = 'download' | 'off'

/** Setting `auto_update_mode`: 'download' (default) checks + downloads at startup; 'off' never checks. */
export function parseAutoUpdateMode(raw: string | null | undefined): AutoUpdateMode {
  return raw === 'off' ? 'off' : 'download'
}
