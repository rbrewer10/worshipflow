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

export interface ReferenceMix {
  id: string
  spectralProfile: { low: number; mid: number; high: number; presence: number }
  dynamicRange: number
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
