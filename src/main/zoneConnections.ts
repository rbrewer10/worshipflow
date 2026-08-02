import type { ZoneId } from '../shared/types'

// Tracks which zone screens (Back Left, Back Right, Lyrics TVs, Stage
// Monitors) currently have a live WebSocket connection, so wf:getInfo can
// report real zone connectivity instead of the always-zero local-output-
// window count for an all-zone setup. See the 2026-08-02 design spec.
//
// Generic over the socket type (kept as `unknown`) so this stays decoupled
// from the `ws` library and is trivially testable with plain objects —
// nothing here ever reads a property off the socket, only compares identity.
const zoneConnections = new Map<ZoneId, unknown>()

export function markZoneConnected(zoneId: ZoneId, socket: unknown): void {
  zoneConnections.set(zoneId, socket)
}

// Only clears the entry if `socket` is still the one on record for this
// zone. If the zone already reconnected with a newer socket before this
// older one's close/error handler fired, that newer connection must not be
// evicted by the older one's belated cleanup.
export function markZoneDisconnected(zoneId: ZoneId, socket: unknown): void {
  if (zoneConnections.get(zoneId) === socket) zoneConnections.delete(zoneId)
}

export function getConnectedZoneIds(): ZoneId[] {
  return Array.from(zoneConnections.keys())
}
