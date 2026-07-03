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

export class YamahaController {
  private port: OSC.UDPPort | null = null
  private openPromise: Promise<void> | null = null
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
   * created once.
   */
  private ensureOpen(): Promise<void> {
    if (this.openPromise) return this.openPromise

    this.openPromise = new Promise<void>((resolve, reject) => {
      const port = new OSC.UDPPort({
        localAddress: '0.0.0.0',
        localPort: this.localPort,
        remoteAddress: this.ip || '192.168.1.100', // Updated on discovery
        remotePort: this.remotePort,
        metadata: true,
      })

      const onReady = (): void => {
        port.removeListener('error', onOpenError)
        // Keep a listener attached so later socket errors don't crash the
        // process via an unhandled 'error' event.
        port.on('error', (err: Error) => console.error('OSC error:', err))
        this.port = port
        resolve()
      }

      const onOpenError = (err: Error): void => {
        port.removeListener('ready', onReady)
        try {
          port.close()
        } catch {
          // ignore — socket may never have bound
        }
        // Allow a retry on the next call.
        this.openPromise = null
        reject(err)
      }

      port.once('ready', onReady)
      port.once('error', onOpenError)
      port.open()
    })

    return this.openPromise
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
          // ignore — socket may never have bound
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

      scanPort.on('error', (err: Error) => fail(err))

      // With metadata: true the third arg carries the sender's rinfo.
      scanPort.on(
        'message',
        (_msg: OSC.OSCMessage, _timeTag: unknown, info?: OSC.RemoteInfo) => {
          if (info?.address) succeed(info.address)
        }
      )

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
        yamaha_channel: i,
        is_mic: false,
        is_backing_track: false,
        current_fader_db: 0,
        is_muted: false,
      })
    }

    this.channels = new Map(channels.map(ch => [ch.id, ch]))
    return channels
  }

  /**
   * Send mute command to channel
   */
  async muteChannel(channel_id: number, mute: boolean): Promise<void> {
    const channel = this.channels.get(channel_id)
    if (!channel) throw new Error(`Channel ${channel_id} not found`)

    await this.ensureOpen()

    // Send OSC: /ch/{yamaha_channel}/mute {0 or 1}
    const osc_addr = `/ch/${channel.yamaha_channel}/mute`
    const osc_value = mute ? 1 : 0
    this.port!.send({ address: osc_addr, args: [{ type: 'i', value: osc_value }] })

    channel.is_muted = mute
  }

  /**
   * Recall a saved scene by name
   */
  async recallScene(scene_name: string): Promise<void> {
    await this.ensureOpen()

    // Send OSC: /scene/{scene_name}
    const osc_addr = `/scene`
    this.port!.send({ address: osc_addr, args: [{ type: 's', value: scene_name }] })
  }

  /**
   * Adjust fader for a channel
   */
  async setFader(channel_id: number, db: number): Promise<void> {
    const channel = this.channels.get(channel_id)
    if (!channel) throw new Error(`Channel ${channel_id} not found`)

    await this.ensureOpen()

    // Convert dB to 0-1 range
    const fader_value = Math.max(0, Math.min(1, (db + 60) / 120))

    // Send OSC: /ch/{yamaha_channel}/fader {0.0-1.0}
    const osc_addr = `/ch/${channel.yamaha_channel}/fader`
    this.port!.send({ address: osc_addr, args: [{ type: 'f', value: fader_value }] })

    channel.current_fader_db = db
  }

  getChannels(): Channel[] {
    return Array.from(this.channels.values())
  }

  /**
   * Close the UDP port if it was ever opened. Safe to call at app shutdown.
   */
  close(): void {
    if (this.port) {
      try {
        this.port.close()
      } catch {
        // ignore — already closed
      }
      this.port = null
    }
    this.openPromise = null
  }
}
