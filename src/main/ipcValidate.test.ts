import { describe, it, expect } from 'vitest'
import { isTrackId, isZoneId, assertTrackId, assertZoneId, isIntent, isPositiveInt, isIsoDate, assertIsoDateOrNull } from './ipcValidate'

describe('isTrackId', () => {
  it('accepts main and second', () => {
    expect(isTrackId('main')).toBe(true)
    expect(isTrackId('second')).toBe(true)
  })
  it('rejects anything else', () => {
    expect(isTrackId('third')).toBe(false)
    expect(isTrackId(undefined)).toBe(false)
    expect(isTrackId(null)).toBe(false)
    expect(isTrackId(1)).toBe(false)
  })
})

describe('isZoneId', () => {
  it('accepts 1-4', () => {
    for (const z of [1, 2, 3, 4]) expect(isZoneId(z)).toBe(true)
  })
  it('rejects out-of-range or non-numeric values', () => {
    expect(isZoneId(0)).toBe(false)
    expect(isZoneId(5)).toBe(false)
    expect(isZoneId('1')).toBe(false)
    expect(isZoneId(undefined)).toBe(false)
  })
})

describe('assertTrackId', () => {
  it('returns the value when valid', () => {
    expect(assertTrackId('main')).toBe('main')
  })
  it('throws a message naming the parameter and the bad value', () => {
    expect(() => assertTrackId('bogus')).toThrow(/Invalid track.*"bogus"/)
    expect(() => assertTrackId(undefined, 'track')).toThrow(/Invalid track/)
  })
})

describe('assertZoneId', () => {
  it('returns the value when valid', () => {
    expect(assertZoneId(2)).toBe(2)
  })
  it('throws a message naming the parameter and the bad value', () => {
    expect(() => assertZoneId(9, 'zoneId')).toThrow(/Invalid zoneId.*9/)
  })
})

describe('isIntent', () => {
  it('accepts every real intent', () => {
    for (const i of ['next', 'prev', 'black', 'logo', 'lyrics']) expect(isIntent(i)).toBe(true)
  })
  it('rejects unrecognized or non-string values', () => {
    expect(isIntent('bogus')).toBe(false)
    expect(isIntent(undefined)).toBe(false)
    expect(isIntent(123)).toBe(false)
  })
})

describe('isPositiveInt', () => {
  it('accepts positive integers', () => {
    expect(isPositiveInt(1)).toBe(true)
    expect(isPositiveInt(42)).toBe(true)
  })
  it('rejects zero, negatives, floats, and non-numbers', () => {
    expect(isPositiveInt(0)).toBe(false)
    expect(isPositiveInt(-1)).toBe(false)
    expect(isPositiveInt(1.5)).toBe(false)
    expect(isPositiveInt('1')).toBe(false)
    expect(isPositiveInt(undefined)).toBe(false)
  })
})

describe('isIsoDate', () => {
  it('accepts a real calendar day', () => {
    expect(isIsoDate('2026-08-01')).toBe(true)
    expect(isIsoDate('2026-12-31')).toBe(true)
  })
  it('accepts a leap day in a leap year and rejects it otherwise', () => {
    expect(isIsoDate('2024-02-29')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
  })
  it('rejects a day the month does not have', () => {
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-04-31')).toBe(false)
  })
  it('rejects out-of-range months and days', () => {
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('2026-00-10')).toBe(false)
    expect(isIsoDate('2026-08-00')).toBe(false)
  })
  it('rejects anything that is not a bare YYYY-MM-DD string', () => {
    expect(isIsoDate('2026-8-1')).toBe(false)
    expect(isIsoDate('08/01/2026')).toBe(false)
    expect(isIsoDate('2026-08-01T00:00:00Z')).toBe(false)
    expect(isIsoDate('')).toBe(false)
    expect(isIsoDate(null)).toBe(false)
    expect(isIsoDate(20260801)).toBe(false)
  })
})

describe('assertIsoDateOrNull', () => {
  it('passes a valid date straight through', () => {
    expect(assertIsoDateOrNull('2026-08-01')).toBe('2026-08-01')
  })
  it('treats null and undefined as "no date set"', () => {
    expect(assertIsoDateOrNull(null)).toBeNull()
    expect(assertIsoDateOrNull(undefined)).toBeNull()
  })
  it('throws a message naming the parameter and the bad value', () => {
    expect(() => assertIsoDateOrNull('nope', 'serviceDate')).toThrow(/serviceDate.*nope/)
  })
})
