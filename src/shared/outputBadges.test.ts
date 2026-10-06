import { describe, expect, it } from 'vitest'
import { IDENTIFY_MS, outputBadges } from './outputBadges'

describe('outputBadges (QA B13 / A-M6)', () => {
  it('a packaged build never shows the fps meter on the projector', () => {
    expect(outputBadges({ dev: false, diag: false, msSinceOpen: 0 }).fps).toBe(false)
    expect(outputBadges({ dev: false, diag: false, msSinceOpen: 60_000 }).fps).toBe(false)
  })
  it('a packaged build shows "OUT n" only briefly after the window opens', () => {
    expect(outputBadges({ dev: false, diag: false, msSinceOpen: 1000 }).id).toBe(true)
    expect(outputBadges({ dev: false, diag: false, msSinceOpen: IDENTIFY_MS }).id).toBe(false)
    expect(outputBadges({ dev: false, diag: false, msSinceOpen: 3_600_000 }).id).toBe(false)
  })
  it('dev builds and ?diag=1 keep both badges', () => {
    expect(outputBadges({ dev: true, diag: false, msSinceOpen: 99_999 })).toEqual({ fps: true, id: true })
    expect(outputBadges({ dev: false, diag: true, msSinceOpen: 99_999 })).toEqual({ fps: true, id: true })
  })
})
