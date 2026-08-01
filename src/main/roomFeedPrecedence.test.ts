import { describe, it, expect, beforeEach } from 'vitest'
import { isRoomFeedActive, setRoomFeedActive } from './roomFeedPrecedence'

describe('roomFeedPrecedence', () => {
  beforeEach(() => { setRoomFeedActive(false) })

  it('starts inactive', () => {
    expect(isRoomFeedActive()).toBe(false)
  })

  it('reflects the last value set', () => {
    setRoomFeedActive(true)
    expect(isRoomFeedActive()).toBe(true)
    setRoomFeedActive(false)
    expect(isRoomFeedActive()).toBe(false)
  })

  it('setting the same value twice is harmless', () => {
    setRoomFeedActive(true)
    setRoomFeedActive(true)
    expect(isRoomFeedActive()).toBe(true)
  })
})
