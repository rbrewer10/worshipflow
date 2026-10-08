import { describe, expect, it } from 'vitest'
import { nextSundayIso } from './sampleSunday'

describe('nextSundayIso (QA B23: Sample Sunday gets a date)', () => {
  it('a Tuesday → the coming Sunday', () => expect(nextSundayIso(new Date(2026, 9, 6, 9, 0))).toBe('2026-10-11'))
  it('a Sunday → today', () => expect(nextSundayIso(new Date(2026, 9, 11, 23, 30))).toBe('2026-10-11'))
  it('a Saturday late at night → tomorrow, across a month end', () => expect(nextSundayIso(new Date(2026, 9, 31, 23, 59))).toBe('2026-11-01'))
})
