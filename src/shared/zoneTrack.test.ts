import { describe, it, expect } from 'vitest'
import { parseZoneTrackAssignment, validateZoneTrackAssignment, resolveZoneTrack } from './zoneTrack'
import { DEFAULT_ZONE_TRACK } from './types'

describe('parseZoneTrackAssignment', () => {
  it('null/garbage/wrong-shape JSON all yield the built-in default', () => {
    expect(parseZoneTrackAssignment(null)).toEqual(DEFAULT_ZONE_TRACK)
    expect(parseZoneTrackAssignment('not json{{')).toEqual(DEFAULT_ZONE_TRACK)
    expect(parseZoneTrackAssignment('"just a string"')).toEqual(DEFAULT_ZONE_TRACK)
  })

  it('fills in a missing or invalid zone with the built-in default for that zone', () => {
    const partial = JSON.stringify({ 1: 'second' })
    expect(parseZoneTrackAssignment(partial)).toEqual({ ...DEFAULT_ZONE_TRACK, 1: 'second' })
    const bogus = JSON.stringify({ 1: 'second', 2: 'bogus', 3: 'main', 4: 'main' })
    expect(parseZoneTrackAssignment(bogus)).toEqual({ ...DEFAULT_ZONE_TRACK, 1: 'second' })
  })

  it('valid JSON round-trips', () => {
    const assignment = { 1: 'second' as const, 2: 'main' as const, 3: 'main' as const, 4: 'main' as const }
    expect(parseZoneTrackAssignment(JSON.stringify(assignment))).toEqual(assignment)
  })
})

describe('validateZoneTrackAssignment', () => {
  it('accepts a full valid assignment', () => {
    expect(validateZoneTrackAssignment({ 1: 'main', 2: 'second', 3: 'main', 4: 'main' })).toBe(true)
  })
  it('rejects missing zones, invalid track values, and non-objects', () => {
    expect(validateZoneTrackAssignment({ 1: 'main', 2: 'second', 3: 'main' })).toBe(false)
    expect(validateZoneTrackAssignment({ 1: 'main', 2: 'bogus', 3: 'main', 4: 'main' })).toBe(false)
    expect(validateZoneTrackAssignment(null)).toBe(false)
    expect(validateZoneTrackAssignment('nope')).toBe(false)
  })
})

describe('resolveZoneTrack', () => {
  it('falls back to the built-in default when assignment is null', () => {
    expect(resolveZoneTrack(2, null)).toBe(DEFAULT_ZONE_TRACK[2])
  })
  it('uses the explicit assignment when present', () => {
    expect(resolveZoneTrack(1, { 1: 'second', 2: 'main', 3: 'main', 4: 'main' })).toBe('second')
  })
})
