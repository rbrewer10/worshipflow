// src/shared/serviceControlModes.ts
// A small, user-editable mapping from the 3 Service Control mode buttons to
// one of the church's own zone-routing scene presets (see zoneScenes.ts —
// scene IDs are NOT fixed, a church might not have anything named "Sermon" or
// "Focus"). Mirrors zoneScenes.ts's parse/validate/default-on-missing style
// so both settings blobs behave the same way under corruption or a fresh
// install.
import type { SceneConfig, SceneDef } from './zoneScenes'

export type ServiceControlMode = 'sermon' | 'worship' | 'invitation'

export interface ServiceControlModeMapping {
  sermon?: string    // sceneId
  worship?: string   // sceneId
  invitation?: string // sceneId
}

// References the STARTER_SCENES ids from zoneScenes.ts, so this works out of
// the box for a church that hasn't customized their scene palette yet.
export const DEFAULT_MODE_MAPPING: ServiceControlModeMapping = {
  sermon: 'focus',
  worship: 'lyrics-tvs-only',
  invitation: 'everywhere',
}

export function validateServiceControlModeMapping(x: unknown): x is ServiceControlModeMapping {
  if (typeof x !== 'object' || x === null) return false
  const m = x as Record<string, unknown>
  for (const key of ['sermon', 'worship', 'invitation']) {
    if (key in m && m[key] !== undefined && typeof m[key] !== 'string') return false
  }
  return true
}

// Never throws; anything unusable yields the default mapping — same
// defensive philosophy as zoneScenes.ts's parseSceneConfig.
export function parseServiceControlModeMapping(json: string | null): ServiceControlModeMapping {
  if (!json) return DEFAULT_MODE_MAPPING
  try {
    const parsed = JSON.parse(json)
    return validateServiceControlModeMapping(parsed) ? parsed : DEFAULT_MODE_MAPPING
  } catch {
    return DEFAULT_MODE_MAPPING
  }
}

// Resolves a mode button to the actual SceneDef it should apply, or null if
// the mapped sceneId doesn't exist in the church's CURRENT scene config
// (customized away, or deleted) — callers use null to disable the button
// with an explanatory tooltip rather than silently doing nothing or crashing,
// per the approved spec's error-handling section.
export function resolveModeScene(
  mode: ServiceControlMode,
  mapping: ServiceControlModeMapping,
  config: SceneConfig
): SceneDef | null {
  const sceneId = mapping[mode]
  if (!sceneId) return null
  return config.scenes.find((s) => s.id === sceneId) ?? null
}
