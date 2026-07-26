/**
 * Live Call — viewer.
 *
 * A screen. Answers the relay's offer and hands back a MediaStream. Video only:
 * the control machine is the single audio source, so nothing here ever plays
 * sound. The TypeScript twin of the script embedded in zoneHtml.ts — output
 * windows are separate renderer processes, so they cannot be handed the relay's
 * MediaStream object and have to negotiate for it like any other screen.
 */

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
const MAX_BACKOFF_MS = 15000

export class LiveCallViewer {
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private attempt = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private closing = false

  constructor(
    private url: string,
    private token: string,
    private room: string,
    private onStream: (stream: MediaStream) => void
  ) {}

  start(): void {
    this.closing = false
    this.connect()
  }

  stop(): void {
    this.closing = true
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    this.pc?.close()
    this.pc = null
    this.ws?.close()
    this.ws = null
  }

  private connect(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    this.ws = new WebSocket(this.url)

    this.ws.addEventListener('open', () => {
      this.attempt = 0
      this.send({ type: 'hello', token: this.token, role: 'viewer', room: this.room })
    })

    this.ws.addEventListener('message', (ev) => { void this.onMessage(ev) })

    this.ws.addEventListener('close', () => {
      if (this.closing) return
      this.attempt++
      this.timer = setTimeout(() => this.connect(), Math.min(1000 * 2 ** this.attempt, MAX_BACKOFF_MS))
    })
  }

  private async onMessage(ev: MessageEvent): Promise<void> {
    let msg: Record<string, unknown>
    try { msg = JSON.parse(String(ev.data)) } catch { return }

    if (msg.type === 'offer') {
      // A fresh offer means the relay rebuilt our connection; drop the old one.
      this.pc?.close()
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      this.pc = pc

      pc.addEventListener('track', (e) => {
        // e.streams is EMPTY when the relay pre-negotiated this connection with
        // addTransceiver and filled it later via replaceTrack — no stream id was
        // ever associated. Trusting e.streams[0] alone leaves the screen black
        // for exactly the case the pre-negotiation was meant to speed up.
        this.onStream(e.streams[0] ?? new MediaStream([e.track]))
      })
      pc.addEventListener('icecandidate', (e) => {
        if (e.candidate) this.send({ type: 'ice-candidate', candidate: e.candidate })
      })

      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: String(msg.sdp) })
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        this.send({ type: 'answer', sdp: answer.sdp })
      } catch { /* the relay will re-offer */ }
    } else if (msg.type === 'ice-candidate' && this.pc && msg.candidate) {
      try { await this.pc.addIceCandidate(msg.candidate as RTCIceCandidateInit) } catch { /* benign */ }
    }
  }

  private send(obj: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj))
  }
}
