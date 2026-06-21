// Types shared across main, preload, and renderer.

export type Mode = 'lyrics' | 'black' | 'logo'
export type Intent = 'next' | 'prev' | 'black' | 'logo' | 'lyrics'

export interface LiveState {
  mode: Mode
  index: number
  line: string
  next: string
  total: number
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
