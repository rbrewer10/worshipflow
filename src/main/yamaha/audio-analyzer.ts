import FFT from 'fft.js'
import type { AudioFrame, Heuristic, SpectralProfile } from '../types/sound-check-types'

/**
 * Real-time analysis of the audience-mic audio feed.
 *
 * Detects feedback, clipping, dropouts, and bad volume from incoming stereo
 * frames, and computes a spectral "fingerprint" (band energy distribution +
 * dynamic range) used to compare the current mix against a recorded
 * reference mix.
 *
 * Frame contract: analyzeFrame expects frames of exactly FFT_SIZE (2048)
 * samples per channel at 48kHz. Shorter frames are zero-padded and longer
 * frames truncated before the FFT.
 *
 * Mono summing: RMS (dropout/volume), the per-frame spectrum feeding
 * feedback detection, and the Welch spectral profile / dynamic-range calc
 * all analyze toMono(frame) — the average of the left/right capsules of the
 * stereo audience mic — rather than a single channel. This approximates
 * what the room actually hears and cancels noise unique to one capsule.
 * Clipping is the one exception: it still checks left/right independently
 * so a clip on either channel is still caught.
 * CALIBRATION NOTE: averaging two mic channels can shift measured RMS by up
 * to ~3dB depending on inter-channel correlation/phase, and can smear or
 * partially cancel a narrow feedback tone if the two capsules pick it up
 * with a phase difference. All dB thresholds below (VOLUME_LOW_DB,
 * VOLUME_HIGH_DB, DROPOUT_SILENCE_DB, DROPOUT_PRIOR_LEVEL_DB,
 * FEEDBACK_MIN_PEAK_MAGNITUDE) are therefore provisional and were not tuned
 * against real dual-capsule hardware audio — re-validate them once real
 * mixer audio is available.
 */

export const FFT_SIZE = 2048
const SAMPLE_RATE = 48000
const HZ_PER_BIN = SAMPLE_RATE / FFT_SIZE // 23.4375 Hz per bin
// fft.js realTransform fills bins 0..N/2-1 of the half spectrum; the Nyquist
// bin (24kHz) is excluded, which is above every band we care about.
const NUM_BINS = FFT_SIZE / 2
const MAX_FRAMES_STORED = 100

// Clipping: alert when more than 1% of sample positions exceed +/-0.95.
const CLIP_SAMPLE_THRESHOLD = 0.95
const CLIP_RATIO_THRESHOLD = 0.01

// Feedback: a sustained, narrow, prominent tone. All three must hold:
// (a) the peak bin exceeds FEEDBACK_PROMINENCE_RATIO times the mean bin
//     magnitude, (b) fewer than FEEDBACK_MAX_BANDWIDTH_BINS bins near the
//     peak are above half its magnitude, and (c) the same peak bin (within
//     +/-FEEDBACK_BIN_TOLERANCE) persists for FEEDBACK_SUSTAIN_FRAMES
//     consecutive analyzeFrame calls.
const FEEDBACK_PROMINENCE_RATIO = 8
const FEEDBACK_MAX_BANDWIDTH_BINS = 20
const FEEDBACK_BANDWIDTH_SEARCH_BINS = 100
const FEEDBACK_SUSTAIN_FRAMES = 5
const FEEDBACK_BIN_TOLERANCE = 1
// Peaks quieter than this (normalized magnitude, ~-46dBFS) are never
// feedback; it also keeps the prominence ratio meaningful near silence.
const FEEDBACK_MIN_PEAK_MAGNITUDE = 0.005

// Dropout: SUDDEN silence — the current frame is near-silent while the
// rolling average of the previous few frames still carried signal.
const DROPOUT_SILENCE_DB = -70
const DROPOUT_PRIOR_LEVEL_DB = -50
const RMS_HISTORY_FRAMES = 5

// Plain volume warnings (RMS dB of the current frame). Exported so
// RecommendationEngine can mirror this exact logic when turning a volume
// Heuristic into a suggested action, instead of duplicating the numbers.
export const VOLUME_LOW_DB = -50
export const VOLUME_HIGH_DB = -3

