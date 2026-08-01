import { describe, it, expect, beforeEach } from 'vitest'
import { LivecallRooms } from './livecallRooms'

let rooms: LivecallRooms

beforeEach(() => {
  rooms = new LivecallRooms('secret-token')
})

describe('join', () => {
  it('rejects a bad token', () => {
    const r = rooms.join('p1', { token: 'wrong-token!', role: 'caller', room: 'sanctuary' })
    expect(r.accepted).toBe(false)
    expect(r.reason).toBe('bad-token')
  })

  it('rejects a token of a different length without throwing', () => {
    // timingSafeEqual throws on length mismatch — the length pre-check matters.
    const r = rooms.join('p1', { token: 'short', role: 'caller', room: 'sanctuary' })
    expect(r.accepted).toBe(false)
    expect(r.reason).toBe('bad-token')
  })

  it('rejects a non-string token', () => {
    const r = rooms.join('p1', { token: 12345, role: 'caller', room: 'sanctuary' })
    expect(r.accepted).toBe(false)
    expect(r.reason).toBe('bad-token')
  })

  it('rejects an unknown role', () => {
    const r = rooms.join('p1', { token: 'secret-token', role: 'wat', room: 'sanctuary' })
    expect(r.accepted).toBe(false)
    expect(r.reason).toBe('bad-role')
  })

  it('accepts a caller and reports no peer yet', () => {
    const r = rooms.join('p1', { token: 'secret-token', role: 'caller', room: 'sanctuary' })
    expect(r.accepted).toBe(true)
    expect(r.peerPresent).toBe(false)
    expect(r.notify).toEqual([])
  })

  it('tells the caller the receiver is already present', () => {
    rooms.join('r1', { token: 'secret-token', role: 'receiver', room: 'sanctuary' })
    const r = rooms.join('p1', { token: 'secret-token', role: 'caller', room: 'sanctuary' })
    expect(r.peerPresent).toBe(true)
    expect(r.notify).toEqual(['r1'])
  })

  it('evicts a stale caller when a new one takes the slot', () => {
    rooms.join('p1', { token: 'secret-token', role: 'caller', room: 'sanctuary' })
    const r = rooms.join('p2', { token: 'secret-token', role: 'caller', room: 'sanctuary' })
    expect(r.evicted).toBe('p1')
  })

  it('does not evict when viewers stack up', () => {
    rooms.join('v1', { token: 'secret-token', role: 'viewer', room: 'sanctuary' })
    const r = rooms.join('v2', { token: 'secret-token', role: 'viewer', room: 'sanctuary' })
    expect(r.evicted).toBe(null)
  })

  it('announces a joining viewer to the receiver only', () => {
    rooms.join('r1', { token: 'secret-token', role: 'receiver', room: 'sanctuary' })
    rooms.join('p1', { token: 'secret-token', role: 'caller', room: 'sanctuary' })
    const r = rooms.join('v1', { token: 'secret-token', role: 'viewer', room: 'sanctuary' })
    expect(r.notify).toEqual(['r1'])
  })

  it('hands a joining receiver the viewers that are already waiting', () => {
    // Screens boot before the operator opens WorshipFlow. Without this the relay
    // never learns they exist and they stay black through the whole service.
    rooms.join('v1', { token: 'secret-token', role: 'viewer', room: 'sanctuary' })
    rooms.join('v2', { token: 'secret-token', role: 'viewer', room: 'sanctuary' })
    const r = rooms.join('r1', { token: 'secret-token', role: 'receiver', room: 'sanctuary' })
    expect(r.existingViewers.sort()).toEqual(['v1', 'v2'])
  })

  it('gives a joining viewer no viewer list', () => {
    rooms.join('v1', { token: 'secret-token', role: 'viewer', room: 'sanctuary' })
    const r = rooms.join('v2', { token: 'secret-token', role: 'viewer', room: 'sanctuary' })
    expect(r.existingViewers).toEqual([])
  })

  it('defaults a missing room name to sanctuary', () => {
    rooms.join('r1', { token: 'secret-token', role: 'receiver', room: 'sanctuary' })
    const r = rooms.join('p1', { token: 'secret-token', role: 'caller' })
    expect(r.room).toBe('sanctuary')
    expect(r.peerPresent).toBe(true)
  })

  it('keeps rooms independent', () => {
    rooms.join('r1', { token: 'secret-token', role: 'receiver', room: 'sanctuary' })
    const r = rooms.join('p1', { token: 'secret-token', role: 'caller', room: 'chapel' })
    expect(r.peerPresent).toBe(false)
  })
})

