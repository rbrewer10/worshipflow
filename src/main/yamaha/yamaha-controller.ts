import OSC from 'osc'
import { Channel, Scene } from '../types/sound-check-types'

export interface YamahaControllerOptions {
  /** UDP port the mixer listens on. Defaults to 10000. */
  remotePort?: number
  /** Local UDP port to bind for send/receive. Defaults to 9000. */
  localPort?: number
}

const DEFAULT_REMOTE_PORT = 10000
const DEFAULT_LOCAL_PORT = 9000
const DISCOVERY_TIMEOUT_MS = 2000

// Placeholder linear dB-to-fader mapping. Real TF-series faders top out at
// +10 dB and use a non-linear taper; replace this mapping when the actual
// protocol is implemented.
const FADER_MIN_DB = -60
const FADER_MAX_DB = 60

export class YamahaController {
  private port: OSC.UDPPort | null = null
  private pendingOpen: { port: OSC.UDPPort; abort: (err: Error) => void } | null = null
  private openPromise: Promise<void> | null = null
  private openGeneration = 0
  private channels: Map<number, Channel> = new Map()
  private scenes: Scene[] = []
  private ip: string = ''
  private readonly remotePort: number
  private readonly localPort: number

  constructor(options: YamahaControllerOptions = {}) {
    // Intentionally no I/O here: the UDP port is created and opened lazily on
    // first use (see ensureOpen) so constructing the controller at app startup
    // can never crash on a port bind failure.
    this.remotePort = options.remotePort ?? DEFAULT_REMOTE_PORT
    this.localPort = options.localPort ?? DEFAULT_LOCAL_PORT
  }

  /**
   * Lazily create and open the UDP port. Resolves once the port has emitted
   * 'ready'. Subsequent callers share the same promise, so the port is only
   * created once. Rejects if no mixer IP has been established yet, or if
   * close() is called while the socket is still binding.
   */
  private ensureOpen(): Promise<void> {
    if (this.openPromise) return this.openPromise

    if (!this.ip) {
      return Promise.reject(
        new Error('Mixer IP unknown — run autoDiscover or set IP first')
      )
    }

    const generation = ++this.openGeneration

    const promise = new Promise<void>((resolve, reject) => {
      const port = new OSC.UDPPort({
        localAddress: '0.0.0.0',
        localPort: this.localPort,
        remotePort: this.remotePort,
        metadata: true,
      })

      const onReady = (): void => {
        port.removeListener('error', onOpenError)

        // close() (or a newer open attempt) invalidated this one while the
        // socket was binding — discard the socket instead of resurrecting it.
        if (generation !== this.openGeneration) {
          // Swallow any late socket error on this discarded port so it can't
          // become an unhandled 'error' event.
          port.on('error', () => {})
          try {
            port.close()
          } catch {
            // already closed by close()
          }
          reject(new Error('Controller was closed while the port was opening'))
          return
        }

        // Keep a listener attached so later socket errors don't crash the
        // process via an unhandled 'error' event.
        port.on('error', (err) => console.error('OSC error:', err))

        // Discovery may have completed while the socket was binding, so the
        // remote address is always applied from state here, never from the
        // options captured at construction time.
        port.options.remoteAddress = this.ip

        this.pendingOpen = null
        this.port = port
        resolve()
      }

      const onOpenError = (err: Error): void => {
        port.removeListener('ready', onReady)
        try {
          port.close()
        } catch {
          // socket may never have bound
        }
        if (this.pendingOpen?.port === port) this.pendingOpen = null
        // Allow a retry on the next call.
        if (generation === this.openGeneration) this.openPromise = null
        reject(err)
      }

      // close() calls this to settle the promise immediately: a socket torn
      // down mid-bind may never emit 'ready' or 'error', which would leave
      // awaiting callers hanging forever.
      const abort = (err: Error): void => {
        port.removeListener('ready', onReady)
        port.removeListener('error', onOpenError)
        // Swallow late socket errors from the aborted bind.
        port.on('error', () => {})
        try {
          port.close()
        } catch {
          // socket may never have bound
        }
        reject(err)
      }

      this.pendingOpen = { port, abort }
      port.once('ready', onReady)
      port.once('error', onOpenError)
      port.open()
    })

    this.openPromise = promise
    return promise
  }

  /**
   * Discover the TF-Rack on the local network, or use a manually supplied IP.
   *
   * With no manual IP, sends an OSC /ping broadcast and waits up to 2 seconds
   * for any reply; the first responder's address is used as the mixer IP.
   */
  async autoDiscover(manualIp?: string): Promise<string> {
    const ip = manualIp ?? (await this.broadcastDiscover())
    this.ip = ip
    if (this.port) {
      this.port.options.remoteAddress = ip
    }
    return ip
  }

