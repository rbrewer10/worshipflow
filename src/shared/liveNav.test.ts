import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
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
  it('QA B3-N8: Space on an announcement card moves on — never redraws it as a lyric slide; at the end it stays put', () => {
    expect(planNav(1, { ...base, mode: 'announcement' })).toEqual({ kind: 'adjacent', dir: 1, fallback: 'none' })
    expect(planNav(-1, { ...base, mode: 'announcement' })).toEqual({ kind: 'adjacent', dir: -1, fallback: 'none' })
  })
  it('QA B4-N2: an announcement BLOCK (deck) steps through every announcement, then moves on', () => {
    const block = { ...base, mode: 'announcement', hasDeck: true, lastIndex: 2 }
    expect(planNav(1, { ...block, index: 0 })).toEqual({ kind: 'step', delta: 1 })
    expect(planNav(1, { ...block, index: 1 })).toEqual({ kind: 'step', delta: 1 })
    expect(planNav(1, { ...block, index: 2 })).toEqual({ kind: 'adjacent', dir: 1, fallback: 'none' })
    expect(planNav(-1, { ...block, index: 2 })).toEqual({ kind: 'step', delta: -1 })
    expect(planNav(-1, { ...block, index: 0 })).toEqual({ kind: 'adjacent', dir: -1, fallback: 'none' })
    // a two-announcement block, as in QA's repro
    expect(planNav(1, { ...base, mode: 'announcement', hasDeck: true, index: 0, lastIndex: 1 })).toEqual({ kind: 'step', delta: 1 })
    expect(planNav(1, { ...base, mode: 'announcement', hasDeck: true, index: 1, lastIndex: 1 })).toEqual({ kind: 'adjacent', dir: 1, fallback: 'none' })
  })
  it('B3-N8 still holds for a single announcement card (no deck), whatever its index', () => {
    expect(planNav(1, { ...base, mode: 'announcement', index: 0, lastIndex: 0 })).toEqual({ kind: 'adjacent', dir: 1, fallback: 'none' })
    expect(planNav(1, { ...base, mode: 'announcement', index: 0, lastIndex: 3 })).toEqual({ kind: 'adjacent', dir: 1, fallback: 'none' })
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
  it('QA B2-N3: with nothing live yet, Next starts the service and Prev does nothing — never steps the hidden index', () => {
    expect(planNav(1, { ...base, mode: 'lyrics', pristine: true })).toEqual({ kind: 'start' })
    expect(planNav(-1, { ...base, mode: 'lyrics', pristine: true })).toEqual({ kind: 'none' })
    expect(planNav(1, { ...base, mode: 'logo', pristine: true })).toEqual({ kind: 'start' })
  })
  it('once something is live, pristine=false keeps the normal table', () => {
    expect(planNav(1, { ...base, mode: 'lyrics', index: 1, pristine: false })).toEqual({ kind: 'step', delta: 1 })
  })
})

describe('B2-N3 wiring (source guard)', () => {
  const main = readFileSync(join(__dirname, '..', 'main', 'index.ts'), 'utf8')
  it('processIntent passes pristine and starts on the first go-live item', () => {
    expect(main).toMatch(/pristine: !t\.hasLiveContent && t\.serviceItemId == null/)
    expect(main).toMatch(/action\.kind === 'start'\) \{[\s\S]{0,300}activeServiceItems\.find\(\(it\) => it\.track === track && itemCanGoLive\(it\)\)/)
  })
})