describe('leave', () => {
  it('notifies the caller when the receiver goes', () => {
    rooms.join('r1', { token: 'secret-token', role: 'receiver', room: 'sanctuary' })
    rooms.join('p1', { token: 'secret-token', role: 'caller', room: 'sanctuary' })
    expect(rooms.leave('r1')).toEqual({ role: 'receiver', notify: ['p1'] })
  })

  it('notifies the receiver when a viewer goes', () => {
    rooms.join('r1', { token: 'secret-token', role: 'receiver', room: 'sanctuary' })
    rooms.join('v1', { token: 'secret-token', role: 'viewer', room: 'sanctuary' })
    expect(rooms.leave('v1')).toEqual({ role: 'viewer', notify: ['r1'] })
  })

  it('is a no-op for an unknown peer', () => {
    expect(rooms.leave('nobody')).toBe(null)
  })

  it('does not evict the new socket when a replaced peer closes late', () => {
    // The evicted socket's close event fires AFTER the replacement joined.
    // Leaving must not clear the slot the new peer now owns.
    rooms.join('p1', { token: 'secret-token', role: 'caller', room: 'sanctuary' })
    rooms.join('p2', { token: 'secret-token', role: 'caller', room: 'sanctuary' })
    rooms.leave('p1')
    rooms.join('r1', { token: 'secret-token', role: 'receiver', room: 'sanctuary' })
    expect(rooms.targetsFor('r1', {})).toEqual(['p2'])
  })

  it('drops a departed viewer from the fan-out', () => {
    rooms.join('r1', { token: 'secret-token', role: 'receiver', room: 'sanctuary' })
    rooms.join('v1', { token: 'secret-token', role: 'viewer', room: 'sanctuary' })
    rooms.leave('v1')
    expect(rooms.targetsFor('r1', { to: 'v1' })).toEqual([])
  })
})

describe('targetsFor', () => {
  beforeEach(() => {
    rooms.join('r1', { token: 'secret-token', role: 'receiver', room: 'sanctuary' })
    rooms.join('p1', { token: 'secret-token', role: 'caller', room: 'sanctuary' })
    rooms.join('v1', { token: 'secret-token', role: 'viewer', room: 'sanctuary' })
    rooms.join('v2', { token: 'secret-token', role: 'viewer', room: 'sanctuary' })
  })

  it('routes caller messages to the receiver', () => {
    expect(rooms.targetsFor('p1', {})).toEqual(['r1'])
  })

  it('routes an unaddressed receiver message to the caller', () => {
    expect(rooms.targetsFor('r1', {})).toEqual(['p1'])
  })

  it('routes an addressed receiver message to that viewer only', () => {
    expect(rooms.targetsFor('r1', { to: 'v2' })).toEqual(['v2'])
  })

  it('drops a receiver message addressed to an unknown viewer', () => {
    expect(rooms.targetsFor('r1', { to: 'ghost' })).toEqual([])
  })

  it('routes viewer messages to the receiver', () => {
    expect(rooms.targetsFor('v1', {})).toEqual(['r1'])
  })

  it('returns nothing for a peer that never said hello', () => {
    expect(rooms.targetsFor('unknown', {})).toEqual([])
  })

  it('does not let a viewer address another viewer', () => {
    // `to` is only meaningful from the receiver; a viewer must not be able to
    // reach its neighbours by claiming one.
    expect(rooms.targetsFor('v1', { to: 'v2' })).toEqual(['r1'])
  })
})
