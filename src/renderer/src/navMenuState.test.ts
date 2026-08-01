import { describe, it, expect } from 'vitest'
import { navMenuReducer, initialNavMenuState } from './navMenuState'
import type { NavMenuState } from './navMenuState'

const COUNT = 4
const reduce = (state: NavMenuState, action: Parameters<typeof navMenuReducer>[1]): NavMenuState =>
  navMenuReducer(state, action, COUNT)

const openState: NavMenuState = { open: true, highlighted: -1 }

describe('navMenuState', () => {
  it('starts closed with nothing highlighted', () => {
    expect(initialNavMenuState).toEqual({ open: false, highlighted: -1 })
  })

  it('opens onto the first item for ArrowDown on the trigger', () => {
    expect(reduce(initialNavMenuState, { type: 'openAtFirst' })).toEqual({ open: true, highlighted: 0 })
  })

  it('opens onto the last item for ArrowUp on the trigger', () => {
    expect(reduce(initialNavMenuState, { type: 'openAtLast' })).toEqual({ open: true, highlighted: 3 })
  })

  it('toggles closed when already open', () => {
    expect(reduce(openState, { type: 'toggle' })).toEqual({ open: false, highlighted: -1 })
  })

  it('toggles open when closed', () => {
    expect(reduce(initialNavMenuState, { type: 'toggle' })).toEqual({ open: true, highlighted: -1 })
  })

  it('clears the highlight when closing', () => {
    expect(reduce({ open: true, highlighted: 2 }, { type: 'close' })).toEqual({ open: false, highlighted: -1 })
  })

  it('moves the highlight to the first item from nothing highlighted', () => {
    expect(reduce(openState, { type: 'next' }).highlighted).toBe(0)
  })

  it('wraps forward past the last item', () => {
    expect(reduce({ open: true, highlighted: 3 }, { type: 'next' }).highlighted).toBe(0)
  })

  it('wraps backward past the first item', () => {
    expect(reduce({ open: true, highlighted: 0 }, { type: 'prev' }).highlighted).toBe(3)
  })

  it('moves to the last item pressing prev with nothing highlighted', () => {
    expect(reduce(openState, { type: 'prev' }).highlighted).toBe(3)
  })

  it('jumps to the first and last items', () => {
    expect(reduce({ open: true, highlighted: 2 }, { type: 'first' }).highlighted).toBe(0)
    expect(reduce({ open: true, highlighted: 2 }, { type: 'last' }).highlighted).toBe(3)
  })

  it('sets an explicit highlight for mouse hover', () => {
    expect(reduce(openState, { type: 'highlight', index: 2 }).highlighted).toBe(2)
  })

  it('ignores an out-of-range explicit highlight', () => {
    expect(reduce(openState, { type: 'highlight', index: 9 }).highlighted).toBe(-1)
    expect(reduce(openState, { type: 'highlight', index: -3 }).highlighted).toBe(-1)
  })

  it('never moves the highlight while closed', () => {
    expect(reduce(initialNavMenuState, { type: 'next' })).toEqual(initialNavMenuState)
    expect(reduce(initialNavMenuState, { type: 'prev' })).toEqual(initialNavMenuState)
  })

  it('leaves nothing highlighted when the menu has no items', () => {
    expect(navMenuReducer(initialNavMenuState, { type: 'openAtFirst' }, 0)).toEqual({ open: true, highlighted: -1 })
    expect(navMenuReducer({ open: true, highlighted: -1 }, { type: 'next' }, 0).highlighted).toBe(-1)
  })

  it('opens onto nothing rather than a negative index when the menu is empty', () => {
    expect(navMenuReducer(initialNavMenuState, { type: 'openAtLast' }, 0)).toEqual({ open: true, highlighted: -1 })
  })

  it('never jumps to first or last while closed', () => {
    expect(reduce(initialNavMenuState, { type: 'first' })).toEqual(initialNavMenuState)
    expect(reduce(initialNavMenuState, { type: 'last' })).toEqual(initialNavMenuState)
  })

  it('ignores hover highlighting while closed', () => {
    expect(reduce(initialNavMenuState, { type: 'highlight', index: 1 })).toEqual(initialNavMenuState)
  })
})
