import { describe, it, expect } from 'vitest'
import { computeTrim } from './ffmpegAssembly'
import type { RecordingSidecar } from '../shared/types'

function sidecar(markers: RecordingSidecar['markers'], durationMs: number): RecordingSidecar {
  return {
    worshipflowVersion: '0.9.0',
    service: { id: 1, name: 'Sunday', date: '2026-07-19' },
    recording: { startedAt: 0, durationMs, file: 'x.mkv' },
    markers
  }
}

describe('computeTrim', () => {
  it('starts at the first song/sermon marker, skipping a leading countdown', () => {
    const sc = sidecar([
      { kind: 'item', label: 'Countdown', offsetMs: 0 },
      { kind: 'song', label: 'Opener', offsetMs: 300000 },
      { kind: 'sermon', label: 'Msg', offsetMs: 1800000 }
    ], 3600000)
    expect(computeTrim(sc)).toEqual({ startMs: 300000, endMs: 3600000 })
  })

  it('starts at 0 when there is no song or sermon marker', () => {
    const sc = sidecar([{ kind: 'item', label: 'Announcements', offsetMs: 0 }], 600000)
    expect(computeTrim(sc)).toEqual({ startMs: 0, endMs: 600000 })
  })

  it('lets an operator override win over the default', () => {
    const sc = sidecar([{ kind: 'song', label: 'Opener', offsetMs: 300000 }], 3600000)
    expect(computeTrim(sc, { startMs: 120000, endMs: 3000000 })).toEqual({ startMs: 120000, endMs: 3000000 })
  })

  it('clamps overrides into [0, duration]', () => {
    const sc = sidecar([{ kind: 'song', label: 'Opener', offsetMs: 300000 }], 3600000)
    expect(computeTrim(sc, { startMs: -50, endMs: 9999999 })).toEqual({ startMs: 0, endMs: 3600000 })
  })

  it('falls back to the full recording when the range is inverted', () => {
    const sc = sidecar([{ kind: 'song', label: 'Opener', offsetMs: 300000 }], 3600000)
    expect(computeTrim(sc, { startMs: 3000000, endMs: 1000000 })).toEqual({ startMs: 0, endMs: 3600000 })
  })
})
