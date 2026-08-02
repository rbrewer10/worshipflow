import { describe, it, expect, afterEach } from 'vitest'
import { markZoneConnected, markZoneDisconnected, getConnectedZoneIds } from './zoneConnections'

describe('zoneConnections', () => {
  // Module-level state persists across tests in this file (same pattern as
  // roomFeedPrecedence.ts) — markZoneDisconnected only clears an entry if the
  // exact socket passed matches what's on record, so each test tracks and
  // releases the sockets it created rather than relying on a blanket reset.
  const toRelease: Array<{ zoneId: 1 | 2 | 3 | 4; socket: unknown }> = []
  afterEach(() => {
    while (toRelease.length) {
      const { zoneId, socket } = toRelease.pop()!
      markZoneDisconnected(zoneId, socket)
    }
  })

  it('starts with no zones connected', () => {
    expect(getConnectedZoneIds()).toEqual([])
  })

  it('marks a zone connected', () => {
    const socket = {}
    markZoneConnected(1, socket)
    toRelease.push({ zoneId: 1, socket })
    expect(getConnectedZoneIds()).toEqual([1])
  })

  it('tracks multiple zones independently', () => {
    const a = {}
    const b = {}
    markZoneConnected(2, a)
    markZoneConnected(4, b)
    toRelease.push({ zoneId: 2, socket: a }, { zoneId: 4, socket: b })
    expect(getConnectedZoneIds().slice().sort()).toEqual([2, 4])
  })

  it('removes a zone on disconnect', () => {
    const socket = {}
    markZoneConnected(3, socket)
    markZoneDisconnected(3, socket)
    expect(getConnectedZoneIds()).not.toContain(3)
  })

  it('does not remove a zone if an older socket disconnects after a reconnect', () => {
    const oldSocket = {}
    const newSocket = {}
    markZoneConnected(1, oldSocket)
    markZoneConnected(1, newSocket) // zone reconnected with a new socket
    markZoneDisconnected(1, oldSocket) // the old connection's close handler fires late
    toRelease.push({ zoneId: 1, socket: newSocket })
    expect(getConnectedZoneIds()).toContain(1) // the newer connection must survive
  })

  it('overwrites the tracked socket when a zone reconnects', () => {
    const oldSocket = {}
    const newSocket = {}
    markZoneConnected(2, oldSocket)
    markZoneConnected(2, newSocket)
    markZoneDisconnected(2, newSocket)
    expect(getConnectedZoneIds()).not.toContain(2)
  })
})
