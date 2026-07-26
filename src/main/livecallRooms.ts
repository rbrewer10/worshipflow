/**
 * Live Call — room/peer state machine.
 *
 * Pure logic: no sockets, no timers, no I/O. The socket wrapper in
 * livecallSignaling.ts translates these results into sends. Everything worth
 * testing about signaling lives here.
 *
 * A room is one call pairing: one caller (the phone), one receiver (the control
 * renderer that relays to screens), and any number of viewers (the screens).
 */
import { timingSafeEqual } from 'crypto'

export type Role = 'caller' | 'receiver' | 'viewer'

export interface HelloMessage {
  token?: unknown
  role?: unknown
  room?: unknown
}

export interface JoinResult {
  accepted: boolean
  reason?: 'bad-token' | 'bad-role'
  role?: Role
  room?: string
  /** Peer id bumped out of a single-occupancy slot, if any. */
  evicted: string | null
  /** Peer ids to notify that this peer arrived. */
  notify: string[]
  /**
   * Viewers already in the room, for a joining receiver only. Screens boot
   * before the operator opens WorshipFlow, so without this the relay never
   * learns they exist and they stay black through the whole service.
   */
  existingViewers: string[]
  /** For caller/viewer: is the receiver already here? For receiver: is the caller? */
  peerPresent: boolean
}

export interface LeaveResult {
  role: Role
  notify: string[]
}

interface Room {
  caller: string | null
  receiver: string | null
  viewers: Set<string>
}

interface PeerRef {
  role: Role
  room: string
}

function tokensMatch(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string') return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  // timingSafeEqual throws unless the lengths match, so check length first.
  // Length is not secret; the bytes are.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export class LivecallRooms {
  private rooms = new Map<string, Room>()
  private peers = new Map<string, PeerRef>()

  constructor(private token: string) {}

  private room(id: string): Room {
    let r = this.rooms.get(id)
    if (!r) {
      r = { caller: null, receiver: null, viewers: new Set() }
      this.rooms.set(id, r)
    }
    return r
  }

  join(peerId: string, msg: HelloMessage): JoinResult {
    const rejected = {
      accepted: false as const, evicted: null, notify: [], existingViewers: [], peerPresent: false
    }
    if (!tokensMatch(msg.token, this.token)) {
      return { ...rejected, reason: 'bad-token' }
    }
    const role = msg.role
    if (role !== 'caller' && role !== 'receiver' && role !== 'viewer') {
      return { ...rejected, reason: 'bad-role' }
    }

    const roomId = typeof msg.room === 'string' && msg.room ? msg.room : 'sanctuary'
    const room = this.room(roomId)

    let evicted: string | null = null
    if (role === 'viewer') {
      room.viewers.add(peerId)
    } else {
      // Single-occupancy slot. A stale socket sitting here means the peer
      // reconnected (hotel wifi handoff) — the newest connection wins.
      const existing = room[role]
      if (existing && existing !== peerId) {
        evicted = existing
        this.peers.delete(existing)
      }
      room[role] = peerId
    }
    this.peers.set(peerId, { role, room: roomId })

    // The receiver is the hub: it needs to know about everyone. The caller only
    // cares about the receiver. Viewers are told nothing about each other.
    const notify: string[] = []
    if (role === 'viewer' || role === 'caller') {
      if (room.receiver) notify.push(room.receiver)
    } else {
      if (room.caller) notify.push(room.caller)
      for (const v of room.viewers) notify.push(v)
    }

    const peerPresent = role === 'receiver' ? !!room.caller : !!room.receiver
    const existingViewers = role === 'receiver' ? [...room.viewers] : []

    return { accepted: true, role, room: roomId, evicted, notify, existingViewers, peerPresent }
  }

  leave(peerId: string): LeaveResult | null {
    const ref = this.peers.get(peerId)
    if (!ref) return null
    this.peers.delete(peerId)

    const room = this.room(ref.room)
    const notify: string[] = []

    if (ref.role === 'viewer') {
      room.viewers.delete(peerId)
      if (room.receiver) notify.push(room.receiver)
    } else {
      // Only clear the slot if this peer still owns it. An evicted socket's
      // close event arrives after its replacement joined; clearing here would
      // orphan the live connection.
      if (room[ref.role] === peerId) {
        room[ref.role] = null
        if (ref.role === 'caller') {
          if (room.receiver) notify.push(room.receiver)
        } else {
          if (room.caller) notify.push(room.caller)
          for (const v of room.viewers) notify.push(v)
        }
      }
    }

    return { role: ref.role, notify }
  }

  /** Who a relayed message from `peerId` should be delivered to. */
  targetsFor(peerId: string, msg: { to?: unknown }): string[] {
    const ref = this.peers.get(peerId)
    if (!ref) return []
    const room = this.room(ref.room)

    // A viewer's `to` is ignored on purpose — only the receiver addresses peers,
    // so a screen cannot reach its neighbours by claiming one.
    if (ref.role === 'caller' || ref.role === 'viewer') {
      return room.receiver ? [room.receiver] : []
    }

    // Receiver: addressed messages go to that viewer, unaddressed to the caller.
    if (typeof msg.to === 'string') {
      return room.viewers.has(msg.to) ? [msg.to] : []
    }
    return room.caller ? [room.caller] : []
  }
}
