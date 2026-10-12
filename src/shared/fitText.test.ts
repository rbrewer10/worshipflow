import { describe, it, expect } from 'vitest'
import { fitScale } from './fitText'

// Model: text height grows linearly with font scale.
const fitsUnder = (contentAtFull: number, room: number) => (k: number) => contentAtFull * k <= room

describe('fitScale (QA B4: main output shrinks long slides to fit)', () => {
  it('keeps the requested size when it already fits', () => {
    expect(fitScale(fitsUnder(500, 1000))).toBe(1)
  })
  it('shrinks to the largest size that fits (Holy, Holy, Holy v1: 1151px of text in a 950px box)', () => {
    const k = fitScale(fitsUnder(1151, 950))
    expect(1151 * k).toBeLessThanOrEqual(950)
    expect(1151 * k).toBeGreaterThan(940)
  })
  it('never goes below the minimum', () => {
    expect(fitScale(fitsUnder(10_000, 100), { min: 0.35 })).toBe(0.35)
  })
})
