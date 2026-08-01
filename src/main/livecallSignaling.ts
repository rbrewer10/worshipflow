/**
 * Live Call — signaling socket wrapper.
 *
 * Owns socket lifecycle only; all routing decisions come from LivecallRooms.
 * Never touches media: WebRTC handshake JSON in, WebRTC handshake JSON out.
 * Never touches tabletClients — livecall peers must not receive service state.
 */
import { randomUUID } from 'crypto'
import type { WebSocketServer, WebSocket as WsSocket } from 'ws'
import { LivecallRooms } from './livecallRooms'

const RELAY_TYPES = ['offer', 'answer', 'ice-candidate', 'bye']
const HEARTBEAT_MS = 15000

// Everything arrives as untrusted JSON. `token`/`role`/`room` are named so a
// hello frame satisfies HelloMessage without a cast; the index signature covers
// the relayed WebRTC payloads, which this module never inspects.
interface Msg {
  type?: unknown
  to?: unknown
  token?: unknown
  role?: unknown
  room?: unknown
  [k: string]: unknown
}

export function attachLivecallSignaling(wss: WebSocketServer, token: string): () => void {
  const rooms = new LivecallRooms(token)
  const sockets = new Map<string, WsSocket>()
  const alive = new WeakSet<WsSocket>()

  const send = (peerId: string, obj: unknown): void => {
    const ws = sockets.get(peerId)
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj))
  }

  wss.on('connection', (ws: WsSocket) => {
    const peerId = randomUUID()
    sockets.set(peerId, ws)
    alive.add(ws)
    ws.on('pong', () => alive.add(ws))

    ws.on('message', (raw) => {
      let msg: Msg
      try {
        msg = JSON.parse(raw.toString()) as Msg
      } catch {
        return // ignore malformed frames
      }

      if (msg.type === 'hello') {
        const result = rooms.join(peerId, msg)
        console.log(`[livecall] hello role=${String(msg.role)} room=${String(msg.room)} id=${peerId.slice(0, 8)} accepted=${result.accepted} evicted=${result.evicted ? result.evicted.slice(0, 8) : 'none'}`)
        if (!result.accepted) {
          send(peerId, { type: 'error', reason: result.reason })
          ws.close(result.reason === 'bad-token' ? 4001 : 4002, result.reason)
          return
        }
        if (result.evicted) {
          send(result.evicted, { type: 'replaced' })
          sockets.get(result.evicted)?.close(4003, 'replaced-by-new-connection')
          sockets.delete(result.evicted)
        }
        send(peerId, {
          type: 'joined',
          role: result.role,
          room: result.room,
          peerPresent: result.peerPresent,
        })
        for (const other of result.notify) {
          send(other, result.role === 'viewer'
            ? { type: 'viewer-joined', id: peerId }
            : { type: 'peer-joined', role: result.role })
        }
        // A receiver arriving late must be told about screens that connected
        // while it was closed, or they never get an offer.
        for (const viewerId of result.existingViewers) {
          send(peerId, { type: 'viewer-joined', id: viewerId })
        }
        return
      }

      if (typeof msg.type !== 'string' || !RELAY_TYPES.includes(msg.type)) return

      // Stamp the sender so the receiver knows which viewer answered. The
      // relay addresses each viewer individually, so this must be the
      // server's value, not something a client can claim for itself.
      const outbound = { ...msg, from: peerId }
      for (const target of rooms.targetsFor(peerId, msg)) send(target, outbound)
    })

    const cleanup = (): void => {
      sockets.delete(peerId)
      const result = rooms.leave(peerId)
      if (!result) return
      for (const other of result.notify) {
        send(other, result.role === 'viewer'
          ? { type: 'viewer-left', id: peerId }
          : { type: 'peer-left', role: result.role })
      }
    }
    ws.on('close', cleanup)
    ws.on('error', cleanup)
  })

  // Hotel wifi drops often never fire a close event.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients as Set<WsSocket>) {
      if (!alive.has(ws)) {
        try { ws.terminate() } catch { /* already gone */ }
        continue
      }
      alive.delete(ws)
      try { ws.ping() } catch { /* already gone */ }
    }
  }, HEARTBEAT_MS)

  return () => clearInterval(heartbeat)
}
