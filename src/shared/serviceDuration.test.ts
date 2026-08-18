import { describe, it, expect } from 'vitest'
import { estimateItemDurationSeconds, estimateServiceDuration, formatDurationEstimate } from './serviceDuration'
import type { ServiceItem } from './types'

function item(overrides: Partial<ServiceItem>): ServiceItem {
  return {
    id: 1, ordinal: 0, type: 'song', ref_id: null, payload: {}, title: 'x',
    notes: null, style: null, zoneRouting: null, track: 'main', ...overrides
  }
}

describe('estimateItemDurationSeconds', () => {
  it('reads seconds from a countdown item', () => {
    expect(estimateItemDurationSeconds(item({ type: 'countdown', payload: { seconds: 300 } }))).toBe(300)
  })
  it('reads seconds from a welcome item', () => {
    expect(estimateItemDurationSeconds(item({ type: 'welcome', payload: { seconds: 180 } }))).toBe(180)
  })
  it('returns null for a song (no known duration)', () => {
    expect(estimateItemDurationSeconds(item({ type: 'song' }))).toBeNull()
  })
  it('returns null when seconds is missing', () => {
    expect(estimateItemDurationSeconds(item({ type: 'countdown', payload: {} }))).toBeNull()
  })
  it('returns null when seconds is zero or negative', () => {
    expect(estimateItemDurationSeconds(item({ type: 'countdown', payload: { seconds: 0 } }))).toBeNull()
    expect(estimateItemDurationSeconds(item({ type: 'countdown', payload: { seconds: -5 } }))).toBeNull()
  })
})

describe('estimateServiceDuration', () => {
  it('sums only items with a known duration', () => {
    const items = [
      item({ id: 1, type: 'countdown', payload: { seconds: 300 } }),
      item({ id: 2, type: 'song' }),
      item({ id: 3, type: 'welcome', payload: { seconds: 120 } }),
    ]
    expect(estimateServiceDuration(items)).toEqual({ totalSeconds: 420, knownItemCount: 2, totalItemCount: 3 })
  })
  it('returns zero total for an empty service', () => {
    expect(estimateServiceDuration([])).toEqual({ totalSeconds: 0, knownItemCount: 0, totalItemCount: 0 })
  })
})

describe('formatDurationEstimate', () => {
  it('rounds to the nearest minute with a tilde', () => {
    expect(formatDurationEstimate(3130)).toBe('~52 min')
  })
  it('shows a floor label under one minute', () => {
    expect(formatDurationEstimate(30)).toBe('< 1 min')
  })
})
