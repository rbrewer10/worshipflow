import { describe, it, expect } from 'vitest'
import { isTrackId, isZoneId, assertTrackId, assertZoneId, isIntent, isPositiveInt } from './ipcValidate'

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
