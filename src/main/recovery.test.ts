import { describe, it, expect } from 'vitest'
import { isRecoveryStale } from './recovery'

describe('isRecoveryStale', () => {
  const HOUR = 60 * 60 * 1000

  it('is not stale when written just now', () => {
    const now = 1_000_000
    expect(isRecoveryStale({ ts: now }, now, 12 * HOUR)).toBe(false)
  })

  it('is not stale when within the threshold', () => {
    const now = 1_000_000
    expect(isRecoveryStale({ ts: now - 6 * HOUR }, now, 12 * HOUR)).toBe(false)
  })

  it('is stale once past the threshold', () => {
    const now = 1_000_000
    expect(isRecoveryStale({ ts: now - 13 * HOUR }, now, 12 * HOUR)).toBe(true)
  })

  it('is stale exactly at the boundary (strictly greater-than, not >=)', () => {
    const now = 1_000_000
    expect(isRecoveryStale({ ts: now - 12 * HOUR }, now, 12 * HOUR)).toBe(false)
  })

  it('handles a snapshot timestamped in the future without throwing', () => {
    const now = 1_000_000
    expect(isRecoveryStale({ ts: now + HOUR }, now, 12 * HOUR)).toBe(false)
  })
})
