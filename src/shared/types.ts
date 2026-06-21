// Types shared across main, preload, and renderer.

export type Mode = 'lyrics' | 'black' | 'logo'
export type Intent = 'next' | 'prev' | 'black' | 'logo' | 'lyrics'

export interface LiveState {
  mode: Mode
  index: number
  line: string
  next: string
  total: number
  songTitle: string
  ts: number
}

export interface DisplayInfo {
  id: number
  bounds: { x: number; y: number; width: number; height: number }
  primary: boolean
  internal: boolean
}

export interface Song {
  title: string
  lines: string[]
}

export interface AppInfo {
  song: Song
  state: LiveState
  displays: DisplayInfo[]
  outputs: number
  startupMs: number
}

// --- Song library (Phase 1) ---
export type SectionKind = 'verse' | 'chorus' | 'bridge' | 'tag' | 'intro' | 'ending' | 'section'

export interface SongSection {
  id?: number
  kind: SectionKind
  label?: string | null
  ordinal: number
  lyrics: string
}

export interface SongSummary {
  id: number
  title: string
  author: string | null
}

export interface SongFull extends SongSummary {
  ccli: string | null
  sections: SongSection[]
}

export interface SongInput {
  title: string
  author?: string
  ccli?: string
  sections: SongSection[]
}

// --- Service builder (Phase 1) ---
export type ServiceItemType = 'song' | 'scripture' | 'text' | 'countdown'

export interface ServiceSummary {
  id: number
  name: string
  service_date: string | null
}

export interface ServiceItem {
  id: number
  ordinal: number
  type: ServiceItemType
  ref_id: number | null
  payload: Record<string, unknown>
  title: string
}

export interface ServiceFull extends ServiceSummary {
  items: ServiceItem[]
}

export interface NewServiceItem {
  type: ServiceItemType
  ref_id?: number | null
  payload?: Record<string, unknown>
}

// --- Scripture / KJV (Phase 1) ---
export interface ScriptureVerse {
  n: number
  text: string
}

export interface ScriptureResult {
  ok: boolean
  reference?: string
  verses?: ScriptureVerse[]
  error?: string
}
