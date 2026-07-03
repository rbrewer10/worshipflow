declare module 'osc' {
  import { EventEmitter } from 'events'

  namespace osc {
    interface UDPPortOptions {
      localAddress?: string
      localPort?: number
      remoteAddress?: string
      remotePort?: number
      metadata?: boolean
      broadcast?: boolean
      socket?: unknown
    }

    interface OSCArgument {
      type: string
      value: unknown
    }

    interface OSCMessage {
      address: string
      args?: OSCArgument[]
    }

    interface RemoteInfo {
      address: string
      family: string
      port: number
      size: number
    }

    class UDPPort extends EventEmitter {
      constructor(options: UDPPortOptions)
      options: UDPPortOptions
      open(): void
      close(): void
      send(msg: OSCMessage, address?: string, port?: number): void
    }
  }

  export = osc
}
