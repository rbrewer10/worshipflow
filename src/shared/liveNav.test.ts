import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { planNav } from './liveNav'

const base = { hasDeck: false, hasSermonSlides: false, index: 0, lastIndex: 3 }

describe('planNav', () => {
  it('Prev during a countdown does nothing — no item change, no restart, never a frozen lyric slide (Ryan\'s decision; QA B3)', () => {
    expect(planNav(-1, { ...base, mode: 'countdown' })).toEqual({ kind: 'none' })
    // whatever the hidden slide index / deck flags happen to be
    expect(planNav(-1, { ...base, mode: 'countdown', index: 2 })).toEqual({ kind: 'none' })
    expect(planNav(-1, { ...base, mode: 'countdown', hasDeck: true, index: 1 })).toEqual({ kind: 'none' })
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

describe('Countdown Prev wiring (source guard, Ryan\'s decision)', () => {
  const main = readFileSync(join(__dirname, '..', 'main', 'index.ts'), 'utf8').replace(/\r\n/g, '\n')
  it("processIntent returns on 'none' before touching the track (no textHidden reset, no load, no countdown clear)", () => {
    const at = main.indexOf('const action = planNav(dir,')
    expect(at).toBeGreaterThan(-1)
    const after = main.slice(at, at + 1200)
    const none = after.indexOf("if (action.kind === 'none') return")
    expect(none).toBeGreaterThan(-1)
    expect(after.indexOf('t.textHidden = false')).toBeGreaterThan(none)
    expect(after.indexOf('handleTabletLoadItem')).toBeGreaterThan(none)
    expect(after.indexOf('clearCountdown')).toBeGreaterThan(none)
  })
})

// QA B12-N4: Black over a countdown used to clear the timer; any way out of
// Black then froze the last value ("4:58") as a bare lyric on OUT, stage and zones.
describe('Black/Logo over a countdown (QA B12-N4)', () => {
  const nav = { hasDeck: false, hasSermonSlides: false, index: 0, lastIndex: 0, pristine: false }
  it('Next and Prev bring the running countdown back — never un-blank to a lyric', () => {
    for (const mode of ['black', 'logo']) {
      expect(planNav(1, { ...nav, mode, countdown: 'running' })).toEqual({ kind: 'resume-countdown' })
      expect(planNav(-1, { ...nav, mode, countdown: 'running' })).toEqual({ kind: 'resume-countdown' })
    }
  })
  it('a countdown that ran out while hidden: Next moves on (logo if nothing after), Prev stays', () => {
    expect(planNav(1, { ...nav, mode: 'black', countdown: 'done' })).toEqual({ kind: 'adjacent', dir: 1, fallback: 'logo-after-countdown' })
    expect(planNav(-1, { ...nav, mode: 'black', countdown: 'done' })).toEqual({ kind: 'none' })
  })
  it('a song blanked by Black still just un-blanks', () => {
    expect(planNav(1, { ...nav, mode: 'black', lastIndex: 3, countdown: null })).toEqual({ kind: 'unblank' })
  })
  const main = readFileSync(join(__dirname, '..', 'main', 'index.ts'), 'utf8').replace(/\r\n/g, '\n')
  it('Black/Logo keep the countdown timer; Live/Unblack, Next and Prev resume it in countdown mode', () => {
    expect(main).toMatch(/type === 'black'\) \{ if \(!countdownUnder\(track\)\) clearCountdown\(track\); t\.mode = 'black'/)
    expect(main).toMatch(/type === 'logo'\) \{ if \(!countdownUnder\(track\)\) clearCountdown\(track\); t\.mode = 'logo'/)
    expect(main).toMatch(/type === 'lyrics' && countdownUnder\(track\)\) \{\s*\/\/[^\n]*\n\s*resumeCountdown\(track\)/)
    expect(main).toMatch(/action\.kind === 'resume-countdown'\) \{\s*resumeCountdown\(track\)/)
    expect(main).toMatch(/countdown: countdownUnder\(track\)/)
    const fn = main.slice(main.indexOf('function resumeCountdown('), main.indexOf('function resumeCountdown(') + 400)
    expect(fn).toMatch(/if \(t\.countdownTimer\) \{ t\.mode = 'countdown' as Mode/)
    // the timer's own end marks it done (so un-blanking after it ran out shows no frozen 0:00)
    expect(main).toMatch(/clearCountdown\(track\)\n\s*t\.countdownDone = true\n\s*t\.song = \{ title: 'Countdown', lines: \['0:00'\]/)
  })
})

// QA B13-N4/N5: what a countdown leaves behind when it runs out while hidden.
describe('countdown running out under Logo/Black (QA B13-N4, B13-N5) — main wiring', () => {
  const main = readFileSync(join(__dirname, '..', 'main', 'index.ts'), 'utf8').replace(/\r\n/g, '\n')
  const expiry = main.slice(main.indexOf('t.countdownTimer = setInterval(() => {'), main.indexOf("t.song = { title: 'Countdown', lines: [fmt(remaining)], background: bg }\n    broadcast()"))
  it('under Logo it stays on the Logo; visible or under Black it ends on Black', () => {
    expect(expiry).toMatch(/t\.countdownDone = true/)
    expect(expiry).toMatch(/if \(t\.mode !== 'logo'\) t\.mode = 'black'/)
    expect(expiry).not.toMatch(/\n\s*t\.mode = 'black'\n/)
  })
  it('zones routed to the countdown show the logo, not a frozen "0:00", once nothing is counting', () => {
    const zones = main.slice(main.indexOf('function computeZoneStates()'), main.indexOf('function zoneStateFromSlot('))
    const stale = zones.indexOf("} else if (mode === 'countdown' && !t.countdownTimer && t.mode !== 'countdown') {")
    expect(stale).toBeGreaterThan(-1)
    expect(stale).toBeLessThan(zones.indexOf("} else if (mode === 'countdown') {"))
    expect(zones.slice(stale, zones.indexOf("} else if (mode === 'countdown') {"))).toMatch(/base\.mode = 'logo'\n\s*base\.imagePath = logoPath/)
  })
  it('the stage monitor (Zone 4) shows the logo, not "Countdown 0:00", once a countdown ran out (QA B14 Z4)', () => {
    const zones = main.slice(main.indexOf('function computeZoneStates()'), main.indexOf('function zoneStateFromSlot('))
    const guard = zones.indexOf("} else if (mode === 'stage' && countdownUnder(zoneTrack) === 'done' && t.song?.title === 'Countdown' && t.mode !== 'countdown') {")
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(zones.indexOf("} else if (mode === 'stage') {"))
    expect(zones.slice(guard, zones.indexOf("} else if (mode === 'stage') {"))).toMatch(/base\.mode = 'logo'\n\s*base\.imagePath = logoPath/)
  })
})
