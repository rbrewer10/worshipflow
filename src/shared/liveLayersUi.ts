// Operator-side layer feedback and Looks highlight (QA B19, B20).
import type { ServiceItemType, ZoneRouting } from './types'
import type { SceneConfig } from './zoneScenes'
import { effectiveRouting, expandScene } from './zoneScenes'
import type { ServiceControlMode, ServiceControlModeMapping } from './serviceControlModes'
import { resolveModeScene } from './serviceControlModes'

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

const sameRouting = (a: ZoneRouting, b: ZoneRouting): boolean => a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4]

/**
 * B19: the highlighted Looks chip was local state that never followed the
 * live item. Derive it from the live item's effective routing instead.
 */
export function activeLookMode(
  item: { type: ServiceItemType; zoneRouting: ZoneRouting | null } | null | undefined,
  config: SceneConfig | null,
  mapping: ServiceControlModeMapping
): ServiceControlMode | null {
  if (!item || !config) return null
  const routing = effectiveRouting(item, config)
  for (const mode of ['worship', 'sermon', 'invitation'] as ServiceControlMode[]) {
    const scene = resolveModeScene(mode, mapping, config)
    if (scene && sameRouting(expandScene(scene, item.type), routing)) return mode
  }
  return null
}
