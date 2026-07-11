// Scenes: named, user-editable placement rules for the 4 display zones.
// A scene says, for zones 1-3, whether the screen shows the item's CONTENT or a
// filler (logo / black). Zone 4 (stage monitor) is always 'stage' — only the
// Advanced per-zone grid can change it. Pure module: no DB, no Electron.

import type { ServiceItemType, ZoneRouting, ZoneMode } from './types'
import { ZONE_ROUTING_DEFAULTS } from './types'

export type ZoneRole = 'content' | 'logo' | 'black'

export interface SceneDef {
  id: string
  name: string
  zones: Record<'1' | '2' | '3', ZoneRole>
}

export interface SceneConfig {
  scenes: SceneDef[]
  typeDefaults: Partial<Record<ServiceItemType, string>> // type → sceneId
}

export const STARTER_SCENES: SceneDef[] = [
  { id: 'lyrics-tvs-only',   name: 'Lyrics TVs only',   zones: { '1': 'logo',    '2': 'logo',    '3': 'content' } },
  { id: 'everywhere',        name: 'Everywhere',        zones: { '1': 'content', '2': 'content', '3': 'content' } },
  { id: 'back-screens-only', name: 'Back screens only', zones: { '1': 'content', '2': 'content', '3': 'logo' } },
  { id: 'focus',             name: 'Focus',             zones: { '1': 'black',   '2': 'black',   '3': 'content' } },
  { id: 'all-logo',          name: 'All logo',          zones: { '1': 'logo',    '2': 'logo',    '3': 'logo' } },
]

export const STARTER_TYPE_DEFAULTS: SceneConfig['typeDefaults'] = {
  song: 'lyrics-tvs-only',
  scripture: 'everywhere',
  text: 'everywhere',
  ticker: 'everywhere',
  announcement: 'everywhere',
  // countdown / welcome / image keep the built-in ZONE_ROUTING_DEFAULTS
}

export function starterConfig(): SceneConfig {
  return { scenes: STARTER_SCENES.map((s) => ({ ...s, zones: { ...s.zones } })), typeDefaults: { ...STARTER_TYPE_DEFAULTS } }
}

// The one mode that shows this item type's actual content on a zone screen.
export function contentModeFor(type: ServiceItemType): ZoneMode {
  if (type === 'song') return 'lyrics'
  if (type === 'countdown' || type === 'welcome') return 'countdown'
  if (type === 'image') return 'image'
  return 'text' // scripture, text, ticker, announcement
}

export function expandScene(scene: SceneDef, type: ServiceItemType): ZoneRouting {
  const roleToMode = (role: ZoneRole | undefined): ZoneMode =>
    role === 'content' ? contentModeFor(type) : role === 'black' ? 'black' : 'logo'
  return {
    1: roleToMode(scene.zones?.['1']),
    2: roleToMode(scene.zones?.['2']),
    3: roleToMode(scene.zones?.['3']),
    4: 'stage',
  }
}

// Default routing for a type: the palette's typeDefault scene (if it exists),
// else the built-in hardcoded defaults. Deleted/unknown sceneIds fall through.
export function defaultRoutingFor(type: ServiceItemType, config: SceneConfig): ZoneRouting {
  const sceneId = config.typeDefaults[type]
  const scene = sceneId ? config.scenes.find((s) => s.id === sceneId) : undefined
  return scene ? expandScene(scene, type) : ZONE_ROUTING_DEFAULTS[type]
}

export function effectiveRouting(
  item: { type: ServiceItemType; zoneRouting: ZoneRouting | null },
  config: SceneConfig
): ZoneRouting {
  return item.zoneRouting ?? defaultRoutingFor(item.type, config)
}

// Reverse-match a routing against every scene's expansion for this type.
// Compares all four zones (so an Advanced-edited Z4 correctly reads as custom).
export function matchScene(routing: ZoneRouting, type: ServiceItemType, config: SceneConfig): string | 'custom' {
  // If two scenes expand identically for this type, the first in config order wins (tie-break is intentional).
  for (const scene of config.scenes) {
    const exp = expandScene(scene, type)
    if (exp[1] === routing[1] && exp[2] === routing[2] && exp[3] === routing[3] && exp[4] === routing[4]) {
      return scene.id
    }
  }
  return 'custom'
}

const ROLES: ZoneRole[] = ['content', 'logo', 'black']

export function validateSceneConfig(config: unknown): config is SceneConfig {
  if (typeof config !== 'object' || config == null) return false
  const c = config as SceneConfig
  if (!Array.isArray(c.scenes) || c.scenes.length === 0) return false
  if (typeof c.typeDefaults !== 'object' || c.typeDefaults == null) return false
  for (const value of Object.values(c.typeDefaults)) {
    if (value !== undefined && typeof value !== 'string') return false
  }
  const ids = new Set<string>()
  for (const s of c.scenes) {
    if (typeof s?.id !== 'string' || !s.id || ids.has(s.id)) return false
    ids.add(s.id)
    if (typeof s.name !== 'string' || !s.name.trim()) return false
    if (typeof s.zones !== 'object' || s.zones == null) return false
    // null/missing roles are allowed — expandScene treats a missing zone as 'logo' (safe filler)
    for (const z of ['1', '2', '3'] as const) {
      const role = s.zones[z]
      if (role != null && !ROLES.includes(role)) return false
    }
  }
  return true
}

// Never throws; anything unusable yields the starter palette.
export function parseSceneConfig(json: string | null): SceneConfig {
  if (!json) return starterConfig()
  try {
    const parsed = JSON.parse(json)
    return validateSceneConfig(parsed) ? (parsed as SceneConfig) : starterConfig()
  } catch {
    return starterConfig()
  }
}
