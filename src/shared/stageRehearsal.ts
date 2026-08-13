// "Stage Rehearsal": lets singers run through a song on the Stage Monitor
// (Zone 4) via the Second track, while Zones 1-3 keep showing a chosen
// announcement on Main, untouched. Session-only, never persisted — same
// contract as rehearsalMode, always starts off. Pure module: no DB, no
// Electron. See docs/superpowers/plans/2026-08-08-stage-rehearsal.md.
import type { ZoneId, TrackId, ZoneMode } from './types'

export interface StageRehearsalState {
  active: boolean
  // The active service's songs, in service order — built automatically when
  // rehearsal starts, not hand-picked. songIndex is which one is currently
  // loaded live on Second.
  songQueue: number[]
  songIndex: number
  // Announcements auto-loop on Zones 1-3 via Main while armed — pulled from
  // the Announcements tab's own schedule-for-this-date logic (or every
  // announcement, if the service has no date set).
  announcementQueue: number[]
}

export const STAGE_REHEARSAL_OFF: StageRehearsalState = {
  active: false,
  songQueue: [],
  songIndex: 0,
  announcementQueue: [],
}

// Clamped, not wrapped — Prev/Next song stop at the ends of the lineup
// rather than looping, so the operator always knows where rehearsal is
// relative to the real service order.
export function clampSongIndex(index: number, queueLength: number): number {
  if (queueLength === 0) return 0
  return Math.max(0, Math.min(index, queueLength - 1))
}

// Zone 4 follows Second while armed, regardless of the service's persisted
// zone_track_assignment — a temporary, session-only override, not a change
// to the service's saved config, so disarming needs no cleanup.
export function zoneTrackFor(zoneId: ZoneId, state: StageRehearsalState, assigned: TrackId): TrackId {
  return state.active && zoneId === 4 ? 'second' : assigned
}

// Guards the exact bug that got the old Main/Second UI pulled from the Live
// tab: a zone pointed at a track with nothing live on it renders 'off' (dark,
// no obvious cause). While armed, Zone 4 falls back to 'logo' instead, until
// a song actually goes live on Second.
export function idleModeFor(zoneId: ZoneId, state: StageRehearsalState, fallback: ZoneMode): ZoneMode {
  return state.active && zoneId === 4 ? 'logo' : fallback
}
