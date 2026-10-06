import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { nextOrderSnapshot, pickAdjacentItem, splitLiveFromDeletion } from './deckAdjacent'

const items = (ids: number[]): Array<{ id: number; live?: boolean }> => ids.map((id) => ({ id }))
const yes = (): boolean => true

describe('pickAdjacentItem (QA B10)', () => {
  it('normal case: neighbours of the live item', () => {
    expect(pickAdjacentItem(items([1, 2, 3]), 2, 1, yes)?.id).toBe(3)
    expect(pickAdjacentItem(items([1, 2, 3]), 2, -1, yes)?.id).toBe(1)
    expect(pickAdjacentItem(items([1, 2, 3]), 3, 1, yes)).toBeUndefined()
  })
  it('skips items that cannot go live', () => {
    expect(pickAdjacentItem(items([1, 2, 3, 4]), 1, 1, (it) => it.id !== 2)?.id).toBe(3)
  })
  it('QA repro: live item deleted (with a neighbour) → Next still reaches the following item', () => {
    // Service 10,11(live),12,13. Operator multi-deletes 11 and 12.
    const before = [10, 11, 12, 13]
    const after = items([10, 13])
    expect(pickAdjacentItem(after, 11, 1, yes)).toBeUndefined() // the old behaviour: stuck
    expect(pickAdjacentItem(after, 11, 1, yes, before)?.id).toBe(13)
    expect(pickAdjacentItem(after, 11, -1, yes, before)?.id).toBe(10)
  })
  it('no snapshot, or a snapshot without the live item → undefined', () => {
    expect(pickAdjacentItem(items([1]), 9, 1, yes, [1, 2])).toBeUndefined()
    expect(pickAdjacentItem(items([1]), null, 1, yes, [1, 2])).toBeUndefined()
  })
})

describe('nextOrderSnapshot', () => {
  it('keeps the last order that still contained the live item', () => {
    let snap = nextOrderSnapshot([1, 2, 3], 2, null)
    expect(snap).toEqual([1, 2, 3])
    snap = nextOrderSnapshot([1, 3], 2, snap) // reload after the delete
    expect(snap).toEqual([1, 2, 3])
    snap = nextOrderSnapshot([1, 3, 4], 2, snap) // another reload
    expect(snap).toEqual([1, 2, 3])
  })
  it('clears when nothing is live', () => {
    expect(nextOrderSnapshot([1, 2], null, [1, 2])).toBeNull()
  })
})

describe('splitLiveFromDeletion (QA B10)', () => {
  it('a multi-selection that includes the live item never deletes it', () => {
    const sel = items([4, 7, 9])
    const r = splitLiveFromDeletion(sel, 7)
    expect(r.deletable.map((x) => x.id)).toEqual([4, 9])
    expect(r.skippedLive?.id).toBe(7)
  })
  it('nothing live → everything deletable', () => {
    expect(splitLiveFromDeletion(items([1, 2]), null)).toEqual({ deletable: items([1, 2]), skippedLive: null })
  })
})

describe('wiring guards (QA B10)', () => {
  // index.ts imports Electron, so check the source instead of importing it.
  const main = readFileSync(join(__dirname, '../main/index.ts'), 'utf8')
  const deck = readFileSync(join(__dirname, '../renderer/src/ServiceDeck.tsx'), 'utf8')
  it('Next/Prev use the snapshot-aware lookup', () => {
    expect(main).toMatch(/pickAdjacentItem\(trackItems, t\.serviceItemId, dir, itemCanGoLive, liveOrderSnapshot\[track\]\)/)
    expect(main).toMatch(/liveOrderSnapshot\[track\] = sameService/)
  })
  it('multi-select delete passes only the non-live items on', () => {
    expect(deck).toMatch(/splitLiveFromDeletion\(selectedItems, liveItemId\)/)
    expect(deck).toMatch(/onBatchDelete\(deletable\)/)
  })
})
