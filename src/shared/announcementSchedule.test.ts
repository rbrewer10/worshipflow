import { describe, it, expect } from 'vitest'
import { announcementMatchesDate, announcementExpired } from './announcementSchedule'

const base = { active: true as boolean, frequency: 'recurring' as 'once' | 'recurring', startDate: null as string | null, endDate: null as string | null }

describe('announcementMatchesDate', () => {
  it('inactive never matches', () => {
    expect(announcementMatchesDate({ ...base, active: false }, '2026-07-12')).toBe(false)
  })
  it('once matches only its exact date', () => {
    const a = { ...base, frequency: 'once' as const, startDate: '2026-07-12' }
    expect(announcementMatchesDate(a, '2026-07-12')).toBe(true)
    expect(announcementMatchesDate(a, '2026-07-19')).toBe(false)
  })
  it('recurring with no bounds matches any date', () => {
    expect(announcementMatchesDate(base, '2030-01-01')).toBe(true)
  })
  it('recurring respects the window inclusively', () => {
    const a = { ...base, startDate: '2026-07-01', endDate: '2026-07-31' }
    expect(announcementMatchesDate(a, '2026-06-30')).toBe(false)
    expect(announcementMatchesDate(a, '2026-07-01')).toBe(true)
    expect(announcementMatchesDate(a, '2026-07-31')).toBe(true)
    expect(announcementMatchesDate(a, '2026-08-01')).toBe(false)
  })
  it('recurring open-ended (start only) matches from start onward', () => {
    const a = { ...base, startDate: '2026-07-01', endDate: null }
    expect(announcementMatchesDate(a, '2026-06-30')).toBe(false)
    expect(announcementMatchesDate(a, '2026-07-01')).toBe(true)
    expect(announcementMatchesDate(a, '2030-01-01')).toBe(true)
  })
})

describe('announcementExpired', () => {
  it('once is expired the day after its date', () => {
    const a = { frequency: 'once' as const, startDate: '2026-07-12', endDate: null }
    expect(announcementExpired(a, '2026-07-12')).toBe(false)
    expect(announcementExpired(a, '2026-07-13')).toBe(true)
  })
  it('recurring with an end date expires after it', () => {
    const a = { frequency: 'recurring' as const, startDate: '2026-07-01', endDate: '2026-07-31' }
    expect(announcementExpired(a, '2026-07-31')).toBe(false)
    expect(announcementExpired(a, '2026-08-01')).toBe(true)
  })
  it('recurring open-ended never expires', () => {
    const a = { frequency: 'recurring' as const, startDate: '2026-07-01', endDate: null }
    expect(announcementExpired(a, '2999-01-01')).toBe(false)
  })
})
