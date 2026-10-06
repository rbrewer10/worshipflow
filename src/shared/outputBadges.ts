// Which diagnostic badges the audience output window may draw (QA B13 / A-M6).
//
// The output window is what goes fullscreen on the real projector, so the
// "NN fps" meter and "OUT n" id must never sit in the corners of the
// congregation's screen. They are shown:
//   - always in a development build (fps is a smoothness check for us), or
//   - when the window was opened with ?diag=1 (WF_OUTPUT_DIAG=1 at launch);
//   - and the "OUT n" id alone for a few seconds right after the window
//     (re)opens, so the operator can still tell which display is which.
export const IDENTIFY_MS = 6000

export interface OutputBadgeInput {
  dev: boolean
  diag: boolean
  msSinceOpen: number
}

export function outputBadges({ dev, diag, msSinceOpen }: OutputBadgeInput): { fps: boolean; id: boolean } {
  const always = dev || diag
  return { fps: always, id: always || msSinceOpen < IDENTIFY_MS }
}
