/**
 * Live Call — room feed sender.
 *
 * Captures a chosen camera and audio input on the WorshipFlow machine and
 * offers them to every viewer (the preacher's tablet) in the 'room-feed'
 * room. Unlike LiveCallRelay's phone relay, there is no inbound peer
 * connection: start() captures the local stream BEFORE joining signaling,
 * so both tracks already exist by the time any viewer-joined message can
 * arrive, and go straight onto the new peer connection with addTrack — no
 * addTransceiver/replaceTrack pre-negotiation needed.
 */
import { ICE_SERVERS } from './iceServers'

export type SenderState = 'idle' | 'starting' | 'live' | 'error'

export interface RoomFeedSenderCallbacks {
  onStateChange?: (state: SenderState) => void
  onError?: (message: string) => void
  onViewerCount?: (n: number) => void
}

const MAX_BACKOFF_MS = 15000

export class RoomFeedSender {
  private ws: WebSocket | null = null
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private closing = false

  private localStream: MediaStream | null = null
  private viewers = new Map<string, RTCPeerConnection>()

  private state: SenderState = 'idle'
  private cb: RoomFeedSenderCallbacks = {}

  constructor(
    private url: string,
    private token: string,
    private room: string
  ) {}

  setCallbacks(cb: RoomFeedSenderCallbacks): void { this.cb = cb }

  getState(): SenderState { return this.state }
  getViewerCount(): number { return this.viewers.size }
  getStream(): MediaStream | null { return this.localStream }

  async start(cameraId: string, audioId: string): Promise<void> {
    if (this.state !== 'idle') return
    this.setState('starting')
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: cameraId } },
        audio: { deviceId: { exact: audioId } },
      })
    } catch (err) {
      this.setState('error')
      this.cb.onError?.(err instanceof Error ? err.message : String(err))
      return
    }
    this.closing = false
    this.connect()
  }

  stop(): void {
    this.closing = true
    for (const [, pc] of this.viewers) pc.close()
    this.viewers.clear()
    this.cb.onViewerCount?.(0)
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop())
      this.localStream = null
    }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.ws?.close()
    this.ws = null
    this.setState('idle')
  }

  // ----------------------------------------------------------- signaling --

  private connect(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.ws = new WebSocket(this.url)

    this.ws.addEventListener('open', () => {
      this.reconnectAttempt = 0
      this.send({ type: 'hello', token: this.token, role: 'receiver', room: this.room })
    })

    this.ws.addEventListener('message', (ev) => { void this.onMessage(ev) })

    this.ws.addEventListener('close', () => {
      if (this.closing) return
      this.reconnectAttempt++
      const delay = Math.min(1000 * 2 ** this.reconnectAttempt, MAX_BACKOFF_MS)
      this.reconnectTimer = setTimeout(() => this.connect(), delay)
    })
  }

  private async onMessage(ev: MessageEvent): Promise<void> {
    let msg: Record<string, unknown>
    try { msg = JSON.parse(String(ev.data)) } catch { return }

    switch (msg.type) {
      case 'joined':
        this.setState('live')
        break

      case 'ice-candidate': {
        const from = typeof msg.from === 'string' ? msg.from : null
        const pc = from ? this.viewers.get(from) : null
        if (pc && msg.candidate) {
          try { await pc.addIceCandidate(msg.candidate as RTCIceCandidateInit) } catch { /* benign */ }
        }
        break
      }

      case 'answer': {
        const from = typeof msg.from === 'string' ? msg.from : null
        const pc = from ? this.viewers.get(from) : null
        if (pc) await pc.setRemoteDescription({ type: 'answer', sdp: String(msg.sdp) })
        break
      }

      case 'viewer-joined':
        await this.addViewer(String(msg.id))
        break

      case 'viewer-left':
        this.removeViewer(String(msg.id))
        break

      case 'error':
        this.setState('error')
        this.cb.onError?.(`signaling: ${String(msg.reason)}`)
        break
    }
  }

  private send(obj: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj))
  }

  // -------------------------------------------------------------- viewers --

  private async addViewer(id: string): Promise<void> {
    if (!this.localStream) return
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    this.viewers.set(id, pc)
    this.cb.onViewerCount?.(this.viewers.size)

    pc.addEventListener('icecandidate', (ev) => {
      if (ev.candidate) this.send({ type: 'ice-candidate', to: id, candidate: ev.candidate })
    })

    for (const track of this.localStream.getTracks()) {
      pc.addTrack(track, this.localStream)
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    this.send({ type: 'offer', to: id, sdp: offer.sdp })
  }

  private removeViewer(id: string): void {
    this.viewers.get(id)?.close()
    this.viewers.delete(id)
    this.cb.onViewerCount?.(this.viewers.size)
  }

  private setState(s: SenderState): void {
    if (this.state === s) return
    this.state = s
    this.cb.onStateChange?.(s)
  }
}
