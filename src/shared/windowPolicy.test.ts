import { describe, it, expect } from 'vitest'
import { operatorCloseDecision, outputCloseAllowed, RendererRecovery, crashReasonText } from './windowPolicy'

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
