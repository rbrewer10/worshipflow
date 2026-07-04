import { EventEmitter } from 'events'
import type { AudioFrame, Heuristic } from './types/sound-check-types'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mic: (opts?: unknown) => { start(): void; stop(): void; getAudioStream(): NodeJS.ReadableStream } = require('mic')

// Captures live audio from the Yamaha TF-Rack USB device and pushes frames
// to an observer. The caller is responsible for feeding frames into AudioAnalyzer
// and handling the audio data pipeline.
export class AudioCapture extends EventEmitter {
  private micInstance: unknown | null = null
  private audioStream: NodeJS.ReadableStream | null = null
  private isCapturing = false
  private sampleRate = 44100
  private channels = 2
  private bitDepth = 16

  constructor() {
    super()
  }

  async start(deviceId?: string): Promise<void> {
    if (this.isCapturing) return

    try {
      const options = {
        rate: this.sampleRate,
        channels: this.channels,
        bitwidth: this.bitDepth,
        encoding: 'signed-integer',
        device: deviceId || 'default' // Falls back to system default if not specified
      }

      const micInst = mic(options) as { start(): void; stop(): void; getAudioStream(): NodeJS.ReadableStream }
      this.micInstance = micInst
      this.audioStream = micInst.getAudioStream()

      if (!this.audioStream) throw new Error('Failed to get audio stream')

      this.audioStream.on('data', (chunk: Buffer) => {
        const frame = this.bufferToAudioFrame(chunk)
        this.emit('frame', frame)
      })

      this.audioStream.on('error', (err: Error) => {
        this.emit('error', err)
      })

      micInst.start()
      this.isCapturing = true
      this.emit('started')
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)))
    }
  }

  stop(): void {
    if (!this.isCapturing) return

    try {
      if (this.micInstance) {
        (this.micInstance as { stop(): void }).stop()
        this.micInstance = null
      }
      if (this.audioStream) {
        this.audioStream.removeAllListeners()
        this.audioStream = null
      }
      this.isCapturing = false
      this.emit('stopped')
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)))
    }
  }

  // Convert raw audio buffer to AudioFrame (stereo L/R channels, float32)
  private bufferToAudioFrame(buffer: Buffer): AudioFrame {
    const sampleCount = buffer.length / (this.bitDepth / 8) / this.channels
    const left = new Float32Array(sampleCount)
    const right = new Float32Array(sampleCount)

    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.length)
    const max16 = 32768

    for (let i = 0; i < sampleCount; i++) {
      const leftIdx = i * this.channels * (this.bitDepth / 8)
      const rightIdx = leftIdx + (this.bitDepth / 8)

      // Read 16-bit signed integers
      const leftSample = view.getInt16(leftIdx, true)
      const rightSample = view.getInt16(rightIdx, true)

      // Normalize to -1..1 range
      left[i] = leftSample / max16
      right[i] = rightSample / max16
    }

    return { timestamp: new Date(), left, right }
  }

  isActive(): boolean {
    return this.isCapturing
  }

  getDevices(): { id: string; name: string }[] {
    try {
      // This would require listing audio devices; `mic` library doesn't expose this easily.
      // For now, return a placeholder. In production, you'd use a library like portaudio
      // or system calls to enumerate devices.
      return [{ id: 'default', name: 'Default Audio Device (Yamaha TF-Rack)' }]
    } catch {
      return []
    }
  }
}
