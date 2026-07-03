declare module 'osc' {
  interface UdpPortConfig {
    localAddress?: string
    localPort?: number
    remoteAddress?: string
    remotePort?: number
    metadata?: boolean
  }

  interface OSCMessage {
    address: string
    args?: any[]
  }

  class UdpPort {
    constructor(config: UdpPortConfig)
    open(): void
    close(): void
    send(msg: OSCMessage, address?: string, port?: number): void
    on(event: string, callback: Function): void
  }

  function udpPort(config: UdpPortConfig): UdpPort

  export = {
    udpPort,
    UdpPort
  }
}
