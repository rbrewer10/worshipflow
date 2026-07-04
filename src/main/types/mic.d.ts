declare module 'mic' {
  import { EventEmitter } from 'events'

  interface MicOptions {
    rate?: number
    channels?: number
    bitwidth?: number
    encoding?: 'signed-integer' | 'unsigned-integer'
    device?: string
  }

  class Microphone extends EventEmitter {
    constructor(options?: MicOptions)
    start(): void
    stop(): void
    pause(): void
    resume(): void
    getAudioStream(): NodeJS.ReadableStream
  }

  export default function mic(options?: MicOptions): Microphone
}
