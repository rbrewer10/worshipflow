import { describe, it, expect } from 'vitest'
import { planNav } from './liveNav'

const base = { hasDeck: false, hasSermonSlides: false, index: 0, lastIndex: 3 }

describe('planNav', () => {
  it('QA B3: Prev during a countdown goes to the previous item — never un-blanks it into a frozen lyric slide', () => {
    expect(planNav(-1, { ...base, mode: 'countdown' })).toEqual({ kind: 'adjacent', dir: -1, fallback: 'none' })
  })
  it('Next during a countdown goes to the next item, else the logo', () => {
    expect(planNav(1, { ...base, mode: 'countdown' })).toEqual({ kind: 'adjacent', dir: 1, fallback: 'logo-after-countdown' })
  })
  it('live call steps between items in both directions', () => {
    expect(planNav(1, { ...base, mode: 'livecall' })).toEqual({ kind: 'adjacent', dir: 1, fallback: 'logo' })
    expect(planNav(-1, { ...base, mode: 'livecall' })).toEqual({ kind: 'adjacent', dir: -1, fallback: 'logo' })
  })
  it('black / logo un-blank back to the slide', () => {
    expect(planNav(1, { ...base, mode: 'black' })).toEqual({ kind: 'unblank' })
    expect(planNav(-1, { ...base, mode: 'logo' })).toEqual({ kind: 'unblank' })
  })
  it('a sermon (deck or verses) at mode logo steps instead of un-blanking', () => {
    expect(planNav(1, { ...base, mode: 'logo', hasDeck: true })).toEqual({ kind: 'step', delta: 1 })
    expect(planNav(1, { ...base, mode: 'logo', hasSermonSlides: true })).toEqual({ kind: 'step', delta: 1 })
  })
  it('steps within an item, then moves to the adjacent item at the ends', () => {
    expect(planNav(1, { ...base, mode: 'lyrics', index: 1 })).toEqual({ kind: 'step', delta: 1 })
    expect(planNav(1, { ...base, mode: 'lyrics', index: 3 })).toEqual({ kind: 'adjacent', dir: 1, fallback: 'none' })
    expect(planNav(-1, { ...base, mode: 'lyrics', index: 2 })).toEqual({ kind: 'step', delta: -1 })
    expect(planNav(-1, { ...base, mode: 'lyrics', index: 0 })).toEqual({ kind: 'adjacent', dir: -1, fallback: 'none' })
  })
})
