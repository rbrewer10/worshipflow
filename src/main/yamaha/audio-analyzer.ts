import FFT from 'fft.js'
import { Heuristic } from '../types/sound-check-types'

export interface AudioFrame {
  timestamp: Date
  left: Float32Array
  right: Float32Array
}

export interface SpectralProfile {
  low: number // energy 0-500Hz
  mid: number // energy 500-2kHz
  high: number // energy 2-5kHz
  presence: number // energy 5-20kHz
  dynamic_range: number // dB from min to max
}

export class AudioAnalyzer {
  private fft: FFT
  private sample_rate: number = 48000
  private last_frames: AudioFrame[] = []
  private max_frames_stored: number = 100

  constructor() {
    this.fft = new FFT(2048)
  }

  /**
   * Analyze a frame of audio and return heuristic alerts
   */
  analyzeFrame(frame: AudioFrame): Heuristic[] {
    this.last_frames.push(frame)
    if (this.last_frames.length > this.max_frames_stored) {
      this.last_frames.shift()
    }

    const alerts: Heuristic[] = []

    // Check for clipping
    const clipping = this.detectClipping(frame)
    if (clipping) alerts.push(clipping)

    // Check for feedback (sustained frequency spike)
    const feedback = this.detectFeedback(frame)
    if (feedback) alerts.push(feedback)

    // Check for dropouts
    const dropout = this.detectDropout(frame)
    if (dropout) alerts.push(dropout)

    // Check overall volume
    const volume = this.checkVolume(frame)
    if (volume) alerts.push(volume)

    return alerts
  }

  private detectClipping(frame: AudioFrame): Heuristic | null {
    const threshold = 0.95
    let clipped_samples = 0

    for (let i = 0; i < frame.left.length; i++) {
      if (Math.abs(frame.left[i]) > threshold || Math.abs(frame.right[i]) > threshold) {
        clipped_samples++
      }
    }

    const clip_ratio = clipped_samples / frame.left.length
    if (clip_ratio > 0.01) {
      return {
        type: 'clipping',
        severity: 'error',
        message: `🔴 Clipping detected (${(clip_ratio * 100).toFixed(1)}% of samples)`,
        value: clip_ratio,
      }
    }
    return null
  }

  private detectFeedback(frame: AudioFrame): Heuristic | null {
    const spectrum = this.computeSpectrum(frame.left)

    let max_bin = 0
    let max_energy = 0
    for (let i = 0; i < spectrum.length; i++) {
      if (spectrum[i] > max_energy) {
        max_energy = spectrum[i]
        max_bin = i
      }
    }

    const bandwidth = this.measureBandwidth(spectrum, max_bin)
    if (bandwidth < 20 && max_energy > 0.5) {
      const freq = (max_bin * this.sample_rate) / 2048
      return {
        type: 'feedback',
        severity: 'error',
        message: `⚠️ Feedback detected at ${freq.toFixed(0)}Hz`,
        value: freq,
      }
    }
    return null
  }

  private detectDropout(frame: AudioFrame): Heuristic | null {
    const rms = this.computeRMS(frame.left)
    const threshold = -80
    if (rms < threshold) {
      return {
        type: 'dropout',
        severity: 'warning',
        message: `⚠️ Sudden silence detected (${rms.toFixed(0)}dB)`,
        value: rms,
      }
    }
    return null
  }

  private checkVolume(frame: AudioFrame): Heuristic | null {
    const rms = this.computeRMS(frame.left)
    if (rms < -50) {
      return {
        type: 'volume',
        severity: 'warning',
        message: `🔉 Volume is very low (${rms.toFixed(0)}dB)`,
        value: rms,
      }
    }
    if (rms > -3) {
      return {
        type: 'volume',
        severity: 'warning',
        message: `🔊 Volume is very high (${rms.toFixed(0)}dB), risking clipping`,
        value: rms,
      }
    }
    return null
  }

  /**
   * Compute spectral profile for reference mix fingerprinting
   */
  computeSpectralProfile(): SpectralProfile {
    if (this.last_frames.length === 0) {
      return { low: 0, mid: 0, high: 0, presence: 0, dynamic_range: 0 }
    }

    let combined = new Float32Array(this.last_frames.length * 2048)
    for (let i = 0; i < this.last_frames.length; i++) {
      const frame = this.last_frames[i]
      combined.set(frame.left, i * 2048)
    }

    const spectrum = this.computeSpectrum(combined)

    const low = spectrum.slice(0, 21).reduce((a, b) => a + b, 0)
    const mid = spectrum.slice(21, 85).reduce((a, b) => a + b, 0)
    const high = spectrum.slice(85, 213).reduce((a, b) => a + b, 0)
    const presence = spectrum.slice(213, 1024).reduce((a, b) => a + b, 0)

    const rms_values = this.last_frames.map(f => this.computeRMS(f.left))
    const dynamic_range = Math.max(...rms_values) - Math.min(...rms_values)

    return {
      low: low / spectrum.length,
      mid: mid / spectrum.length,
      high: high / spectrum.length,
      presence: presence / spectrum.length,
      dynamic_range,
    }
  }

  private computeSpectrum(samples: Float32Array): Float32Array {
    const fft_input = new Array(2048)
    for (let i = 0; i < 2048; i++) {
      fft_input[i] = samples[i % samples.length]
    }
    this.fft.realTransform(fft_input, samples)
    return new Float32Array(fft_input)
  }

  private computeRMS(samples: Float32Array): number {
    let sum = 0
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i]
    }
    const rms_linear = Math.sqrt(sum / samples.length)
    const rms_db = 20 * Math.log10(rms_linear + 1e-10)
    return rms_db
  }

  private measureBandwidth(spectrum: Float32Array, peak_bin: number): number {
    const peak_energy = spectrum[peak_bin]
    let count = 0
    for (let i = Math.max(0, peak_bin - 100); i < Math.min(spectrum.length, peak_bin + 100); i++) {
      if (spectrum[i] > peak_energy * 0.5) count++
    }
    return count
  }
}
