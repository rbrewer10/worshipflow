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

import { buildFfmpegArgs } from './ffmpegAssembly'

describe('buildFfmpegArgs', () => {
  const base = { servicePath: '/nas/svc.mkv', startMs: 300000, endMs: 3600000, outputPath: '/nas/svc-final.mp4' }

  it('trims the service and concats a single segment when no bumpers', () => {
    const a = buildFfmpegArgs(base)
    expect(a.filter((x) => x === '-i')).toHaveLength(1)
    expect(a).toContain('-ss'); expect(a).toContain('300.000')
    expect(a).toContain('-to'); expect(a).toContain('3600.000')
    expect(a.join(' ')).toContain('concat=n=1:v=1:a=1')
    expect(a[a.length - 1]).toBe('/nas/svc-final.mp4')
    expect(a.join(' ')).toContain('-map [v] -map [a]')
  })

  it('puts the intro first and the service second', () => {
    const a = buildFfmpegArgs({ ...base, introPath: '/nas/intro.mp4' })
    expect(a.filter((x) => x === '-i')).toHaveLength(2)
    const introIdx = a.indexOf('/nas/intro.mp4')
    const svcIdx = a.indexOf('/nas/svc.mkv')
    expect(introIdx).toBeGreaterThan(-1)
    expect(introIdx).toBeLessThan(svcIdx)
    expect(a.join(' ')).toContain('concat=n=2:v=1:a=1')
  })

  it('appends the outro last and builds a 3-segment concat', () => {
    const a = buildFfmpegArgs({ ...base, introPath: '/nas/intro.mp4', outroPath: '/nas/outro.mp4' })
    expect(a.filter((x) => x === '-i')).toHaveLength(3)
    expect(a.indexOf('/nas/outro.mp4')).toBeGreaterThan(a.indexOf('/nas/svc.mkv'))
    expect(a.join(' ')).toContain('concat=n=3:v=1:a=1')
  })

  it('includes libx264/aac output flags and -y', () => {
    const a = buildFfmpegArgs(base)
    expect(a).toContain('-c:v'); expect(a).toContain('libx264')
    expect(a).toContain('-c:a'); expect(a).toContain('aac')
    expect(a[0]).toBe('-y')
  })
})
