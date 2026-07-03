export interface Channel {
  id: number
  name: string
  yamahaChannel: number
  isMic: boolean
  isBackingTrack: boolean
  currentFaderDb: number
  isMuted: boolean
}

export interface Scene {
  id: string
  name: string
}

export interface Recommendation {
  severity: 'info' | 'warning' | 'error'
  message: string
  channelId?: number
  suggestedAction?: string
}

export interface AutomationRule {
  id: string
  serviceItemType: 'song' | 'scripture' | 'announcement' | 'prayer' | 'countdown'
  sceneNameToRecall?: string
  faderAdjustments?: { channelId: number; deltaDb: number }[]
  enabled: boolean
}

/** One captured frame of stereo audio from the audience mic (48kHz). */
export interface AudioFrame {
  timestamp: Date
  left: Float32Array
  right: Float32Array
}

/**
 * Spectral "fingerprint" of a mix. Each band is that band's fraction of the
 * total spectral energy (0..1; the four bands sum to ~1), so profiles are
 * level-independent and comparable against a recorded reference.
 * dynamicRange is separate, in dB (max frame RMS minus min frame RMS).
 */
export interface SpectralProfile {
  low: number // 0-500Hz
  mid: number // 500-2000Hz
  high: number // 2000-5000Hz
  presence: number // 5000-20000Hz
  dynamicRange: number // dB
}

export interface ReferenceMix {
  id: string
  spectralProfile: SpectralProfile
  recordedAt: Date
  durationSeconds: number
  notes: string
}

export interface Heuristic {
  type: 'feedback' | 'clipping' | 'dropout' | 'volume'
  severity: 'warning' | 'error'
  message: string
  channel?: number
  value?: number
}
