// Ryan's decision #7 (Oct 2026): Looks are one-time only. Tapping a Look
// (Worship / Word / Invitation) changes what the screens show for the item
// that is live RIGHT NOW. It is never written to the item, and it lapses the
// moment the live item changes — the next item (or the same item sent live
// again) comes up with its own screen setup.
//
// Before this, a Look tap wrote the scene into the item's per-item zone
// routing, so it came back every time that item went live, and the chip
// highlight was derived from that stored routing.
import type { ServiceItemType, ZoneRouting } from './types'
import type { SceneConfig } from './zoneScenes'
import { expandScene } from './zoneScenes'
import type { ServiceControlMode, ServiceControlModeMapping } from './serviceControlModes'
import { resolveModeScene } from './serviceControlModes'

export const LOOK_MODES: readonly ServiceControlMode[] = ['worship', 'sermon', 'invitation']

export const isLookMode = (mode: unknown): mode is ServiceControlMode =>
  typeof mode === 'string' && (LOOK_MODES as readonly string[]).includes(mode)

/** The one-time Look on a track: which live item it was tapped on, and the
 *  load it was tapped during (a track's loadGeneration bumps on every load,
 *  including sending the same item live again). In memory only. */
export interface LiveLook {
  itemId: number
  generation: number
  mode: ServiceControlMode
  routing: ZoneRouting
}

/** The Look still in force for this track, or null once the live item has
 *  changed (different item, or any fresh load of it). */
export function liveLookFor(
  look: LiveLook | null | undefined,
  track: { serviceItemId: number | null; loadGeneration: number }
): LiveLook | null {
  if (!look) return null
  if (track.serviceItemId == null || look.itemId !== track.serviceItemId) return null
  if (look.generation !== track.loadGeneration) return null
  return look
}

/** What the screens show for a Look on an item of this type, or null when the
 *  Look isn't mapped to a scene in Setup. */
export function lookRouting(
  mode: ServiceControlMode,
  mapping: ServiceControlModeMapping,
  config: SceneConfig | null,
  itemType: ServiceItemType
): ZoneRouting | null {
  if (!config) return null
  const scene = resolveModeScene(mode, mapping, config)
  return scene ? expandScene(scene, itemType) : null
}
