import { describe, it, expect, vi } from 'vitest'
import { createSaveQueue, type SaveStatus } from './saveQueue'

function statusRecorder(): { onStatusChange: (s: SaveStatus, e: string | null) => void; log: [SaveStatus, string | null][] } {
  const log: [SaveStatus, string | null][] = []
  return { onStatusChange: (s, e) => log.push([s, e]), log }
}

describe('createSaveQueue', () => {
  it('saves the triggered value and reports saving then saved', async () => {
    const saved: number[] = []
    const { onStatusChange, log } = statusRecorder()
    const q = createSaveQueue<number>({
      save: async (v) => { saved.push(v) },
      onStatusChange,
      notifyFailure: vi.fn()
    })
    q.trigger(1)
    await new Promise((r) => setTimeout(r, 0))
    expect(saved).toEqual([1])
    expect(log).toEqual([['saving', null], ['saved', null]])
  })

  it('serializes overlapping triggers instead of racing them', async () => {
    const order: string[] = []
    const q = createSaveQueue<number>({
      save: async (v) => {
        order.push(`start:${v}`)
        await new Promise((r) => setTimeout(r, v === 1 ? 20 : 0))
        order.push(`end:${v}`)
      },
      onStatusChange: () => {},
      notifyFailure: vi.fn()
    })
    q.trigger(1) // slow save
    q.trigger(2) // arrives while 1 is still in flight
    await new Promise((r) => setTimeout(r, 50))
    // 2 must not start until 1 has fully finished — no interleaving.
    expect(order).toEqual(['start:1', 'end:1', 'start:2', 'end:2'])
  })

  it('coalesces rapid triggers into only the latest pending value', async () => {
    const saved: number[] = []
    let resolveFirst: (() => void) | null = null
    const q = createSaveQueue<number>({
      save: async (v) => {
        saved.push(v)
        if (v === 1) await new Promise<void>((r) => { resolveFirst = r })
      },
      onStatusChange: () => {},
      notifyFailure: vi.fn()
    })
    q.trigger(1) // starts saving immediately
    q.trigger(2) // coalesced while 1 is in flight
    q.trigger(3) // replaces 2 — 2 is never actually saved
    resolveFirst!()
    await new Promise((r) => setTimeout(r, 0))
    expect(saved).toEqual([1, 3])
  })

  it('reports failed with the error message and lets retry re-attempt the same value', async () => {
    let attempt = 0
    const saved: number[] = []
    const notifyFailure = vi.fn()
    const { onStatusChange, log } = statusRecorder()
    const q = createSaveQueue<number>({
      save: async (v) => {
        attempt++
        if (attempt === 1) throw new Error('disk full')
        saved.push(v)
      },
      onStatusChange,
      notifyFailure
    })
    q.trigger(42)
    await new Promise((r) => setTimeout(r, 0))
    expect(log).toEqual([['saving', null], ['failed', 'disk full']])
    expect(notifyFailure).toHaveBeenCalledWith('disk full')
    expect(saved).toEqual([])

    q.retry()
    await new Promise((r) => setTimeout(r, 0))
    expect(saved).toEqual([42])
    expect(log[log.length - 1]).toEqual(['saved', null])
  })

  it('retry is a no-op when nothing has failed', async () => {
    const notifyFailure = vi.fn()
    const q = createSaveQueue<number>({
      save: async () => {},
      onStatusChange: () => {},
      notifyFailure
    })
    q.retry()
    await new Promise((r) => setTimeout(r, 0))
    expect(notifyFailure).not.toHaveBeenCalled()
  })

  it('a trigger after a failure clears the stale failed value so retry cannot resurrect it', async () => {
    let attempt = 0
    const saved: number[] = []
    const q = createSaveQueue<number>({
      save: async (v) => {
        attempt++
        if (attempt === 1) throw new Error('boom')
        saved.push(v)
      },
      onStatusChange: () => {},
      notifyFailure: vi.fn()
    })
    q.trigger(1)
    await new Promise((r) => setTimeout(r, 0))
    q.trigger(2) // operator kept typing after the failure — this supersedes it
    await new Promise((r) => setTimeout(r, 0))
    q.retry() // should be a no-op now, not re-save the stale value 1
    await new Promise((r) => setTimeout(r, 0))
    expect(saved).toEqual([2])
  })
})
