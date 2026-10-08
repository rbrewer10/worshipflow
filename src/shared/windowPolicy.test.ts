import { describe, it, expect } from 'vitest'
import { operatorCloseDecision, outputCloseAllowed, RendererRecovery, crashReasonText, wasOnRemovedDisplay, trackShowing, closePromptText, CRASH_RETRY_BACKOFF_MS } from './windowPolicy'

const idle = { isQuitting: false, anyLiveContent: false, obsStreaming: false, obsRecording: false }

describe('operatorCloseDecision (QA A-C2)', () => {
  it('never just closes the operator: with nothing live it quits the whole app', () => {
    expect(operatorCloseDecision(idle)).toBe('quit')
  })
  it('asks first when anything is live, streaming or recording', () => {
    expect(operatorCloseDecision({ ...idle, anyLiveContent: true })).toBe('confirm')
    expect(operatorCloseDecision({ ...idle, obsStreaming: true })).toBe('confirm')
    expect(operatorCloseDecision({ ...idle, obsRecording: true })).toBe('confirm')
  })
  it('lets the window close once the app is already quitting', () => {
    expect(operatorCloseDecision({ ...idle, isQuitting: true, anyLiveContent: true })).toBe('allow')
  })
})

describe('outputCloseAllowed (QA A-H7)', () => {
  it('blocks Alt+F4 on a projector output while running', () => {
    expect(outputCloseAllowed({ isQuitting: false, windowedFallback: false })).toBe(false)
  })
  it('allows it when quitting, or for the manual windowed fallback', () => {
    expect(outputCloseAllowed({ isQuitting: true, windowedFallback: false })).toBe(true)
    expect(outputCloseAllowed({ isQuitting: false, windowedFallback: true })).toBe(true)
  })
})

describe('RendererRecovery (QA A-H3)', () => {
  it('reloads a crashed window, up to 3 times a minute per window', () => {
    const r = new RendererRecovery()
    expect(r.allowReload('output:ext1', 0)).toBe(true)
    expect(r.allowReload('output:ext1', 1000)).toBe(true)
    expect(r.allowReload('output:ext1', 2000)).toBe(true)
    expect(r.allowReload('output:ext1', 3000)).toBe(false)
    // other windows have their own budget
    expect(r.allowReload('operator', 3000)).toBe(true)
    // the budget refills after the window passes
    expect(r.allowReload('output:ext1', 61_000)).toBe(true)
  })
  it('describes crash reasons in plain words', () => {
    expect(crashReasonText('oom')).toBe('ran out of memory')
    expect(crashReasonText('weird')).toBe('stopped')
  })
})

describe('QA A-L4: aux windows on an unplugged display', () => {
  const primary = { x: 0, y: 0, width: 1920, height: 1080 }
  const tv = { x: 1920, y: 0, width: 1920, height: 1080 }
  it('a window centred on the removed display was on it', () => {
    expect(wasOnRemovedDisplay({ x: 1920, y: 0, width: 1920, height: 1080 }, tv, [primary])).toBe(true)
  })
  it('a window already moved by the OS onto no remaining display also counts', () => {
    expect(wasOnRemovedDisplay({ x: 5000, y: 0, width: 800, height: 600 }, tv, [primary])).toBe(true)
  })
  it('a window on the operator screen is left alone', () => {
    expect(wasOnRemovedDisplay({ x: 80, y: 80, width: 960, height: 540 }, tv, [primary])).toBe(false)
  })
})

describe('QA A-N3: a window past the crash cap is retried, not abandoned', () => {
  it('after the cap, retries back off 30 s → 2 min → 5 min', () => {
    const r = new RendererRecovery(3, 60_000)
    for (let i = 0; i < 3; i++) expect(r.allowReload('output:1', i * 1000)).toBe(true)
    expect(r.allowReload('output:1', 4000)).toBe(false)
    expect(r.retryAfterMs('output:1')).toBe(30_000)
    expect(r.allowReload('output:1', 35_000)).toBe(false) // the retry crashed too, still inside the window
    expect(r.retryAfterMs('output:1')).toBe(120_000)
    expect(r.retryAfterMs('output:1')).toBe(CRASH_RETRY_BACKOFF_MS[2])
    expect(r.retryAfterMs('output:1')).toBe(CRASH_RETRY_BACKOFF_MS[2])
  })
  it('once the crash window has passed, crashes reload immediately again and the back-off resets', () => {
    const r = new RendererRecovery(3, 60_000)
    for (let i = 0; i < 3; i++) r.allowReload('k', i)
    expect(r.allowReload('k', 10)).toBe(false)
    r.retryAfterMs('k')
    expect(r.allowReload('k', 200_000)).toBe(true)
    expect(r.retryAfterMs('k')).toBe(30_000)
  })
  it('reset() (the app launched again) clears the cap', () => {
    const r = new RendererRecovery(3, 60_000)
    for (let i = 0; i < 3; i++) r.allowReload('operator', i)
    expect(r.allowReload('operator', 5)).toBe(false)
    r.reset('operator')
    expect(r.allowReload('operator', 6)).toBe(true)
  })
})

describe('QA A-N6: the close prompt reflects what is on screen', () => {
  it('black and logo are not "showing" for songs; lyrics/countdown/announcement/livecall are', () => {
    expect(trackShowing({ hasLiveContent: true, mode: 'black' })).toBe(false)
    expect(trackShowing({ hasLiveContent: true, mode: 'logo' })).toBe(false)
    for (const mode of ['lyrics', 'countdown', 'announcement', 'livecall']) expect(trackShowing({ hasLiveContent: true, mode })).toBe(true)
    expect(trackShowing({ hasLiveContent: false, mode: 'lyrics' })).toBe(false)
  })
  it('a deck/sermon sitting at logo is still showing its slides; Black is not', () => {
    expect(trackShowing({ hasLiveContent: true, mode: 'logo', hasSlides: true })).toBe(true)
    expect(trackShowing({ hasLiveContent: true, mode: 'black', hasSlides: true })).toBe(false)
  })
  it('after Black/Logo with nothing streaming, closing quits without the "projectors are live" prompt', () => {
    expect(operatorCloseDecision({ isQuitting: false, anyLiveContent: trackShowing({ hasLiveContent: true, mode: 'black' }), obsStreaming: false, obsRecording: false })).toBe('quit')
  })
  it('the prompt names the real reason', () => {
    expect(closePromptText({ showing: true, obsStreaming: false, obsRecording: false }).message).toMatch(/showing the service/)
    expect(closePromptText({ showing: false, obsStreaming: true, obsRecording: false }).message).toMatch(/OBS is streaming/)
    expect(closePromptText({ showing: false, obsStreaming: false, obsRecording: true }).message).toMatch(/OBS is recording/)
  })
})
