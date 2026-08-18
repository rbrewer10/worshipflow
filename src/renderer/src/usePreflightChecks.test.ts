import { describe, it, expect } from 'vitest'
import { computePreflightChecks } from './usePreflightChecks'

describe('computePreflightChecks', () => {
  it('flags rehearsal mode as a warning', () => {
    const checks = computePreflightChecks({
      rehearsal: true, screenCount: 2, missingZoneNames: [], activeServiceName: 'Sunday', obsConnected: true
    })
    expect(checks[0]).toEqual({ level: 'warn', label: 'Rehearsal mode is armed — real outputs are showing nothing' })
  })

  it('reports zero screens as a warning', () => {
    const checks = computePreflightChecks({
      rehearsal: false, screenCount: 0, missingZoneNames: [], activeServiceName: null, obsConnected: false
    })
    expect(checks[1]).toEqual({ level: 'warn', label: 'No screens connected yet' })
  })

  it('reports partial connectivity by name', () => {
    const checks = computePreflightChecks({
      rehearsal: false, screenCount: 3, missingZoneNames: ['Stage Monitors'], activeServiceName: 'Sunday', obsConnected: false
    })
    expect(checks[1]).toEqual({ level: 'warn', label: '3 screens connected — Stage Monitors not connected' })
  })

  it('reports full connectivity as ok, singular screen count', () => {
    const checks = computePreflightChecks({
      rehearsal: false, screenCount: 1, missingZoneNames: [], activeServiceName: 'Sunday', obsConnected: false
    })
    expect(checks[1]).toEqual({ level: 'ok', label: '1 screen connected' })
  })

  it('reports no active service as a warning', () => {
    const checks = computePreflightChecks({
      rehearsal: false, screenCount: 1, missingZoneNames: [], activeServiceName: null, obsConnected: false
    })
    expect(checks[2]).toEqual({ level: 'warn', label: 'No service loaded yet' })
  })

  it('treats OBS disconnected as informational, not a warning', () => {
    const checks = computePreflightChecks({
      rehearsal: false, screenCount: 1, missingZoneNames: [], activeServiceName: 'Sunday', obsConnected: false
    })
    expect(checks[3]).toEqual({ level: 'info', label: 'OBS not connected' })
  })

  it('needsAttention is true when any check is a warning', () => {
    const checks = computePreflightChecks({
      rehearsal: false, screenCount: 0, missingZoneNames: [], activeServiceName: 'Sunday', obsConnected: true
    })
    expect(checks.some((c) => c.level === 'warn')).toBe(true)
  })

  it('needsAttention is false when every check is ok or info', () => {
    const checks = computePreflightChecks({
      rehearsal: false, screenCount: 4, missingZoneNames: [], activeServiceName: 'Sunday', obsConnected: true
    })
    expect(checks.some((c) => c.level === 'warn')).toBe(false)
  })
})