  private broadcastDiscover(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const scanPort = new OSC.UDPPort({
        localAddress: '0.0.0.0',
        localPort: 0, // ephemeral — never conflicts with the main port
        broadcast: true,
        metadata: true,
      })

      let settled = false
      let timer: NodeJS.Timeout | null = null

      const cleanup = (): void => {
        if (timer) clearTimeout(timer)
        scanPort.removeAllListeners('message')
        scanPort.removeAllListeners('ready')
        scanPort.removeAllListeners('error')
        // Swallow errors emitted while the socket shuts down.
        scanPort.on('error', () => {})
        try {
          scanPort.close()
        } catch {
          // socket may never have bound
        }
      }

      const fail = (err: Error): void => {
        if (settled) return
        settled = true
        cleanup()
        reject(err)
      }

      const succeed = (ip: string): void => {
        if (settled) return
        settled = true
        cleanup()
        resolve(ip)
      }

      timer = setTimeout(() => {
        fail(
          new Error(
            'Yamaha TF-Rack not found on network — enter the mixer IP manually'
          )
        )
      }, DISCOVERY_TIMEOUT_MS)

      scanPort.on('error', (err) => fail(err))

      // With metadata: true the third arg carries the sender's rinfo.
      scanPort.on('message', (_msg, _timeTag, info) => {
        if (info?.address) succeed(info.address)
      })

      scanPort.once('ready', () => {
        try {
          scanPort.send(
            { address: '/ping', args: [] },
            '255.255.255.255',
            this.remotePort
          )
        } catch (err) {
          fail(err instanceof Error ? err : new Error(String(err)))
        }
      })

      scanPort.open()
    })
  }

  /**
   * Fetch all channel names and current state from TF-Rack
   */
  async fetchChannels(): Promise<Channel[]> {
    const channels: Channel[] = []

    for (let i = 1; i <= 32; i++) {
      channels.push({
        id: i,
        name: `Channel ${i}`,
        yamahaChannel: i,
        isMic: false,
        isBackingTrack: false,
        currentFaderDb: 0,
        isMuted: false,
      })
    }

    this.channels = new Map(channels.map(ch => [ch.id, ch]))
    return channels
  }

  private getLoadedChannel(channelId: number): Channel {
    if (this.channels.size === 0) {
      throw new Error('Channels not loaded — call fetchChannels() first')
    }
    const channel = this.channels.get(channelId)
    if (!channel) throw new Error(`Channel ${channelId} not found`)
    return channel
  }

  /**
   * Send mute command to channel
   */
  async muteChannel(channelId: number, mute: boolean): Promise<void> {
    const channel = this.getLoadedChannel(channelId)

    await this.ensureOpen()

    this.port!.send({
      address: `/ch/${channel.yamahaChannel}/mute`,
      args: [{ type: 'i', value: mute ? 1 : 0 }],
    })

    channel.isMuted = mute
  }

  /**
   * Recall a saved scene by name
   */
  async recallScene(sceneName: string): Promise<void> {
    await this.ensureOpen()

    // '/scene' address is a placeholder — real TF scene recall address TBD.
    this.port!.send({
      address: `/scene`,
      args: [{ type: 's', value: sceneName }],
    })
  }

  /**
   * Adjust fader for a channel
   */
  async setFader(channelId: number, db: number): Promise<void> {
    if (!Number.isFinite(db)) {
      throw new Error(`Invalid fader value: ${db} dB (must be a finite number)`)
    }

    const channel = this.getLoadedChannel(channelId)

    await this.ensureOpen()

    const faderValue = Math.max(
      0,
      Math.min(1, (db - FADER_MIN_DB) / (FADER_MAX_DB - FADER_MIN_DB))
    )

    this.port!.send({
      address: `/ch/${channel.yamahaChannel}/fader`,
      args: [{ type: 'f', value: faderValue }],
    })

    channel.currentFaderDb = db
  }

  getChannels(): Channel[] {
    return Array.from(this.channels.values())
  }

  /**
   * Close the UDP port, including one whose open is still in flight.
   * Safe to call at app shutdown or repeatedly.
   */
  close(): void {
    // Invalidate any in-flight open attempt so a straggling 'ready' event
    // discards its socket instead of resurrecting it (see ensureOpen).
    this.openGeneration++
    this.openPromise = null

    if (this.pendingOpen) {
      const pending = this.pendingOpen
      this.pendingOpen = null
      pending.abort(
        new Error('Controller was closed while the port was opening')
      )
    }

    if (this.port) {
      try {
        this.port.close()
      } catch {
        // already closed
      }
      this.port = null
    }
  }
}
