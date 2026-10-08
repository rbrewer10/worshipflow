// Operator-side layer feedback (QA B20).
export interface LayerState {
  mode?: string
  textHidden?: boolean
  bgHidden?: boolean
}

/**
 * B20: the C / G keys only ever turned a layer OFF, while the on-screen
 * "Clear lyrics" / "Clear BG" buttons toggle. Pressing C again did nothing.
 * Now the keys match the buttons.
 */
export function layerTogglePatch(state: LayerState | null | undefined, which: 'text' | 'bg'): { textHidden?: boolean; bgHidden?: boolean } {
  return which === 'text' ? { textHidden: !state?.textHidden } : { bgHidden: !state?.bgHidden }
}

/**
 * B20: the operator's CURRENT preview kept showing the lyrics while they were
 * hidden on the audience screens. A short notice for the preview (and for
 * Volunteer mode, which had no layer indicator at all), or null.
 */
export function hiddenLayerNotice(state: LayerState | null | undefined): string | null {
  if (!state || state.mode === 'black') return null
  const text = !!state.textHidden && state.mode === 'lyrics'
  const bg = !!state.bgHidden
  if (text && bg) return 'Lyrics and background hidden on the screens'
  if (text) return 'Lyrics hidden on the screens'
  if (bg) return 'Background hidden on the screens'
  return null
}

// The Looks chip highlight used to be derived here from the live item's
// STORED routing (QA B19). Looks are one-time only now (Ryan's decision #7):
// the highlight comes from the live state's `liveLook`, and a routing stored
// on an item by an older build is never read back as a Look. See liveLook.ts.
