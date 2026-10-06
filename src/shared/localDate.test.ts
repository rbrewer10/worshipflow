import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { localDateString } from './localDate'

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
      expect(src, f).toMatch(/localDateString\(/)
    }
  })
})
