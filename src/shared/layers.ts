// ProPresenter-style independent layers. Black still blanks the house.
// Clear-slide hides lyrics on audience screens but keeps the motion background.
// Clear-background hides the media but keeps the words. Stage (zone 4) always
// keeps the current slide so the pastor is never flying blind.

export interface LayerFlags {
  textHidden: boolean
  bgHidden: boolean
}

export function defaultLayerFlags(): LayerFlags {
  return { textHidden: false, bgHidden: false }
}

export function applyAudienceLayers<T extends { line: string; background: string | null }>(
  shown: T,
  flags: LayerFlags,
  opts?: { isStage?: boolean }
): T {
  if (opts?.isStage) return shown
  return {
    ...shown,
    line: flags.textHidden ? '' : shown.line,
    background: flags.bgHidden ? null : shown.background,
  }
}
