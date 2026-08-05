// Looks: named, saved snapshots of all 4 zones' pin state ("what's routed to
// every zone right now"), recalled in one click instead of pinning each zone
// separately. A Look's `pins` field is the exact same shape zonePins.ts
// already validates (ZonePins — an absent zone key means "was unpinned,
// following the service, when saved"), so applying a Look reuses that
// validation rather than inventing a parallel one. Pure module: no DB, no
// Electron. See the 2026-08-05 design spec.
import type { ZonePins } from './zonePins'
import { validateZonePins } from './zonePins'

export interface Look {
  id: string
  name: string
  pins: ZonePins
}

export function validateLook(value: unknown): value is Look {
  if (typeof value !== 'object' || value === null) return false
  const l = value as Look
  if (typeof l.id !== 'string' || !l.id) return false
  if (typeof l.name !== 'string' || !l.name.trim()) return false
  if (!validateZonePins(l.pins)) return false
  return true
}

export function validateLooksConfig(value: unknown): value is Look[] {
  if (!Array.isArray(value)) return false
  const ids = new Set<string>()
  for (const look of value) {
    if (!validateLook(look)) return false
    if (ids.has(look.id)) return false
    ids.add(look.id)
  }
  return true
}

// Never throws; anything unusable yields no saved Looks.
export function parseLooksConfig(json: string | null): Look[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return validateLooksConfig(parsed) ? (parsed as Look[]) : []
  } catch {
    return []
  }
}
