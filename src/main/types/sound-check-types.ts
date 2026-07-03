export interface Channel {
  id: number
  name: string
  yamaha_channel: number
  is_mic: boolean
  is_backing_track: boolean
  current_fader_db: number
  is_muted: boolean
}

export interface Scene {
  id: string
  name: string
}

export interface Recommendation {
  severity: 'info' | 'warning' | 'error'
  message: string
  channel_id?: number
  suggested_action?: string
}

export interface AutomationRule {
  id: string
  service_item_type: 'song' | 'scripture' | 'announcement' | 'prayer' | 'countdown'
  scene_name_to_recall?: string
  fader_adjustments?: { channel_id: number; delta_db: number }[]
  enabled: boolean
}

export interface ReferenceMix {
  id: string
  spectral_profile: { low: number; mid: number; high: number; presence: number }
  dynamic_range: number
  recorded_at: Date
  duration_seconds: number
  notes: string
}

export interface Heuristic {
  type: 'feedback' | 'clipping' | 'dropout' | 'volume'
  severity: 'warning' | 'error'
  message: string
  channel?: number
  value?: number
}