// Spectral profile band edges (Hz). Bin ranges are derived from these via
// binFrequency = binIndex * SAMPLE_RATE / FFT_SIZE.
const LOW_BAND_MAX_HZ = 500
const MID_BAND_MAX_HZ = 2000
const HIGH_BAND_MAX_HZ = 5000
const PRESENCE_BAND_MAX_HZ = 20000

export class AudioAnalyzer {
  private fft: FFT
  private lastFrames: AudioFrame[] = []
  // RMS (dB) of recent frames, most recent last; excludes the current frame
  // while it is being analyzed. Used for dropout detection.
  private rmsHistory: number[] = []
  // Feedback candidate tracked across frames: the persistent peak bin and
  // how many consecutive frames it has held.
  private feedbackCandidateBin = -1
  private feedbackCandidateFrames = 0
  // Precomputed Hann window and reusable FFT buffers. fftInput/fftOutput are
  // shared mutable instance state reused across calls to avoid per-frame
  // allocation; they are NOT safe for concurrent/re-entrant use — analyzeFrame
  // and computeSpectralProfile must be invoked serially, never interleaved.
  private hannWindow: Float32Array
  private magnitudeScale: number
  private fftInput: number[]
  private fftOutput: number[]

  constructor() {
    this.fft = new FFT(FFT_SIZE)
    this.fftInput = new Array(FFT_SIZE).fill(0)
    this.fftOutput = this.fft.createComplexArray()

    this.hannWindow = new Float32Array(FFT_SIZE)
    let windowSum = 0
    for (let i = 0; i < FFT_SIZE; i++) {
      this.hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)))
      windowSum += this.hannWindow[i]
    }
    // Normalization: raw bin magnitudes are divided by N/2 (the FFT gain for
    // a real sine) and by the Hann window's coherent gain (windowSum/N,
    // ~0.5), so a full-scale bin-centered sine yields a peak magnitude ~1.0.
    const coherentGain = windowSum / FFT_SIZE
    this.magnitudeScale = 1 / ((FFT_SIZE / 2) * coherentGain)
  }

  /**
   * Analyze one frame of audio and return heuristic alerts.
   * Expects 2048-sample frames (see frame contract above).
   */
  analyzeFrame(frame: AudioFrame): Heuristic[] {
    this.lastFrames.push(frame)
    if (this.lastFrames.length > MAX_FRAMES_STORED) {
      this.lastFrames.shift()
    }

    const mono = this.toMono(frame)
    const rmsDb = this.computeRmsDb(mono)
    const spectrum = this.computeMagnitudeSpectrum(mono)

    const alerts: Heuristic[] = []

    const clipping = this.detectClipping(frame)
    if (clipping) alerts.push(clipping)

    const feedback = this.detectFeedback(spectrum)
    if (feedback) alerts.push(feedback)

    // Dropout means the signal vanished: near-silence now, but the previous
    // few frames averaged well above the silence floor. A dropout suppresses
    // the plain volume warning for the same frame.
    const previousAvgDb = this.averageRecentRmsDb()
    const isDropout =
      rmsDb < DROPOUT_SILENCE_DB &&
      previousAvgDb !== null &&
      previousAvgDb > DROPOUT_PRIOR_LEVEL_DB
    if (isDropout) {
      alerts.push({
        type: 'dropout',
        severity: 'warning',
        message: `⚠️ Sudden silence detected (${rmsDb.toFixed(0)}dB)`,
        value: rmsDb,
      })
    } else {
      const volume = this.checkVolume(rmsDb)
      if (volume) alerts.push(volume)
    }

    this.rmsHistory.push(rmsDb)
    if (this.rmsHistory.length > RMS_HISTORY_FRAMES) {
      this.rmsHistory.shift()
    }

    return alerts
  }

  /**
   * Compute the spectral profile of the buffered frames for reference-mix
   * fingerprinting. Uses Welch-style averaging: the windowed power spectrum
   * of every buffered frame is averaged, then band energies are expressed as
   * fractions of the total spectral energy (level-independent, sum ~1).
   */
  computeSpectralProfile(): SpectralProfile {
    if (this.lastFrames.length === 0) {
      return { low: 0, mid: 0, high: 0, presence: 0, dynamicRange: 0 }
    }

    const avgPower = new Float64Array(NUM_BINS)
    for (const frame of this.lastFrames) {
      const magnitudes = this.computeMagnitudeSpectrum(this.toMono(frame))
      for (let i = 0; i < NUM_BINS; i++) {
        avgPower[i] += magnitudes[i] * magnitudes[i]
      }
    }
    for (let i = 0; i < NUM_BINS; i++) {
      avgPower[i] /= this.lastFrames.length
    }

    let low = 0
    let mid = 0
    let high = 0
    let presence = 0
    let total = 0
    for (let i = 0; i < NUM_BINS; i++) {
      const frequency = i * HZ_PER_BIN
      const power = avgPower[i]
      total += power
      if (frequency < LOW_BAND_MAX_HZ) low += power
      else if (frequency < MID_BAND_MAX_HZ) mid += power
      else if (frequency < HIGH_BAND_MAX_HZ) high += power
      else if (frequency < PRESENCE_BAND_MAX_HZ) presence += power
    }
    if (total > 0) {
      low /= total
      mid /= total
      high /= total
      presence /= total
    }

    // Manual min/max loop instead of Math.max(...rmsValues) / Math.min(...) —
    // a spread over lastFrames is safe today (MAX_FRAMES_STORED = 100) but
    // would risk a call-stack blowup if that constant is ever raised.
    let maxRmsDb = -Infinity
    let minRmsDb = Infinity
    for (const f of this.lastFrames) {
      const rmsDb = this.computeRmsDb(this.toMono(f))
      if (rmsDb > maxRmsDb) maxRmsDb = rmsDb
      if (rmsDb < minRmsDb) minRmsDb = rmsDb
    }
    const dynamicRange = maxRmsDb - minRmsDb

    return { low, mid, high, presence, dynamicRange }
  }

  private detectClipping(frame: AudioFrame): Heuristic | null {
    let clippedSamples = 0
    for (let i = 0; i < frame.left.length; i++) {
      if (
        Math.abs(frame.left[i]) > CLIP_SAMPLE_THRESHOLD ||
        (i < frame.right.length && Math.abs(frame.right[i]) > CLIP_SAMPLE_THRESHOLD)
      ) {
        clippedSamples++
      }
    }

    const clipRatio = clippedSamples / frame.left.length
    if (clipRatio > CLIP_RATIO_THRESHOLD) {
      return {
        type: 'clipping',
        severity: 'error',
        message: `🔴 Clipping detected (${(clipRatio * 100).toFixed(1)}% of samples)`,
        value: clipRatio,
      }
    }
    return null
  }

  private detectFeedback(spectrum: Float32Array): Heuristic | null {
    let peakBin = 0
    let peakMagnitude = 0
    let magnitudeSum = 0
    for (let i = 0; i < spectrum.length; i++) {
      magnitudeSum += spectrum[i]
      if (spectrum[i] > peakMagnitude) {
        peakMagnitude = spectrum[i]
        peakBin = i
      }
    }
    const meanMagnitude = magnitudeSum / spectrum.length

    const prominent =
      peakMagnitude > FEEDBACK_MIN_PEAK_MAGNITUDE &&
      peakMagnitude > FEEDBACK_PROMINENCE_RATIO * meanMagnitude
    const narrow =
      prominent && this.measureBandwidth(spectrum, peakBin) < FEEDBACK_MAX_BANDWIDTH_BINS

    if (!prominent || !narrow) {
      this.feedbackCandidateBin = -1
      this.feedbackCandidateFrames = 0
      return null
    }

    if (
      this.feedbackCandidateBin >= 0 &&
      Math.abs(peakBin - this.feedbackCandidateBin) <= FEEDBACK_BIN_TOLERANCE
    ) {
      this.feedbackCandidateFrames++
    } else {
      this.feedbackCandidateFrames = 1
    }
    this.feedbackCandidateBin = peakBin

    if (this.feedbackCandidateFrames >= FEEDBACK_SUSTAIN_FRAMES) {
      const frequency = peakBin * HZ_PER_BIN
      return {
        type: 'feedback',
        severity: 'error',
        message: `⚠️ Feedback detected at ${frequency.toFixed(0)}Hz`,
        value: frequency,
      }
    }
    return null
  }

  private checkVolume(rmsDb: number): Heuristic | null {
    if (rmsDb < VOLUME_LOW_DB) {
      return {
        type: 'volume',
        severity: 'warning',
        message: `🔉 Volume is very low (${rmsDb.toFixed(0)}dB)`,
        value: rmsDb,
      }
    }
    if (rmsDb > VOLUME_HIGH_DB) {
      return {
        type: 'volume',
        severity: 'warning',
        message: `🔊 Volume is very high (${rmsDb.toFixed(0)}dB), risking clipping`,
        value: rmsDb,
      }
    }
    return null
  }

  /** Average RMS (dB) of the recent frames before the current one. */
  private averageRecentRmsDb(): number | null {
    if (this.rmsHistory.length === 0) return null
    const sum = this.rmsHistory.reduce((a, b) => a + b, 0)
    return sum / this.rmsHistory.length
  }

  /**
   * Windowed, normalized magnitude spectrum of one frame.
   * Input is truncated or zero-padded to FFT_SIZE, Hann-windowed, then
   * transformed; bin i of the result covers frequency i * HZ_PER_BIN.
   */
  private computeMagnitudeSpectrum(samples: Float32Array): Float32Array {
    const copyLength = Math.min(samples.length, FFT_SIZE)
    for (let i = 0; i < copyLength; i++) {
      this.fftInput[i] = samples[i] * this.hannWindow[i]
    }
    for (let i = copyLength; i < FFT_SIZE; i++) {
      this.fftInput[i] = 0
    }

    this.fft.realTransform(this.fftOutput, this.fftInput)

    const magnitudes = new Float32Array(NUM_BINS)
    for (let i = 0; i < NUM_BINS; i++) {
      magnitudes[i] =
        Math.hypot(this.fftOutput[2 * i], this.fftOutput[2 * i + 1]) * this.magnitudeScale
    }
    return magnitudes
  }

  /**
   * Mono mix of a stereo frame (average of the two channels). See the
   * "Mono summing" note in the class doc-comment: this is a deliberate
   * approximation of room-perceived level and a deliberate change from the
   * previous left-only calibration, not an oversight.
   */
  private toMono(frame: AudioFrame): Float32Array {
    const mono = new Float32Array(frame.left.length)
    for (let i = 0; i < mono.length; i++) {
      const right = i < frame.right.length ? frame.right[i] : frame.left[i]
      mono[i] = (frame.left[i] + right) / 2
    }
    return mono
  }

  private computeRmsDb(samples: Float32Array): number {
    let sum = 0
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i]
    }
    const rmsLinear = Math.sqrt(sum / samples.length)
    return 20 * Math.log10(rmsLinear + 1e-10)
  }

  /** Number of bins near the peak whose magnitude exceeds half the peak's. */
  private measureBandwidth(spectrum: Float32Array, peakBin: number): number {
    const peakMagnitude = spectrum[peakBin]
    const start = Math.max(0, peakBin - FEEDBACK_BANDWIDTH_SEARCH_BINS)
    const end = Math.min(spectrum.length, peakBin + FEEDBACK_BANDWIDTH_SEARCH_BINS)
    let count = 0
    for (let i = start; i < end; i++) {
      if (spectrum[i] > peakMagnitude * 0.5) count++
    }
    return count
  }
}
