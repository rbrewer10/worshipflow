import { describe, it, expect } from 'vitest'
import { zoneTrackFor, idleModeFor, clampSongIndex, STAGE_REHEARSAL_OFF } from './stageRehearsal'
import type { StageRehearsalState } from './stageRehearsal'

const armed: StageRehearsalState = { active: true, songQueue: [3, 18, 4], songIndex: 0, announcementQueue: [2, 3] }

describe('zoneTrackFor', () => {
  it('off: every zone keeps its assigned track', () => {
    expect(zoneTrackFor(1, STAGE_REHEARSAL_OFF, 'main')).toBe('main')
    expect(zoneTrackFor(4, STAGE_REHEARSAL_OFF, 'second')).toBe('second') // an explicit assignment still wins when disarmed
  })
  it('armed: zone 4 is forced onto second regardless of its assignment', () => {
    expect(zoneTrackFor(4, armed, 'main')).toBe('second')
    expect(zoneTrackFor(4, armed, 'second')).toBe('second')
  })
  it('armed: zones 1-3 are untouched, keep their assigned track', () => {
    expect(zoneTrackFor(1, armed, 'main')).toBe('main')
    expect(zoneTrackFor(2, armed, 'main')).toBe('main')
    expect(zoneTrackFor(3, armed, 'main')).toBe('main')
  })
})

describe('idleModeFor', () => {
  it('off: passes the fallback through unchanged', () => {
    expect(idleModeFor(4, STAGE_REHEARSAL_OFF, 'off')).toBe('off')
    expect(idleModeFor(1, STAGE_REHEARSAL_OFF, 'logo')).toBe('logo')
  })
  it('armed: zone 4 falls back to logo instead of a dark screen', () => {
    expect(idleModeFor(4, armed, 'off')).toBe('logo')
  })
  it('armed: zones 1-3 keep their normal fallback', () => {
    expect(idleModeFor(1, armed, 'logo')).toBe('logo')
    expect(idleModeFor(3, armed, 'off')).toBe('off')
  })
})

describe('clampSongIndex', () => {
  it('clamps to the ends of the queue instead of wrapping', () => {
    expect(clampSongIndex(-1, 3)).toBe(0)
    expect(clampSongIndex(3, 3)).toBe(2)
    expect(clampSongIndex(1, 3)).toBe(1)
  })
  it('an empty queue always clamps to 0', () => {
    expect(clampSongIndex(5, 0)).toBe(0)
  })
})
