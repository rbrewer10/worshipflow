import { describe, it, expect } from 'vitest'
import { stateOrderGuard } from './stateOrder'

describe('stateOrderGuard (QA B6-N1: a stale live-state payload never redraws over a newer one)', () => {
  it('drops a payload older than one already drawn', () => {
    const accept = stateOrderGuard()
    // The B6-N1 sequence: pre-deck (2) arrives after the deck summary (3) and the numbered deck text (4).
    expect([1, 3, 4, 2].map(accept)).toEqual([true, true, true, false])
  })
  it('lets the same payload through to every listener in the window', () => {
    const accept = stateOrderGuard()
    expect([5, 5, 5, 6, 6].map(accept)).toEqual([true, true, true, true, true])
  })
  it('passes payloads with no sequence number (older main, browser mock)', () => {
    const accept = stateOrderGuard()
    expect(accept(7)).toBe(true)
    expect(accept(undefined)).toBe(true)
    expect(accept(Number.NaN)).toBe(true)
    expect(accept(6)).toBe(false)
  })
  it('each window keeps its own order', () => {
    const a = stateOrderGuard(); const b = stateOrderGuard()
    expect(a(10)).toBe(true)
    expect(b(3)).toBe(true)
  })
})
