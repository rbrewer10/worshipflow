/**
 * Live Call — relay.
 *
 * Receives ONE stream from the phone and re-offers it to every screen. The phone
 * uploads once: hotel wifi upstream is the scarce resource, and fanning out from
 * the phone (one peer connection per screen) is the thing that must not happen.
 * Downstream fan-out is LAN traffic, where bandwidth is free.
 *
 * Audio is deliberately NOT forwarded. It plays here, on the control machine,
 * whose output already feeds the board. Several screens playing the same voice
 * milliseconds apart is comb-filtered mush.
 */

export type CallState = 'idle' | 'ringing' | 'live' | 'reconnecting'

export interface RelayCallbacks {
  onStateChange?: (state: CallState) => void
  onTelemetry?: (text: string) => void
  onViewerCount?: (n: number) => void
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
const MAX_BACKOFF_MS = 15000

export class LiveCallRelay {
  private ws: WebSocket | null = null
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private closing = false

  /** Connection to the phone. */
  private inbound: RTCPeerConnection | null = null
  private inboundStream: MediaStream | null = null

  /** One connection per screen, keyed by the server-assigned viewer id. */
  private viewers = new Map<string, RTCPeerConnection>()

  private audioEl: HTMLAudioElement | null = null
  private state: CallState = 'idle'
  private autoAccept = true
  private pendingOffer: string | null = null
  private cb: RelayCallbacks = {}

  constructor(
    private url: string,
    private token: string,
    private room: string,
    cb: RelayCallbacks = {}
  ) {
    this.cb = cb
  }

  setCallbacks(cb: RelayCallbacks): void { this.cb = cb }

  start(): void {
    this.closing = false
    this.connect()
  }

  stop(): void {
    this.closing = true
    this.teardownInbound()
    for (const [, pc] of this.viewers) pc.close()
    this.viewers.clear()
    this.cb.onViewerCount?.(0)
    if (this.audioEl) { this.audioEl.srcObject = null; this.audioEl = null }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.ws?.close()
    this.ws = null
    this.setState('idle')
  }

  setAutoAccept(on: boolean): void { this.autoAccept = on }
  getAutoAccept(): boolean { return this.autoAccept }

  /** The inbound stream, for a local preview element. */
  getStream(): MediaStream | null { return this.inboundStream }

  getState(): CallState { return this.state }

  getViewerCount(): number { return this.viewers.size }

  async acceptCall(): Promise<void> {
    if (!this.pendingOffer) return
    const sdp = this.pendingOffer
    this.pendingOffer = null

    // Reuse the existing connection when the phone renegotiates (ICE restart on
    // every network blip). Building a fresh one each time leaks the old one —
    // the bug in the source package's scene module, on the exact path a bad
    // network exercises over and over.
    if (!this.inbound) this.inbound = this.createInbound()
    await this.inbound.setRemoteDescription({ type: 'offer', sdp })
    const answer = await this.inbound.createAnswer()
    await this.inbound.setLocalDescription(answer)
    this.send({ type: 'answer', sdp: answer.sdp })
  }

  declineCall(): void {
    this.pendingOffer = null
    this.send({ type: 'bye' })
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
      this.cb.onTelemetry?.(`signaling: disconnected — retrying in ${Math.round(delay / 1000)}s`)
      this.reconnectTimer = setTimeout(() => this.connect(), delay)
    })
  }

  private async onMessage(ev: MessageEvent): Promise<void> {
    let msg: Record<string, unknown>
    try { msg = JSON.parse(String(ev.data)) } catch { return }

    switch (msg.type) {
      case 'joined':
        this.cb.onTelemetry?.(`signaling: joined room "${this.room}"`)
        break

      case 'offer':
        this.pendingOffer = String(msg.sdp)
        if (this.state !== 'live') this.setState('ringing')
        if (this.autoAccept) await this.acceptCall()
        break

      case 'ice-candidate': {
        // From a viewer if the id matches one, otherwise from the phone.
        const from = typeof msg.from === 'string' ? msg.from : null
        const pc = from && this.viewers.has(from) ? this.viewers.get(from)! : this.inbound
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

      case 'peer-left':
      case 'bye':
        this.teardownInbound()
        this.setState('idle')
        break
    }
  }

  private send(obj: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj))
  }

  // -------------------------------------------------------------- inbound --

  private createInbound(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    pc.addEventListener('track', (ev) => {
      const stream = ev.streams[0]
      if (!stream) return
      this.inboundStream = stream

      if (ev.track.kind === 'audio') {
        // Only this machine makes sound.
        if (!this.audioEl) {
          this.audioEl = document.createElement('audio')
          this.audioEl.autoplay = true
        }
        this.audioEl.srcObject = stream
        void this.audioEl.play().catch(() => { /* autoplay policy; a user gesture will start it */ })
      } else {
        // Push the new track into every existing screen connection instead of
        // renegotiating them. A wifi blip must not black out the sanctuary.
        for (const [, vpc] of this.viewers) {
          const sender = vpc.getSenders().find((s) => s.track?.kind === 'video' || s.track === null)
          if (sender) void sender.replaceTrack(ev.track)
        }
      }
    })

    pc.addEventListener('icecandidate', (ev) => {
      if (ev.candidate) this.send({ type: 'ice-candidate', candidate: ev.candidate })
    })

    pc.addEventListener('connectionstatechange', () => {
      this.cb.onTelemetry?.(`webrtc: ${pc.connectionState}`)
      if (pc.connectionState === 'connected') this.setState('live')
      else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        // The phone owns reconnection — it will ICE-restart and re-offer.
        this.setState('reconnecting')
      }
    })

    return pc
  }

  private teardownInbound(): void {
    this.inbound?.close()
    this.inbound = null
    this.inboundStream = null
    this.pendingOffer = null
    if (this.audioEl) this.audioEl.srcObject = null
  }

  // -------------------------------------------------------------- viewers --

  private async addViewer(id: string): Promise<void> {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    this.viewers.set(id, pc)
    this.cb.onViewerCount?.(this.viewers.size)

    pc.addEventListener('icecandidate', (ev) => {
      if (ev.candidate) this.send({ type: 'ice-candidate', to: id, candidate: ev.candidate })
    })

    const track = this.inboundStream?.getVideoTracks()[0]
    if (track) {
      pc.addTrack(track, this.inboundStream!)
    } else {
      // No call yet. Reserve the video slot so the screen is already negotiated
      // and ready — replaceTrack() fills it the moment he goes live, with no
      // renegotiation round-trip while the room waits.
      pc.addTransceiver('video', { direction: 'sendonly' })
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

  private setState(s: CallState): void {
    if (this.state === s) return
    this.state = s
    this.cb.onStateChange?.(s)
  }
}
