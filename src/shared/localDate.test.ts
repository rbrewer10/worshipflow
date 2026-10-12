import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { localDateString, upcomingSundayLocal } from './localDate'

describe('QA B2-N7: an imported setlist is dated today, local time', () => {
  it('uses local calendar fields, not UTC', () => {
    // 9:30 PM local on Oct 11 — in EDT that is already Oct 12 in UTC.
    const evening = new Date(2026, 9, 11, 21, 30)
    expect(localDateString(evening)).toBe('2026-10-11')
    expect(localDateString(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
  })
  it('SetlistImport no longer uses toISOString() for the service date', () => {
    const src = readFileSync(join(__dirname, '../renderer/src/SetlistImport.tsx'), 'utf8')
    expect(src).not.toMatch(/toISOString\(\)\.slice\(0, ?10\)/)
    expect(src).toMatch(/serviceCreate\('Imported setlist', today\)/)
    expect(src).toMatch(/const today = localDateString\(\)/)
  })
  it('no other "today" in the app is computed in UTC either (announcement expiry, next Sunday, default service, CCLI file name)', () => {
    for (const f of ['main/db.ts', 'renderer/src/ServiceBuilder.tsx', 'renderer/src/AnnouncementEditor.tsx', 'renderer/src/VolunteerView.tsx', 'renderer/src/CcliPanel.tsx']) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8')
      expect(src, f).not.toMatch(/toISOString\(\)\.slice\(0, ?10\)/)
      expect(src, f).toMatch(/localDateString\(|upcomingSundayLocal\(/)
    }
  })
})

describe('QA B3-N7: Start Sunday / new service on a Sunday means today', () => {
  it('Sunday morning → today; any other day → the coming Sunday', () => {
    expect(upcomingSundayLocal(new Date(2026, 9, 11, 8, 30))).toBe('2026-10-11') // Sun 8:30 AM
    expect(upcomingSundayLocal(new Date(2026, 9, 11, 23, 59))).toBe('2026-10-11')
    expect(upcomingSundayLocal(new Date(2026, 9, 12, 0, 1))).toBe('2026-10-18') // Mon
    expect(upcomingSundayLocal(new Date(2026, 9, 10, 21, 30))).toBe('2026-10-11') // Sat night
    expect(upcomingSundayLocal(new Date(2026, 11, 28))).toBe('2027-01-03') // across a year
  })
  it('ServiceBuilder uses it (no more "|| 7")', () => {
    const src = readFileSync(join(__dirname, '../renderer/src/ServiceBuilder.tsx'), 'utf8')
    expect(src).toMatch(/upcomingSundayLocal\(new Date\(\)\)/)
    expect(src).not.toMatch(/% 7 \|\| 7/)
  })
})
