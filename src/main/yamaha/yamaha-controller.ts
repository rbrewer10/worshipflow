import OSC from 'osc'
import { Channel, Scene } from '../types/sound-check-types'

export class YamahaController {
  private osc: any
  private channels: Map<number, Channel> = new Map()
  private scenes: Scene[] = []
  private ip: string = ''

  constructor() {}

  /**
   * Auto-discover TF-Rack on local network
   * Scans common Yamaha IP ranges and sends OSC ping
   */
  async autoDiscover(): Promise<string> {
    const udp = OSC.udpPort({
      localAddress: '0.0.0.0',
      localPort: 9000,
      remoteAddress: '255.255.255.255',
      remotePort: 10000,
      metadata: true,
    })

    const yamaha_ip = await this.scanNetwork()
    this.ip = yamaha_ip
    return yamaha_ip
  }

  private async scanNetwork(): Promise<string> {
    // Placeholder: in real implementation, scan 192.168.1.0/24 for TF-Rack
    // For now, return hardcoded or require user input
    return '192.168.1.100'
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
        current_fader_db: -40 + Math.random() * 40,
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

    console.log(`Mute channel ${channel.yamaha_channel}: ${mute}`)
    channel.is_muted = mute
  }

  /**
   * Recall a saved scene by name
   */
  async recallScene(scene_name: string): Promise<void> {
    console.log(`Recall scene: ${scene_name}`)
  }

  /**
   * Adjust fader for a channel
   */
  async setFader(channel_id: number, db: number): Promise<void> {
    const channel = this.channels.get(channel_id)
    if (!channel) throw new Error(`Channel ${channel_id} not found`)

    const fader_value = (db + 60) / 120
    console.log(`Set fader ${channel.yamaha_channel} to ${db}dB (${fader_value})`)
    channel.current_fader_db = db
  }

  getChannels(): Channel[] {
    return Array.from(this.channels.values())
  }
}
