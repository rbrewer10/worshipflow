import { EventEmitter } from 'events'
import type { AudioFrame, Heuristic } from './types/sound-check-types'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mic: (opts?: unknown) => { start(): void; stop(): void; getAudioStream(): NodeJS.ReadableStream } = require('mic')

const TARGET_SAMPLE_RATE = 48000 // AudioAnalyzer expects 48kHz frames
const FFT_FRAME_SIZE = 2048 // AudioAnalyzer expects exactly 2048 samples per frame

// Buffers raw audio samples and emits fixed-size resampled frames.
// Input: variable-size chunks at micSampleRate (typically 44.1kHz, stereo, 16-bit)
// Output: exactly FFT_FRAME_SIZE frames at TARGET_SAMPLE_RATE
class FrameBuffer {
  private leftBuffer: number[] = []
  private rightBuffer: number[] = []
  private micSampleRate: number
  private resampleRatio: number
  private sampleIndex = 0 // Track position in resampling for phase continuity

  constructor(micSampleRate: number) {
    this.micSampleRate = micSampleRate
    this.resampleRatio = TARGET_SAMPLE_RATE / micSampleRate // e.g., 48000/44100 ≈ 1.0884
  }

  // Add a frame of interleaved stereo samples (L, R, L, R, ...) in 16-bit signed int range
  addSamples(left: Float32Array, right: Float32Array): AudioFrame[] {
    this.leftBuffer.push(...left)
    this.rightBuffer.push(...right)

    const frames: AudioFrame[] = []

    // Emit frames while we have enough input samples to produce a resampled output frame
    while (this.canEmitFrame()) {
      const frame = this.emitFrame()
      if (frame) frames.push(frame)
    }

    return frames
  }

  private canEmitFrame(): boolean {
    // How many input samples do we need to produce FFT_FRAME_SIZE output samples?
    const inputSamplesNeeded = (this.sampleIndex + FFT_FRAME_SIZE) / this.resampleRatio
    return this.leftBuffer.length >= Math.ceil(inputSamplesNeeded)
  }

  private emitFrame(): AudioFrame | null {
    const left = new Float32Array(FFT_FRAME_SIZE)
    const right = new Float32Array(FFT_FRAME_SIZE)

    // Resample from micSampleRate to TARGET_SAMPLE_RATE using linear interpolation
    for (let i = 0; i < FFT_FRAME_SIZE; i++) {
      const inputPos = (this.sampleIndex + i) / this.resampleRatio
      const inputIdx = Math.floor(inputPos)
      const frac = inputPos - inputIdx

      // Linear interpolation between inputIdx and inputIdx+1
      if (inputIdx < this.leftBuffer.length - 1) {
        left[i] =
          this.leftBuffer[inputIdx] * (1 - frac) + this.leftBuffer[inputIdx + 1] * frac
        right[i] =
          this.rightBuffer[inputIdx] * (1 - frac) + this.rightBuffer[inputIdx + 1] * frac
      } else if (inputIdx < this.leftBuffer.length) {
        // Boundary: only one sample available
        left[i] = this.leftBuffer[inputIdx]
        right[i] = this.rightBuffer[inputIdx]
      } else {
        // Shouldn't happen if canEmitFrame() is correct, but failsafe to zero
        left[i] = 0
        right[i] = 0
      }
    }

    this.sampleIndex += FFT_FRAME_SIZE
    this.purgeOldSamples()

    return { timestamp: new Date(), left, right }
  }

  private purgeOldSamples(): void {
    // Remove samples we've already consumed (with safety margin for interpolation)
    const inputIdx = Math.floor(this.sampleIndex / this.resampleRatio)
    if (inputIdx > 1) {
      const safeIdx = inputIdx - 1
      this.leftBuffer.splice(0, safeIdx)
      this.rightBuffer.splice(0, safeIdx)
      // Adjust sampleIndex to account for removed samples
      this.sampleIndex -= safeIdx * this.resampleRatio
    }
  }
}

// Captures live audio from the Yamaha TF-Rack USB device and pushes frames
// to an observer. The caller is responsible for feeding frames into AudioAnalyzer
// and handling the audio data pipeline.
export class AudioCapture extends EventEmitter {
  private micInstance: unknown | null = null
  private audioStream: NodeJS.ReadableStream | null = null
  private isCapturing = false
  private micSampleRate = 44100 // Input: mic device sample rate
  private channels = 2
  private bitDepth = 16
  private frameBuffer: FrameBuffer | null = null

  constructor() {
    super()
  }

  async start(deviceId?: string): Promise<void> {
    if (this.isCapturing) return

    try {
      const options = {
        rate: this.micSampleRate,
        channels: this.channels,
        bitwidth: this.bitDepth,
        encoding: 'signed-integer',
        device: deviceId || 'default' // Falls back to system default if not specified
      }

      const micInst = mic(options) as { start(): void; stop(): void; getAudioStream(): NodeJS.ReadableStream }
      this.micInstance = micInst
      this.audioStream = micInst.getAudioStream()

      if (!this.audioStream) throw new Error('Failed to get audio stream')

      this.frameBuffer = new FrameBuffer(this.micSampleRate)

      this.audioStream.on('data', (chunk: Buffer) => {
        const { left, right } = this.bufferToAudioFrame(chunk)
        const frames = this.frameBuffer!.addSamples(left, right)
        frames.forEach((frame) => this.emit('frame', frame))
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

  // Convert raw audio buffer to stereo float32 samples (FrameBuffer handles framing)
  private bufferToAudioFrame(buffer: Buffer): { left: Float32Array; right: Float32Array } {
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

    return { left, right }
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
