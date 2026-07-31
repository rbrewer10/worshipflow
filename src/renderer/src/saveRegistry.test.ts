import { describe, it, expect, vi } from 'vitest'
import { registerSave, unregisterSave, hasFailedSaves, subscribe } from './saveRegistry'

describe('saveRegistry', () => {
  it('reports no failed saves when the registry is empty', () => {
    expect(hasFailedSaves()).toBe(false)
  })

  it('reports a failed save once registered', () => {
    const id = Symbol('test')
    registerSave(id, 'failed')
    expect(hasFailedSaves()).toBe(true)
    unregisterSave(id)
    expect(hasFailedSaves()).toBe(false)
  })

  it('does not report non-failed statuses as failed', () => {
    const id = Symbol('test')
    registerSave(id, 'saving')
    expect(hasFailedSaves()).toBe(false)
    registerSave(id, 'saved')
    expect(hasFailedSaves()).toBe(false)
    unregisterSave(id)
  })

  it('still reports failed if only one of several instances failed', () => {
    const a = Symbol('a')
    const b = Symbol('b')
    registerSave(a, 'saved')
    registerSave(b, 'failed')
    expect(hasFailedSaves()).toBe(true)
    unregisterSave(a)
    unregisterSave(b)
  })

  it('notifies subscribers on register and unregister', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)
    const id = Symbol('test')
    registerSave(id, 'failed')
    expect(listener).toHaveBeenCalledTimes(1)
    unregisterSave(id)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)
    unsubscribe()
    const id = Symbol('test')
    registerSave(id, 'failed')
    unregisterSave(id)
    expect(listener).not.toHaveBeenCalled()
  })
})
