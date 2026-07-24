// Per-service "which zone follows which track" assignment. Pure module: no DB, no Electron.

import type { ZoneId, TrackId } from './types'
import { DEFAULT_ZONE_TRACK } from './types'

export type ZoneTrackAssignment = Record<ZoneId, TrackId>

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

function isTrackId(v: unknown): v is TrackId {
  return v === 'main' || v === 'second'
}

// Missing key, wrong shape, or unparseable JSON all fall back to the built-in
// default — same "never crash, never surprise with a blank screen" contract
// zoneScenes.ts's parseSceneConfig uses for the zone_scenes setting.
export function parseZoneTrackAssignment(json: string | null): ZoneTrackAssignment {
  if (!json) return { ...DEFAULT_ZONE_TRACK }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ...DEFAULT_ZONE_TRACK }
  }
  if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_ZONE_TRACK }
  const obj = parsed as Record<number, unknown>
  const result = {} as ZoneTrackAssignment
  for (const zoneId of ZONE_IDS) {
    const v = obj[zoneId]
    result[zoneId] = isTrackId(v) ? v : DEFAULT_ZONE_TRACK[zoneId]
  }
  return result
}

export function validateZoneTrackAssignment(value: unknown): value is ZoneTrackAssignment {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<number, unknown>
  return ZONE_IDS.every((zoneId) => isTrackId(v[zoneId]))
}

export function resolveZoneTrack(zoneId: ZoneId, assignment: ZoneTrackAssignment | null): TrackId {
  return assignment?.[zoneId] ?? DEFAULT_ZONE_TRACK[zoneId]
}
