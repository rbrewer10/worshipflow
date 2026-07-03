import type { Heuristic, Recommendation, SpectralProfile } from '../types/sound-check-types'
import { VOLUME_HIGH_DB, VOLUME_LOW_DB } from './audio-analyzer'

/**
 * Turns raw signal (a reference SpectralProfile comparison, or live
 * Heuristic alerts from AudioAnalyzer) into human-readable, actionable
 * Recommendations for the operator during a sound check.
 */

// SpectralProfile bands are fractions of total energy (0..1, sum ~1), so a
// percent-delta relative to the reference share is level-independent: it
// flags "the mix's tonal balance shifted" rather than "it got louder."
const BAND_DELTA_THRESHOLD_PCT = 20
// Presence (5-20kHz) is more audibly sensitive to small fractional shifts
// (sibilance, cymbal wash) and naturally holds a smaller energy share than
// the other bands, so it gets a slightly higher threshold to avoid noise.
const PRESENCE_DELTA_THRESHOLD_PCT = 25
// A drop of more than this many dB in dynamic range versus the reference
// suggests something (compressor/limiter) is squashing the mix.
const DYNAMIC_RANGE_REGRESSION_DB = 5
// Avoids divide-by-zero when a reference band's fraction is ~0; small enough
// not to distort the ratio for any realistic (non-zero) reference band.
const RATIO_EPSILON = 1e-6
// Below this reference fraction, the band is treated as "no meaningful
// reference energy" and skipped entirely rather than compared: with a
// near-zero denominator, even a tiny absolute change in the current band
// produces a huge percent-delta (e.g. "boosted 10000000%"), which is noise,
// not a real signal worth showing an operator.
const MIN_REFERENCE_BAND_FRACTION = 1e-3

type BandName = 'low' | 'mid' | 'high' | 'presence'

interface BandInfo {
  band: BandName
  label: string
  thresholdPct: number
  raiseHint: string
  lowerHint: string
}

// Ordered low-to-high so recommendations read in a natural sweep across the
// spectrum; the suggested-action hints point at the channel types most
// likely responsible for a shift in that band.
const BAND_INFO: BandInfo[] = [
  {
    band: 'low',
    label: 'low end (below 500Hz)',
    thresholdPct: BAND_DELTA_THRESHOLD_PCT,
    raiseHint: 'Raise low-band EQ or check bass/kick channel levels.',
    lowerHint: 'Lower low-band EQ or check for rumble/proximity effect on bass or kick channels.',
  },
  {
    band: 'mid',
    label: 'midrange (500Hz-2kHz)',
    thresholdPct: BAND_DELTA_THRESHOLD_PCT,
    raiseHint: 'Raise mid-band EQ or check vocal/kick channel levels.',
    lowerHint: 'Lower mid-band EQ on vocal or kick channels to reduce boxiness.',
  },
  {
    band: 'high',
    label: 'high end (2-5kHz)',
    thresholdPct: BAND_DELTA_THRESHOLD_PCT,
    raiseHint: 'Raise high-band EQ or check bright channels (acoustic guitar, overheads).',
    lowerHint: 'Lower high-band EQ on bright channels (acoustic guitar, overheads) to tame harshness.',
  },
  {
    band: 'presence',
    label: 'presence peak (5-20kHz)',
    thresholdPct: PRESENCE_DELTA_THRESHOLD_PCT,
    raiseHint: 'Raise presence/air EQ or check vocal channels for added brightness.',
    lowerHint: 'Lower presence/air EQ on vocal channels to reduce sibilance.',
  },
]

export class RecommendationEngine {
  private referenceProfile: SpectralProfile | null = null

  setReferenceProfile(profile: SpectralProfile): void {
    this.referenceProfile = profile
  }

  /**
   * Compares the current spectral profile against the stored reference,
   * band by band, plus dynamic range. Returns [] if no reference is set
   * (nothing to compare against) or if the current mix matches closely.
   */
  analyzeAgainstReference(current: SpectralProfile): Recommendation[] {
    if (!this.referenceProfile) return []
    const reference = this.referenceProfile

    const recommendations: Recommendation[] = []

    for (const info of BAND_INFO) {
      const referenceValue = reference[info.band]
      if (referenceValue < MIN_REFERENCE_BAND_FRACTION) continue

      const currentValue = current[info.band]
      const deltaPct = ((currentValue - referenceValue) / (referenceValue + RATIO_EPSILON)) * 100

      if (Math.abs(deltaPct) > info.thresholdPct) {
        const boosted = deltaPct > 0
        recommendations.push({
          severity: 'info',
          message: `${boosted ? '📈' : '📉'} The ${info.label} is ${boosted ? 'boosted' : 'reduced'} ${Math.abs(deltaPct).toFixed(0)}% versus the reference mix.`,
          suggestedAction: boosted ? info.raiseHint : info.lowerHint,
        })
      }
    }

    const dynamicRangeDeltaDb = current.dynamicRange - reference.dynamicRange
    if (dynamicRangeDeltaDb < -DYNAMIC_RANGE_REGRESSION_DB) {
      recommendations.push({
        severity: 'info',
        message: `📉 Dynamic range dropped ${Math.abs(dynamicRangeDeltaDb).toFixed(1)}dB versus the reference mix — the mix sounds more compressed.`,
        suggestedAction: 'Check compressor/limiter settings on the master bus and individual channels.',
      })
    }

    return recommendations
  }

  /**
   * Converts real-time Heuristic alerts (already carrying an operator-facing
   * message from AudioAnalyzer) into Recommendations with a concrete
   * suggested next step per alert type.
   */
  heuristicsToRecommendations(heuristics: Heuristic[]): Recommendation[] {
    return heuristics.map((heuristic) => ({
      severity: heuristic.severity === 'error' ? 'error' : 'warning',
      message: heuristic.message,
      channelId: heuristic.channel,
      suggestedAction: this.suggestActionFor(heuristic),
    }))
  }

  private suggestActionFor(heuristic: Heuristic): string {
    switch (heuristic.type) {
      case 'feedback': {
        const frequencyNote =
          heuristic.value !== undefined ? ` near ${heuristic.value.toFixed(0)}Hz` : ''
        return `Check the mic for loose connections or a feedback loop${frequencyNote}. Reduce gain or notch out the offending frequency with EQ.`
      }
      case 'clipping':
        return 'Lower the input gain on the affected channel, or reduce the master level.'
      case 'dropout':
        return 'Check wireless mic batteries or cable/connector connections.'
      case 'volume': {
        // Mirrors AudioAnalyzer's own checkVolume() thresholds so the
        // suggested action always agrees with why the heuristic fired.
        if (heuristic.value !== undefined && heuristic.value < VOLUME_LOW_DB) {
          return 'Increase input gain or check for an unintended mute.'
        }
        if (heuristic.value !== undefined && heuristic.value > VOLUME_HIGH_DB) {
          return 'Turn down the channel or master level to prevent clipping.'
        }
        return 'Check channel gain staging.'
      }
      default:
        return 'Review the channel and mixer settings.'
    }
  }
}
