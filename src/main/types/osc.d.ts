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

      on(event: 'ready', listener: () => void): this
      on(event: 'error', listener: (err: Error) => void): this
      on(
        event: 'message',
        listener: (msg: OSCMessage, timeTag: unknown, info: RemoteInfo) => void
      ): this
      on(event: string | symbol, listener: (...args: any[]) => void): this

      once(event: 'ready', listener: () => void): this
      once(event: 'error', listener: (err: Error) => void): this
      once(
        event: 'message',
        listener: (msg: OSCMessage, timeTag: unknown, info: RemoteInfo) => void
      ): this
      once(event: string | symbol, listener: (...args: any[]) => void): this
    }
  }

  export = osc
}
