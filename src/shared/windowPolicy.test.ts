import { describe, it, expect } from 'vitest'
import { operatorCloseDecision, outputCloseAllowed, RendererRecovery, crashReasonText, wasOnRemovedDisplay } from './windowPolicy'

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
